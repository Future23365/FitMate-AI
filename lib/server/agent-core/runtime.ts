import { validateAgentAction, createToolError } from "./action-validator";
import {
  claimPendingActionForExecution,
  createConfirmationRequest,
  createPendingAction,
  InMemoryConfirmationStore,
  type ConfirmationStore,
} from "./confirmation-store";
import { executeTool, hashNormalizedInput } from "./executor";
import { createInvalidActionObservation, createRuntimeErrorObservation, createToolObservation } from "./observation";
import { evaluateToolPolicy } from "./policy-guard";
import { validateAndRegisterProducedResources, validateConsumedResources } from "./resource-contract";
import { ResourceStore } from "./resource-store";
import type { AgentObservation, AgentTraceEvent, AgentRunInput, AgentRunResult, ConfirmationResumeInput, ToolError, ToolResult } from "./contracts";
import { AGENT_ERROR_CODES, isAgentContractError } from "./errors";
import type { PlannerPort } from "./planner-port";
import type { ToolRegistry } from "./tool-registry";

/** RunAgentRuntimeInput 连接 registry、planner 和 run input，是 M0 runtime 的唯一入口。 */
export type RunAgentRuntimeInput = {
  registry: ToolRegistry;
  planner: PlannerPort;
  run: AgentRunInput;
  resourceStore?: ResourceStore;
  confirmationStore?: ConfirmationStore;
  confirmationSecret?: string;
};

/** ResumeConfirmedActionRuntimeInput 是 M1 core 级 confirmation resume 的执行入口参数。 */
export type ResumeConfirmedActionRuntimeInput = {
  registry: ToolRegistry;
  resume: ConfirmationResumeInput;
  resourceStore?: ResourceStore;
  confirmationStore: ConfirmationStore;
  confirmationSecret?: string;
  timeoutMs?: number;
};

const DEFAULT_LIMITS = {
  maxSteps: 6,
  maxPlannerCalls: 8,
  maxToolCalls: 6,
  maxInvalidActions: 1,
  duplicateFailureLimit: 1,
  perToolTimeoutMs: 1_000,
  overallTimeoutMs: 5_000,
};

const DEFAULT_CONFIRMATION_SECRET = "agent-core-m1-confirmation-secret";

