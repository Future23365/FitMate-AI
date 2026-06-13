import "server-only";

import { ChatDeepSeek } from "@langchain/deepseek";
import { z } from "zod";

import {
  agentRuntimeConfig,
  resolveLangChainDeepSeekProviderConfig,
  type LangChainDeepSeekProviderConfigResult,
} from "@/lib/server/config";

import {
  getErrorMessage,
  messageContentToText,
  toLangChainJsonValue,
  truncateTextForLangChainTrace,
} from "./utils";
import type {
  LangChainAgentRunFailure,
  LangChainAgentRuntimeErrorCode,
  LangChainJsonValue,
  LangChainTerminalFailureFinalizerOutput,
} from "./types";

export type LangChainTerminalFailureFinalizerFailureCategory =
  | "tool_failure"
  | "budget_exhausted"
  | "structured_output_invalid"
  | "response_adapter_failed";

export type LangChainTerminalFailureFinalizerSkipReason =
  | "finalizer_disabled"
  | "failure_not_classifiable"
  | "model_config_missing";

export type LangChainTerminalFailureFinalizerDegradedReason =
  | LangChainTerminalFailureFinalizerSkipReason
  | "finalizer_timeout"
  | "finalizer_provider_error"
  | "finalizer_invalid_json"
  | "finalizer_output_invalid";

export type LangChainTerminalFailureFinalizerInput = {
  failureCategory: LangChainTerminalFailureFinalizerFailureCategory;
  errorCode: LangChainAgentRuntimeErrorCode;
  userRequestSummary: string;
  failedToolExecutions: readonly LangChainTerminalFailureToolExecutionSummary[];
  verifiedFactsSummary: LangChainJsonValue;
  allowedResponseMode: "failure_explanation_only";
};

export type LangChainTerminalFailureToolExecutionSummary = {
  toolName: string;
  failureCode?: LangChainAgentRuntimeErrorCode;
  failureMessage?: string;
  schemaIssues?: readonly {
    path: string;
    code: string;
    message: string;
    expected?: string;
    received?: string;
    options?: readonly string[];
  }[];
};

export type LangChainTerminalFailureFinalizerTraceSummary = {
  status: "succeeded" | "skipped" | "failed";
  failureCategory?: LangChainTerminalFailureFinalizerFailureCategory;
  errorCode: LangChainAgentRuntimeErrorCode;
  reason?: LangChainTerminalFailureFinalizerDegradedReason;
  model?: string;
  outputValidation?: {
    ok: boolean;
    code?: LangChainTerminalFailureFinalizerDegradedReason;
    issues?: LangChainJsonValue;
  };
  inputSummary?: LangChainJsonValue;
  rawTextPreview?: string;
};

export type LangChainTerminalFailureFinalizerResult =
  | {
      status: "succeeded";
      output: LangChainTerminalFailureFinalizerOutput;
      trace: LangChainTerminalFailureFinalizerTraceSummary;
    }
  | {
      status: "skipped" | "failed";
      reason: LangChainTerminalFailureFinalizerDegradedReason;
      trace: LangChainTerminalFailureFinalizerTraceSummary;
    };

type LangChainTerminalFailureFinalizerModel = {
  invoke(input: readonly { role: "system" | "user"; content: string }[], options?: { signal?: AbortSignal }): Promise<unknown>;
};

export type RunLangChainTerminalFailureFinalizerInput = {
  result: LangChainAgentRunFailure;
  userRequestSummary: string;
  providerConfigResult?: LangChainDeepSeekProviderConfigResult;
  model?: LangChainTerminalFailureFinalizerModel;
};

