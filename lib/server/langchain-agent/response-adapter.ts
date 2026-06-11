import "server-only";

import { agentRuntimeConfig } from "@/lib/server/config";

import { toLangChainJsonValue } from "./utils";
import type {
  LangChainAgentRunResult,
  LangChainAgentRuntimeErrorCode,
  LangChainAgentToolExecution,
  LangChainJsonValue,
  LangChainValidatedVisibleOutput,
} from "./types";

export type LangChainAgentStreamEvent =
  | { type: "content"; content: string }
  | { type: "visible_output"; outputType: string; schemaVersion: string; payload: LangChainJsonValue; content?: LangChainJsonValue }
  | { type: "suggested_questions"; suggestedQuestions: string[] }
  | { type: "error"; error: LangChainAgentResponseError }
  | { type: "done" };

export type LangChainAgentResponseError = {
  code: string;
  message: string;
  retryable: boolean;
};

export type LangChainAgentResponseProjectionType =
  | "content"
  | "content_with_visible_output"
  | "content_with_suggestions"
  | "provider_unavailable_fallback"
  | "budget_timeout_fallback"
  | "tool_failure_fallback"
  | "response_adapter_failed"
  | "transport_config_failure";

export type CreateLangChainAgentResponseProjectionInput = {
  result: LangChainAgentRunResult;
  suggestedQuestions?: readonly string[];
  validatedVisibleOutputs?: readonly LangChainValidatedVisibleOutput[];
};

export type LangChainAgentResponseProjection = {
  projectionType: LangChainAgentResponseProjectionType;
  events: readonly LangChainAgentStreamEvent[];
  summary: LangChainAgentResponseProjectionSummary;
};

export type LangChainAgentResponseProjectionSummary = {
  eventTypes: readonly LangChainAgentStreamEvent["type"][];
  visibleOutputCount: number;
  suggestedQuestionCount: number;
  toolExecutions: readonly {
    toolName: string;
    status: LangChainAgentToolExecution["status"];
    failureCode?: LangChainAgentRuntimeErrorCode;
    enteredModelContext: boolean;
  }[];
  errorCode?: string;
  projectionType: LangChainAgentResponseProjectionType;
};

const langChainProviderUnavailableFailureMessage = "模型服务暂时不可用或请求受限，所以这次不能继续生成可靠回复。你可以稍后重试，或先把问题缩小后再发一次。";
const langChainBudgetOrTimeoutFailureMessage = "这次请求需要的步骤或信息量超出了当前处理范围。你可以减少条件、缩小训练目标，或分两步提问。";
const langChainToolFailureMessage = "这次工具执行或参数校验没有成功，所以我不会把不可靠结果当作事实。你可以补充条件后再试一次。";
const langChainResponseAdapterFailureMessage = "这次回复没能投影成安全的前端事件。你可以缩小问题范围后再试。";
const langChainConfigFailureMessage = "聊天服务暂时不可用，请稍后再试。";
const fixedLangChainFailureSuggestions = [
  "为什么没成功？",
  "你再试试",
  "要不换个别的？",
];

/** createLangChainAgentResponseProjection 把 LangChain run result 投影为受控 NDJSON 白名单事件，不接受模型自定义事件。 */
export function createLangChainAgentResponseProjection(
  input: CreateLangChainAgentResponseProjectionInput,
): LangChainAgentResponseProjection {
  const events = input.result.ok
    ? createSuccessEvents(input)
    : createFailureEvents(input.result);
  const projectionType = resolveProjectionType(input.result, events);
  const summary = summarizeLangChainAgentResponseProjection({
    result: input.result,
    events,
    projectionType,
  });

  return {
    projectionType,
    events,
    summary,
  };
}

