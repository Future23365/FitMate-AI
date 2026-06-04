import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { POST as createLocalAnonymousSession } from "@/app/api/auth/local-anonymous/route";
import { POST as postChat } from "@/app/api/chat/route";
import { clearAiTraces, listAiTracesForUser } from "@/lib/server/dev/ai-trace-store";
import {
  buildConversationSummaryContext,
  buildFitnessConversationContext,
  initializeConversationSummary,
} from "@/lib/shared/chat/fitness-conversation-context";

import {
  BasicChatFixtureParseError,
  readBasicChatFixture,
  summarizeBasicChatFixture,
  type BasicChatFixture,
  type BasicChatFlow,
} from "./basic-chat-fixtures";
import {
  createBasicChatJudgeConfig,
  judgeBasicChatTurn,
  type BasicChatJudgeConfig,
  type BasicChatTokenUsage,
  type BasicChatVisibleOutputSummary,
} from "./basic-chat-judge";
import {
  mergeTokenUsage,
  renderBasicChatBlackboxReport,
  summarizeReportText,
  type BasicChatSuiteSummary,
  type BasicChatTurnRunRecord,
} from "./basic-chat-report";

type BasicChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type BasicChatBlackboxRunOptions = {
  sourcePath?: string;
  reportPath?: string;
  flowIds?: string[];
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

export type BasicChatBlackboxRunResult = {
  exitCode: number;
  reportPath: string;
  reportMarkdown: string;
  summary: BasicChatSuiteSummary;
  records: BasicChatTurnRunRecord[];
};

type AuthSession = {
  cookie: string;
  userId: string;
};

type NormalizedChatOutput = {
  assistantText: string;
  visibleOutputs: BasicChatVisibleOutputSummary[];
  visibleOutputKinds: string[];
  eventTypes: string[];
  done: boolean;
  errorMessage?: string;
};

const defaultReportPath = "docs/manual-llm-basic-blackbox-latest-report.md";
const defaultChatModel = "deepseek-chat";

// createBasicChatBlackboxRunOptionsFromEnv 让专用命令通过 env 传入筛选条件和报告路径。
export function createBasicChatBlackboxRunOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): BasicChatBlackboxRunOptions {
  return {
    env,
    flowIds: parseFlowIds(env.MANUAL_LLM_BASIC_FLOW_IDS),
    reportPath: env.MANUAL_LLM_BASIC_REPORT_PATH,
  };
}