/** runAgentRuntime 执行 M0 通用循环，按 manifest、planner、validator、executor、observation 顺序推进。 */
export async function runAgentRuntime(input: RunAgentRuntimeInput): Promise<AgentRunResult> {
  const limits = { ...DEFAULT_LIMITS, ...input.run.limits };
  const startedAt = Date.now();
  const deadline = startedAt + limits.overallTimeoutMs;
  const controller = new AbortController();
  const toolResults: ToolResult[] = [];
  const observations: AgentObservation[] = [];
  const traceEvents: AgentTraceEvent[] = [];
  const resourceStore = input.resourceStore ?? new ResourceStore(input.run.runId);
  const confirmationStore = input.confirmationStore ?? new InMemoryConfirmationStore();
  const confirmationSecret = input.confirmationSecret ?? DEFAULT_CONFIRMATION_SECRET;
  const nonRetryableFailures = new Map<string, { code: ToolError["code"]; count: number }>();
  let plannerCalls = 0;
  let toolCalls = 0;
  let invalidActions = 0;

  for (let step = 1; step <= limits.maxSteps; step += 1) {
    if (Date.now() >= deadline) {
      controller.abort();
      return failedResult(input.run.runId, toolResults, observations, traceEvents, step - 1, createToolError(
        AGENT_ERROR_CODES.OVERALL_TIMEOUT,
        "Agent runtime reached the overall timeout.",
      ));
    }

    if (plannerCalls >= limits.maxPlannerCalls) {
      return failedResult(input.run.runId, toolResults, observations, traceEvents, step - 1, createToolError(
        AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED,
        "Agent runtime reached the planner call limit.",
      ));
    }

    const manifests = input.registry.serializeForPlanner();
    plannerCalls += 1;

    const plannerAction = await callPlanner(input.planner, {
      run: input.run,
      step,
      manifests,
      observations,
      toolResults: toolResults.map(redactToolResultForPlanner),
    }, deadline);

    if (!plannerAction.ok) {
      controller.abort();
      return failedResult(input.run.runId, toolResults, observations, traceEvents, step - 1, plannerAction.error);
    }

    const validation = validateAgentAction({
      action: plannerAction.action,
      registry: input.registry,
      manifests,
      toolResults,
      resourceStore,
    });

    if (!validation.ok) {
      invalidActions += 1;
      observations.push(createInvalidActionObservation(validation.error));

      if (invalidActions > limits.maxInvalidActions) {
        return failedResult(input.run.runId, toolResults, observations, traceEvents, step, createToolError(
          AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED,
          "Agent runtime reached the invalid action repair limit.",
          { lastCode: validation.error.code },
        ));
      }

      continue;
    }

    if (validation.action.type === "final_answer") {
      traceEvents.push({
        type: "terminal_grounding",
        actionType: validation.action.type,
        usedResourceRefs: validation.action.usedResourceRefs ?? [],
      });
      return {
        runId: input.run.runId,
        status: "completed",
        terminalAction: validation.action,
        toolResults,
        observations,
        traceEvents,
        steps: step,
      };
    }

    if (validation.action.type === "ask_user") {
      traceEvents.push({
        type: "terminal_grounding",
        actionType: validation.action.type,
        usedResourceRefs: validation.action.usedResourceRefs ?? [],
      });
      return {
        runId: input.run.runId,
        status: "needs_input",
        terminalAction: validation.action,
        toolResults,
        observations,
        traceEvents,
        steps: step,
      };
    }

    if (toolCalls >= limits.maxToolCalls) {
      return failedResult(input.run.runId, toolResults, observations, traceEvents, step, createToolError(
        AGENT_ERROR_CODES.MAX_TOOL_CALLS_EXCEEDED,
        "Agent runtime reached the tool call limit.",
      ));
    }

    const tool = input.registry.get(validation.action.toolName);
    if (!tool) {
      return failedResult(input.run.runId, toolResults, observations, traceEvents, step, createToolError(
        AGENT_ERROR_CODES.UNKNOWN_TOOL,
        `Tool "${validation.action.toolName}" is not registered.`,
      ));
    }

    const consumedValidation = validateConsumedResources({
      tool,
      action: validation.action,
      resourceStore,
    });
    if (!consumedValidation.ok) {
      observations.push(createInvalidActionObservation(consumedValidation.error));
      return failedResult(input.run.runId, toolResults, observations, traceEvents, step, consumedValidation.error);
    }

    const policyDecision = evaluateToolPolicy({
      actor: input.run.actor,
      tool,
      action: validation.action,
    });
    traceEvents.push({
      type: "policy_decision",
      toolName: tool.name,
      decision: policyDecision.kind,
      policyVersion: policyDecision.policyVersion,
    });

    if (policyDecision.kind === "deny") {
      return failedResult(input.run.runId, toolResults, observations, traceEvents, step, policyDecision.error);
    }

    if (policyDecision.kind === "requires_confirmation") {
      const pendingAction = createPendingAction({
        run: input.run,
        tool,
        action: validation.action,
        decision: policyDecision,
        secret: confirmationSecret,
      });
      confirmationStore.save(pendingAction);
      const confirmationRequest = createConfirmationRequest(pendingAction);
      traceEvents.push({ type: "confirmation_request", request: confirmationRequest });
      return {
        runId: input.run.runId,
        status: "requires_confirmation",
        confirmationRequest,
        toolResults,
        observations,
        traceEvents,
        steps: step,
      };
    }

    const normalizedInputHash = hashNormalizedInput(validation.action.input);
    const failureKey = `${tool.name}:${tool.version}:${normalizedInputHash}`;
    const previousFailure = nonRetryableFailures.get(failureKey);

    if (previousFailure && previousFailure.count >= limits.duplicateFailureLimit) {
      const duplicateError = createToolError(
        AGENT_ERROR_CODES.DUPLICATE_TOOL_FAILURE,
        "Agent runtime stopped repeated non-retryable tool failure before invoking the handler again.",
        { toolName: tool.name, failureCode: previousFailure.code },
      );
      const duplicateResult = createFailureToolResult(input.run.runId, tool.name, tool.version, normalizedInputHash, duplicateError);
      toolResults.push(duplicateResult);
      observations.push(createToolObservation(duplicateResult));
      return failedResult(input.run.runId, toolResults, observations, traceEvents, step, duplicateError);
    }

    toolCalls += 1;
    const remainingMs = Math.max(1, deadline - Date.now());
    const configuredToolTimeout = tool.policy.timeoutMs ?? limits.perToolTimeoutMs;
    const timeoutMs = Math.min(configuredToolTimeout, remainingMs);
    const result = await executeTool({
      tool,
      input: validation.action.input,
      run: input.run,
      timeoutMs,
      toolCallId: `tc_${step}_${toolCalls}`,
      parentSignal: controller.signal,
      resourceStore,
      consumedResources: consumedValidation.consumedResources,
    });
    const finalizedResult = finalizeToolResultResources({
      result,
      tool,
      run: input.run,
      resourceStore,
      traceEvents,
    });

    if (!finalizedResult.ok && finalizedResult.error.code === AGENT_ERROR_CODES.TIMEOUT && remainingMs <= configuredToolTimeout) {
      controller.abort();
      return failedResult(input.run.runId, toolResults, observations, traceEvents, step, createToolError(
        AGENT_ERROR_CODES.OVERALL_TIMEOUT,
        "Agent runtime reached the overall timeout during tool execution.",
      ));
    }

    toolResults.push(finalizedResult);
    observations.push(createToolObservation(finalizedResult));

    if (!finalizedResult.ok && !finalizedResult.error.retryable) {
      const current = nonRetryableFailures.get(failureKey);
      nonRetryableFailures.set(failureKey, {
        code: finalizedResult.error.code,
        count: (current?.count ?? 0) + 1,
      });
    }
  }

  return failedResult(input.run.runId, toolResults, observations, traceEvents, limits.maxSteps, createToolError(
    AGENT_ERROR_CODES.MAX_STEPS_EXCEEDED,
    "Agent runtime reached maxSteps without a terminal action.",
  ));
}

