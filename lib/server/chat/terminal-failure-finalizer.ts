import "server-only";

import { z } from "zod";

import { stableStringify } from "@/lib/server/agent-core/canonical-json";
import type {
  AgentRunInput,
  AgentRunResult,
  JsonValue,
  ToolError,
} from "@/lib/server/agent-core/contracts";
import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { redactJsonValue } from "@/lib/server/agent-core/redaction";
import type { ModelTokenUsage, PlannerModelTraceEvent } from "@/lib/server/agent-planners/model-adapters/model-adapter";
import { normalizeModelTokenUsage } from "@/lib/server/agent-planners/model-adapters/model-adapter";
import {
  agentRuntimeConfig,
  buildTerminalFailureFinalizerSystemPrompt,
  terminalFailureFinalizerPromptConfig,
  type TerminalFailureFinalizerPromptConfig,
} from "@/lib/server/config";

export type TerminalFailureFinalizerFailureCategory =
  | "visible_output_validation"
  | "terminal_reference"
  | "repair_exhausted"
  | "budget_exhausted"
  | "unsupported_capability";

export type TerminalFailureFinalizerSkipReason =
  | "failure_not_classifiable"
  | "finalizer_disabled"
  | "max_calls_exceeded"
  | "model_config_missing"
  | "provider_unavailable"
  | "provider_quota_exhausted"
  | "remaining_time_insufficient";

export type TerminalFailureFinalizerDegradedReason =
  | TerminalFailureFinalizerSkipReason
  | "finalizer_http_error"
  | "finalizer_timeout"
  | "finalizer_adapter_exception"
  | "finalizer_invalid_json"
  | "finalizer_output_invalid";

export type TerminalFailureFinalizerInput = {
  failureCategory: TerminalFailureFinalizerFailureCategory;
  errorCode: string;
  userRequestSummary: string;
  unmetRequirements: Array<{ code: string; path?: string; summary: string }>;
  blockedOutputs: Array<{ outputType?: string; reasonCode: string; summary: string }>;
  verifiedFactsSummary: JsonValue;
  allowedResponseMode: "failure_explanation_only";
};

export type TerminalFailureFinalizerOutput = {
  content: string;
  suggestedQuestions?: string[];
};

export type TerminalFailureFinalizerTrace = {
  provider: string;
  adapterName: string;
  promptVersion: string;
  request: {
    model?: string;
    endpoint?: string;
    temperature: number;
    max_tokens: number;
    response_format: { type: "json_object" };
    thinking: {
      type: "disabled";
    };
    timeoutMs: number;
    messageCount: number;
    messages: Array<{ role: string; content: JsonValue; contentLength: number }>;
    inputSummary: TerminalFailureFinalizerInput;
  };
  response?: {
    model?: string;
    httpStatus?: number;
    status: "parsed" | "http_error" | "invalid_json" | "invalid_output" | "timeout" | "adapter_exception";
    rawText?: JsonValue;
    rawTextLength?: number;
    rawResponse?: JsonValue;
  };
  tokenUsage?: ModelTokenUsage;
  outputValidation: {
    ok: boolean;
    code?: TerminalFailureFinalizerDegradedReason;
    issues?: JsonValue;
  };
};

export type TerminalFailureFinalizerResult =
  | {
      ok: true;
      output: TerminalFailureFinalizerOutput;
      trace: TerminalFailureFinalizerTrace;
      model?: string;
      tokenUsage?: ModelTokenUsage;
    }
  | {
      ok: false;
      reason: TerminalFailureFinalizerDegradedReason;
      trace?: TerminalFailureFinalizerTrace;
      model?: string;
      tokenUsage?: ModelTokenUsage;
    };

export type TerminalFailureFinalizer = {
  readonly provider: string;
  readonly model: string;
  finalize(input: TerminalFailureFinalizerInput): Promise<TerminalFailureFinalizerResult>;
};

