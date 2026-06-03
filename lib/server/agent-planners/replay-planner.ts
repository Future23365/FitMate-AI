import type { AgentAction } from "@/lib/server/agent-core/contracts";
import { AGENT_ERROR_CODES, AgentContractError } from "@/lib/server/agent-core/errors";
import type { PlannerInput, PlannerPort } from "@/lib/server/agent-core/planner-port";

/** ReplayPlanner 用固定 action 序列驱动 M0 runtime，隔离真实 LLM 黑盒波动。 */
export class ReplayPlanner implements PlannerPort {
  readonly calls: PlannerInput[] = [];
  private cursor = 0;

  constructor(private readonly actions: unknown[]) {}

  /** decideNext 返回预置 action，并记录每次 Planner 输入供合同测试断言。 */
  async decideNext(input: PlannerInput): Promise<AgentAction> {
    this.calls.push(input);

    if (this.cursor >= this.actions.length) {
      throw new AgentContractError(
        AGENT_ERROR_CODES.PLANNER_EXHAUSTED,
        "ReplayPlanner action sequence is exhausted.",
      );
    }

    const action = this.actions[this.cursor];
    this.cursor += 1;
    return action as AgentAction;
  }
}