// runBasicChatBlackboxSuite 是基础首页聊天黑盒套件入口，不改生产链路，只通过请求合同执行。
export async function runBasicChatBlackboxSuite(
  options: BasicChatBlackboxRunOptions = {},
): Promise<BasicChatBlackboxRunResult> {
  const env = options.env ?? process.env;
  const startedAt = options.now?.() ?? new Date();
  const reportPath = resolve(process.cwd(), options.reportPath ?? defaultReportPath);
  let fixture: BasicChatFixture;

  try {
    fixture = await readBasicChatFixture(options.sourcePath);
  } catch (error) {
    const preflightErrors = error instanceof BasicChatFixtureParseError
      ? error.errors
      : [error instanceof Error ? error.message : String(error)];
    return writeFinalReport({
      reportPath,
      fixture: {
        sourcePath: options.sourcePath ?? "llm基础测试.md",
        flows: [],
        stats: { flowCount: 0, turnCount: 0 },
      },
      selectedFlows: [],
      records: [],
      startedAt,
      endedAt: options.now?.() ?? new Date(),
      status: "preflight_failed",
      model: readChatModel(env),
      judgeModel: readJudgeModelLabel(env),
      filterLabel: formatFilterLabel(options.flowIds),
      missingConfiguration: [],
      preflightErrors,
      estimatedTokenTotal: 0,
    });
  }

  const selectedFlowResult = selectFlows(fixture.flows, options.flowIds);
  if (!selectedFlowResult.ok) {
    return writeFinalReport({
      reportPath,
      fixture,
      selectedFlows: [],
      records: [],
      startedAt,
      endedAt: options.now?.() ?? new Date(),
      status: "preflight_failed",
      model: readChatModel(env),
      judgeModel: readJudgeModelLabel(env),
      filterLabel: formatFilterLabel(options.flowIds),
      missingConfiguration: [],
      preflightErrors: [selectedFlowResult.message],
      estimatedTokenTotal: estimateBasicChatTokenUsage(fixture.flows),
    });
  }

  const selectedFlows = selectedFlowResult.flows;
  const judgeConfigResult = createBasicChatJudgeConfig(env);
  const estimatedTokenTotal = estimateBasicChatTokenUsage(selectedFlows);
  const model = readChatModel(env);
  const judgeModel = judgeConfigResult.config?.model ?? readJudgeModelLabel(env);
  const filterLabel = formatFilterLabel(options.flowIds);

  logRunStart({
    model,
    judgeModel,
    flowCount: selectedFlows.length,
    turnCount: summarizeBasicChatFixture(selectedFlows).turnCount,
    filterLabel,
    reportPath,
    estimatedTokenTotal,
  });

  if (!judgeConfigResult.config) {
    return writeFinalReport({
      reportPath,
      fixture,
      selectedFlows,
      records: [],
      startedAt,
      endedAt: options.now?.() ?? new Date(),
      status: "configuration_failed",
      model,
      judgeModel,
      filterLabel,
      missingConfiguration: judgeConfigResult.missing,
      preflightErrors: [],
      estimatedTokenTotal,
    });
  }

  const records: BasicChatTurnRunRecord[] = [];
  let authSession: AuthSession;

  try {
    authSession = await createManualAuthSession();
    clearAiTraces(authSession.userId);
  } catch (error) {
    records.push(createSuiteErrorRecord({
      failureReason: `本地匿名登录失败：${error instanceof Error ? error.message : String(error)}`,
    }));

    return writeFinalReport({
      reportPath,
      fixture,
      selectedFlows,
      records,
      startedAt,
      endedAt: options.now?.() ?? new Date(),
      status: "failed",
      model,
      judgeModel,
      filterLabel,
      missingConfiguration: [],
      preflightErrors: [],
      estimatedTokenTotal,
    });
  }

  for (const flow of selectedFlows) {
    const flowRecords = await runBasicChatFlow({
      flow,
      authSession,
      judgeConfig: judgeConfigResult.config,
      fetchImpl: options.fetchImpl,
    });

    records.push(...flowRecords);
  }

  const failed = records.some((record) => record.executed && record.status !== "passed");

  return writeFinalReport({
    reportPath,
    fixture,
    selectedFlows,
    records,
    startedAt,
    endedAt: options.now?.() ?? new Date(),
    status: failed ? "failed" : "passed",
    model,
    judgeModel,
    filterLabel,
    missingConfiguration: [],
    preflightErrors: [],
    estimatedTokenTotal,
  });
}

