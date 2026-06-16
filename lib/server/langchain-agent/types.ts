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

export type LangChainAgentToolExecutionStatus = "succeeded" | "failed" | "duplicate_input";

export type LangChainAgentToolFeedbackCode = "duplicate_tool_input";

/** ToolCallRuntimeMetadata 是业务 tool call arguments 中的 request-local UI metadata，不进入业务 handler 或模型结果。 */
export type ToolCallRuntimeMetadata = {
  activitySummary?: string;
};

/** RuntimeMetadataEnvelope 表达 provider-visible schema 的通用外壳，服务端执行前会剥离 runtimeMetadata。 */
export type RuntimeMetadataEnvelope<TBusinessInput> = TBusinessInput & {
  runtimeMetadata?: ToolCallRuntimeMetadata;
};

export type LangChainRuntimeActivitySummarySource = "model" | "tool_default" | "fallback";

export type LangChainRuntimeActivitySummaryDiscardReason =
  | "not_string"
  | "empty"
  | "control_character"
  | "too_long"
  | "internal_detail"
  | "completion_claim";

/** LangChainToolRuntimeActivityMetadata 只记录 wrapper 投影给 UI / trace 的安全活动摘要来源。 */
export type LangChainToolRuntimeActivityMetadata = {
  activitySummary: string;
  source: LangChainRuntimeActivitySummarySource;
  discardedSummaryReason?: LangChainRuntimeActivitySummaryDiscardReason;
  rawSummaryLength?: number;
};

export type LangChainAgentSchemaIssue = {
  path: string;
  code: string;
  message: string;
  keys?: readonly string[];
  expected?: string;
  received?: string;
  actual?: string;
  options?: readonly string[];
};

export type LangChainAgentToolExecution = {
  sequence?: number;
  modelCallIndex?: number;
  runtimeStep?: number;
  toolCallId?: string;
  toolName: string;
  executionKind?: "business";
  status: LangChainAgentToolExecutionStatus;
  durationMs?: number;
  inputSummary?: LangChainJsonValue;
  modelVisibleSummary?: string;
  userProjection?: LangChainJsonValue;
  traceSummary?: LangChainJsonValue;
  runtimeActivity?: LangChainToolRuntimeActivityMetadata;
  failureCode?: LangChainAgentRuntimeErrorCode;
  feedbackCode?: LangChainAgentToolFeedbackCode;
  failureMessage?: string;
  schemaIssues?: readonly LangChainAgentSchemaIssue[];
  enteredModelContext: boolean;
};