/** resumeConfirmedAction 执行服务端保存的 pending tool_call，忽略客户端重传的新 input。 */
export async function resumeConfirmedAction(input: ResumeConfirmedActionRuntimeInput): Promise<AgentRunResult> {
  const run = input.resume.run;
  const resourceStore = input.resourceStore ?? new ResourceStore(run.runId);
  const traceEvents: AgentTraceEvent[] = [];
  const observations: AgentObservation[] = [];
  const toolResults: ToolResult[] = [];
  const claim = claimPendingActionForExecution({
    store: input.confirmationStore,
    resume: input.resume,
    secret: input.confirmationSecret ?? DEFAULT_CONFIRMATION_SECRET,
  });

  if (!claim.ok) {
    return failedResult(run.runId, toolResults, observations, traceEvents, 0, claim.error);
  }

  traceEvents.push({
    type: "confirmation_resume",
    pendingActionId: claim.pendingAction.pendingActionId,
    status: "consumed",
  });

  const tool = input.registry.get(claim.pendingAction.toolName);
  if (!tool) {
    return failedResult(run.runId, toolResults, observations, traceEvents, 0, createToolError(
      AGENT_ERROR_CODES.UNKNOWN_TOOL,
      `Tool "${claim.pendingAction.toolName}" is not registered.`,
    ));
  }

  const manifests = input.registry.serializeForPlanner();
  const validation = validateAgentAction({
    action: claim.pendingAction.toolCall,
    registry: input.registry,
    manifests,
    toolResults,
    resourceStore,
  });
  if (!validation.ok || validation.action.type !== "tool_call") {
    const error = validation.ok
      ? createToolError(AGENT_ERROR_CODES.INVALID_ACTION, "Pending action is not an executable tool_call.")
      : validation.error;
    return failedResult(run.runId, toolResults, observations, traceEvents, 0, error);
  }

  const consumedValidation = validateConsumedResources({
    tool,
    action: validation.action,
    resourceStore,
  });
  if (!consumedValidation.ok) {
    return failedResult(run.runId, toolResults, observations, traceEvents, 0, consumedValidation.error);
  }

  const policyDecision = evaluateToolPolicy({
    actor: run.actor,
    tool,
    action: validation.action,
    confirmationSatisfied: true,
  });
  traceEvents.push({
    type: "policy_decision",
    toolName: tool.name,
    decision: policyDecision.kind,
    policyVersion: policyDecision.policyVersion,
  });

  if (policyDecision.kind !== "allow") {
    const error = policyDecision.kind === "deny"
      ? policyDecision.error
      : createToolError(AGENT_ERROR_CODES.CONFIRMATION_REQUIRED, "Confirmation was not accepted by policy guard.");
    return failedResult(run.runId, toolResults, observations, traceEvents, 0, error);
  }

  const result = await executeTool({
    tool,
    input: validation.action.input,
    run,
    timeoutMs: input.timeoutMs ?? tool.policy.timeoutMs ?? DEFAULT_LIMITS.perToolTimeoutMs,
    toolCallId: `tc_resume_${claim.pendingAction.pendingActionId}`,
    resourceStore,
    consumedResources: consumedValidation.consumedResources,
  });
  const finalizedResult = finalizeToolResultResources({
    result,
    tool,
    run,
    resourceStore,
    traceEvents,
  });

  toolResults.push(finalizedResult);
  observations.push(createToolObservation(finalizedResult));

  if (!finalizedResult.ok) {
    return failedResult(run.runId, toolResults, observations, traceEvents, 1, finalizedResult.error);
  }

  return {
    runId: run.runId,
    status: "completed",
    toolResults,
    observations,
    traceEvents,
    steps: 1,
  };
}

