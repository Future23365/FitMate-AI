import { validateAgentAction, createToolError } from "./action-validator";
import {
  claimPendingActionForExecution,
  createConfirmationRequest,
  createPendingAction,
  InMemoryConfirmationStore,
  markPendingActionConsumed,
  type ConfirmationStore,
} from "./confirmation-store";
import { estimateJsonTokens } from "./canonical-json";
import { executeTool, hashNormalizedInput } from "./executor";
import { createToolExecutionIdempotencyKey } from "./idempotency";
import { createRegistrySnapshot } from "./manifest-hardening";
import { compressPlannerObservations, createInvalidActionObservation, createRuntimeErrorObservation, createToolObservation } from "./observation";
import { evaluateToolPolicy } from "./policy-guard";
import { redactJsonValue } from "./redaction";
import { validateAndRegisterProducedResources, validateConsumedResources } from "./resource-contract";
import { ResourceStore } from "./resource-store";
import type {
  AgentObservation,
  AgentReplaySummary,
  AgentTraceEvent,
  AgentRunInput,
  AgentRunResult,
  ConfirmationResumeInput,
  DynamicConfirmationEvaluator,
  RegistrySnapshot,
  ToolCallAction,
  ToolError,
  ToolResult,
} from "./contracts";
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
  dynamicConfirmationEvaluator?: DynamicConfirmationEvaluator;
};

/** ResumeConfirmedActionRuntimeInput 是 M1 core 级 confirmation resume 的执行入口参数。 */
export type ResumeConfirmedActionRuntimeInput = {
  registry: ToolRegistry;
  resume: ConfirmationResumeInput;
  resourceStore?: ResourceStore;
  confirmationStore: ConfirmationStore;
  confirmationSecret?: string;
  dynamicConfirmationEvaluator?: DynamicConfirmationEvaluator;
  timeoutMs?: number;
};

