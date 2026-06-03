import { AGENT_ERROR_CODES, AgentContractError } from "@/lib/server/agent-core/errors";
import type { AgentAction, JsonValue } from "@/lib/server/agent-core/contracts";
import type { PlannerInput } from "@/lib/server/agent-core/planner-port";

/** ModelActionCompletionInput 是模型 adapter 可见的模型无关 action completion 输入。 */
export type ModelActionCompletionInput = PlannerInput;

/** ModelActionCompletionResult 保存模型返回的 action candidate 和安全诊断信息。 */
export type ModelActionCompletionResult = {
  actionCandidate: unknown;
  rawText?: string;
  model?: string;
  usage?: JsonValue;
  diagnostics?: JsonValue;
};

/** ModelAdapter 是 LlmPlanner 依赖的唯一模型供应商边界。 */
export type ModelAdapter = {
  name: string;
  completeAction(input: ModelActionCompletionInput): Promise<ModelActionCompletionResult>;
};

/** ModelAdapterError 归一化模型请求、timeout 和响应解析前的供应商错误。 */
export class ModelAdapterError extends AgentContractError {
  constructor(message: string, details?: JsonValue) {
    super(AGENT_ERROR_CODES.INVALID_ACTION, message, {
      retryable: false,
      details,
    });
  }
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
