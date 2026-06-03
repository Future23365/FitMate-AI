import { validateAgentAction, createToolError } from "./action-validator";
import { executeTool, hashNormalizedInput } from "./executor";
import { createInvalidActionObservation, createRuntimeErrorObservation, createToolObservation } from "./observation";
import type { AgentRunInput, AgentRunResult, ToolError, ToolResult } from "./contracts";
import { AGENT_ERROR_CODES, isAgentContractError } from "./errors";
import type { PlannerPort } from "./planner-port";
import type { ToolRegistry } from "./tool-registry";

/** RunAgentRuntimeInput 连接 registry、planner 和 run input，是 M0 runtime 的唯一入口。 */
export type RunAgentRuntimeInput = {
  registry: ToolRegistry;
  planner: PlannerPort;
  run: AgentRunInput;
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

/** runAgentRuntime 执行 M0 通用循环，按 manifest、planner、validator、executor、observation 顺序推进。 */
export async function runAgentRuntime(input: RunAgentRuntimeInput): Promise<AgentRunResult> {
  const limits = { ...DEFAULT_LIMITS, ...input.run.limits };
  const startedAt = Date.now();
  const deadline = startedAt + limits.overallTimeoutMs;
  const controller = new AbortController();
  const toolResults: ToolResult[] = [];
  const observations = [];
  const nonRetryableFailures = new Map<string, { code: ToolError["code"]; count: number }>();
  let plannerCalls = 0;
  let toolCalls = 0;
  let invalidActions = 0;

  for (let step = 1; step <= limits.maxSteps; step += 1) {
    if (Date.now() >= deadline) {
      controller.abort();
      return failedResult(input.run.runId, toolResults, observations, step - 1, createToolError(
        AGENT_ERROR_CODES.OVERALL_TIMEOUT,
        "Agent runtime reached the overall timeout.",
      ));
    }

    if (plannerCalls >= limits.maxPlannerCalls) {
      return failedResult(input.run.runId, toolResults, observations, step - 1, createToolError(
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
      toolResults,
    }, deadline);

    if (!plannerAction.ok) {
      controller.abort();
      return failedResult(input.run.runId, toolResults, observations, step - 1, plannerAction.error);
    }

    const validation = validateAgentAction({
      action: plannerAction.action,
      registry: input.registry,
      manifests,
      toolResults,
    });

    if (!validation.ok) {
      invalidActions += 1;
      observations.push(createInvalidActionObservation(validation.error));

      if (invalidActions > limits.maxInvalidActions) {
        return failedResult(input.run.runId, toolResults, observations, step, createToolError(
          AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED,
          "Agent runtime reached the invalid action repair limit.",
          { lastCode: validation.error.code },
        ));
      }

      continue;
    }

    if (validation.action.type === "final_answer") {
      return {
        runId: input.run.runId,
        status: "completed",
        terminalAction: validation.action,
        toolResults,
        observations,
        steps: step,
      };
    }

    if (validation.action.type === "ask_user") {
      return {
        runId: input.run.runId,
        status: "needs_input",
        terminalAction: validation.action,
        toolResults,
        observations,
        steps: step,
      };
    }

    if (toolCalls >= limits.maxToolCalls) {
      return failedResult(input.run.runId, toolResults, observations, step, createToolError(
        AGENT_ERROR_CODES.MAX_TOOL_CALLS_EXCEEDED,
        "Agent runtime reached the tool call limit.",
      ));
    }

    const tool = input.registry.get(validation.action.toolName);
    if (!tool) {
      return failedResult(input.run.runId, toolResults, observations, step, createToolError(
        AGENT_ERROR_CODES.UNKNOWN_TOOL,
        `Tool "${validation.action.toolName}" is not registered.`,
      ));
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
      return failedResult(input.run.runId, toolResults, observations, step, duplicateError);
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
    });

    if (!result.ok && result.error.code === AGENT_ERROR_CODES.TIMEOUT && remainingMs <= configuredToolTimeout) {
      controller.abort();
      return failedResult(input.run.runId, toolResults, observations, step, createToolError(
        AGENT_ERROR_CODES.OVERALL_TIMEOUT,
        "Agent runtime reached the overall timeout during tool execution.",
      ));
    }

    toolResults.push(result);
    observations.push(createToolObservation(result));

    if (!result.ok && !result.error.retryable) {
      const current = nonRetryableFailures.get(failureKey);
      nonRetryableFailures.set(failureKey, {
        code: result.error.code,
        count: (current?.count ?? 0) + 1,
      });
    }
  }

  return failedResult(input.run.runId, toolResults, observations, limits.maxSteps, createToolError(
    AGENT_ERROR_CODES.MAX_STEPS_EXCEEDED,
    "Agent runtime reached maxSteps without a terminal action.",
  ));
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
  observations: ReturnType<typeof createRuntimeErrorObservation>[],
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
      summary: `Tool "${toolName}" failed with ${error.code}.`,
    },
  };
}