export type TerminalFailureFinalizerAvailability = {
  allowed: boolean;
  reason?: TerminalFailureFinalizerSkipReason;
  providerDiagnosticCode?: string;
};

type TerminalFailureFinalizerRuntimeConfig = typeof agentRuntimeConfig.terminalFailureFinalizer;

type DeepSeekTerminalFailureFinalizerOptions = {
  apiKey: string;
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
  promptConfig?: TerminalFailureFinalizerPromptConfig;
};

type DeepSeekTerminalFailureFinalizerFactoryInput = {
  env?: Partial<Pick<NodeJS.ProcessEnv, "DEEPSEEK_API_KEY" | "DEEPSEEK_API_URL" | "DEEPSEEK_MODEL">>;
  fetchImpl?: typeof fetch;
};

type DeepSeekTerminalFailureFinalizerFactoryResult =
  | { ok: true; finalizer: TerminalFailureFinalizer }
  | { ok: false; reason: TerminalFailureFinalizerSkipReason; missing: string[] };

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
  thinking: { type: "disabled" };
  messages: Array<{ role: string; content: string }>;
};

const DEFAULT_DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const maxFinalizerTraceStringLength = 800;
const maxFinalizerListItems = 6;
const quotaOrRateLimitStatuses = new Set([402, 429]);
const authFailureStatuses = new Set([401, 403]);
const providerFailureCodes = new Set([
  "deepseek_http_error",
  "timeout",
  "adapter_exception",
]);
const timeoutFailureCodes: ReadonlySet<string> = new Set([
  AGENT_ERROR_CODES.OVERALL_TIMEOUT,
  AGENT_ERROR_CODES.TIMEOUT,
]);
const sensitiveDiagnosticKeys = new Set([
  "apikey",
  "api_key",
  "authorization",
  "bearer",
  "cookie",
  "set_cookie",
  "set-cookie",
  "password",
  "secret",
  "token",
]);

// buildTerminalFailureFinalizerInput 把 runtime failure 投影成可给模型看的脱敏失败摘要。
export function buildTerminalFailureFinalizerInput(input: {
  run: AgentRunInput;
  result: AgentRunResult;
  failureCategory: TerminalFailureFinalizerFailureCategory;
}): TerminalFailureFinalizerInput {
  const terminalError = input.result.terminalError;
  const unmetRequirements = collectUnmetRequirements(input.result);
  const blockedOutputs = collectBlockedOutputs(input.result);

  return {
    failureCategory: input.failureCategory,
    errorCode: terminalError?.code ?? "unknown_terminal_failure",
    userRequestSummary: summarizeText(input.run.userInput),
    unmetRequirements,
    blockedOutputs,
    verifiedFactsSummary: summarizeVerifiedFacts(input.result),
    allowedResponseMode: "failure_explanation_only",
  };
}

// assessTerminalFailureFinalizerAvailability 是 provider gate；只根据配置、预算和模型诊断事实决定是否允许调用。
export function assessTerminalFailureFinalizerAvailability(input: {
  config?: TerminalFailureFinalizerRuntimeConfig;
  providerConfigured: boolean;
  callsThisRun: number;
  remainingTimeMs: number;
  plannerDiagnostics: readonly PlannerModelTraceEvent[];
  terminalError?: ToolError;
}): TerminalFailureFinalizerAvailability {
  const config = input.config ?? agentRuntimeConfig.terminalFailureFinalizer;

  if (!config.enabled) {
    return { allowed: false, reason: "finalizer_disabled" };
  }

  if (input.callsThisRun >= config.maxCallsPerRun) {
    return { allowed: false, reason: "max_calls_exceeded" };
  }

  if (!input.providerConfigured) {
    return { allowed: false, reason: "model_config_missing" };
  }

  if (input.remainingTimeMs < config.timeoutMs) {
    return { allowed: false, reason: "remaining_time_insufficient" };
  }

  const providerReason = classifyProviderUnavailableReason(input.plannerDiagnostics, input.terminalError);

  if (providerReason) {
    return {
      allowed: false,
      reason: providerReason.reason,
      providerDiagnosticCode: providerReason.code,
    };
  }

  return { allowed: true };
}