/** runLangChainTerminalFailureFinalizer 将 LangChain 主链失败转成普通用户可见兜底回复，不继续执行业务 tool。 */
export async function runLangChainTerminalFailureFinalizer(
  input: RunLangChainTerminalFailureFinalizerInput,
): Promise<LangChainTerminalFailureFinalizerResult> {
  const config = agentRuntimeConfig.langChain.terminalFailureFinalizer;
  const failureCategory = classifyLangChainTerminalFailure(input.result);
  const errorCode = input.result.code;

  if (!config.defaultEnabled) {
    return createSkippedFinalizerResult(errorCode, "finalizer_disabled");
  }

  if (!failureCategory) {
    return createSkippedFinalizerResult(errorCode, "failure_not_classifiable");
  }

  const finalizerInput = buildLangChainTerminalFailureFinalizerInput({
    result: input.result,
    failureCategory,
    userRequestSummary: input.userRequestSummary,
  });
  const providerConfig = input.providerConfigResult ?? resolveLangChainDeepSeekProviderConfig();
  const modelContext = createLangChainTerminalFailureFinalizerModelContext({
    injectedModel: input.model,
    providerConfig,
    errorCode,
    failureCategory,
  });

  if (!modelContext.ok) {
    return modelContext.result;
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), config.timeoutMs);

  try {
    const response = await modelContext.model.invoke([
      { role: "system", content: buildLangChainTerminalFailureFinalizerSystemPrompt() },
      { role: "user", content: JSON.stringify(finalizerInput) },
    ], { signal: abortController.signal });
    const rawText = messageContentToText(readRecord(response).content ?? response);
    const parsedJson = parseJsonObject(rawText);

    if (!parsedJson.ok) {
      return createFailedFinalizerResult({
        errorCode,
        failureCategory,
        reason: "finalizer_invalid_json",
        finalizerInput,
        rawText,
      });
    }

    const outputSchema = createLangChainTerminalFailureFinalizerOutputSchema();
    const parsedOutput = outputSchema.safeParse(parsedJson.value);

    if (!parsedOutput.success) {
      return createFailedFinalizerResult({
        errorCode,
        failureCategory,
        reason: "finalizer_output_invalid",
        finalizerInput,
        rawText,
        issues: toLangChainJsonValue(parsedOutput.error.issues, config.inputSummaryMaxLength),
      });
    }

    return {
      status: "succeeded",
      output: parsedOutput.data,
      trace: {
        status: "succeeded",
        failureCategory,
        errorCode,
        model: modelContext.modelName,
        inputSummary: toLangChainJsonValue(finalizerInput, config.inputSummaryMaxLength),
        rawTextPreview: truncateTextForLangChainTrace(rawText, config.inputSummaryMaxLength),
        outputValidation: { ok: true },
      },
    };
  } catch (error) {
    return createFailedFinalizerResult({
      errorCode,
      failureCategory,
      reason: abortController.signal.aborted ? "finalizer_timeout" : "finalizer_provider_error",
      finalizerInput,
      rawText: getErrorMessage(error),
    });
  } finally {
    clearTimeout(timeout);
  }
}

function createLangChainTerminalFailureFinalizerModelContext(input: {
  injectedModel?: LangChainTerminalFailureFinalizerModel;
  providerConfig: LangChainDeepSeekProviderConfigResult;
  errorCode: LangChainAgentRuntimeErrorCode;
  failureCategory: LangChainTerminalFailureFinalizerFailureCategory;
}): { ok: true; model: LangChainTerminalFailureFinalizerModel; modelName: string } | { ok: false; result: LangChainTerminalFailureFinalizerResult } {
  if (input.injectedModel) {
    return {
      ok: true,
      model: input.injectedModel,
      modelName: "injected-test-model",
    };
  }

  if (!input.providerConfig.ok) {
    return {
      ok: false,
      result: createSkippedFinalizerResult(input.errorCode, "model_config_missing", input.failureCategory),
    };
  }

  return {
    ok: true,
    model: createDeepSeekTerminalFailureFinalizerModel(input.providerConfig),
    modelName: input.providerConfig.config.model,
  };
}