/** summarizeLangChainAgentResponseProjection 生成 trace 安全摘要，避免前端事件和 tool raw output 混在一起。 */
export function summarizeLangChainAgentResponseProjection(input: {
  result: LangChainAgentRunResult;
  events: readonly LangChainAgentStreamEvent[];
  projectionType: LangChainAgentResponseProjectionType;
}): LangChainAgentResponseProjectionSummary {
  return {
    eventTypes: input.events.map((event) => event.type),
    visibleOutputCount: input.events.filter((event) => event.type === "visible_output").length,
    suggestedQuestionCount: input.events
      .filter((event): event is Extract<LangChainAgentStreamEvent, { type: "suggested_questions" }> => event.type === "suggested_questions")
      .reduce((count, event) => count + event.suggestedQuestions.length, 0),
    toolExecutions: input.result.toolExecutions.map((execution) => ({
      toolName: execution.toolName,
      status: execution.status,
      failureCode: execution.failureCode,
      enteredModelContext: execution.enteredModelContext,
    })),
    ...(!input.result.ok ? { errorCode: input.result.code } : {}),
    projectionType: input.projectionType,
  };
}

function createSuccessEvents(input: CreateLangChainAgentResponseProjectionInput): LangChainAgentStreamEvent[] {
  if (!input.result.ok) {
    return createFailureEvents(input.result);
  }

  const content = input.result.finalText.trim();
  const events: LangChainAgentStreamEvent[] = content
    ? [{ type: "content", content }]
    : [];

  for (const output of input.validatedVisibleOutputs ?? []) {
    events.push({
      type: "visible_output",
      outputType: output.outputType,
      schemaVersion: output.schemaVersion,
      payload: toLangChainJsonValue(output.payload, agentRuntimeConfig.langChain.trace.ndjsonProjectionPreviewMaxLength),
      ...(output.content === undefined
        ? {}
        : { content: toLangChainJsonValue(output.content, agentRuntimeConfig.langChain.trace.ndjsonProjectionPreviewMaxLength) }),
    });
  }

  if (input.suggestedQuestions?.length) {
    events.push({
      type: "suggested_questions",
      suggestedQuestions: input.suggestedQuestions.slice(0, 3).map((question) => question.trim()).filter(Boolean),
    });
  }

  events.push({ type: "done" });
  return events;
}

function createFailureEvents(result: Extract<LangChainAgentRunResult, { ok: false }>): LangChainAgentStreamEvent[] {
  if (result.code === "config_missing") {
    return [
      {
        type: "error",
        error: {
          code: "chat_ai_not_configured",
          message: langChainConfigFailureMessage,
          retryable: false,
        },
      },
      { type: "done" },
    ];
  }

  return [
    { type: "content", content: mapLangChainFailureMessage(result.code) },
    { type: "suggested_questions", suggestedQuestions: fixedLangChainFailureSuggestions },
    { type: "done" },
  ];
}

function resolveProjectionType(
  result: LangChainAgentRunResult,
  events: readonly LangChainAgentStreamEvent[],
): LangChainAgentResponseProjectionType {
  if (!result.ok) {
    if (result.code === "config_missing") {
      return "transport_config_failure";
    }
    if (result.code === "provider_error" || result.code === "provider_timeout") {
      return "provider_unavailable_fallback";
    }
    if (result.code === "budget_exhausted") {
      return "budget_timeout_fallback";
    }
    if (
      result.code === "tool_schema_invalid"
      || result.code === "tool_handler_failed"
      || result.code === "tool_timeout"
      || result.code === "unknown_tool"
    ) {
      return "tool_failure_fallback";
    }

    return "response_adapter_failed";
  }

  if (events.some((event) => event.type === "visible_output")) {
    return "content_with_visible_output";
  }

  if (events.some((event) => event.type === "suggested_questions")) {
    return "content_with_suggestions";
  }

  return "content";
}

function mapLangChainFailureMessage(code: LangChainAgentRuntimeErrorCode) {
  if (code === "provider_error" || code === "provider_timeout") {
    return langChainProviderUnavailableFailureMessage;
  }

  if (code === "budget_exhausted") {
    return langChainBudgetOrTimeoutFailureMessage;
  }

  if (
    code === "tool_schema_invalid"
    || code === "tool_handler_failed"
    || code === "tool_timeout"
    || code === "unknown_tool"
  ) {
    return langChainToolFailureMessage;
  }

  return langChainResponseAdapterFailureMessage;
}