// parseTerminalFailureFinalizerOutput 只校验 finalizer 兜底回复的用户可见事件 shape。
export function parseTerminalFailureFinalizerOutput(
  value: unknown,
  config: TerminalFailureFinalizerRuntimeConfig = agentRuntimeConfig.terminalFailureFinalizer,
): { ok: true; output: TerminalFailureFinalizerOutput } | { ok: false; issues: JsonValue } {
  const schema = createTerminalFailureFinalizerOutputSchema(config);
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  return { ok: true, output: parsed.data };
}

// DeepSeekTerminalFailureFinalizer 调用 DeepSeek 生成受限失败回复，不暴露主 Agent tool loop。
export class DeepSeekTerminalFailureFinalizer implements TerminalFailureFinalizer {
  readonly provider = "deepseek";
  readonly adapterName = "deepseek-terminal-failure-finalizer";
  private readonly apiKey: string;
  private readonly endpoint: string;
  readonly model: string;
  private readonly timeoutMs: number;
  private readonly temperature: number;
  private readonly maxTokens: number;
  private readonly fetchImpl: typeof fetch;
  private readonly promptConfig: TerminalFailureFinalizerPromptConfig;

  constructor(options: DeepSeekTerminalFailureFinalizerOptions) {
    if (!options.apiKey) {
      throw new Error("DeepSeekTerminalFailureFinalizer requires apiKey.");
    }

    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint ?? DEFAULT_DEEPSEEK_ENDPOINT;
    this.model = options.model ?? agentRuntimeConfig.llm.deepSeek.defaultModel;
    this.timeoutMs = options.timeoutMs ?? agentRuntimeConfig.terminalFailureFinalizer.timeoutMs;
    this.temperature = options.temperature ?? agentRuntimeConfig.terminalFailureFinalizer.temperature;
    this.maxTokens = options.maxTokens ?? agentRuntimeConfig.terminalFailureFinalizer.maxTokens;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.promptConfig = options.promptConfig ?? terminalFailureFinalizerPromptConfig;
  }

  async finalize(input: TerminalFailureFinalizerInput): Promise<TerminalFailureFinalizerResult> {
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
        const reason = classifyHttpStatusAsDegradedReason(response.status);

        return {
          ok: false,
          reason,
          trace: {
            ...requestTrace,
            response: {
              model: this.model,
              httpStatus: response.status,
              status: "http_error",
              rawText: responseText ? summarizeTraceText(responseText) : undefined,
              rawTextLength: responseText?.length,
            },
            outputValidation: { ok: false, code: reason },
          },
        };
      }

      const payload = await response.json() as DeepSeekChatResponse;
      const content = payload.choices?.[0]?.message?.content;
      const model = payload.model ?? this.model;
      const tokenUsage = normalizeModelTokenUsage(payload.usage);

      if (!content) {
        const trace = {
          ...requestTrace,
          response: {
            model,
            httpStatus: response.status,
            status: "invalid_output" as const,
            rawResponse: summarizeDeepSeekPayload(payload),
          },
          tokenUsage,
          outputValidation: { ok: false, code: "finalizer_output_invalid" as const },
        };

        return { ok: false, reason: "finalizer_output_invalid", trace, model, tokenUsage };
      }

      const parsedJson = parseJsonObject(content);

      if (!parsedJson.ok) {
        const trace = {
          ...requestTrace,
          response: {
            model,
            httpStatus: response.status,
            status: "invalid_json" as const,
            rawText: summarizeTraceText(content),
            rawTextLength: content.length,
            rawResponse: summarizeDeepSeekPayload(payload),
          },
          tokenUsage,
          outputValidation: {
            ok: false,
            code: "finalizer_invalid_json" as const,
            issues: { message: parsedJson.message },
          },
        };

        return { ok: false, reason: "finalizer_invalid_json", trace, model, tokenUsage };
      }

