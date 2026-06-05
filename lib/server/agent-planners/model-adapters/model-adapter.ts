import { AGENT_ERROR_CODES, AgentContractError } from "@/lib/server/agent-core/errors";
import type { AgentAction, JsonValue } from "@/lib/server/agent-core/contracts";
import type { PlannerInput } from "@/lib/server/agent-core/planner-port";

/** ModelActionCompletionInput 是模型 adapter 可见的模型无关 action completion 输入。 */
export type ModelActionCompletionInput = PlannerInput;

/** ModelTokenUsage 是供应商 usage 字段归一化后的真实模型 token 用量。 */
export type ModelTokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

/** ModelActionCompletionParseStatus 描述模型响应在 adapter 边界的解析结果或失败边界。 */
export type ModelActionCompletionParseStatus =
  | "parsed"
  | "http_error"
  | "empty_content"
  | "invalid_json"
  | "invalid_action_schema"
  | "timeout"
  | "adapter_exception";

/** ModelTraceLongTextChunk 是模型请求长文本在 trace 中的安全分块，避免单个字符串被 trace store 截断。 */
export type ModelTraceLongTextChunk = {
  index: number;
  start: number;
  end: number;
  text: string;
};

/** ModelTraceLongTextEnvelope 让开发态导出层能还原模型可见长文本，同时默认报告只保留引用。 */
export type ModelTraceLongTextEnvelope = {
  kind: "trace_long_text";
  contentType: "model_request_message";
  originalLength: number;
  storedLength: number;
  chunkSize: number;
  hash: string;
  preview: string;
  redacted: boolean;
  chunks: ModelTraceLongTextChunk[];
};

/** ModelTraceMessageSummary 是 trace 可保存的模型 message 诊断，短文本直接保存，长文本使用分块 envelope。 */
export type ModelTraceMessageSummary = {
  role: string;
  content: JsonValue;
  contentLength: number;
};

/** ModelActionCompletionTrace 是 ModelAdapter 输出给 LlmPlanner 的安全模型调用诊断。 */
export type ModelActionCompletionTrace = {
  provider: string;
  adapterName: string;
  request: {
    model?: string;
    endpoint?: string;
    temperature?: number;
    max_tokens?: number;
    response_format?: JsonValue;
    timeoutMs?: number;
    messageCount: number;
    messages: ModelTraceMessageSummary[];
    run: {
      runId: string;
      step: number;
      latestUserMessage: JsonValue;
      messageCount: number;
      observationCount: number;
      toolResultCount: number;
      successfulLightweightObservationCount: number;
      repairDiagnosticObservationCount: number;
      toolResultProjectionCount: number;
      toolResultProjectionPresence: Array<{
        toolResultId: string;
        toolName: string;
        satisfied: boolean;
        factChannel: "fact" | "diagnostic" | "failed";
        hasModelProjection: boolean;
      }>;
      toolCount: number;
      toolNames: string[];
      limits?: JsonValue;
    };
  };
  response?: {
    model?: string;
    httpStatus?: number;
    status: ModelActionCompletionParseStatus;
    rawText?: JsonValue;
    rawTextLength?: number;
    rawResponse?: JsonValue;
  };
  parsedAction?: JsonValue;
  actionType?: string;
  toolName?: string;
  parseStatus: ModelActionCompletionParseStatus;
  failureCode?: string;
  tokenUsage?: ModelTokenUsage;
  diagnostics?: JsonValue;
};

/** PlannerModelTraceEvent 把 adapter 诊断和 planner 调用序号、runtime step 绑定起来。 */
export type PlannerModelTraceEvent = ModelActionCompletionTrace & {
  plannerCallIndex: number;
  runtimeStep: number;
  runId: string;
};

/** ModelActionCompletionResult 保存模型返回的 action candidate 和安全诊断信息。 */
export type ModelActionCompletionResult = {
  actionCandidate: unknown;
  rawText?: string;
  model?: string;
  usage?: ModelTokenUsage;
  diagnostics?: JsonValue;
  trace?: ModelActionCompletionTrace;
};

/** ModelAdapter 是 LlmPlanner 依赖的唯一模型供应商边界。 */
export type ModelAdapter = {
  name: string;
  completeAction(input: ModelActionCompletionInput): Promise<ModelActionCompletionResult>;
};

/** ModelAdapterError 归一化模型请求、timeout 和响应解析前的供应商错误。 */
export class ModelAdapterError extends AgentContractError {
  readonly trace?: ModelActionCompletionTrace;

  constructor(message: string, details?: JsonValue, trace?: ModelActionCompletionTrace) {
    super(AGENT_ERROR_CODES.INVALID_ACTION, message, {
      retryable: false,
      details,
    });
    this.trace = trace;
  }
}

/** normalizeModelTokenUsage 把不同供应商的 usage 字段收敛为 trace 展示使用的稳定命名。 */
export function normalizeModelTokenUsage(usage: unknown): ModelTokenUsage | undefined {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
    return undefined;
  }

  const record = usage as Record<string, unknown>;
  const promptTokens = readFiniteNumber(record.prompt_tokens ?? record.promptTokens ?? record.input_tokens ?? record.inputTokens);
  const completionTokens = readFiniteNumber(
    record.completion_tokens ?? record.completionTokens ?? record.output_tokens ?? record.outputTokens,
  );
  const totalTokens = readFiniteNumber(record.total_tokens ?? record.totalTokens)
    ?? (
      promptTokens !== undefined || completionTokens !== undefined
        ? (promptTokens ?? 0) + (completionTokens ?? 0)
        : undefined
    );

  return promptTokens !== undefined || completionTokens !== undefined || totalTokens !== undefined
    ? {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
      }
    : undefined;
}

/** FakeModelAdapter 用固定 action candidate 测试 LlmPlanner，不依赖真实模型或 SDK。 */
export class FakeModelAdapter implements ModelAdapter {
  readonly name = "fake-model-adapter";
  readonly calls: ModelActionCompletionInput[] = [];
  private cursor = 0;

  constructor(private readonly candidates: unknown[]) {}

  async completeAction(input: ModelActionCompletionInput): Promise<ModelActionCompletionResult> {
    this.calls.push(input);

    if (this.cursor >= this.candidates.length) {
      throw new ModelAdapterError("FakeModelAdapter action sequence is exhausted.");
    }

    const actionCandidate = this.candidates[this.cursor] as AgentAction;
    this.cursor += 1;

    return {
      actionCandidate,
      model: this.name,
    };
  }
}

/** createInvalidModelActionCandidate 把非法模型输出转换成 validator 可 repair 的非合同 action。 */
export function createInvalidModelActionCandidate(reason: string, diagnostics?: JsonValue) {
  return {
    type: "__invalid_model_action__",
    reason,
    diagnostics,
  };
}

function readFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