/** buildLangChainTerminalFailureFinalizerInput 投影脱敏失败摘要，避免把 raw tool payload 交给兜底模型。 */
export function buildLangChainTerminalFailureFinalizerInput(input: {
  result: LangChainAgentRunFailure;
  failureCategory: LangChainTerminalFailureFinalizerFailureCategory;
  userRequestSummary: string;
}): LangChainTerminalFailureFinalizerInput {
  const config = agentRuntimeConfig.langChain.terminalFailureFinalizer;
  const failedToolExecutions = input.result.toolExecutions
    .filter((execution) => execution.status === "failed" || execution.failureCode)
    .slice(-config.maxToolExecutionSummaries)
    .map((execution) => ({
      toolName: execution.toolName,
      ...(execution.failureCode ? { failureCode: execution.failureCode } : {}),
      ...(execution.failureMessage
        ? { failureMessage: truncateTextForLangChainTrace(execution.failureMessage, config.inputSummaryMaxLength) }
        : {}),
      ...(execution.schemaIssues?.length
        ? {
            schemaIssues: execution.schemaIssues.slice(0, 12).map((issue) => ({
              path: issue.path,
              code: issue.code,
              message: issue.message,
              ...(issue.expected ? { expected: issue.expected } : {}),
              ...(issue.received ? { received: issue.received } : {}),
              ...(issue.options?.length ? { options: issue.options.slice(0, 12) } : {}),
            })),
          }
        : {}),
    }));

  return {
    failureCategory: input.failureCategory,
    errorCode: input.result.code,
    userRequestSummary: truncateTextForLangChainTrace(input.userRequestSummary, config.inputSummaryMaxLength),
    failedToolExecutions,
    verifiedFactsSummary: createVerifiedFactsSummary(input.result),
    allowedResponseMode: "failure_explanation_only",
  };
}

/** buildLangChainTerminalFailureFinalizerSystemPrompt 约束 finalizer 只做失败解释，不恢复旧 action 或 tool calling。 */
export function buildLangChainTerminalFailureFinalizerSystemPrompt() {
  const config = agentRuntimeConfig.langChain.terminalFailureFinalizer;

  return [
    "你是 FitMate 的失败收口回复生成器。",
    "主 Agent 已经没有完成用户请求，你只能基于输入中的失败摘要生成普通用户可见回复。",
    "不要继续执行原始任务，不要声称训练卡片、训练计划、保存或写入已经成功。",
    "不要输出 tool_call、旧 action JSON、visibleOutputs、artifact、NDJSON event 或 Markdown 代码块。",
    "不要泄漏内部错误堆栈、provider、API、数据库、token、trace id 或实现细节。",
    "可以用自然语言说明这次没有生成可靠结果，并给出用户下一步可以怎么缩小范围、补充条件或重试。",
    `只返回 JSON object：{"content": string, "suggestedQuestions"?: string[]}。`,
    `content 必须是中文，非空，最多 ${config.maxContentLength} 个字符。`,
    `suggestedQuestions 最多 ${config.maxSuggestedQuestions} 条，每条最多 ${config.maxSuggestedQuestionLength} 个字符，必须是用户可直接发送的完整中文消息。`,
  ].join("\n");
}

function createDeepSeekTerminalFailureFinalizerModel(providerConfig: Extract<LangChainDeepSeekProviderConfigResult, { ok: true }>) {
  const runtimeConfig = agentRuntimeConfig.langChain;
  const finalizerConfig = runtimeConfig.terminalFailureFinalizer;

  return new ChatDeepSeek({
    apiKey: providerConfig.config.apiKey,
    model: providerConfig.config.model,
    temperature: runtimeConfig.model.temperature,
    maxTokens: finalizerConfig.maxTokens,
    timeout: finalizerConfig.timeoutMs,
    modelKwargs: {
      thinking: runtimeConfig.model.thinking,
    },
    configuration: {
      baseURL: providerConfig.config.endpoint,
    },
  }) as LangChainTerminalFailureFinalizerModel;
}