/** LangChainAgentRuntimeObserverEvent 是 runtime 发给 /api/chat adapter 的当前请求内观察事件，不进入模型长期上下文或业务事实。 */
export type LangChainAgentRuntimeObserverEvent =
  | {
      type: "model_call_started";
      loopTurn: number;
      modelCallIndex: number;
      runtimeStep: number;
    }
  | {
      type: "runtime_activity_reported";
      activitySummary: string;
      source: LangChainRuntimeActivitySummarySource;
      discardedSummaryReason?: LangChainRuntimeActivitySummaryDiscardReason;
      toolCallId?: string;
      modelCallIndex?: number;
      runtimeStep?: number;
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

/** LangChainTraceLongTextEnvelope 是 runtime trace 内部的长文本外壳，导出层会把它转换为 contentRef。 */
export type LangChainTraceLongTextEnvelope = {
  kind: "trace_long_text";
  contentType:
    | "model_request_system_prompt"
    | "model_request_system_message"
    | "model_request_message"
    | "model_request_tool_description"
    | "model_request_tool_schema"
    | "model_request_tool_schema_description";
  originalLength: number;
  storedLength: number;
  chunkSize: number;
  hash: string;
  preview: string;
  redacted: boolean;
  chunks: readonly {
    index: number;
    start: number;
    end: number;
    text: string;
  }[];
};

/** LangChainModelVisibleTextTrace 记录模型可见文本的安全内容、长度和 fingerprint，不参与 provider request 改写。 */
export type LangChainModelVisibleTextTrace = {
  content: LangChainTraceLongTextEnvelope;
  length: number;
  hash: string;
  preview: string;
  redacted: boolean;
  sourcePath: string;
};

/** LangChainModelRequestMessageTrace 按 provider request 顺序记录单条 message 的可审计安全快照。 */
export type LangChainModelRequestMessageTrace = {
  index: number;
  role: string;
  content: LangChainModelVisibleTextTrace;
};

/** LangChainModelRequestToolSchemaDescriptionTrace 标出 schema description 的原始 schema 路径和安全文本。 */
export type LangChainModelRequestToolSchemaDescriptionTrace = {
  path: string;
  text: LangChainModelVisibleTextTrace;
};

/** LangChainModelRequestToolTrace 记录本次模型请求可见 tool 的 name、description 和 input schema 摘要。 */
export type LangChainModelRequestToolTrace = {
  name: string;
  description?: LangChainModelVisibleTextTrace;
  inputSchema?: LangChainModelVisibleTextTrace;
  schemaDescriptions: readonly LangChainModelRequestToolSchemaDescriptionTrace[];
  schemaHash?: string;
};

/** LangChainModelVisibleInputAuditField 描述模型可见输入某个组成部分是否被 trace 捕获。 */
export type LangChainModelVisibleInputAuditField = {
  path: string;
  sourceKind: "runtime_model_request";
  present: boolean;
  length?: number;
  hash?: string;
};

/** LangChainModelVisibleDuplicateMessageRisk 只标记重复 message 风险，不允许 trace 层改写 message。 */
export type LangChainModelVisibleDuplicateMessageRisk = {
  role: string;
  hash: string;
  messageIndexes: readonly number[];
  sourceKind: "runtime_model_request";
};

/** LangChainModelVisibleInputAudit 是判断本轮模型输入快照是否完整的稳定审计对象。 */
export type LangChainModelVisibleInputAudit = {
  sourceKind: "runtime_model_request";
  completeness: "complete" | "incomplete";
  missingModelVisibleParts: readonly string[];
  fields: readonly LangChainModelVisibleInputAuditField[];
  duplicateMessageRisks: readonly LangChainModelVisibleDuplicateMessageRisk[];
};

/** LangChainModelRequestBudgetSummary 记录模型调用预算视角，帮助区分预算边界和模型决策问题。 */
export type LangChainModelRequestBudgetSummary = {
  modelCallIndex: number;
  maxModelCalls: number;
  remainingModelCallsBeforeCall: number;
  exposedToolCount: number;
  businessToolCount: number;
};

/** LangChainModelRequestToolAvailabilitySummary 记录本次请求可见 tool 集合和业务 tool 集合。 */
export type LangChainModelRequestToolAvailabilitySummary = {
  exposedToolNames: readonly string[];
  businessToolNames: readonly string[];
  finalizationToolName: string;
};

/** LangChainModelRequestSummaryTrace 是每次 LangChain model call 的模型可见输入安全快照。 */
export type LangChainModelRequestSummaryTrace = {
  messageCount: number;
  messagePreviews: readonly {
    role: string;
    contentPreview: string;
  }[];
  toolCount: number;
  toolNames: readonly string[];
  systemPrompt?: LangChainModelVisibleTextTrace;
  systemMessage?: LangChainModelRequestMessageTrace;
  messages: readonly LangChainModelRequestMessageTrace[];
  tools: readonly LangChainModelRequestToolTrace[];
  finalizationTool?: LangChainModelRequestToolTrace;
  budget: LangChainModelRequestBudgetSummary;
  toolAvailability: LangChainModelRequestToolAvailabilitySummary;
  modelVisibleInputAudit: LangChainModelVisibleInputAudit;
};

export type LangChainAgentModelCallTrace = {
  modelCallIndex: number;
  runtimeStep: number;
  status: "success" | "failed";
  durationMs?: number;
  requestSummary: LangChainModelRequestSummaryTrace;
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
  runtimeActivities: readonly (LangChainToolRuntimeActivityMetadata & {
    toolName: string;
    toolCallId?: string;
    modelCallIndex?: number;
    runtimeStep?: number;
  })[];
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
  suggestedQuestions: readonly string[];
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

export type LangChainTerminalFailureFinalizerOutput = {
  content: string;
  suggestedQuestions: readonly string[];
};

export type LangChainAgentRunResult = LangChainAgentRunSuccess | LangChainAgentRunFailure;
