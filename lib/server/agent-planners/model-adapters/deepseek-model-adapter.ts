import { AgentActionSchema } from "@/lib/server/agent-core/contracts";
import { stableStringify } from "@/lib/server/agent-core/canonical-json";
import type { JsonValue } from "@/lib/server/agent-core/contracts";

import {
  createInvalidModelActionCandidate,
  ModelAdapterError,
  type ModelActionCompletionInput,
  type ModelActionCompletionResult,
  type ModelAdapter,
} from "./model-adapter";

type DeepSeekFetch = typeof fetch;

type DeepSeekModelAdapterOptions = {
  apiKey: string;
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
  fetchImpl?: DeepSeekFetch;
};

type DeepSeekChatResponse = {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  usage?: JsonValue;
};

const DEFAULT_DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";

/** DeepSeekModelAdapter 封装 DeepSeek 请求、模型参数、结构化输出解析和错误归一化。 */
export class DeepSeekModelAdapter implements ModelAdapter {
  readonly name = "deepseek-model-adapter";
  private readonly endpoint: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly temperature: number;
  private readonly maxTokens: number;
  private readonly fetchImpl: DeepSeekFetch;
  private readonly apiKey: string;

  constructor(options: DeepSeekModelAdapterOptions) {
    if (!options.apiKey) {
      throw new ModelAdapterError("DeepSeekModelAdapter requires apiKey.");
    }

    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint ?? DEFAULT_DEEPSEEK_ENDPOINT;
    this.model = options.model ?? DEFAULT_DEEPSEEK_MODEL;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.temperature = options.temperature ?? 0;
    this.maxTokens = options.maxTokens ?? 1_200;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** completeAction 要求 DeepSeek 只返回 JSON AgentAction candidate，非法输出转成可 repair action。 */
  async completeAction(input: ModelActionCompletionInput): Promise<ModelActionCompletionResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(this.createRequestBody(input)),
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          actionCandidate: createInvalidModelActionCandidate("deepseek_http_error", {
            status: response.status,
          }),
          model: this.model,
        };
      }

      const payload = await response.json() as DeepSeekChatResponse;
      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        return {
          actionCandidate: createInvalidModelActionCandidate("deepseek_empty_content"),
          model: payload.model ?? this.model,
          usage: payload.usage,
        };
      }

      const parsed = parseJsonObject(content);
      if (!parsed.ok) {
        return {
          actionCandidate: createInvalidModelActionCandidate("invalid_json", { message: parsed.message }),
          rawText: content,
          model: payload.model ?? this.model,
          usage: payload.usage,
        };
      }

      const actionResult = AgentActionSchema.safeParse(parsed.value);
      return {
        actionCandidate: actionResult.success
          ? actionResult.data
          : createInvalidModelActionCandidate("invalid_action_schema", {
              issues: actionResult.error.issues.map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
              })),
            }),
        rawText: content,
        model: payload.model ?? this.model,
        usage: payload.usage,
      };
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") {
        throw new ModelAdapterError("DeepSeek request timed out.", { timeoutMs: this.timeoutMs });
      }

      throw new ModelAdapterError("DeepSeek request failed before returning an action candidate.");
    } finally {
      clearTimeout(timeout);
    }
  }

  private createRequestBody(input: ModelActionCompletionInput) {
    return {
      model: this.model,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "Return exactly one JSON object matching the AgentAction contract.",
            "Allowed type values are tool_call, final_answer, and ask_user.",
            "Do not execute tools, invent confirmation hashes, leak secrets, or emit NDJSON events.",
          ].join(" "),
        },
        {
          role: "user",
          content: stableStringify({
            run: {
              runId: input.run.runId,
              userInput: input.run.userInput,
              messages: input.run.messages ?? [],
              metadata: input.run.metadata ?? {},
            },
            step: input.step,
            tools: input.manifests,
            observations: input.observations,
            toolResults: input.toolResults,
          }),
        },
      ],
    };
  }
}

/** createDeepSeekModelAdapterFromEnv 是测试和后续接入可选使用的 DeepSeek-only 构造器。 */
export function createDeepSeekModelAdapterFromEnv(fetchImpl?: DeepSeekFetch): DeepSeekModelAdapter | undefined {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return undefined;
  }

  return new DeepSeekModelAdapter({
    apiKey,
    endpoint: process.env.DEEPSEEK_API_URL,
    model: process.env.DEEPSEEK_MODEL,
    fetchImpl,
  });
}

function parseJsonObject(content: string): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(content) };
  } catch (error) {
    const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fencedMatch?.[1]) {
      try {
        return { ok: true, value: JSON.parse(fencedMatch[1]) };
      } catch {
        return { ok: false, message: "DeepSeek fenced JSON content is invalid." };
      }
    }

    return { ok: false, message: (error as Error).message };
  }
}
