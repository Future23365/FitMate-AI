import "server-only";

import type { CreateAgentParams } from "langchain";

export type LangChainJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly LangChainJsonValue[]
  | { readonly [key: string]: LangChainJsonValue };

export type LangChainAgentMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LangChainAgentModel = CreateAgentParams["model"];

export type LangChainAgentRuntimeErrorCode =
  | "config_missing"
  | "provider_error"
  | "provider_timeout"
  | "unknown_tool"
  | "tool_schema_invalid"
  | "tool_handler_failed"
  | "tool_timeout"
  | "budget_exhausted"
  | "structured_output_validation_failed"
  | "response_adapter_failed"
  | "empty_final_message";

export type LangChainAgentToolExecutionStatus = "succeeded" | "failed";

export type LangChainAgentToolExecution = {
  sequence?: number;
  modelCallIndex?: number;
  runtimeStep?: number;
  toolCallId?: string;
  toolName: string;
  status: LangChainAgentToolExecutionStatus;
  durationMs?: number;
  inputSummary?: LangChainJsonValue;
  modelVisibleSummary?: string;
  userProjection?: LangChainJsonValue;
  traceSummary?: LangChainJsonValue;
  failureCode?: LangChainAgentRuntimeErrorCode;
  failureMessage?: string;
  enteredModelContext: boolean;
};

export type LangChainTokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type LangChainAgentProviderToolCallTrace = {
  id?: string;
  name: string;
  argsSummary: LangChainJsonValue;
  modelCallIndex?: number;
  runtimeStep?: number;
};

export type LangChainAgentModelCallTrace = {
  modelCallIndex: number;
  runtimeStep: number;
  status: "success" | "failed";
  durationMs?: number;
  requestSummary: {
    messageCount: number;
    messagePreviews: readonly {
      role: string;
      contentPreview: string;
    }[];
    toolCount: number;
    toolNames: readonly string[];
  };
  responseSummary?: {
    contentPreview?: string;
    contentLength: number;
    finishReason?: string;
  };
  providerToolCalls: readonly LangChainAgentProviderToolCallTrace[];
  tokenUsage?: LangChainTokenUsage;
  failureCode?: LangChainAgentRuntimeErrorCode;
  failureMessage?: string;
};

/** LangChainValidatedVisibleOutput 是 response adapter 允许输出的服务端已校验结构化结果。 */
export type LangChainValidatedVisibleOutput = {
  outputType: string;
  schemaVersion: string;
  payload: LangChainJsonValue;
  content?: LangChainJsonValue;
};

export type LangChainAgentRunTraceSummary = {
  runtimeVersion: string;
  model: string;
  toolNames: readonly string[];
  modelRequestSummary: {
    inputMessageCount: number;
    inputMessagePreviews: readonly {
      role: LangChainAgentMessage["role"];
      contentPreview: string;
    }[];
    toolCount: number;
  };
  modelResponseSummary: {
    generatedMessageCount: number;
    assistantMessageCount: number;
    toolMessageCount: number;
    finalTextPreview?: string;
  };
  modelCalls: readonly LangChainAgentModelCallTrace[];
  providerToolCalls: readonly LangChainAgentProviderToolCallTrace[];
  modelCallCount: number;
  toolCallCount: number;
  messageCount: number;
  durationMs: number;
};

export type LangChainAgentRunSuccess = {
  ok: true;
  finalText: string;
  messages: readonly unknown[];
  toolExecutions: readonly LangChainAgentToolExecution[];
  traceSummary: LangChainAgentRunTraceSummary;
};

export type LangChainAgentRunFailure = {
  ok: false;
  code: LangChainAgentRuntimeErrorCode;
  message: string;
  retryable: boolean;
  messages: readonly unknown[];
  toolExecutions: readonly LangChainAgentToolExecution[];
  traceSummary?: LangChainAgentRunTraceSummary;
};

export type LangChainAgentRunResult = LangChainAgentRunSuccess | LangChainAgentRunFailure;
