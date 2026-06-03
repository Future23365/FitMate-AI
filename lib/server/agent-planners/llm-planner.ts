import type { AgentAction } from "@/lib/server/agent-core/contracts";
import type { PlannerInput, PlannerPort } from "@/lib/server/agent-core/planner-port";

import type { ModelActionCompletionResult, ModelAdapter } from "./model-adapters/model-adapter";

/** LlmPlanner 调用模型 adapter 只产出 AgentAction candidate，不执行 tool 或生成用户事件。 */
export class LlmPlanner implements PlannerPort {
  readonly calls: PlannerInput[] = [];
  readonly completions: ModelActionCompletionResult[] = [];

  constructor(private readonly adapter: ModelAdapter) {}

  /** decideNext 将 adapter 输出原样交给 Action Validator，保持语义理解和确定性校验分层。 */
  async decideNext(input: PlannerInput): Promise<AgentAction> {
    this.calls.push(input);
    const completion = await this.adapter.completeAction(input);
    this.completions.push(completion);
    return completion.actionCandidate as AgentAction;
  }
}
