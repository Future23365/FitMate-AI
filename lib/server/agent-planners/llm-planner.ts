import type { AgentAction } from "@/lib/server/agent-core/contracts";
import type { PlannerInput, PlannerPort } from "@/lib/server/agent-core/planner-port";

import {
  ModelAdapterError,
  type ModelActionCompletionResult,
  type ModelAdapter,
  type PlannerModelTraceEvent,
} from "./model-adapters/model-adapter";

/** LlmPlanner 调用模型 adapter 只产出 AgentAction candidate，不执行 tool 或生成用户事件。 */
export class LlmPlanner implements PlannerPort {
  readonly calls: PlannerInput[] = [];
  readonly completions: ModelActionCompletionResult[] = [];
  readonly modelTraceEvents: PlannerModelTraceEvent[] = [];

  constructor(private readonly adapter: ModelAdapter) {}

  /** decideNext 将 adapter 输出原样交给 Action Validator，保持语义理解和确定性校验分层。 */
  async decideNext(input: PlannerInput): Promise<AgentAction> {
    const plannerCallIndex = this.calls.length + 1;
    this.calls.push(input);

    try {
      const completion = await this.adapter.completeAction(input);
      this.completions.push(completion);
      this.recordCompletionTrace(input, plannerCallIndex, completion);
      return completion.actionCandidate as AgentAction;
    } catch (error) {
      this.recordErrorTrace(input, plannerCallIndex, error);
      throw error;
    }
  }

  /** getModelTraceEvents 暴露生产聊天 trace helper 可读取的模型调用诊断，不污染 PlannerPort 合同。 */
  getModelTraceEvents(): readonly PlannerModelTraceEvent[] {
    return this.modelTraceEvents;
  }

  private recordCompletionTrace(
    input: PlannerInput,
    plannerCallIndex: number,
    completion: ModelActionCompletionResult,
  ) {
    if (!completion.trace) {
      return;
    }

    this.modelTraceEvents.push({
      ...completion.trace,
      plannerCallIndex,
      runtimeStep: input.step,
      runId: input.run.runId,
      actionType: completion.trace.actionType ?? readActionType(completion.actionCandidate),
      toolName: completion.trace.toolName ?? readToolName(completion.actionCandidate),
    });
  }

  private recordErrorTrace(input: PlannerInput, plannerCallIndex: number, error: unknown) {
    if (!(error instanceof ModelAdapterError) || !error.trace) {
      return;
    }

    this.modelTraceEvents.push({
      ...error.trace,
      plannerCallIndex,
      runtimeStep: input.step,
      runId: input.run.runId,
    });
  }
}

function readActionType(action: unknown) {
  return isRecord(action) && typeof action.type === "string" ? action.type : undefined;
}

function readToolName(action: unknown) {
  return isRecord(action) && typeof action.toolName === "string" ? action.toolName : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
