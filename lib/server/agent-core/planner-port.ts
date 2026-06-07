import type {
  AgentAction,
  AgentObservation,
  AgentRunInput,
  JsonValue,
  PlannerVisibleToolResult,
  ToolError,
  ToolManifest,
} from "./contracts";

/** PlannerRepairContextError 是 validator 反馈给 repair 轮的字段级错误摘要，不携带 provider 原文或 handler output。 */
export type PlannerRepairContextError = {
  code?: string;
  path?: string;
  expected?: JsonValue;
  actual?: JsonValue;
  allowedFields?: readonly string[];
  requiredFields?: readonly string[];
  allowedValues?: readonly JsonValue[];
};

/** PlannerRepairContext 是正常 planning 失败后的独立修复层，只描述上一轮非法 action 与确定性错误。 */
export type PlannerRepairContext = {
  failedAction: JsonValue;
  error: Pick<ToolError, "code" | "message"> & {
    details?: JsonValue;
  };
  errors: PlannerRepairContextError[];
  facts?: JsonValue[];
};

/** PlannerContextLayer 是每轮 run 的事实层，长期协议不应混入这里。 */
export type PlannerContextLayer = {
  run: AgentRunInput;
  step: number;
  manifests: ToolManifest[];
  observations: AgentObservation[];
  toolResults: PlannerVisibleToolResult[];
};

/**
 * PlannerInput 是 core 传给 PlannerPort 的模型无关状态快照。
 * toolResults 承载成功 tool facts 的 Planner 专用瘦身投影，observations 承载 repair / diagnostic 和成功结果轻量索引。
 */
export type PlannerInput = {
  run: AgentRunInput;
  step: number;
  manifests: ToolManifest[];
  observations: AgentObservation[];
  toolResults: PlannerVisibleToolResult[];
  context: PlannerContextLayer;
  repairContext?: PlannerRepairContext;
};

/** PlannerPort 是 Agent core 唯一依赖的决策端口，不绑定任何 LLM SDK 或 function calling 协议。 */
export type PlannerPort = {
  decideNext(input: PlannerInput): Promise<AgentAction>;
};
