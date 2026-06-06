import { AgentActionSchema } from "@/lib/server/agent-core/contracts";
import { stableStringify } from "@/lib/server/agent-core/canonical-json";
import {
  OK_TOOL_RESULT_INDEX_OBSERVATION_ROLE,
  TOOL_RESULT_MODEL_PROJECTION_CHANNEL,
} from "@/lib/server/agent-core/observation";
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
  type ModelTraceReasoningSummary,
  type ModelAdapter,
} from "./model-adapter";
import {
  agentRuntimeConfig,
  agentLlmPromptConfig,
  buildAgentActionSystemPrompt,
  getAgentVisibleOutputContracts,
  summarizeAgentVisibleOutputContracts,
  type AgentLlmPromptConfig,
  type AgentVisibleOutputContract,
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
  outputContracts?: readonly AgentVisibleOutputContract[];
};

type DeepSeekChatResponse = {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
    };
  }>;
  usage?: JsonValue;
};

type DeepSeekThinkingType = "enabled" | "disabled";

type DeepSeekRequestBody = {
  model: string;
  temperature: number;
  max_tokens: number;
  response_format: { type: "json_object" };
  thinking: { type: DeepSeekThinkingType };
  reasoning_effort?: "high" | "max";
  messages: Array<{ role: string; content: string }>;
};

const DEFAULT_DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
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
  private readonly outputContracts: readonly AgentVisibleOutputContract[];

  constructor(options: DeepSeekModelAdapterOptions) {
    if (!options.apiKey) {
      throw new ModelAdapterError("DeepSeekModelAdapter requires apiKey.");
    }

    this.promptConfig = options.promptConfig ?? agentLlmPromptConfig;
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint ?? DEFAULT_DEEPSEEK_ENDPOINT;
    this.model = options.model ?? agentRuntimeConfig.llm.deepSeek.defaultModel;
    this.timeoutMs = options.timeoutMs ?? agentRuntimeConfig.llm.timeoutMs;
    this.temperature = options.temperature ?? this.promptConfig.requestDefaults.temperature;
    this.maxTokens = options.maxTokens ?? this.promptConfig.requestDefaults.maxTokens;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.outputContracts = options.outputContracts ?? getAgentVisibleOutputContracts();
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
      const reasoningTrace = createReasoningTrace(payload, requestTrace);
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
              reasoning: reasoningTrace,
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
              reasoning: reasoningTrace,
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
            reasoning: reasoningTrace,
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
    const thinking = createDeepSeekThinkingRequest(input);

    return {
      model: this.model,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      response_format: { type: "json_object" },
      thinking: {
        type: thinking.type,
      },
      reasoning_effort: thinking.reasoning_effort,
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
            outputContracts: this.outputContracts,
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
    const dedupeSummary = summarizePlannerInputDedupe(input);
    const outputContracts = summarizeAgentVisibleOutputContracts(this.outputContracts);

    return {
      model: requestBody.model,
      endpoint: this.endpoint,
      temperature: requestBody.temperature,
      max_tokens: requestBody.max_tokens,
      response_format: requestBody.response_format,
      thinking: {
        type: requestBody.thinking.type,
        enabled: requestBody.thinking.type === "enabled",
        reasoning_effort: requestBody.reasoning_effort,
      },
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
        successfulLightweightObservationCount: dedupeSummary.successfulLightweightObservationCount,
        repairDiagnosticObservationCount: dedupeSummary.repairDiagnosticObservationCount,
        toolResultProjectionCount: dedupeSummary.toolResultProjectionCount,
        toolResultProjectionPresence: dedupeSummary.toolResultProjectionPresence,
        toolCount: input.manifests.length,
        toolNames: input.manifests.map((manifest) => manifest.name),
        outputContractCount: outputContracts.count,
        outputContracts: outputContracts.contracts,
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
  const reasoningContent = readDeepSeekReasoningContent(payload);

  return safeTraceValue({
    model: payload.model,
    choiceCount: payload.choices?.length ?? 0,
    hasContent: Boolean(payload.choices?.[0]?.message?.content),
    hasReasoningContent: Boolean(reasoningContent),
    reasoningContentLength: reasoningContent?.length,
    usage: normalizeModelTokenUsage(payload.usage),
  });
}

// createDeepSeekThinkingRequest 只把受控 run metadata 映射为 provider 参数，不参与业务语义推断。
function createDeepSeekThinkingRequest(input: ModelActionCompletionInput) {
  const enabled = readRunThinkingEnabled(input.run.metadata);
  const type: DeepSeekThinkingType = enabled ? "enabled" : "disabled";

  return {
    type,
    reasoning_effort: enabled ? agentRuntimeConfig.llm.deepSeek.thinking.reasoningEffort : undefined,
  };
}

function readRunThinkingEnabled(metadata: ModelActionCompletionInput["run"]["metadata"]) {
  const value = metadata?.thinkingEnabled;

  return typeof value === "boolean"
    ? value
    : agentRuntimeConfig.llm.deepSeek.thinking.defaultEnabled;
}

// createReasoningTrace 保留 reasoning_content 的安全诊断摘要，正式 AgentAction 仍只从 content 解析。
function createReasoningTrace(
  payload: DeepSeekChatResponse,
  requestTrace: ModelActionCompletionTrace["request"],
): ModelTraceReasoningSummary {
  const reasoningContent = readDeepSeekReasoningContent(payload);

  return {
    received: Boolean(reasoningContent),
    contentLength: reasoningContent?.length ?? 0,
    rawText: reasoningContent ? summarizeText(reasoningContent) : undefined,
    source: "choices[0].message.reasoning_content",
    unexpectedWhenThinkingDisabled: Boolean(reasoningContent) && requestTrace.thinking?.type === "disabled",
  };
}

function readDeepSeekReasoningContent(payload: DeepSeekChatResponse) {
  return payload.choices?.[0]?.message?.reasoning_content ?? undefined;
}

function safeTraceValue(value: unknown): JsonValue {
  return redactJsonValue(value, { maxStringLength: agentRuntimeConfig.trace.modelTraceMaxStringLength });
}

function summarizeText(value: string): JsonValue {
  return safeTraceValue(value);
}

/** summarizePlannerInputDedupe 只记录去重诊断元数据，不复制模型可见 projection 或 handler output。 */
function summarizePlannerInputDedupe(input: ModelActionCompletionInput) {
  const successfulLightweightObservationCount = input.observations.filter(isSuccessfulLightweightObservation).length;
  const toolResultProjectionPresence = input.toolResults.map((result) => ({
    toolResultId: result.toolResultId,
    toolName: result.toolName,
    satisfied: result.fulfillment.satisfied,
    factChannel: result.ok ? (result.fulfillment.satisfied ? "fact" as const : "diagnostic" as const) : "failed" as const,
    hasModelProjection: result.ok && result.projection.model !== undefined,
  }));

  return {
    successfulLightweightObservationCount,
    repairDiagnosticObservationCount: Math.max(0, input.observations.length - successfulLightweightObservationCount),
    toolResultProjectionCount: toolResultProjectionPresence.filter((entry) => entry.hasModelProjection).length,
    toolResultProjectionPresence,
  };
}

function isSuccessfulLightweightObservation(observation: ModelActionCompletionInput["observations"][number]) {
  const content = observation.content;

  return observation.type === "tool_result"
    && observation.ok === true
    && isRecord(content)
    && content.observationRole === OK_TOOL_RESULT_INDEX_OBSERVATION_ROLE
    && content.modelFactsChannel === TOOL_RESULT_MODEL_PROJECTION_CHANNEL;
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
