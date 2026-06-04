import type { AgentAction, AgentObservation, AgentRunInput, ToolManifest, ToolResult } from "./contracts";

/** PlannerInput 是 core 传给 PlannerPort 的模型无关状态快照。 */
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