function classifyLangChainTerminalFailure(result: LangChainAgentRunFailure): LangChainTerminalFailureFinalizerFailureCategory | undefined {
  if (result.code === "budget_exhausted") {
    return "budget_exhausted";
  }

  if (
    result.code === "tool_schema_invalid"
    || result.code === "tool_handler_failed"
    || result.code === "tool_timeout"
    || result.code === "unknown_tool"
    || result.toolExecutions.some((execution) => execution.status === "failed" && execution.failureCode)
  ) {
    return "tool_failure";
  }

  if (result.code === "structured_output_validation_failed" || result.code === "empty_final_message") {
    return "structured_output_invalid";
  }

  if (result.code === "response_adapter_failed") {
    return "response_adapter_failed";
  }

  return undefined;
}

function createVerifiedFactsSummary(result: LangChainAgentRunFailure): LangChainJsonValue {
  const config = agentRuntimeConfig.langChain.terminalFailureFinalizer;
  const succeededTools = result.toolExecutions
    .filter((execution) => execution.status === "succeeded")
    .slice(-config.maxToolExecutionSummaries)
    .map((execution) => ({
      toolName: execution.toolName,
      ...(execution.traceSummary === undefined
        ? {}
        : { traceSummary: toLangChainJsonValue(execution.traceSummary, config.inputSummaryMaxLength) }),
    }));

  return {
    succeededToolCount: result.toolExecutions.filter((execution) => execution.status === "succeeded").length,
    succeededTools,
    traceSummary: result.traceSummary
      ? {
          modelCallCount: result.traceSummary.modelCallCount,
          toolCallCount: result.traceSummary.toolCallCount,
          toolNames: result.traceSummary.toolNames,
        }
      : null,
  };
}

function createLangChainTerminalFailureFinalizerOutputSchema() {
  const config = agentRuntimeConfig.langChain.terminalFailureFinalizer;
  const trimmedString = z.string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1));

  return z.object({
    content: trimmedString.pipe(z.string().max(config.maxContentLength)),
    suggestedQuestions: z.array(
      trimmedString.pipe(z.string().max(config.maxSuggestedQuestionLength)),
    ).max(config.maxSuggestedQuestions).optional().default([]),
  }).strict();
}

function createSkippedFinalizerResult(
  errorCode: LangChainAgentRuntimeErrorCode,
  reason: LangChainTerminalFailureFinalizerSkipReason,
  failureCategory?: LangChainTerminalFailureFinalizerFailureCategory,
): LangChainTerminalFailureFinalizerResult {
  return {
    status: "skipped",
    reason,
    trace: {
      status: "skipped",
      errorCode,
      reason,
      ...(failureCategory ? { failureCategory } : {}),
      outputValidation: { ok: false, code: reason },
    },
  };
}

function createFailedFinalizerResult(input: {
  errorCode: LangChainAgentRuntimeErrorCode;
  failureCategory: LangChainTerminalFailureFinalizerFailureCategory;
  reason: Exclude<LangChainTerminalFailureFinalizerDegradedReason, LangChainTerminalFailureFinalizerSkipReason>;
  finalizerInput: LangChainTerminalFailureFinalizerInput;
  rawText: string;
  issues?: LangChainJsonValue;
}): LangChainTerminalFailureFinalizerResult {
  const config = agentRuntimeConfig.langChain.terminalFailureFinalizer;

  return {
    status: "failed",
    reason: input.reason,
    trace: {
      status: "failed",
      errorCode: input.errorCode,
      failureCategory: input.failureCategory,
      reason: input.reason,
      inputSummary: toLangChainJsonValue(input.finalizerInput, config.inputSummaryMaxLength),
      rawTextPreview: truncateTextForLangChainTrace(input.rawText, config.inputSummaryMaxLength),
      outputValidation: {
        ok: false,
        code: input.reason,
        ...(input.issues === undefined ? {} : { issues: input.issues }),
      },
    },
  };
}

function parseJsonObject(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    if (start < 0 || end <= start) {
      return { ok: false };
    }

    try {
      return { ok: true, value: JSON.parse(text.slice(start, end + 1)) };
    } catch {
      return { ok: false };
    }
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}