async function runBasicChatFlow(input: {
  flow: BasicChatFlow;
  authSession: AuthSession;
  judgeConfig: BasicChatJudgeConfig;
  fetchImpl?: typeof fetch;
}): Promise<BasicChatTurnRunRecord[]> {
  const records: BasicChatTurnRunRecord[] = [];
  const conversationId = `manual-basic-${input.flow.id}-${randomUUID()}`;
  const historyMessages: BasicChatMessage[] = [];
  let conversationSummary = "";
  let shouldSkipAfterFirstTurn = false;

  for (const turn of input.flow.turns) {
    if (shouldSkipAfterFirstTurn) {
      records.push({
        flowId: input.flow.id,
        goal: input.flow.goal,
        turnIndex: turn.index,
        userInput: turn.userInput,
        expectation: turn.expectation,
        executed: false,
        status: "skipped",
        finalAssistantTextSummary: "",
        visibleOutputKinds: [],
        skipReason: "第 1 轮基础输出失败，按基础黑盒规则跳过同 flow 后续轮次。",
      });
      continue;
    }

    const responseMessageId = `assistant-${randomUUID()}`;
    const requestMessages = [...historyMessages, { role: "user" as const, content: turn.userInput }];
    const requestSummary = buildConversationSummaryContext({
      summary: conversationSummary,
      latestUserMessage: turn.userInput,
    });
    const requestBody = {
      conversationId,
      responseMessageId,
      latestUserMessage: requestSummary.latestUserMessage,
      conversationSummary: requestSummary.summary,
      messages: requestMessages,
      conversationContext: buildFitnessConversationContext(requestMessages),
      thinkingEnabled: false,
    };

    let record: BasicChatTurnRunRecord;

    try {
      const response = await postChat(jsonRequest("/api/chat", requestBody, input.authSession.cookie));
      const output = normalizeChatOutput(await response.text());
      const chatTokenUsage = readChatTokenUsage(input.authSession.userId, responseMessageId);
      if (!output.done) {
        record = {
          flowId: input.flow.id,
          goal: input.flow.goal,
          turnIndex: turn.index,
          userInput: turn.userInput,
          expectation: turn.expectation,
          executed: true,
          status: "error",
          finalAssistantTextSummary: summarizeReportText(output.assistantText),
          visibleOutputKinds: output.visibleOutputKinds,
          chatTokenUsage,
          failureReason: output.errorMessage ?? "聊天响应未收到 done 事件。",
        };
        records.push(record);

        if (turn.index === 1) {
          shouldSkipAfterFirstTurn = true;
        }
        continue;
      }

      const judgeOutcome = await judgeBasicChatTurn(
        {
          flowId: input.flow.id,
          goal: input.flow.goal,
          turnIndex: turn.index,
          userInput: turn.userInput,
          expectation: turn.expectation,
          finalAssistantText: output.assistantText,
          visibleOutputs: output.visibleOutputs,
        },
        input.judgeConfig,
        input.fetchImpl,
      );

      if (judgeOutcome.ok) {
        record = {
          flowId: input.flow.id,
          goal: input.flow.goal,
          turnIndex: turn.index,
          userInput: turn.userInput,
          expectation: turn.expectation,
          executed: true,
          status: judgeOutcome.result.passed ? "passed" : "failed",
          finalAssistantTextSummary: summarizeReportText(output.assistantText),
          visibleOutputKinds: output.visibleOutputKinds,
          judge: judgeOutcome.result,
          chatTokenUsage,
          judgeTokenUsage: judgeOutcome.usage,
          failureReason: output.errorMessage,
        };
      } else {
        record = {
          flowId: input.flow.id,
          goal: input.flow.goal,
          turnIndex: turn.index,
          userInput: turn.userInput,
          expectation: turn.expectation,
          executed: true,
          status: "judge_failed",
          finalAssistantTextSummary: summarizeReportText(output.assistantText),
          visibleOutputKinds: output.visibleOutputKinds,
          chatTokenUsage,
          judgeTokenUsage: judgeOutcome.usage,
          failureReason: `${judgeOutcome.failureCode}: ${judgeOutcome.reason}`,
        };
      }

      historyMessages.push({ role: "user", content: turn.userInput });
      historyMessages.push({ role: "assistant", content: output.assistantText || record.failureReason || "" });
      conversationSummary = initializeConversationSummary(historyMessages).summary;
    } catch (error) {
      record = {
        flowId: input.flow.id,
        goal: input.flow.goal,
        turnIndex: turn.index,
        userInput: turn.userInput,
        expectation: turn.expectation,
        executed: true,
        status: "error",
        finalAssistantTextSummary: "",
        visibleOutputKinds: [],
        failureReason: error instanceof Error ? error.message : String(error),
      };
    }

    records.push(record);

    if (turn.index === 1 && record.status !== "passed") {
      shouldSkipAfterFirstTurn = true;
    }
  }

  return records;
}

async function createManualAuthSession(): Promise<AuthSession> {
  const response = await createLocalAnonymousSession(new Request("http://localhost/api/auth/local-anonymous", {
    method: "POST",
  }));
  const body = await response.json() as { user?: { id?: string } };
  const cookie = extractCookiePair(response.headers.get("set-cookie"));
  const userId = body.user?.id;

  if (!response.ok || !cookie || !userId) {
    throw new Error(`local anonymous auth failed: HTTP ${response.status}`);
  }

  return { cookie, userId };
}

