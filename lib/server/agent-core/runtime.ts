import { validateAgentAction, validateAgentActionAsync, createToolError } from "./action-validator";
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
import {
  compressPlannerObservations,
  createDuplicateToolInputObservation,
  createInvalidActionObservation,
  createRuntimeErrorObservation,
  createToolObservation,
} from "./observation";
import { evaluateToolPolicy } from "./policy-guard";
import { toPlannerVisibleToolResult } from "./planner-visible-tool-result";
import { redactJsonValue } from "./redaction";
import { validateAndRegisterProducedResources, validateConsumedResources } from "./resource-contract";
import { ResourceStore } from "./resource-store";
import { sanitizeAgentActivitySummary } from "@/lib/shared/agent-activity-summary";
import type { TerminalOutputValidatorRegistry } from "./terminal-output-validator";
import type {
  AgentObservation,
  AgentReplaySummary,
  AgentTraceEvent,
  AgentRunInput,
  AgentRunResult,
  ConfirmationResumeInput,
  DynamicConfirmationEvaluator,
  JsonValue,
  RegistrySnapshot,
  ToolCallAction,
  ToolError,
  ToolResult,
} from "./contracts";
import { AGENT_ERROR_CODES, isAgentContractError } from "./errors";
import type { PlannerPort, PlannerRepairContext } from "./planner-port";
import type { ToolRegistry } from "./tool-registry";

/** AgentRuntimeTraceObserver 是 runtime 对外暴露的只读观察点，失败时不得影响执行结果。 */
export type AgentRuntimeTraceObserver = (event: AgentTraceEvent) => void | Promise<void>;