      const outputValidation = parseTerminalFailureFinalizerOutput(parsedJson.value);

      if (!outputValidation.ok) {
        const trace = {
          ...requestTrace,
          response: {
            model,
            httpStatus: response.status,
            status: "invalid_output" as const,
            rawText: summarizeTraceText(content),
            rawTextLength: content.length,
            rawResponse: summarizeDeepSeekPayload(payload),
          },
          tokenUsage,
          outputValidation: {
            ok: false,
            code: "finalizer_output_invalid" as const,
            issues: outputValidation.issues,
          },
        };

        return { ok: false, reason: "finalizer_output_invalid", trace, model, tokenUsage };
      }

      const trace = {
        ...requestTrace,
        response: {
          model,
          httpStatus: response.status,
          status: "parsed" as const,
          rawText: summarizeTraceText(content),
          rawTextLength: content.length,
          rawResponse: summarizeDeepSeekPayload(payload),
        },
        tokenUsage,
        outputValidation: { ok: true },
      };

      return {
        ok: true,
        output: outputValidation.output,
        trace,
        model,
        tokenUsage,
      };
    } catch (error) {
      const isTimeout = (error as { name?: string }).name === "AbortError";
      const reason = isTimeout ? "finalizer_timeout" : "finalizer_adapter_exception";

      return {
        ok: false,
        reason,
        trace: {
          ...requestTrace,
          response: {
            model: this.model,
            status: isTimeout ? "timeout" : "adapter_exception",
          },
          outputValidation: {
            ok: false,
            code: reason,
            issues: isTimeout
              ? { timeoutMs: this.timeoutMs }
              : { cause: error instanceof Error ? error.message : String(error) },
          },
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private createRequestBody(input: TerminalFailureFinalizerInput): DeepSeekRequestBody {
    return {
      model: this.model,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      response_format: { type: "json_object" },
      thinking: {
        type: agentRuntimeConfig.terminalFailureFinalizer.deepSeek.thinkingType,
      },
      messages: [
        {
          role: "system",
          content: buildTerminalFailureFinalizerSystemPrompt(this.promptConfig),
        },
        {
          role: "user",
          content: stableStringify({
            failure: input,
            outputContract: {
              schemaId: "TerminalFailureFinalizerOutput@1",
              allowedFields: ["content", "suggestedQuestions"],
              maxSuggestedQuestions: agentRuntimeConfig.terminalFailureFinalizer.maxSuggestedQuestions,
              responseMode: "failure_explanation_only",
            },
          }),
        },
      ],
    };
  }

  private createRequestTrace(
    input: TerminalFailureFinalizerInput,
    requestBody: DeepSeekRequestBody,
  ): Omit<TerminalFailureFinalizerTrace, "response" | "outputValidation" | "tokenUsage"> {
    return {
      provider: this.provider,
      adapterName: this.adapterName,
      promptVersion: this.promptConfig.promptVersion,
      request: {
        model: requestBody.model,
        endpoint: this.endpoint,
        temperature: requestBody.temperature,
        max_tokens: requestBody.max_tokens,
        response_format: requestBody.response_format,
        thinking: requestBody.thinking,
        timeoutMs: this.timeoutMs,
        messageCount: requestBody.messages.length,
        messages: requestBody.messages.map((message) => ({
          role: message.role,
          content: summarizeTraceText(message.content),
          contentLength: message.content.length,
        })),
        inputSummary: input,
      },
    };
  }
}

// createProductionTerminalFailureFinalizerFromEnv 是 production finalizer 的唯一环境变量构造入口。
export function createProductionTerminalFailureFinalizerFromEnv(
  input: DeepSeekTerminalFailureFinalizerFactoryInput = {},
): DeepSeekTerminalFailureFinalizerFactoryResult {
  const env = input.env ?? process.env;
  const apiKey = readOptionalEnv(env.DEEPSEEK_API_KEY);

  if (!apiKey) {
    return {
      ok: false,
      reason: "model_config_missing",
      missing: ["DEEPSEEK_API_KEY"],
    };
  }

  return {
    ok: true,
    finalizer: new DeepSeekTerminalFailureFinalizer({
      apiKey,
      endpoint: readOptionalEnv(env.DEEPSEEK_API_URL),
      model: readOptionalEnv(env.DEEPSEEK_MODEL),
      fetchImpl: input.fetchImpl,
    }),
  };
}

function createTerminalFailureFinalizerOutputSchema(config: TerminalFailureFinalizerRuntimeConfig) {
  return z.object({
    content: z.string().trim().min(1).max(800),
    suggestedQuestions: z.array(z.string().trim().min(1).max(120))
      .max(config.maxSuggestedQuestions)
      .optional(),
  }).strict();
}

function classifyProviderUnavailableReason(
  diagnostics: readonly PlannerModelTraceEvent[],
  terminalError?: ToolError,
): { reason: Extract<TerminalFailureFinalizerSkipReason, "provider_unavailable" | "provider_quota_exhausted">; code: string } | undefined {
  const diagnostic = [...diagnostics].reverse().find((event) => {
    const status = event.response?.httpStatus;
    return (
      (event.failureCode && providerFailureCodes.has(event.failureCode))
      || event.parseStatus === "timeout"
      || event.parseStatus === "adapter_exception"
      || (typeof status === "number" && status >= 400)
    );
  });

  if (diagnostic) {
    const status = diagnostic.response?.httpStatus;
    const failureCode = diagnostic.failureCode ?? diagnostic.parseStatus;

    if (typeof status === "number" && quotaOrRateLimitStatuses.has(status)) {
      return { reason: "provider_quota_exhausted", code: String(status) };
    }

    if (typeof status === "number" && authFailureStatuses.has(status)) {
      return { reason: "provider_unavailable", code: String(status) };
    }

    if (failureCode === "timeout" || diagnostic.parseStatus === "timeout") {
      return { reason: "provider_unavailable", code: "timeout" };
    }

    return { reason: "provider_unavailable", code: failureCode };
  }

  if (terminalError && timeoutFailureCodes.has(terminalError.code)) {
    return { reason: "provider_unavailable", code: terminalError.code };
  }

  return undefined;
}

function classifyHttpStatusAsDegradedReason(status: number): TerminalFailureFinalizerDegradedReason {
  if (quotaOrRateLimitStatuses.has(status)) {
    return "provider_quota_exhausted";
  }

  return "finalizer_http_error";
}

function collectUnmetRequirements(result: AgentRunResult) {
  const entries: TerminalFailureFinalizerInput["unmetRequirements"] = [];
  const terminalError = result.terminalError;

  if (terminalError) {
    entries.push({
      code: terminalError.code,
      summary: summarizeText(terminalError.message),
    });
    collectDiagnosticEntries(terminalError.details, entries);
  }

  for (const event of result.traceEvents) {
    if (entries.length >= maxFinalizerListItems) {
      break;
    }

    if (event.type === "validation_result" && !event.ok && event.code) {
      entries.push({
        code: event.code,
        summary: `第 ${event.step} 步 action 校验未通过。`,
      });
    } else if (event.type === "budget_event" && event.status === "exhausted") {
      entries.push({
        code: event.reason ?? `${event.budget}_exhausted`,
        summary: `${event.budget} 预算已耗尽。`,
      });
    } else if (event.type === "tool_execution" && !event.ok && event.failureCode) {
      entries.push({
        code: event.failureCode,
        summary: event.error?.details ? summarizeText(stableStringify(redactJsonValue(event.error.details))) : "Tool 执行失败。",
      });
    }
  }

  return entries.slice(0, maxFinalizerListItems);
}

function collectBlockedOutputs(result: AgentRunResult) {
  const blocked: TerminalFailureFinalizerInput["blockedOutputs"] = [];
  collectBlockedOutputsFromValue(result.terminalError?.details, blocked);

  for (const observation of result.observations) {
    if (blocked.length >= maxFinalizerListItems) {
      break;
    }
    collectBlockedOutputsFromValue(observation.content, blocked);
  }

  return blocked.slice(0, maxFinalizerListItems);
}

function summarizeVerifiedFacts(result: AgentRunResult): JsonValue {
  const facts = result.toolResults
    .filter((toolResult) => toolResult.ok)
    .slice(0, maxFinalizerListItems)
    .map((toolResult, index) => ({
      index: index + 1,
      toolName: toolResult.toolName,
      satisfied: toolResult.fulfillment.satisfied,
      summary: summarizeText(toolResult.fulfillment.summary),
    }));

  return {
    okToolResultCount: facts.length,
    facts,
  };
}

function collectDiagnosticEntries(
  value: JsonValue | undefined,
  entries: TerminalFailureFinalizerInput["unmetRequirements"],
) {
  if (!value || entries.length >= maxFinalizerListItems) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectDiagnosticEntries(item, entries);
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  const record = value as Record<string, JsonValue>;
  const code = readString(record.code) ?? readString(record.lastCode) ?? readString(record.reason);

  if (code) {
    entries.push({
      code,
      path: readString(record.path),
      summary: summarizeText(readString(record.message) ?? stableStringify(sanitizeFinalizerDiagnosticValue(record))),
    });
  }

  for (const item of Object.values(record)) {
    collectDiagnosticEntries(item, entries);
  }
}

function collectBlockedOutputsFromValue(
  value: JsonValue | undefined,
  blocked: TerminalFailureFinalizerInput["blockedOutputs"],
) {
  if (!value || blocked.length >= maxFinalizerListItems) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectBlockedOutputsFromValue(item, blocked);
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  const record = value as Record<string, JsonValue>;
  const outputType = readString(record.outputType);
  const reasonCode = readString(record.code) ?? readString(record.lastCode) ?? readString(record.reason);

  if (outputType || reasonCode) {
    blocked.push({
      outputType,
      reasonCode: reasonCode ?? "output_validation_blocked",
      summary: summarizeText(readString(record.message) ?? stableStringify(sanitizeFinalizerDiagnosticValue(record))),
    });
  }

  for (const item of Object.values(record)) {
    collectBlockedOutputsFromValue(item, blocked);
  }
}

function parseJsonObject(content: string): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(content) };
  } catch (error) {
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
  return redactTraceValue({
    model: payload.model,
    choiceCount: payload.choices?.length ?? 0,
    hasContent: Boolean(payload.choices?.[0]?.message?.content),
    usage: normalizeModelTokenUsage(payload.usage),
  });
}

function summarizeTraceText(value: string): JsonValue {
  return redactTraceValue(summarizeText(value));
}

function summarizeText(value: string) {
  if (value.length <= maxFinalizerTraceStringLength) {
    return value;
  }

  return `${value.slice(0, maxFinalizerTraceStringLength)}...[truncated]`;
}

function redactTraceValue(value: unknown): JsonValue {
  return redactJsonValue(value, { maxStringLength: maxFinalizerTraceStringLength });
}

function sanitizeFinalizerDiagnosticValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(sanitizeFinalizerDiagnosticValue);
  }

  if (!value || typeof value !== "object") {
    return redactTraceValue(value);
  }

  const sanitized: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isSensitiveDiagnosticKey(key)) {
      continue;
    }

    sanitized[key] = sanitizeFinalizerDiagnosticValue(entry);
  }

  return sanitized;
}

function isSensitiveDiagnosticKey(key: string) {
  const normalized = key.trim().toLowerCase();
  const withoutSeparators = normalized.replaceAll("_", "").replaceAll("-", "");

  return sensitiveDiagnosticKeys.has(normalized)
    || sensitiveDiagnosticKeys.has(withoutSeparators);
}

function readString(value: JsonValue | undefined) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readOptionalEnv(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}