function normalizeChatOutput(rawNdjson: string): NormalizedChatOutput {
  const events = parseNdjsonEvents(rawNdjson);
  let assistantText = "";
  let done = false;
  let errorMessage: string | undefined;
  const visibleOutputs: BasicChatVisibleOutputSummary[] = [];
  const eventTypes: string[] = [];

  for (const event of events) {
    const eventType = typeof event.type === "string" ? event.type : "unknown";
    eventTypes.push(eventType);

    if (eventType === "content" && typeof event.content === "string") {
      assistantText += event.content;
    }

    if (eventType === "visible_output") {
      const outputType = String(event.outputType ?? "");
      const schemaVersion = String(event.schemaVersion ?? "");
      visibleOutputs.push({
        outputType,
        schemaVersion,
        summary: summarizeUnknown(event.content ?? event.payload),
      });
    }

    if (eventType === "error") {
      errorMessage = readSafeErrorMessage(event.error);
      if (!assistantText) {
        assistantText = errorMessage;
      }
    }

    if (eventType === "done") {
      done = true;
    }
  }

  return {
    assistantText,
    visibleOutputs,
    visibleOutputKinds: visibleOutputs.map((output) => `${output.outputType}@${output.schemaVersion}`),
    eventTypes,
    done,
    errorMessage: done ? errorMessage : errorMessage ?? "聊天响应未收到 done 事件。",
  };
}

