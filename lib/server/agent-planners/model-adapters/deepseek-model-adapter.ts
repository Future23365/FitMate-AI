import { AgentActionSchema } from "@/lib/server/agent-core/contracts";
import { stableStringify } from "@/lib/server/agent-core/canonical-json";
import { REDACTED_VALUE, redactJsonValue } from "@/lib/server/agent-core/redaction";
import type { JsonValue } from "@/lib/server/agent-core/contracts";

import {
  createInvalidModelActionCandidate,
  ModelAdapterError,
  normalizeModelTokenUsage,
  type ModelActionCompletionParseStatus,
  type ModelActionCompletionInput,
  type ModelActionCompletionResult,
  type ModelActionCompletionTrace,
  type ModelTraceLongTextChunk,
  type ModelTraceLongTextEnvelope,
  type ModelAdapter,
} from "./model-adapter";
import {
  agentRuntimeConfig,
  agentLlmPromptConfig,
  buildAgentActionSystemPrompt,
  type AgentLlmPromptConfig,
} from "@/lib/server/config";

type DeepSeekFetch = typeof fetch;

type DeepSeekModelAdapterOptions = {
  apiKey: string;
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
  fetchImpl?: DeepSeekFetch;
  promptConfig?: AgentLlmPromptConfig;
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

type DeepSeekRequestBody = {
  model: string;
  temperature: number;
  max_tokens: number;
  response_format: { type: "json_object" };
  messages: Array<{ role: string; content: string }>;
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
  private readonly promptConfig: AgentLlmPromptConfig;

  constructor(options: DeepSeekModelAdapterOptions) {
    if (!options.apiKey) {
      throw new ModelAdapterError("DeepSeekModelAdapter requires apiKey.");
    }

    this.promptConfig = options.promptConfig ?? agentLlmPromptConfig;
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint ?? DEFAULT_DEEPSEEK_ENDPOINT;
    this.model = options.model ?? DEFAULT_DEEPSEEK_MODEL;
    this.timeoutMs = options.timeoutMs ?? agentRuntimeConfig.llm.timeoutMs;
    this.temperature = options.temperature ?? this.promptConfig.requestDefaults.temperature;
    this.maxTokens = options.maxTokens ?? this.promptConfig.requestDefaults.maxTokens;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** completeAction 要求 DeepSeek 只返回 JSON AgentAction candidate，非法输出转成可 repair action。 */
  async completeAction(input: ModelActionCompletionInput): Promise<ModelActionCompletionResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const requestBody = this.createRequestBody(input);
    const requestTrace = this.createRequestTrace(input, requestBody);

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        const responseText = await safeReadResponseText(response);
        const actionCandidate = createInvalidModelActionCandidate("deepseek_http_error", {
          status: response.status,
        });

        return {
          actionCandidate,
          model: this.model,
          diagnostics: safeTraceValue({ status: response.status }),
          trace: this.createCompletionTrace({
            request: requestTrace,
            response: {
              model: this.model,
              httpStatus: response.status,
              status: "http_error",
              rawText: responseText ? summarizeText(responseText) : undefined,
              rawTextLength: responseText?.length,
            },
            actionCandidate,
            parseStatus: "http_error",
            failureCode: "deepseek_http_error",
            diagnostics: { status: response.status },
          }),
        };
      }

      const payload = await response.json() as DeepSeekChatResponse;
      const content = payload.choices?.[0]?.message?.content;
      const model = payload.model ?? this.model;
      const usage = normalizeModelTokenUsage(payload.usage);
      if (!content) {
        const actionCandidate = createInvalidModelActionCandidate("deepseek_empty_content");

        return {
          actionCandidate,
          model,
          usage,
          trace: this.createCompletionTrace({
            request: requestTrace,
            response: {
              model,
              httpStatus: response.status,
              status: "empty_content",
              rawResponse: summarizeDeepSeekPayload(payload),
            },
            actionCandidate,
            parseStatus: "empty_content",
            failureCode: "deepseek_empty_content",
            tokenUsage: usage,
          }),
        };
      }

      const parsed = parseJsonObject(content);
      if (!parsed.ok) {
        const actionCandidate = createInvalidModelActionCandidate("invalid_json", { message: parsed.message });

        return {
          actionCandidate,
          rawText: content,
          model,
          usage,
          diagnostics: safeTraceValue({ message: parsed.message }),
          trace: this.createCompletionTrace({
            request: requestTrace,
            response: {
              model,
              httpStatus: response.status,
              status: "invalid_json",
              rawText: summarizeText(content),
              rawTextLength: content.length,
              rawResponse: summarizeDeepSeekPayload(payload),
            },
            actionCandidate,
            parseStatus: "invalid_json",
            failureCode: "invalid_json",
            tokenUsage: usage,
            diagnostics: { message: parsed.message },
          }),
        };
      }

      const actionResult = AgentActionSchema.safeParse(parsed.value);
      const actionCandidate = actionResult.success
        ? actionResult.data
        : createInvalidModelActionCandidate("invalid_action_schema", {
            issues: actionResult.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          });
      const parseStatus: ModelActionCompletionParseStatus = actionResult.success
        ? "parsed"
        : "invalid_action_schema";
      const diagnostics = actionResult.success
        ? undefined
        : {
            issues: actionResult.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          };

      return {
        actionCandidate,
        rawText: content,
        model,
        usage,
        diagnostics: diagnostics ? safeTraceValue(diagnostics) : undefined,
        trace: this.createCompletionTrace({
          request: requestTrace,
          response: {
            model,
            httpStatus: response.status,
            status: parseStatus,
            rawText: summarizeText(content),
            rawTextLength: content.length,
            rawResponse: summarizeDeepSeekPayload(payload),
          },
          actionCandidate,
          parsedAction: parsed.value,
          parseStatus,
          failureCode: actionResult.success ? undefined : "invalid_action_schema",
          tokenUsage: usage,
          diagnostics,
        }),
      };
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") {
        throw new ModelAdapterError(
          "DeepSeek request timed out.",
          { timeoutMs: this.timeoutMs },
          this.createCompletionTrace({
            request: requestTrace,
            response: {
              model: this.model,
              status: "timeout",
            },
            actionCandidate: createInvalidModelActionCandidate("timeout"),
            parseStatus: "timeout",
            failureCode: "timeout",
            diagnostics: { timeoutMs: this.timeoutMs },
          }),
        );
      }

      throw new ModelAdapterError(
        "DeepSeek request failed before returning an action candidate.",
        {
          cause: error instanceof Error ? error.message : String(error),
        },
        this.createCompletionTrace({
          request: requestTrace,
          response: {
            model: this.model,
            status: "adapter_exception",
          },
          actionCandidate: createInvalidModelActionCandidate("adapter_exception"),
          parseStatus: "adapter_exception",
          failureCode: "adapter_exception",
          diagnostics: {
            cause: error instanceof Error ? error.message : String(error),
          },
        }),
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private createRequestBody(input: ModelActionCompletionInput): DeepSeekRequestBody {
    return {
      model: this.model,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildAgentActionSystemPrompt(this.promptConfig),
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

  private createRequestTrace(
    input: ModelActionCompletionInput,
    requestBody: DeepSeekRequestBody,
  ): ModelActionCompletionTrace["request"] {
    return {
      model: requestBody.model,
      endpoint: this.endpoint,
      temperature: requestBody.temperature,
      max_tokens: requestBody.max_tokens,
      response_format: requestBody.response_format,
      timeoutMs: this.timeoutMs,
      messageCount: requestBody.messages.length,
      messages: requestBody.messages.map((message) => ({
        role: message.role,
        content: createModelTraceMessageContent(message.content),
        contentLength: message.content.length,
      })),
      run: {
        runId: input.run.runId,
        step: input.step,
        latestUserMessage: summarizeText(input.run.userInput),
        messageCount: input.run.messages?.length ?? 0,
        observationCount: input.observations.length,
        toolResultCount: input.toolResults.length,
        toolCount: input.manifests.length,
        toolNames: input.manifests.map((manifest) => manifest.name),
        limits: safeTraceValue(input.run.limits ?? {}),
      },
    };
  }

  private createCompletionTrace(input: {
    request: ModelActionCompletionTrace["request"];
    response?: ModelActionCompletionTrace["response"];
    actionCandidate: unknown;
    parsedAction?: unknown;
    parseStatus: ModelActionCompletionParseStatus;
    failureCode?: string;
    tokenUsage?: ModelActionCompletionTrace["tokenUsage"];
    diagnostics?: unknown;
  }): ModelActionCompletionTrace {
    const actionSource = input.parsedAction ?? input.actionCandidate;

    return {
      provider: "deepseek",
      adapterName: this.name,
      request: input.request,
      response: input.response,
      parsedAction: input.parsedAction === undefined ? undefined : safeTraceValue(input.parsedAction),
      actionType: readActionType(actionSource),
      toolName: readToolName(actionSource),
      parseStatus: input.parseStatus,
      failureCode: input.failureCode,
      tokenUsage: input.tokenUsage,
      diagnostics: input.diagnostics === undefined ? undefined : safeTraceValue(input.diagnostics),
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

async function safeReadResponseText(response: Response) {
  try {
    return await response.text();
  } catch {
    return undefined;
  }
}

function summarizeDeepSeekPayload(payload: DeepSeekChatResponse): JsonValue {
  return safeTraceValue({
    model: payload.model,
    choiceCount: payload.choices?.length ?? 0,
    hasContent: Boolean(payload.choices?.[0]?.message?.content),
    usage: normalizeModelTokenUsage(payload.usage),
  });
}

function safeTraceValue(value: unknown): JsonValue {
  return redactJsonValue(value, { maxStringLength: agentRuntimeConfig.trace.modelTraceMaxStringLength });
}

function summarizeText(value: string): JsonValue {
  return safeTraceValue(value);
}

// createModelTraceMessageContent 保留模型真实可见 message 的诊断价值，长文本交给导出层外置而不是提前硬截。
function createModelTraceMessageContent(value: string): JsonValue {
  if (value.length <= agentRuntimeConfig.trace.modelTraceMaxStringLength) {
    return summarizeText(value);
  }

  return createTraceLongTextEnvelope(value);
}

function createTraceLongTextEnvelope(value: string): ModelTraceLongTextEnvelope {
  const chunks: ModelTraceLongTextChunk[] = [];
  let hasRedactedChunk = false;

  for (let start = 0; start < value.length; start += agentRuntimeConfig.trace.modelTraceLongTextChunkLength) {
    const rawChunk = value.slice(start, start + agentRuntimeConfig.trace.modelTraceLongTextChunkLength);
    const safeChunk = redactJsonValue(rawChunk, { maxStringLength: agentRuntimeConfig.trace.modelTraceLongTextChunkLength });
    const text = typeof safeChunk === "string" ? safeChunk : REDACTED_VALUE;

    if (text !== rawChunk) {
      hasRedactedChunk = true;
    }

    chunks.push({
      index: chunks.length,
      start,
      end: Math.min(start + rawChunk.length, value.length),
      text,
    });
  }

  const storedContent = chunks.map((chunk) => chunk.text).join("");

  return {
    kind: "trace_long_text",
    contentType: "model_request_message",
    originalLength: value.length,
    storedLength: storedContent.length,
    chunkSize: agentRuntimeConfig.trace.modelTraceLongTextChunkLength,
    hash: hashTraceText(storedContent),
    preview: createTraceLongTextPreview(storedContent),
    redacted: hasRedactedChunk,
    chunks,
  };
}

function createTraceLongTextPreview(value: string) {
  const edgeLength = agentRuntimeConfig.trace.modelTracePreviewEdgeLength;

  if (value.length <= edgeLength * 2) {
    return value;
  }

  return `${value.slice(0, edgeLength)}\n...[middle omitted]...\n${value.slice(-edgeLength)}`;
}

function hashTraceText(value: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function readActionType(action: unknown) {
  return isRecord(action) && typeof action.type === "string" ? action.type : undefined;
}

function readToolName(action: unknown) {
  return isRecord(action) && typeof action.toolName === "string" ? action.toolName : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
