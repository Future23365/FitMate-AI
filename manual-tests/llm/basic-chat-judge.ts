import { z } from "zod";

export type BasicChatTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type BasicChatVisibleOutputSummary = {
  outputType: string;
  schemaVersion: string;
  summary: string;
};

export type BasicChatJudgeModelInput = {
  flowId: string;
  goal: string;
  turnIndex: number;
  userInput: string;
  expectation: string;
  finalAssistantText: string;
  visibleOutputs: BasicChatVisibleOutputSummary[];
};

export type BasicChatJudgeConfig = {
  apiKey: string;
  endpoint: string;
  model: string;
  timeoutMs: number;
};

export const basicChatJudgeResultSchema = z.object({
  passed: z.boolean(),
  status: z.enum(["passed", "failed", "uncertain"]),
  reason: z.string().trim().min(1).max(1200),
  matchedExpectations: z.array(z.string().trim().min(1).max(300)).max(20),
  missingExpectations: z.array(z.string().trim().min(1).max(300)).max(20),
  visibleOutputKinds: z.array(z.string().trim().min(1).max(80)).max(12),
}).refine(
  (result) => (result.status === "passed" ? result.passed : !result.passed),
  "passed 必须和 status 保持一致",
);

export type BasicChatJudgeResult = z.infer<typeof basicChatJudgeResultSchema>;

export type BasicChatJudgeOutcome =
  | {
      ok: true;
      model: string;
      result: BasicChatJudgeResult;
      usage?: BasicChatTokenUsage;
    }
  | {
      ok: false;
      model: string;
      failureCode: "judge_http_error" | "judge_empty_content" | "judge_invalid_json" | "judge_schema_invalid" | "judge_request_failed";
      reason: string;
      usage?: BasicChatTokenUsage;
    };

const defaultJudgeEndpoint = "https://api.deepseek.com/chat/completions";
const defaultJudgeModel = "deepseek-chat";
const maxJudgeAssistantTextLength = 4000;
const maxJudgeVisibleOutputSummaryLength = 1200;

// createBasicChatJudgeConfig 统一解析真实 judge 模型配置，避免缺配置时回退到 mock 或旧快照。
export function createBasicChatJudgeConfig(env: NodeJS.ProcessEnv = process.env): {
  config?: BasicChatJudgeConfig;
  missing: string[];
} {
  const apiKey = env.DEEPSEEK_API_KEY?.trim();

  if (!apiKey) {
    return { missing: ["DEEPSEEK_API_KEY"] };
  }

  return {
    config: {
      apiKey,
      endpoint: env.DEEPSEEK_API_URL?.trim() || defaultJudgeEndpoint,
      model: env.DEEPSEEK_JUDGE_MODEL?.trim() || env.DEEPSEEK_MODEL?.trim() || defaultJudgeModel,
      timeoutMs: readPositiveInteger(env.DEEPSEEK_JUDGE_TIMEOUT_MS, 20_000),
    },
    missing: [],
  };
}

// buildBasicChatJudgeModelInput 是 judge 唯一模型可见事实投影，禁止把 trace/tool/prompt 诊断带入判定。
export function buildBasicChatJudgeModelInput(input: BasicChatJudgeModelInput): BasicChatJudgeModelInput {
  return {
    flowId: input.flowId,
    goal: input.goal,
    turnIndex: input.turnIndex,
    userInput: input.userInput,
    expectation: input.expectation,
    finalAssistantText: truncateText(input.finalAssistantText, maxJudgeAssistantTextLength),
    visibleOutputs: input.visibleOutputs.map((output) => ({
      outputType: output.outputType,
      schemaVersion: output.schemaVersion,
      summary: truncateText(output.summary, maxJudgeVisibleOutputSummaryLength),
    })),
  };
}

// createBasicChatJudgeMessages 使用中文描述用户可见验收边界，结构化字段名保持英文合同。
export function createBasicChatJudgeMessages(input: BasicChatJudgeModelInput) {
  const modelInput = buildBasicChatJudgeModelInput(input);

  return [
    {
      role: "system" as const,
      content: [
        "你是首页聊天基础黑盒测试的语义判定器。",
        "你只能依据用户最终可见输出判断该轮是否满足文档期望。",
        "用户最终可见输出包括 finalAssistantText 和 visibleOutputs 摘要。",
        "不要因为缺少 agent_progress、tool_result、trace、planner action、raw provider response、token diagnostics 或内部错误栈而判失败。",
        "不要要求文档未声明的 exerciseId、动作精确组数、精确时长、计划内部字段或数据库字段完全匹配。",
        "如果最终输出语义满足文档期望，返回 passed=true 且 status=passed。",
        "如果缺少关键用户可见语义，返回 passed=false 且 status=failed，并写清 missingExpectations。",
        "如果最终输出不足以判断或 judge 自身不确定，返回 passed=false 且 status=uncertain。",
        "只返回 JSON 对象，字段必须包含 passed、status、reason、matchedExpectations、missingExpectations、visibleOutputKinds。",
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: JSON.stringify(modelInput),
    },
  ];
}

// judgeBasicChatTurn 调用真实 judge 模型并强制校验结构化结果，非法输出不能视为通过。
export async function judgeBasicChatTurn(
  input: BasicChatJudgeModelInput,
  config: BasicChatJudgeConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<BasicChatJudgeOutcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const requestBody = {
    model: config.model,
    temperature: 0,
    max_tokens: 900,
    response_format: { type: "json_object" },
    messages: createBasicChatJudgeMessages(input),
  };

  try {
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        model: config.model,
        failureCode: "judge_http_error",
        reason: `judge HTTP ${response.status}`,
      };
    }

    const payload = await response.json() as {
      model?: string;
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: unknown;
    };
    const model = payload.model ?? config.model;
    const usage = normalizeBasicChatTokenUsage(payload.usage);
    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      return {
        ok: false,
        model,
        failureCode: "judge_empty_content",
        reason: "judge 返回空内容",
        usage,
      };
    }

    const parsedJson = parseJsonObject(content);

    if (!parsedJson.ok) {
      return {
        ok: false,
        model,
        failureCode: "judge_invalid_json",
        reason: parsedJson.reason,
        usage,
      };
    }

    const parsedResult = basicChatJudgeResultSchema.safeParse(parsedJson.value);

    if (!parsedResult.success) {
      return {
        ok: false,
        model,
        failureCode: "judge_schema_invalid",
        reason: parsedResult.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
        usage,
      };
    }

    return {
      ok: true,
      model,
      result: parsedResult.data,
      usage,
    };
  } catch (error) {
    return {
      ok: false,
      model: config.model,
      failureCode: "judge_request_failed",
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeBasicChatTokenUsage(value: unknown): BasicChatTokenUsage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const usage = value as Record<string, unknown>;
  const promptTokens = readNumber(usage.prompt_tokens);
  const completionTokens = readNumber(usage.completion_tokens);
  const totalTokens = readNumber(usage.total_tokens) ?? (
    promptTokens !== undefined && completionTokens !== undefined ? promptTokens + completionTokens : undefined
  );

  if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
    return undefined;
  }

  return {
    promptTokens: promptTokens ?? 0,
    completionTokens: completionTokens ?? 0,
    totalTokens: totalTokens ?? 0,
  };
}

function parseJsonObject(content: string): { ok: true; value: unknown } | { ok: false; reason: string } {
  try {
    const value = JSON.parse(content);
    return { ok: true, value };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = value ? Number(value) : NaN;

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, " ");

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}