function parseNdjsonEvents(text: string): Array<Record<string, unknown>> {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function writeFinalReport(input: {
  reportPath: string;
  fixture: BasicChatFixture;
  selectedFlows: BasicChatFlow[];
  records: BasicChatTurnRunRecord[];
  startedAt: Date;
  endedAt: Date;
  status: BasicChatSuiteSummary["status"];
  model: string;
  judgeModel: string;
  filterLabel: string;
  missingConfiguration: string[];
  preflightErrors: string[];
  estimatedTokenTotal: number;
}): Promise<BasicChatBlackboxRunResult> {
  const executedRecords = input.records.filter((record) => record.executed);
  const summary: BasicChatSuiteSummary = {
    status: input.status,
    model: input.model,
    judgeModel: input.judgeModel,
    sourcePath: input.fixture.sourcePath,
    reportPath: input.reportPath,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    selectedFlowIds: input.selectedFlows.map((flow) => flow.id),
    filterLabel: input.filterLabel,
    fullFlowCount: input.fixture.stats.flowCount,
    fullTurnCount: input.fixture.stats.turnCount,
    executedFlowCount: new Set(executedRecords.map((record) => record.flowId)).size,
    executedTurnCount: executedRecords.length,
    passedTurnCount: input.records.filter((record) => record.status === "passed").length,
    failedTurnCount: input.records.filter((record) => (
      record.executed && record.status !== "passed"
    )).length,
    skippedTurnCount: input.records.filter((record) => record.status === "skipped").length,
    estimatedTokenTotal: input.estimatedTokenTotal,
    actualChatTokenUsage: mergeTokenUsage(input.records.map((record) => record.chatTokenUsage)),
    actualJudgeTokenUsage: mergeTokenUsage(input.records.map((record) => record.judgeTokenUsage)),
    missingConfiguration: input.missingConfiguration,
    preflightErrors: input.preflightErrors,
  };
  const reportMarkdown = renderBasicChatBlackboxReport({
    summary,
    flows: input.selectedFlows.length ? input.selectedFlows : input.fixture.flows,
    records: input.records,
  });

  await mkdir(dirname(input.reportPath), { recursive: true });
  await writeFile(input.reportPath, reportMarkdown, "utf8");

  return {
    exitCode: summary.status === "passed" ? 0 : 1,
    reportPath: input.reportPath,
    reportMarkdown,
    summary,
    records: input.records,
  };
}

function selectFlows(flows: BasicChatFlow[], flowIds: string[] | undefined):
  | { ok: true; flows: BasicChatFlow[] }
  | { ok: false; message: string } {
  if (!flowIds || flowIds.length === 0) {
    return { ok: true, flows };
  }

  const flowById = new Map(flows.map((flow) => [flow.id, flow]));
  const unknown = flowIds.filter((id) => !flowById.has(id));

  if (unknown.length > 0) {
    return {
      ok: false,
      message: `未知 flow id：${unknown.join(", ")}。可用 id：${flows.map((flow) => flow.id).join(", ")}`,
    };
  }

  return { ok: true, flows: flowIds.map((id) => flowById.get(id)!) };
}

function readChatTokenUsage(userId: string, responseMessageId: string): BasicChatTokenUsage | undefined {
  const trace = listAiTracesForUser(userId).find((item) => item.messageId === responseMessageId);
  const usage = trace?.metadata?.tokenUsageSummary;

  if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
    return undefined;
  }

  const record = usage as Record<string, unknown>;
  const promptTokens = readNumber(record.prompt_tokens);
  const completionTokens = readNumber(record.completion_tokens);
  const totalTokens = readNumber(record.total_tokens) ?? (
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

function jsonRequest(url: string, body: unknown, cookie: string) {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
}

function estimateBasicChatTokenUsage(flows: BasicChatFlow[]) {
  const textLength = flows.reduce((total, flow) => (
    total
    + flow.goal.length
    + flow.turns.reduce((turnTotal, turn) => turnTotal + turn.userInput.length + turn.expectation.length, 0)
  ), 0);
  const turnCount = summarizeBasicChatFixture(flows).turnCount;

  return Math.ceil(textLength / 2) + turnCount * 2800;
}

function logRunStart(input: {
  model: string;
  judgeModel: string;
  flowCount: number;
  turnCount: number;
  filterLabel: string;
  reportPath: string;
  estimatedTokenTotal: number;
}) {
  console.log([
    `基础 LLM 黑盒套件启动`,
    `模型：${input.model}`,
    `Judge 模型：${input.judgeModel}`,
    `flow 数：${input.flowCount}`,
    `turn 数：${input.turnCount}`,
    `筛选条件：${input.filterLabel}`,
    `报告路径：${input.reportPath}`,
    `预计 token 消耗：约 ${input.estimatedTokenTotal}`,
  ].join("\n"));
}

function createSuiteErrorRecord(input: { failureReason: string }): BasicChatTurnRunRecord {
  return {
    flowId: "(suite)",
    goal: "基础黑盒套件启动",
    turnIndex: 0,
    userInput: "",
    expectation: "",
    executed: false,
    status: "error",
    finalAssistantTextSummary: "",
    visibleOutputKinds: [],
    failureReason: input.failureReason,
  };
}

function extractCookiePair(setCookieHeader: string | null) {
  if (!setCookieHeader) {
    throw new Error("Missing Set-Cookie header.");
  }

  return setCookieHeader.split(";")[0];
}

function summarizeUnknown(value: unknown) {
  try {
    return summarizeReportText(JSON.stringify(value));
  } catch {
    return summarizeReportText(String(value));
  }
}

function readSafeErrorMessage(error: unknown) {
  if (!error || typeof error !== "object" || Array.isArray(error)) {
    return "聊天生成失败，请稍后重试。";
  }

  const message = (error as Record<string, unknown>).message;
  return typeof message === "string" && message.trim()
    ? message.trim()
    : "聊天生成失败，请稍后重试。";
}

function parseFlowIds(value: string | undefined) {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatFilterLabel(flowIds: string[] | undefined) {
  return flowIds && flowIds.length > 0 ? flowIds.join(", ") : "全部 flow";
}

function readChatModel(env: NodeJS.ProcessEnv) {
  return env.DEEPSEEK_MODEL?.trim() || defaultChatModel;
}

function readJudgeModelLabel(env: NodeJS.ProcessEnv) {
  return env.DEEPSEEK_JUDGE_MODEL?.trim() || env.DEEPSEEK_MODEL?.trim() || defaultChatModel;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
