import type { AgentAction, AgentObservation, AgentRunInput, ToolManifest, ToolResult } from "./contracts";

/**
 * PlannerInput 是 core 传给 PlannerPort 的模型无关状态快照。
 * toolResults 承载成功 tool facts 的详细权威投影，observations 承载 repair / diagnostic 和成功结果轻量索引。
 */
export type PlannerInput = {
  run: AgentRunInput;
  step: number;
  manifests: ToolManifest[];
  observations: AgentObservation[];
  toolResults: ToolResult[];
};

/** PlannerPort 是 Agent core 唯一依赖的决策端口，不绑定任何 LLM SDK 或 function calling 协议。 */
export type PlannerPort = {
  decideNext(input: PlannerInput): Promise<AgentAction>;
};