const DEFAULT_LIMITS = {
  maxSteps: 6,
  maxPlannerCalls: 8,
  maxToolCalls: 6,
  maxInvalidActions: 1,
  maxRepairAttempts: undefined as number | undefined,
  maxEstimatedTokens: undefined as number | undefined,
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
  const manifests = input.registry.serializeForPlanner();
  const registrySnapshot = createRegistrySnapshot(manifests);
  const resourceStore = input.resourceStore ?? new ResourceStore(input.run.runId);
  const confirmationStore = input.confirmationStore ?? new InMemoryConfirmationStore();
  const confirmationSecret = input.confirmationSecret ?? DEFAULT_CONFIRMATION_SECRET;
  const nonRetryableFailures = new Map<string, { code: ToolError["code"]; count: number }>();
  const repairLimit = limits.maxRepairAttempts ?? limits.maxInvalidActions;
  let plannerCalls = 0;
  let toolCalls = 0;
  let invalidActions = 0;

  traceEvents.push({
    type: "registry_snapshot",
    snapshotId: registrySnapshot.snapshotId,
    manifestHash: registrySnapshot.manifestHash,
    toolCount: registrySnapshot.tools.length,
  });
  const finish = (result: AgentRunResult) => attachReplaySummary(result, registrySnapshot);

  for (let step = 1; step <= limits.maxSteps; step += 1) {
    if (Date.now() >= deadline) {
      controller.abort();
      return finish(failedResult(input.run.runId, toolResults, observations, traceEvents, step - 1, createToolError(
        AGENT_ERROR_CODES.OVERALL_TIMEOUT,
        "Agent runtime reached the overall timeout.",
      )));
    }

    if (plannerCalls >= limits.maxPlannerCalls) {
      traceEvents.push(createBudgetEvent("planner_calls", "exhausted", plannerCalls, limits.maxPlannerCalls, step));
      return finish(failedResult(input.run.runId, toolResults, observations, traceEvents, step - 1, createToolError(
        AGENT_ERROR_CODES.BUDGET_EXHAUSTED,
        "Agent runtime reached the planner call limit.",
      )));
    }

    const plannerInput = {
      run: input.run,
      step,
      manifests,
      observations: compressPlannerObservations(observations),
      toolResults: toolResults.map(redactToolResultForPlanner),
    };
    const estimatedTokens = estimateJsonTokens(plannerInput);

    if (limits.maxEstimatedTokens && estimatedTokens > limits.maxEstimatedTokens) {
      traceEvents.push(createBudgetEvent("estimated_tokens", "exhausted", estimatedTokens, limits.maxEstimatedTokens, step));
      return finish(failedResult(input.run.runId, toolResults, observations, traceEvents, step - 1, createToolError(
        AGENT_ERROR_CODES.BUDGET_EXHAUSTED,
        "Agent runtime reached the estimated token budget before calling planner.",
        { estimatedTokens, maxEstimatedTokens: limits.maxEstimatedTokens },
      )));
    }

    plannerCalls += 1;
    traceEvents.push(createBudgetEvent("planner_calls", "used", plannerCalls, limits.maxPlannerCalls, step));

    const plannerAction = await callPlanner(input.planner, plannerInput, deadline);

    if (!plannerAction.ok) {
      controller.abort();
      return finish(failedResult(input.run.runId, toolResults, observations, traceEvents, step - 1, plannerAction.error));
    }

    traceEvents.push(createPlannerActionTrace(step, plannerAction.action));

    const validation = validateAgentAction({
      action: plannerAction.action,
      registry: input.registry,
      manifests,
      toolResults,
      resourceStore,
    });
    traceEvents.push({
      type: "validation_result",
      step,
      ok: validation.ok,
      code: validation.ok ? undefined : validation.error.code,
    });

    if (!validation.ok) {
      invalidActions += 1;
      observations.push(createInvalidActionObservation(validation.error));

      if (invalidActions > repairLimit) {
        traceEvents.push(createBudgetEvent("repair_attempts", "exhausted", invalidActions, repairLimit, step, validation.error.code));
        return finish(failedResult(input.run.runId, toolResults, observations, traceEvents, step, createToolError(
          AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED,
          "Agent runtime reached the invalid action repair limit.",
          { lastCode: validation.error.code },
        )));
      }

      traceEvents.push(createBudgetEvent("repair_attempts", "used", invalidActions, repairLimit, step, validation.error.code));

      continue;
    }

    if (validation.action.type === "final_answer") {
      traceEvents.push({
        type: "terminal_grounding",
        actionType: validation.action.type,
        usedResourceRefs: validation.action.usedResourceRefs ?? [],
      });
      return finish({
        runId: input.run.runId,
        status: "completed",
        terminalAction: validation.action,
        toolResults,
        observations,
        traceEvents,
        steps: step,
      });
    }

    if (validation.action.type === "ask_user") {
      traceEvents.push({
        type: "terminal_grounding",
        actionType: validation.action.type,
        usedResourceRefs: validation.action.usedResourceRefs ?? [],
      });
      return finish({
        runId: input.run.runId,
        status: "needs_input",
        terminalAction: validation.action,
        toolResults,
        observations,
        traceEvents,
        steps: step,
      });
    }

    if (toolCalls >= limits.maxToolCalls) {
      traceEvents.push(createBudgetEvent("tool_calls", "exhausted", toolCalls, limits.maxToolCalls, step));
      return finish(failedResult(input.run.runId, toolResults, observations, traceEvents, step, createToolError(
        AGENT_ERROR_CODES.BUDGET_EXHAUSTED,
        "Agent runtime reached the tool call limit.",
      )));
    }

    const tool = input.registry.get(validation.action.toolName);
    if (!tool) {
      return finish(failedResult(input.run.runId, toolResults, observations, traceEvents, step, createToolError(
        AGENT_ERROR_CODES.UNKNOWN_TOOL,
        `Tool "${validation.action.toolName}" is not registered.`,
      )));
    }

    const consumedValidation = validateConsumedResources({
      tool,
      action: validation.action,
      resourceStore,
    });
    if (!consumedValidation.ok) {
      observations.push(createInvalidActionObservation(consumedValidation.error));
      return finish(failedResult(input.run.runId, toolResults, observations, traceEvents, step, consumedValidation.error));
    }

    const policyDecision = evaluateToolPolicy({
      actor: input.run.actor,
      tool,
      action: validation.action,
      dynamicConfirmationEvaluator: input.dynamicConfirmationEvaluator,
    });
    traceEvents.push({
      type: "policy_decision",
      toolName: tool.name,
      decision: policyDecision.kind,
      policyVersion: policyDecision.policyVersion,
    });

    if (policyDecision.kind === "deny") {
      return finish(failedResult(input.run.runId, toolResults, observations, traceEvents, step, policyDecision.error));
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
      return finish({
        runId: input.run.runId,
        status: "requires_confirmation",
        confirmationRequest,
        toolResults,
        observations,
        traceEvents,
        steps: step,
      });
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
      traceEvents.push(createToolExecutionTrace({
        step,
        action: validation.action,
        result: duplicateResult,
        source: "duplicate_failure_fuse",
      }));
      toolResults.push(duplicateResult);
      observations.push(createToolObservation(duplicateResult));
      return finish(failedResult(input.run.runId, toolResults, observations, traceEvents, step, duplicateError));
    }

    toolCalls += 1;
    traceEvents.push(createBudgetEvent("tool_calls", "used", toolCalls, limits.maxToolCalls, step));
    const remainingMs = Math.max(1, deadline - Date.now());
    const configuredToolTimeout = tool.policy.timeoutMs ?? limits.perToolTimeoutMs;
    const timeoutMs = Math.min(configuredToolTimeout, remainingMs);
    const idempotencyKey = createToolExecutionIdempotencyKey({
      run: input.run,
      toolName: tool.name,
      toolVersion: tool.version,
      input: validation.action.input,
      action: validation.action,
      resourceRefs: validation.action.consumes ?? [],
    });
    const result = await executeTool({
      tool,
      input: validation.action.input,
      run: input.run,
      timeoutMs,
      toolCallId: `tc_${step}_${toolCalls}`,
      idempotencyKey,
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
    traceEvents.push(createToolExecutionTrace({
      step,
      action: validation.action,
      result: finalizedResult,
      source: "runtime",
    }));

    if (!finalizedResult.ok && finalizedResult.error.code === AGENT_ERROR_CODES.TIMEOUT && remainingMs <= configuredToolTimeout) {
      controller.abort();
      return finish(failedResult(input.run.runId, toolResults, observations, traceEvents, step, createToolError(
        AGENT_ERROR_CODES.OVERALL_TIMEOUT,
        "Agent runtime reached the overall timeout during tool execution.",
      )));
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

  return finish(failedResult(input.run.runId, toolResults, observations, traceEvents, limits.maxSteps, createToolError(
    AGENT_ERROR_CODES.MAX_STEPS_EXCEEDED,
    "Agent runtime reached maxSteps without a terminal action.",
  )));
}

/** resumeConfirmedAction 执行服务端保存的 pending tool_call，忽略客户端重传的新 input。 */
export async function resumeConfirmedAction(input: ResumeConfirmedActionRuntimeInput): Promise<AgentRunResult> {
  const run = input.resume.run;
  const resourceStore = input.resourceStore ?? new ResourceStore(run.runId);
  const traceEvents: AgentTraceEvent[] = [];
  const observations: AgentObservation[] = [];
  const toolResults: ToolResult[] = [];
  const manifests = input.registry.serializeForPlanner();
  const registrySnapshot = createRegistrySnapshot(manifests);
  traceEvents.push({
    type: "registry_snapshot",
    snapshotId: registrySnapshot.snapshotId,
    manifestHash: registrySnapshot.manifestHash,
    toolCount: registrySnapshot.tools.length,
  });
  const finish = (result: AgentRunResult) => attachReplaySummary(result, registrySnapshot);
  const claim = claimPendingActionForExecution({
    store: input.confirmationStore,
    resume: input.resume,
    secret: input.confirmationSecret ?? DEFAULT_CONFIRMATION_SECRET,
  });

  if (!claim.ok) {
    return finish(failedResult(run.runId, toolResults, observations, traceEvents, 0, claim.error));
  }

  const tool = input.registry.get(claim.pendingAction.toolName);
  if (!tool) {
    return finish(failedResult(run.runId, toolResults, observations, traceEvents, 0, createToolError(
      AGENT_ERROR_CODES.UNKNOWN_TOOL,
      `Tool "${claim.pendingAction.toolName}" is not registered.`,
    )));
  }

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
    return finish(failedResult(run.runId, toolResults, observations, traceEvents, 0, error));
  }

  const consumedValidation = validateConsumedResources({
    tool,
    action: validation.action,
    resourceStore,
  });
  if (!consumedValidation.ok) {
    return finish(failedResult(run.runId, toolResults, observations, traceEvents, 0, consumedValidation.error));
  }

  const policyDecision = evaluateToolPolicy({
    actor: run.actor,
    tool,
    action: validation.action,
    confirmationSatisfied: true,
    dynamicConfirmationEvaluator: input.dynamicConfirmationEvaluator,
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
    return finish(failedResult(run.runId, toolResults, observations, traceEvents, 0, error));
  }

  const idempotencyKey = createToolExecutionIdempotencyKey({
    run,
    toolName: tool.name,
    toolVersion: tool.version,
    input: validation.action.input,
    action: validation.action,
    resourceRefs: validation.action.consumes ?? [],
    pendingActionId: claim.pendingAction.pendingActionId,
    actionHash: claim.pendingAction.actionHash,
  });
  const result = await executeTool({
    tool,
    input: validation.action.input,
    run,
    timeoutMs: input.timeoutMs ?? tool.policy.timeoutMs ?? DEFAULT_LIMITS.perToolTimeoutMs,
    toolCallId: `tc_resume_${claim.pendingAction.pendingActionId}`,
    idempotencyKey,
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
  traceEvents.push(createToolExecutionTrace({
    step: 1,
    action: validation.action,
    result: finalizedResult,
    source: "confirmation_resume",
  }));

  toolResults.push(finalizedResult);
  observations.push(createToolObservation(finalizedResult));

  if (!finalizedResult.ok) {
    return finish(failedResult(run.runId, toolResults, observations, traceEvents, 1, finalizedResult.error));
  }

  markPendingActionConsumed(input.confirmationStore, claim.pendingAction.pendingActionId);
  traceEvents.push({
    type: "confirmation_resume",
    pendingActionId: claim.pendingAction.pendingActionId,
    status: "consumed",
  });

  return finish({
    runId: run.runId,
    status: "completed",
    toolResults,
    observations,
    traceEvents,
    steps: 1,
  });
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

function createBudgetEvent(
  budget: Extract<AgentTraceEvent, { type: "budget_event" }>["budget"],
  status: Extract<AgentTraceEvent, { type: "budget_event" }>["status"],
  used: number,
  limit: number,
  step: number,
  reason?: string,
): Extract<AgentTraceEvent, { type: "budget_event" }> {
  return {
    type: "budget_event",
    budget,
    status,
    used,
    limit,
    step,
    reason,
  };
}

/** createToolExecutionTrace 统一投影 tool 执行证据，避免各业务 handler 自行打日志。 */
function createToolExecutionTrace(input: {
  step: number;
  action: ToolCallAction;
  result: ToolResult;
  source?: Extract<AgentTraceEvent, { type: "tool_execution" }>["source"];
}): Extract<AgentTraceEvent, { type: "tool_execution" }> {
  return {
    type: "tool_execution",
    step: input.step,
    source: input.source,
    toolName: input.result.toolName,
    toolVersion: input.result.toolVersion,
    toolCallId: input.result.toolCallId,
    toolResultId: input.result.toolResultId,
    normalizedInputHash: input.result.normalizedInputHash,
    inputSummary: redactJsonValue(input.action.input),
    ok: input.result.ok,
    satisfied: input.result.fulfillment.satisfied,
    failureCode: input.result.ok ? undefined : input.result.error.code,
    error: input.result.ok
      ? undefined
      : {
          code: input.result.error.code,
          retryable: input.result.error.retryable,
          details: input.result.error.details ? redactJsonValue(input.result.error.details) : undefined,
        },
    fulfillment: {
      summary: input.result.fulfillment.summary,
      satisfied: input.result.fulfillment.satisfied,
      producedResources: input.result.fulfillment.producedResources,
      consumedResources: input.result.fulfillment.consumedResources,
      unmetRequirements: input.result.fulfillment.unmetRequirements,
    },
    projectionSummary: input.result.ok
      ? {
          model: input.result.projection.model ? redactJsonValue(input.result.projection.model) : undefined,
          user: input.result.projection.user ? redactJsonValue(input.result.projection.user) : undefined,
        }
      : undefined,
    producedResources: input.result.fulfillment.producedResources,
    consumedResources: input.result.fulfillment.consumedResources,
    startedAt: input.result.startedAt,
    completedAt: input.result.completedAt,
    durationMs: getToolExecutionDurationMs(input.result.startedAt, input.result.completedAt),
  };
}

function createPlannerActionTrace(step: number, action: unknown): AgentTraceEvent {
  const actionRecord = action && typeof action === "object" ? action as Partial<ToolCallAction> : undefined;

  return {
    type: "planner_action",
    step,
    actionType: typeof actionRecord?.type === "string" ? actionRecord.type : "unknown",
    toolName: typeof actionRecord?.toolName === "string" ? actionRecord.toolName : undefined,
  };
}

function getToolExecutionDurationMs(startedAt: string, completedAt: string) {
  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);

  if (!Number.isFinite(started) || !Number.isFinite(completed)) {
    return undefined;
  }

  return Math.max(0, completed - started);
}

function attachReplaySummary(result: AgentRunResult, registrySnapshot: RegistrySnapshot): AgentRunResult {
  const traceEvents = redactJsonValue(result.traceEvents) as AgentTraceEvent[];
  const safeResult = {
    ...result,
    traceEvents,
    registrySnapshot,
  };

  return {
    ...safeResult,
    replaySummary: createReplaySummary(safeResult, registrySnapshot),
  };
}

function createReplaySummary(result: AgentRunResult, registrySnapshot: RegistrySnapshot): AgentReplaySummary {
  return {
    manifestHash: registrySnapshot.manifestHash,
    registrySnapshotId: registrySnapshot.snapshotId,
    status: result.status,
    steps: result.steps,
    terminalActionType: result.terminalAction?.type,
    terminalErrorCode: result.terminalError?.code,
    toolResults: result.toolResults.map((toolResult) => ({
      toolResultId: toolResult.toolResultId,
      toolName: toolResult.toolName,
      ok: toolResult.ok,
      fulfillment: {
        satisfied: toolResult.fulfillment.satisfied,
        summary: toolResult.fulfillment.summary,
        producedResources: toolResult.fulfillment.producedResources,
        consumedResources: toolResult.fulfillment.consumedResources,
      },
    })),
    budgetEvents: result.traceEvents.filter((event): event is Extract<AgentTraceEvent, { type: "budget_event" }> => event.type === "budget_event"),
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
    idempotencyKey: `idem_${hashNormalizedInput({ runId, toolName, normalizedInputHash, code: error.code })}`,
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
      idempotencyKey: input.result.idempotencyKey,
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
      idempotencyKey: input.result.idempotencyKey,
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
      summary: redactJsonValue(registered?.summary ?? {}),
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
    output: "[redacted]",
  };
}