type PlannerCallResult =
  | { ok: true; action: Awaited<ReturnType<PlannerPort["decideNext"]>> }
  | { ok: false; error: ToolError };

async function callPlanner(
  planner: PlannerPort,
  plannerInput: Parameters<PlannerPort["decideNext"]>[0],
  deadline: number,
): Promise<PlannerCallResult> {
  const remainingMs = Math.max(1, deadline - Date.now());

  try {
    const action = await Promise.race([
      planner.decideNext(plannerInput),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("OVERALL_TIMEOUT")), remainingMs);
      }),
    ]);
    return { ok: true, action };
  } catch (error) {
    if ((error as Error).message === "OVERALL_TIMEOUT") {
      return {
        ok: false,
        error: createToolError(AGENT_ERROR_CODES.OVERALL_TIMEOUT, "Agent runtime reached the overall timeout while waiting for planner."),
      };
    }

    if (isAgentContractError(error)) {
      return {
        ok: false,
        error: createToolError(error.code, error.message),
      };
    }

    return {
      ok: false,
      error: createToolError(AGENT_ERROR_CODES.INVALID_ACTION, "Planner failed before returning an AgentAction."),
    };
  }
}

function failedResult(
  runId: string,
  toolResults: ToolResult[],
  observations: AgentObservation[],
  traceEvents: AgentTraceEvent[],
  steps: number,
  error: ToolError,
): AgentRunResult {
  const allObservations = [...observations, createRuntimeErrorObservation(error)];

  return {
    runId,
    status: "failed",
    terminalError: error,
    toolResults,
    observations: allObservations,
    traceEvents,
    steps,
  };
}

function createFailureToolResult(
  runId: string,
  toolName: string,
  toolVersion: string,
  normalizedInputHash: string,
  error: ToolError,
): ToolResult {
  const now = new Date().toISOString();

  return {
    toolResultId: `tr_${hashNormalizedInput({ runId, toolName, normalizedInputHash, code: error.code })}`,
    toolName,
    toolVersion,
    toolCallId: `tc_duplicate_${toolName}`,
    normalizedInputHash,
    startedAt: now,
    completedAt: now,
    ok: false,
    error,
    fulfillment: {
      satisfied: false,
      summary: `Tool "${toolName}" failed with ${error.code}.`,
    },
  };
}

function finalizeToolResultResources(input: {
  result: ToolResult;
  tool: NonNullable<ReturnType<ToolRegistry["get"]>>;
  run: AgentRunInput;
  resourceStore: ResourceStore;
  traceEvents: AgentTraceEvent[];
}): ToolResult {
  if (!input.result.ok) {
    return input.result;
  }

  const producedValidation = validateAndRegisterProducedResources({
    tool: input.tool,
    result: input.result,
    resourceStore: input.resourceStore,
    projectionContext: {
      runId: input.run.runId,
      actor: input.run.actor,
      toolCallId: input.result.toolCallId,
      metadata: input.run.metadata,
      resources: input.resourceStore,
    },
  });

  if (!producedValidation.ok) {
    return {
      toolResultId: input.result.toolResultId,
      toolName: input.result.toolName,
      toolVersion: input.result.toolVersion,
      toolCallId: input.result.toolCallId,
      normalizedInputHash: input.result.normalizedInputHash,
      startedAt: input.result.startedAt,
      completedAt: new Date().toISOString(),
      ok: false,
      error: producedValidation.error,
      fulfillment: {
        ...input.result.fulfillment,
        satisfied: false,
        summary: `Tool "${input.result.toolName}" failed resource contract validation.`,
        unmetRequirements: [
          {
            reason: producedValidation.error.code,
            message: producedValidation.error.message,
          },
        ],
      },
    };
  }

  for (const resource of producedValidation.producedResources) {
    const registered = input.resourceStore.get(resource);
    input.traceEvents.push({
      type: "resource_registered",
      toolResultId: input.result.toolResultId,
      resource,
      summary: registered?.summary ?? {},
    });
  }

  return {
    ...input.result,
    fulfillment: {
      ...input.result.fulfillment,
      producedResources: producedValidation.producedResources,
    },
  };
}

/** redactToolResultForPlanner 防止完整 handler output 回灌给 Planner，只保留安全投影和履约摘要。 */
function redactToolResultForPlanner(result: ToolResult): ToolResult {
  if (!result.ok) {
    return result;
  }

  return {
    ...result,
    output: "[redacted-tool-output]",
  };
}