/** RunAgentRuntimeInput 连接 registry、planner 和 run input，是 M0 runtime 的唯一入口。 */
export type RunAgentRuntimeInput = {
  registry: ToolRegistry;
  planner: PlannerPort;
  run: AgentRunInput;
  resourceStore?: ResourceStore;
  confirmationStore?: ConfirmationStore;
  confirmationSecret?: string;
  dynamicConfirmationEvaluator?: DynamicConfirmationEvaluator;
  terminalOutputValidators?: TerminalOutputValidatorRegistry;
  onTraceEvent?: AgentRuntimeTraceObserver;
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
  const toolCallCounts = new Map<string, number>();
  const repairLimit = limits.maxRepairAttempts ?? limits.maxInvalidActions;
  let plannerCalls = 0;
  let toolCalls = 0;
  let invalidActions = 0;
  let pendingRepairContext: PlannerRepairContext | undefined;

  const recordTraceEvent = async (event: AgentTraceEvent) => {
    traceEvents.push(event);

    if (!input.onTraceEvent) {
      return;
    }

    try {
      await input.onTraceEvent(event);
    } catch {
      // 进度观察是非致命 UI 侧信号，不能改变 Planner、tool 或 runtime 结果。
    }
  };

  await recordTraceEvent({
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
      await recordTraceEvent(createBudgetEvent("planner_calls", "exhausted", plannerCalls, limits.maxPlannerCalls, step));
      return finish(failedResult(input.run.runId, toolResults, observations, traceEvents, step - 1, createToolError(
        AGENT_ERROR_CODES.BUDGET_EXHAUSTED,
        "Agent runtime reached the planner call limit.",
      )));
    }

    const plannerContext = {
      run: input.run,
      step,
      manifests,
      observations: compressPlannerObservations(observations),
      toolResults: toolResults.map(toPlannerVisibleToolResult),
    };
    const plannerInput = {
      ...plannerContext,
      context: plannerContext,
      repairContext: pendingRepairContext,
    };
    const estimatedTokens = estimateJsonTokens({
      context: plannerInput.context,
      repairContext: plannerInput.repairContext,
    });

    if (limits.maxEstimatedTokens && estimatedTokens > limits.maxEstimatedTokens) {
      await recordTraceEvent(createBudgetEvent("estimated_tokens", "exhausted", estimatedTokens, limits.maxEstimatedTokens, step));
      return finish(failedResult(input.run.runId, toolResults, observations, traceEvents, step - 1, createToolError(
        AGENT_ERROR_CODES.BUDGET_EXHAUSTED,
        "Agent runtime reached the estimated token budget before calling planner.",
        { estimatedTokens, maxEstimatedTokens: limits.maxEstimatedTokens },
      )));
    }

    await recordTraceEvent(createAgentLoopTrace(step));
    plannerCalls += 1;
    await recordTraceEvent(createBudgetEvent("planner_calls", "used", plannerCalls, limits.maxPlannerCalls, step));

    const plannerAction = await callPlanner(input.planner, plannerInput, deadline);

    if (!plannerAction.ok) {
      controller.abort();
      return finish(failedResult(input.run.runId, toolResults, observations, traceEvents, step - 1, plannerAction.error));
    }

    await recordTraceEvent(createPlannerActionTrace(step, plannerAction.action));

    const validation = await validateAgentActionAsync({
      action: plannerAction.action,
      registry: input.registry,
      manifests,
      toolResults,
      run: input.run,
      resourceStore,
      terminalOutputValidators: input.terminalOutputValidators,
    });
    if (validation.normalization) {
      await recordTraceEvent(createActionNormalizationTrace(step, validation.normalization, validation.ok));
    }
    await recordTraceEvent({
      type: "validation_result",
      step,
      ok: validation.ok,
      code: validation.ok ? undefined : validation.error.code,
    });

    if (!validation.ok) {
      invalidActions += 1;
      observations.push(createInvalidActionObservation(validation.error));

      if (invalidActions > repairLimit) {
        await recordTraceEvent(createBudgetEvent("repair_attempts", "exhausted", invalidActions, repairLimit, step, validation.error.code));
        return finish(failedResult(input.run.runId, toolResults, observations, traceEvents, step, createToolError(
          AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED,
          "Agent runtime reached the invalid action repair limit.",
          { lastCode: validation.error.code },
        )));
      }

      pendingRepairContext = createPlannerRepairContext(plannerAction.action, validation.error);
      await recordTraceEvent(createBudgetEvent("repair_attempts", "used", invalidActions, repairLimit, step, validation.error.code));

      continue;
    }
    pendingRepairContext = undefined;

    if (validation.action.type === "final_answer") {
      await recordTraceEvent({
        type: "terminal_grounding",
        actionType: validation.action.type,
        usedRefs: validation.action.usedRefs ?? [],
      });
      return finish({
        runId: input.run.runId,
        status: "completed",
        terminalAction: validation.action,
        terminalOutputValidation: validation.terminalOutputValidation,
        toolResults,
        observations,
        traceEvents,
        steps: step,
      });
    }

    if (validation.action.type === "ask_user") {
      await recordTraceEvent({
        type: "terminal_grounding",
        actionType: validation.action.type,
        usedRefs: validation.action.usedRefs ?? [],
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
      await recordTraceEvent(createBudgetEvent("tool_calls", "exhausted", toolCalls, limits.maxToolCalls, step));
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
    await recordTraceEvent({
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
      await recordTraceEvent({ type: "confirmation_request", request: confirmationRequest });
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
    const previousToolCallCount = toolCallCounts.get(failureKey) ?? 0;

    const previousResult = findToolResult(toolResults, {
      toolName: tool.name,
      toolVersion: tool.version,
      normalizedInputHash,
    });

    if (previousToolCallCount > 0 && previousResult) {
      await recordTraceEvent({
        type: "duplicate_tool_call",
        step,
        toolName: tool.name,
        toolVersion: tool.version,
        normalizedInputHash,
        previousToolResultId: previousResult.toolResultId,
        previousOk: previousResult.ok,
        previousCount: previousToolCallCount,
        repeatCount: previousToolCallCount + 1,
      });
    }
    toolCallCounts.set(failureKey, previousToolCallCount + 1);

    const previousOkResult = previousResult?.ok ? previousResult : undefined;
    if (previousOkResult) {
      invalidActions += 1;
      const duplicateFeedback = {
        toolName: tool.name,
        toolVersion: tool.version,
        normalizedInputHash,
        previousToolResultId: previousOkResult.toolResultId,
        previousOk: previousOkResult.ok,
        previousSatisfied: previousOkResult.fulfillment.satisfied,
        repeatCount: previousToolCallCount + 1,
        resultSummary: previousOkResult.fulfillment.summary,
        producedResources: previousOkResult.fulfillment.producedResources as JsonValue | undefined,
      };
      const duplicateError = createDuplicateToolInputRepairError(duplicateFeedback);
      observations.push(createDuplicateToolInputObservation(duplicateFeedback));

      if (invalidActions > repairLimit) {
        await recordTraceEvent(createBudgetEvent("repair_attempts", "exhausted", invalidActions, repairLimit, step, AGENT_ERROR_CODES.DUPLICATE_TOOL_INPUT));
        return finish(failedResult(input.run.runId, toolResults, observations, traceEvents, step, createToolError(
          AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED,
          "Agent runtime reached the duplicate tool input repair limit.",
          { lastCode: AGENT_ERROR_CODES.DUPLICATE_TOOL_INPUT },
        )));
      }

      pendingRepairContext = createPlannerRepairContext(validation.action, duplicateError);
      await recordTraceEvent(createBudgetEvent("repair_attempts", "used", invalidActions, repairLimit, step, AGENT_ERROR_CODES.DUPLICATE_TOOL_INPUT));
      continue;
    }

    const previousFailure = nonRetryableFailures.get(failureKey);

    if (previousFailure && previousFailure.count >= limits.duplicateFailureLimit) {
      const duplicateError = createToolError(
        AGENT_ERROR_CODES.DUPLICATE_TOOL_FAILURE,
        "Agent runtime stopped repeated non-retryable tool failure before invoking the handler again.",
        { toolName: tool.name, failureCode: previousFailure.code },
      );
      const duplicateResult = createFailureToolResult(input.run.runId, tool.name, tool.version, normalizedInputHash, duplicateError);
      await recordTraceEvent(createToolExecutionTrace({
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
    await recordTraceEvent(createBudgetEvent("tool_calls", "used", toolCalls, limits.maxToolCalls, step));
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
    const finalizedToolResult = finalizeToolResultResources({
      result,
      tool,
      run: input.run,
      resourceStore,
    });
    for (const resourceTraceEvent of finalizedToolResult.resourceTraceEvents) {
      await recordTraceEvent(resourceTraceEvent);
    }
    await recordTraceEvent(createToolExecutionTrace({
      step,
      action: validation.action,
      result: finalizedToolResult.result,
      source: "runtime",
    }));

    if (!finalizedToolResult.result.ok && finalizedToolResult.result.error.code === AGENT_ERROR_CODES.TIMEOUT && remainingMs <= configuredToolTimeout) {
      controller.abort();
      return finish(failedResult(input.run.runId, toolResults, observations, traceEvents, step, createToolError(
        AGENT_ERROR_CODES.OVERALL_TIMEOUT,
        "Agent runtime reached the overall timeout during tool execution.",
      )));
    }

    toolResults.push(finalizedToolResult.result);
    observations.push(createToolObservation(finalizedToolResult.result));

    if (!finalizedToolResult.result.ok && !finalizedToolResult.result.error.retryable) {
      const current = nonRetryableFailures.get(failureKey);
      nonRetryableFailures.set(failureKey, {
        code: finalizedToolResult.result.error.code,
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
    run,
    resourceStore,
    terminalOutputValidators: undefined,
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
  const finalizedToolResult = finalizeToolResultResources({
    result,
    tool,
    run,
    resourceStore,
  });
  traceEvents.push(...finalizedToolResult.resourceTraceEvents);
  traceEvents.push(createToolExecutionTrace({
    step: 1,
    action: validation.action,
    result: finalizedToolResult.result,
    source: "confirmation_resume",
  }));

  toolResults.push(finalizedToolResult.result);
  observations.push(createToolObservation(finalizedToolResult.result));

  if (!finalizedToolResult.result.ok) {
    return finish(failedResult(run.runId, toolResults, observations, traceEvents, 1, finalizedToolResult.result.error));
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

/** createAgentLoopTrace 标记 runtime 进入一次真实 Agent loop，供上层投影安全 UI 轮次。 */
function createAgentLoopTrace(step: number): Extract<AgentTraceEvent, { type: "agent_loop" }> {
  return {
    type: "agent_loop",
    loopTurn: step,
    step,
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
    factChannel: classifyToolResultFactChannel(input.result),
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
  const activitySummaryProjection = projectPlannerActionActivitySummary(actionRecord?.activitySummary);

  return {
    type: "planner_action",
    step,
    actionType: typeof actionRecord?.type === "string" ? actionRecord.type : "unknown",
    toolName: typeof actionRecord?.toolName === "string" ? actionRecord.toolName : undefined,
    ...activitySummaryProjection,
  };
}

// createActionNormalizationTrace 记录顶层字段裁剪事实，不保存被丢弃字段的完整值。
function createActionNormalizationTrace(
  step: number,
  normalization: NonNullable<ReturnType<typeof validateAgentAction>["normalization"]>,
  validationOk: boolean,
): Extract<AgentTraceEvent, { type: "action_normalization" }> {
  return {
    type: "action_normalization",
    step,
    selectedActionType: normalization.selectedActionType,
    status: normalization.diagnosticStatus === "not_normalizable"
      ? "not_normalizable"
      : (validationOk ? "normalized_and_executed" : "normalized_then_failed"),
    normalizedActionContinues: validationOk,
    droppedFields: normalization.droppedFields,
  };
}

// projectPlannerActionActivitySummary 只记录已安全投影的活动摘要或拒绝原因，不保存原始不安全文本。
function projectPlannerActionActivitySummary(value: unknown): Partial<Extract<AgentTraceEvent, { type: "planner_action" }>> {
  if (value === undefined) {
    return {};
  }

  const sanitized = sanitizeAgentActivitySummary(value);

  return sanitized.ok
    ? {
        activitySummary: sanitized.summary,
        activitySummarySource: "AgentAction.activitySummary",
      }
    : {
        activitySummaryRejectedReason: sanitized.reason,
      };
}

type DuplicateToolInputRepairFeedback = Parameters<typeof createDuplicateToolInputObservation>[0];

// createDuplicateToolInputRepairError 把重复成功 tool_call 转成独立 repair payload，避免只靠 observation 长句提示。
function createDuplicateToolInputRepairError(input: DuplicateToolInputRepairFeedback): ToolError {
  const fact: Record<string, JsonValue> = {
    factLevel: input.previousSatisfied ? "current_run_tool_result" : "diagnostic_tool_result",
    toolName: input.toolName,
    toolVersion: input.toolVersion,
    previousToolResultId: input.previousToolResultId,
    previousOk: input.previousOk,
    previousSatisfied: input.previousSatisfied,
    repeatCount: input.repeatCount,
    recoveryBoundary: input.previousSatisfied
      ? "previousToolResultId 对应当前 run 已有 satisfied=true 的 tool result；模型可在合法 terminal usedRefs 中引用该事实，或提交不同的合法 tool input。"
      : "previousToolResultId 对应当前 run 已有诊断 tool result；模型只能把它作为失败解释、澄清或修复事实，或提交不同的合法 tool input。",
  };

  if (input.previousSatisfied) {
    fact.reusableRef = { type: "tool_result", id: input.previousToolResultId };
  }

  if (input.resultSummary) {
    fact.resultSummary = input.resultSummary;
  }

  if (input.producedResources) {
    fact.producedResources = input.producedResources;
  }

  return createToolError(
    AGENT_ERROR_CODES.DUPLICATE_TOOL_INPUT,
    "当前 run 已存在相同 toolName、toolVersion 和 input 的执行结果；重复相同 input 不会产生新的 current-run 事实。",
    {
      errors: [
        {
          code: AGENT_ERROR_CODES.DUPLICATE_TOOL_INPUT,
          path: "tool_call.input",
          expected: "使用 previousToolResultId 对应的当前 run 结果，或提交不同的合法 tool input。",
          actual: {
            toolName: input.toolName,
            toolVersion: input.toolVersion,
            normalizedInputHash: input.normalizedInputHash,
          },
        },
      ],
      facts: [fact],
    },
  );
}

// createPlannerRepairContext 将 validator 错误拆成独立 repair 层，避免正常 planning prompt 携带上一轮失败内容。
function createPlannerRepairContext(failedAction: unknown, error: ToolError): PlannerRepairContext {
  const safeDetails = error.details ? redactJsonValue(error.details) : undefined;

  return {
    failedAction: redactJsonValue(failedAction),
    error: {
      code: error.code,
      message: error.message,
      details: safeDetails,
    },
    errors: extractRepairErrors(safeDetails),
    facts: extractRepairFacts(safeDetails),
  };
}

function extractRepairErrors(details: JsonValue | undefined): PlannerRepairContext["errors"] {
  if (!isJsonRecord(details) || !Array.isArray(details.errors)) {
    return [];
  }

  return details.errors
    .filter(isJsonRecord)
    .map((error) => ({
      code: readString(error.code),
      path: readString(error.path),
      expected: isJsonValue(error.expected) ? error.expected : undefined,
      actual: isJsonValue(error.actual) ? error.actual : undefined,
      allowedFields: readStringArray(error.allowedFields),
      requiredFields: readStringArray(error.requiredFields),
      allowedValues: readJsonArray(error.allowedValues),
    }));
}

function extractRepairFacts(details: JsonValue | undefined): JsonValue[] | undefined {
  if (!isJsonRecord(details) || !Array.isArray(details.facts)) {
    return undefined;
  }

  const facts = details.facts.filter(isJsonValue);
  return facts.length > 0 ? facts : undefined;
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
    duplicateToolCalls: result.traceEvents.filter((event): event is Extract<AgentTraceEvent, { type: "duplicate_tool_call" }> => event.type === "duplicate_tool_call"),
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

function findToolResult(
  toolResults: ToolResult[],
  input: {
    toolName: string;
    toolVersion: string;
    normalizedInputHash: string;
  },
): ToolResult | undefined {
  return toolResults.find((result) => (
    result.toolName === input.toolName
    && result.toolVersion === input.toolVersion
    && result.normalizedInputHash === input.normalizedInputHash
  ));
}

function classifyToolResultFactChannel(result: ToolResult): "fact" | "diagnostic" | "failed" {
  if (!result.ok) {
    return "failed";
  }

  return result.fulfillment.satisfied ? "fact" : "diagnostic";
}

function isJsonRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  return value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
    || (Array.isArray(value) && value.every(isJsonValue))
    || (
      typeof value === "object"
      && value !== null
      && Object.values(value).every(isJsonValue)
    );
}

function readString(value: JsonValue | undefined) {
  return typeof value === "string" ? value : undefined;
}

function readStringArray(value: JsonValue | undefined) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

function readJsonArray(value: JsonValue | undefined) {
  return Array.isArray(value) ? value.filter(isJsonValue) : undefined;
}

function finalizeToolResultResources(input: {
  result: ToolResult;
  tool: NonNullable<ReturnType<ToolRegistry["get"]>>;
  run: AgentRunInput;
  resourceStore: ResourceStore;
}): { result: ToolResult; resourceTraceEvents: AgentTraceEvent[] } {
  if (!input.result.ok) {
    return { result: input.result, resourceTraceEvents: [] };
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
      result: {
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
      },
      resourceTraceEvents: [],
    };
  }

  const resourceTraceEvents = producedValidation.producedResources.map((resource) => {
    const registered = input.resourceStore.get(resource);

    return {
      type: "resource_registered",
      toolResultId: input.result.toolResultId,
      resource,
      summary: redactJsonValue(registered?.summary ?? {}),
    } satisfies Extract<AgentTraceEvent, { type: "resource_registered" }>;
  });

  return {
    result: {
      ...input.result,
      fulfillment: {
        ...input.result.fulfillment,
        producedResources: producedValidation.producedResources,
      },
    },
    resourceTraceEvents,
  };
}
