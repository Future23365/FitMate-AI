import "server-only";

import type { AiTraceLogger } from "@/lib/server/dev/ai-trace-logger";
import type {
  AgentActivityStage,
  AgentActivityStatus,
} from "@/lib/shared/chat/agent-activity";
import { toUtcISOString } from "@/lib/shared/time/utc-date-time";

import {
  agentExecutionStateSchema,
  createAgentToolResultResourceSummary,
  defaultAgentRuntimeLimits,
  isAgentToolResultConsumable,
  isAgentToolResultDiagnostic,
  resolveAgentToolResultResourceRole,
  type AgentAvailableResourceIds,
  type AgentCheckpoint,
  type AgentDecisionFeedback,
  type AgentDecisionFeedbackAvailableResources,
  type AgentDecisionFeedbackCode,
  type AgentDiagnosticResourceIds,
  type AgentDecisionFeedbackResourceKind,
  type AgentDecisionFeedbackResourceReference,
  type AgentDependencyGraph,
  type AgentExecutionResult,
  type AgentExecutionState,
  type AgentHardFailureCode,
  type AgentRepairSummary,
  type AgentRuntimeLimits,
  type AgentToolAccessLevel,
  type AgentToolCallRecord,
  type AgentToolDecision,
  type AgentToolDependencyKind,
  type AgentToolErrorCode,
  type AgentToolResultRecord,
  type ContextPackage,
} from "./contracts";
import {
  AgentToolRegistry,
  parseAgentJsonObject,
  parseAgentToolDecision,
  type AgentToolDefinition,
  type AgentToolDecisionParseResult,
  type AgentToolExecutionResult,
} from "./tool-registry";

export type AgentDecisionProviderInput = {
  state: AgentExecutionState;
  registry: ReturnType<AgentToolRegistry["listModelDefinitions"]>;
  remainingSteps: number;
  loopTurnId: string;
  loopTurnIndex: number;
  modelCallId: string;
  visibleToolResultIds: string[];
};

export type AgentDecisionProvider = (
  input: AgentDecisionProviderInput,
) => Promise<unknown> | unknown;

export type AgentRuntimeActivity = {
  stage: AgentActivityStage;
  status?: AgentActivityStatus;
};

export type RunAgentOrchestratorInput = {
  runId?: string;
  userId: string;
  sessionId: string;
  context: ContextPackage;
  registry: AgentToolRegistry;
  decideNext: AgentDecisionProvider;
  /** 面向聊天流的粗粒度活动回调，只允许输出用户安全的阶段枚举。 */
  onActivity?: (activity: AgentRuntimeActivity) => void;
  limits?: Partial<AgentRuntimeLimits>;
  trace?: AiTraceLogger;
};

export type RunAgentOrchestratorOutput = {
  state: AgentExecutionState;
  result: AgentExecutionResult;
  replayFixture: AgentReplayFixture;
};

export type AgentReplayFixture = {
  runId: string;
  contextSummary: unknown;
  toolDecisions: Array<{
    stepIndex: number;
    action: AgentToolDecision["action"];
    toolName?: string;
    reason: string;
  }>;
  toolResults: AgentToolResultRecord[];
  dependencyGraph: AgentDependencyGraph;
  finalResult: AgentExecutionResult;
  repairSummary: AgentRepairSummary;
  legacyPathSkip: {
    intentFirst: true;
    normalize: true;
    summaryOnlyContext: true;
    referenceResolverFirst: true;
    readonlyToolLoop: true;
    assistantActionEvent: true;
  };
};

// runAgentOrchestrator 是 Tool-first Agent 的运行时循环，生产入口切换留给后续阶段接入。
export async function runAgentOrchestrator(
  input: RunAgentOrchestratorInput,
): Promise<RunAgentOrchestratorOutput> {
  const limits = { ...defaultAgentRuntimeLimits, ...input.limits };
  const runId = input.runId ?? createAgentId("agent_run");
  const deadlineAt = Date.now() + limits.timeoutMs;
  const toolDecisions: AgentReplayFixture["toolDecisions"] = [];
  // 本轮失败索引用于阻止模型重复执行同一不可重试工具调用，避免失败循环吞掉 token 预算。
  const nonRetryableToolFailures = new Map<string, DuplicateToolFailureEntry>();
  let state = agentExecutionStateSchema.parse({
    runId,
    userId: input.userId,
    sessionId: input.sessionId,
    context: input.context,
    toolCalls: [],
    toolResults: [],
    dependencyGraph: { nodes: [], edges: [] },
    candidateSets: {},
    checkpoints: [],
    repairSummary: {},
  });

  input.trace?.addStep({
    name: "agent_run_started",
    type: "agent_context",
    input: summarizeContextForTrace(input.context),
    metadata: {
      runId,
      userId: input.userId,
      sessionId: input.sessionId,
      registeredTools: input.registry.list().map((tool) => tool.name),
      legacyPathSkip: createLegacyPathSkip(),
    },
  });

  for (let stepIndex = 0; stepIndex < limits.maxSteps; stepIndex += 1) {
    if (Date.now() > deadlineAt) {
      state = finishWithResult(state, createFailedResult("timeout"), input.trace, "Agent loop timeout.");
      break;
    }

    const loopTurnId = createAgentId("loop_turn");
    const modelCallId = createAgentId("model_call");
    const visibleToolResultIds = state.toolResults.map((toolResult) => toolResult.toolResultId);
    const repairBudget = createRepairBudgetSnapshot(state, limits, stepIndex);
    emitAgentRuntimeActivity(input, "analyzing_request");
    const rawDecision = await input.decideNext({
      state,
      registry: input.registry.listModelDefinitions(),
      remainingSteps: limits.maxSteps - stepIndex,
      loopTurnId,
      loopTurnIndex: stepIndex,
      modelCallId,
      visibleToolResultIds,
    });
    const parsedDecision = parseDecisionValue(rawDecision, input.registry);

    if (!parsedDecision.ok) {
      input.trace?.addStep({
        name: "agent_tool_decision_parse_failed",
        type: "agent_tool_decision",
        status: "failed",
        input: { rawDecision: summarizeUnknown(rawDecision) },
        error: parsedDecision,
        metadata: {
          aiStage: "agent_tool_decision",
          loopTurnId,
          loopTurnIndex: stepIndex,
          modelCallId,
          visibleToolResultIds,
          stepIndex,
          repairTurnCount: state.repairSummary.repairTurnCount,
          remainingRepairTurns: repairBudget.remainingRepairTurns,
          repairFeedbackCodes: state.repairSummary.repairFeedbackCodes,
          fusedFailureCount: state.repairSummary.fusedFailureCount,
          repairBudgetExhaustedReason: state.repairSummary.repairBudgetExhaustedReason,
          failureCode: parsedDecision.code,
          parsingFailure: {
            code: parsedDecision.code,
            message: parsedDecision.message,
          },
        },
      });
      const projectedResult = projectFinalResultFromRegisteredFacts({
        state,
        rawDecision,
        parseFailure: parsedDecision,
      });

      if (projectedResult) {
        const referenceValidation = validateFinalResultReferences(state, projectedResult.result);
        state = finishWithResult(
          recordFinalProjection(state, projectedResult.sourceToolResultId),
          referenceValidation.ok ? projectedResult.result : createFailedResult("model_output_invalid"),
          input.trace,
          referenceValidation.ok ? projectedResult.reason : referenceValidation.message,
          {
            loopTurnId,
            loopTurnIndex: stepIndex,
            modelCallId,
            visibleToolResultIds,
            usedToolResultIds: getResultUsedToolResultIds(projectedResult.result),
            finalProjectionSourceToolResultId: projectedResult.sourceToolResultId,
          },
        );
        state = maybeCheckpoint(state, limits, stepIndex);
        break;
      }

      const recoverableFeedback = createFeedbackForParseFailure({
        state,
        rawDecision,
        parseFailure: parsedDecision,
        stepIndex,
        remainingSteps: limits.maxSteps - stepIndex - 1,
        limits,
      });

      if (recoverableFeedback) {
        const budget = evaluateRepairBudget(state, recoverableFeedback.result.decisionFeedback, limits, stepIndex);

        if (!budget.ok) {
          state = finishWithResult(
            recordRepairBudgetExhaustion(state, budget.reason),
            createFailedResult("repair_budget_exhausted"),
            input.trace,
            budget.reason,
            {
              loopTurnId,
              loopTurnIndex: stepIndex,
              modelCallId,
              visibleToolResultIds,
              usedToolResultIds: [],
              repairBudgetExhaustedReason: budget.reason,
            },
          );
          state = maybeCheckpoint(state, limits, stepIndex);
          break;
        }

        state = recordSyntheticDecisionFeedback(state, recoverableFeedback, limits);
        input.trace?.addStep({
          name: "agent_tool_result",
          type: "agent_tool_result",
          status: "failed",
          input: { rawDecision: summarizeUnknown(rawDecision) },
          output: recoverableFeedback.result.modelSummary,
          error: recoverableFeedback.result.error,
          metadata: createToolResultTraceMetadata({
            loopTurnId,
            loopTurnIndex: stepIndex,
            modelCallId,
            toolCallId: recoverableFeedback.toolCall.id,
            resultRecord: recoverableFeedback.result,
            stepIndex,
            durationMs: 0,
            failureCode: recoverableFeedback.result.error?.code,
            repairSummary: state.repairSummary,
          }),
        });
        state = maybeCheckpoint(state, limits, stepIndex);
        continue;
      }

      state = finishWithResult(state, createFailedResult("model_output_invalid"), input.trace, parsedDecision.message);
      break;
    }

    const decision = parsedDecision.decision;
    const toolCallId = decision.action === "call_tool" ? createAgentId("tool_call") : undefined;
    toolDecisions.push({
      stepIndex,
      action: decision.action,
      toolName: decision.action === "call_tool" ? decision.toolName : undefined,
      reason: decision.reason,
    });
    input.trace?.addStep({
      name: "agent_tool_decision",
      type: "agent_tool_decision",
      input: summarizeDecisionForTrace(decision),
      metadata: {
        aiStage: "agent_tool_decision",
        loopTurnId,
        loopTurnIndex: stepIndex,
        modelCallId,
        toolCallId,
        visibleToolResultIds,
        usedToolResultIds: getDecisionUsedToolResultIds(decision),
        stepIndex,
        remainingSteps: limits.maxSteps - stepIndex - 1,
        repairTurnCount: state.repairSummary.repairTurnCount,
        remainingRepairTurns: createRepairBudgetSnapshot(state, limits, stepIndex).remainingRepairTurns,
        repairFeedbackCodes: state.repairSummary.repairFeedbackCodes,
        fusedFailureCount: state.repairSummary.fusedFailureCount,
        repairBudgetExhaustedReason: state.repairSummary.repairBudgetExhaustedReason,
      },
    });

    if (decision.action === "final_result") {
      const answeredClarificationProjection = decision.result.status === "answered"
        ? projectFinalResultFromRegisteredFacts({ state, rawDecision: decision })
        : null;

      if (answeredClarificationProjection) {
        state = finishWithResult(
          recordFinalProjection(state, answeredClarificationProjection.sourceToolResultId),
          answeredClarificationProjection.result,
          input.trace,
          answeredClarificationProjection.reason,
          {
            loopTurnId,
            loopTurnIndex: stepIndex,
            modelCallId,
            visibleToolResultIds,
            usedToolResultIds: getResultUsedToolResultIds(answeredClarificationProjection.result),
            finalProjectionSourceToolResultId: answeredClarificationProjection.sourceToolResultId,
          },
        );
        state = maybeCheckpoint(state, limits, stepIndex);
        break;
      }

      const referenceValidation = validateFinalResultReferences(state, decision.result);
      const projectedResult = referenceValidation.ok ? null : projectFinalResultFromRegisteredFacts({
        state,
        rawDecision: decision,
        referenceValidation,
      });

      if (projectedResult) {
        const projectedValidation = validateFinalResultReferences(state, projectedResult.result);
        state = finishWithResult(
          recordFinalProjection(state, projectedResult.sourceToolResultId),
          projectedValidation.ok ? projectedResult.result : createFailedResult("model_output_invalid"),
          input.trace,
          projectedValidation.ok ? projectedResult.reason : projectedValidation.message,
          {
            loopTurnId,
            loopTurnIndex: stepIndex,
            modelCallId,
            visibleToolResultIds,
            usedToolResultIds: getResultUsedToolResultIds(projectedResult.result),
            finalProjectionSourceToolResultId: projectedResult.sourceToolResultId,
          },
        );
        state = maybeCheckpoint(state, limits, stepIndex);
        break;
      }

      if (!referenceValidation.ok) {
        const recoverableFeedback = createFeedbackForFinalResultReferenceFailure({
          state,
          decision,
          referenceValidation,
          stepIndex,
          remainingSteps: limits.maxSteps - stepIndex - 1,
          limits,
        });

        if (recoverableFeedback) {
          const budget = evaluateRepairBudget(state, recoverableFeedback.result.decisionFeedback, limits, stepIndex);

          if (!budget.ok) {
            state = finishWithResult(
              recordRepairBudgetExhaustion(state, budget.reason),
              createFailedResult("repair_budget_exhausted"),
              input.trace,
              budget.reason,
              {
                loopTurnId,
                loopTurnIndex: stepIndex,
                modelCallId,
                visibleToolResultIds,
                usedToolResultIds: [],
                repairBudgetExhaustedReason: budget.reason,
              },
            );
            state = maybeCheckpoint(state, limits, stepIndex);
            break;
          }

          state = recordSyntheticDecisionFeedback(state, recoverableFeedback, limits);
          input.trace?.addStep({
            name: "agent_tool_result",
            type: "agent_tool_result",
            status: "failed",
            input: summarizeDecisionForTrace(decision),
            output: recoverableFeedback.result.modelSummary,
            error: recoverableFeedback.result.error,
            metadata: createToolResultTraceMetadata({
              loopTurnId,
              loopTurnIndex: stepIndex,
              modelCallId,
              toolCallId: recoverableFeedback.toolCall.id,
              resultRecord: recoverableFeedback.result,
              stepIndex,
              durationMs: 0,
              failureCode: recoverableFeedback.result.error?.code,
              repairSummary: state.repairSummary,
            }),
          });
          state = maybeCheckpoint(state, limits, stepIndex);
          continue;
        }
      }

      state = finishWithResult(
        state,
        referenceValidation.ok ? decision.result : createFailedResult("model_output_invalid"),
        input.trace,
        referenceValidation.ok ? decision.reason : referenceValidation.message,
        {
          loopTurnId,
          loopTurnIndex: stepIndex,
          modelCallId,
          visibleToolResultIds,
          usedToolResultIds: getDecisionUsedToolResultIds(decision),
        },
      );
      state = maybeCheckpoint(state, limits, stepIndex);
      break;
    }

    const toolCallIdForExecution = toolCallId as string;
    const tool = input.registry.get(decision.toolName);

    if (!tool) {
      state = recordSyntheticToolFailure(state, decision, stepIndex, "unknown_tool", toolCallIdForExecution);
      const failedRecord = state.toolResults.at(-1);
      input.trace?.addStep({
        name: "agent_tool_result",
        type: "agent_tool_result",
        status: "failed",
        input: summarizeDecisionForTrace(decision),
        output: failedRecord?.traceSummary,
        error: failedRecord?.error,
        metadata: createToolResultTraceMetadata({
          stepIndex,
          loopTurnId,
          loopTurnIndex: stepIndex,
          modelCallId,
          toolCallId: toolCallIdForExecution,
          resultRecord: failedRecord,
          durationMs: 0,
          failureCode: failedRecord?.error?.code,
        }),
      });
      state = maybeCheckpoint(state, limits, stepIndex);
      continue;
    }

    emitAgentRuntimeActivity(input, mapToolToActivityStage(decision.toolName, tool.accessLevel));
    const parsedInput = tool.inputSchema.safeParse(decision.input);
    const startedAt = toUtcISOString(new Date());
    const callRecord: AgentToolCallRecord = {
      id: toolCallIdForExecution,
      toolName: decision.toolName,
      input: parsedInput.success ? parsedInput.data : decision.input,
      status: parsedInput.success ? "pending" : "failed",
      startedAt,
      reason: decision.reason,
    };
    state = addToolCall(state, callRecord);

    if (!parsedInput.success) {
      const failedRecord = createToolResultRecord({
        toolCallId: toolCallIdForExecution,
        toolName: decision.toolName,
        result: {
          ok: false,
          error: {
            code: "schema_validation_failed",
            message: "Agent tool input did not match tool schema.",
            retryable: true,
          },
          traceSummary: parsedInput.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        decisionFeedback: createToolInputSchemaFeedback({
          state,
          toolName: decision.toolName,
          issues: parsedInput.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
          limits,
          stepIndex,
        }),
      });
      state = completeToolCall(state, toolCallIdForExecution, "failed", failedRecord);
      input.trace?.addStep({
        name: "agent_tool_result",
        type: "agent_tool_result",
        status: "failed",
        input: summarizeDecisionForTrace(decision),
        output: failedRecord.traceSummary,
        error: failedRecord.error,
        metadata: createToolResultTraceMetadata({
          stepIndex,
          loopTurnId,
          loopTurnIndex: stepIndex,
          modelCallId,
          toolCallId: toolCallIdForExecution,
          resultRecord: failedRecord,
          durationMs: 0,
          failureCode: failedRecord.error?.code,
          repairSummary: state.repairSummary,
        }),
      });
      state = maybeCheckpoint(state, limits, stepIndex);
      continue;
    }

    const dependencyFailure = validateToolDependencies(tool, parsedInput.data, state);
    if (dependencyFailure) {
      const failedRecord = createToolResultRecord({
        toolCallId: toolCallIdForExecution,
        toolName: decision.toolName,
        result: dependencyFailure,
        decisionFeedback: createToolDependencyFeedback({
          state,
          toolName: decision.toolName,
          dependencyFailure,
          limits,
          stepIndex,
        }),
      });
      state = completeToolCall(state, toolCallIdForExecution, "failed", failedRecord);
      input.trace?.addStep({
        name: "agent_tool_result",
        type: "agent_tool_result",
        status: "failed",
        input: summarizeDecisionForTrace(decision),
        output: failedRecord.traceSummary,
        error: failedRecord.error,
        metadata: createToolResultTraceMetadata({
          stepIndex,
          loopTurnId,
          loopTurnIndex: stepIndex,
          modelCallId,
          toolCallId: toolCallIdForExecution,
          resultRecord: failedRecord,
          durationMs: 0,
          failureCode: failedRecord.error?.code,
          repairSummary: state.repairSummary,
        }),
      });
      state = maybeCheckpoint(state, limits, stepIndex);
      continue;
    }

    const duplicateFailureKey = createToolFailureKey(decision.toolName, parsedInput.data);
    const duplicateFailure = nonRetryableToolFailures.get(duplicateFailureKey);

    if (duplicateFailure) {
      duplicateFailure.repeatCount += 1;
      const failedRecord = createDuplicateToolFailureResultRecord({
        toolCallId: toolCallIdForExecution,
        toolName: decision.toolName,
        duplicateFailureKey,
        duplicateFailure,
        state,
        limits,
        stepIndex,
      });
      duplicateFailure.latestToolResultId = failedRecord.toolResultId;
      state = completeToolCall(state, toolCallIdForExecution, "failed", failedRecord);
      input.trace?.addStep({
        name: "agent_tool_result",
        type: "agent_tool_result",
        status: "failed",
        input: summarizeDecisionForTrace(decision),
        output: failedRecord.traceSummary,
        error: failedRecord.error,
        metadata: createToolResultTraceMetadata({
          stepIndex,
          loopTurnId,
          loopTurnIndex: stepIndex,
          modelCallId,
          toolCallId: toolCallIdForExecution,
          resultRecord: failedRecord,
          durationMs: 0,
          failureCode: failedRecord.error?.code,
          repairSummary: state.repairSummary,
        }),
      });
      state = maybeCheckpoint(state, limits, stepIndex);
      continue;
    }

    const executionStartedAt = Date.now();
    const result = await tool.execute(parsedInput.data, {
      runId,
      userId: input.userId,
      sessionId: input.sessionId,
      traceId: input.trace?.id,
      deadlineAt,
      toolResults: state.toolResults,
    });
    const resultRecord = createToolResultRecord({
      toolCallId: toolCallIdForExecution,
      toolName: decision.toolName,
      result,
      decisionFeedback: createToolResultFeedback({
        state,
        toolName: decision.toolName,
        result,
        limits,
        stepIndex,
      }),
    });
    if (!result.ok && !result.error.retryable) {
      nonRetryableToolFailures.set(duplicateFailureKey, {
        toolName: decision.toolName,
        originalFailureCode: result.error.code,
        originalMessage: result.error.message,
        firstToolResultId: resultRecord.toolResultId,
        latestToolResultId: resultRecord.toolResultId,
        repeatCount: 0,
      });
    }
    state = completeToolCall(state, toolCallIdForExecution, resultRecord.status === "success" ? "success" : "failed", resultRecord);
    input.trace?.addStep({
      name: "agent_tool_result",
      type: "agent_tool_result",
      status: resultRecord.status === "success" ? "success" : "failed",
      input: summarizeDecisionForTrace(decision),
      output: resultRecord.traceSummary,
      error: resultRecord.error,
      metadata: createToolResultTraceMetadata({
        stepIndex,
        loopTurnId,
        loopTurnIndex: stepIndex,
        modelCallId,
        toolCallId: toolCallIdForExecution,
        resultRecord,
        durationMs: Date.now() - executionStartedAt,
        failureCode: result.ok ? resultRecord.error?.code : result.error.code,
        repairSummary: state.repairSummary,
      }),
    });
    const clarificationProjection = projectNeedsClarificationFromAskClarification(state, resultRecord);
    if (clarificationProjection) {
      state = finishWithResult(
        recordFinalProjection(state, clarificationProjection.sourceToolResultId),
        clarificationProjection.result,
        input.trace,
        clarificationProjection.reason,
        {
          loopTurnId,
          loopTurnIndex: stepIndex,
          modelCallId,
          visibleToolResultIds: state.toolResults.map((toolResult) => toolResult.toolResultId),
          usedToolResultIds: clarificationProjection.result.usedToolResultIds,
          finalProjectionSourceToolResultId: clarificationProjection.sourceToolResultId,
        },
      );
      state = maybeCheckpoint(state, limits, stepIndex);
      break;
    }
    if (shouldTerminateAfterToolResult(resultRecord)) {
      state = finishWithResult(
        state,
        createFailedResult(resultRecord.error?.code ?? "unrecoverable_tool_error"),
        input.trace,
        resultRecord.error?.message ?? "Agent tool hit an unrecoverable hard boundary.",
        {
          loopTurnId,
          loopTurnIndex: stepIndex,
          modelCallId,
          visibleToolResultIds: state.toolResults.map((toolResult) => toolResult.toolResultId),
          usedToolResultIds: [],
        },
      );
      state = maybeCheckpoint(state, limits, stepIndex);
      break;
    }
    state = maybeCheckpoint(state, limits, stepIndex);
  }

  if (!state.finalResult) {
    state = finishWithResult(state, createFailedResult("step_limit_exceeded"), input.trace, "Agent loop reached step limit.", {
      visibleToolResultIds: state.toolResults.map((toolResult) => toolResult.toolResultId),
      usedToolResultIds: [],
    });
  }
  const finalResult = state.finalResult;

  if (!finalResult) {
    throw new Error("Agent runtime finished without AgentExecutionResult.");
  }

  return {
    state,
    result: finalResult,
    replayFixture: createAgentReplayFixture(state, toolDecisions),
  };
}

// createAgentReplayFixture 输出脱敏复盘材料，用于测试和 trace 诊断。
export function createAgentReplayFixture(
  state: AgentExecutionState,
  toolDecisions: AgentReplayFixture["toolDecisions"] = [],
): AgentReplayFixture {
  if (!state.finalResult) {
    throw new Error("Cannot create Agent replay fixture before final result.");
  }

  return {
    runId: state.runId,
    contextSummary: summarizeContextForTrace(state.context),
    toolDecisions,
    toolResults: state.toolResults,
    dependencyGraph: state.dependencyGraph,
    finalResult: state.finalResult,
    repairSummary: state.repairSummary,
    legacyPathSkip: createLegacyPathSkip(),
  };
}

// mapToolToActivityStage 将内部工具名压缩成用户可见的粗粒度活动阶段，避免生产流泄漏 toolName。
function mapToolToActivityStage(
  toolName: string,
  accessLevel: AgentToolAccessLevel,
): AgentActivityStage {
  if (toolName === "searchExercises" || toolName === "getExerciseById") {
    return "querying_exercises";
  }

  if (
    toolName === "listRecentArtifacts" ||
    toolName === "searchArtifacts" ||
    toolName === "getArtifactPayload"
  ) {
    return "reading_artifacts";
  }

  if (
    toolName === "generateRoutineDraft" ||
    toolName === "generatePlanDraft" ||
    toolName === "proposeWorkoutEditPlan" ||
    toolName === "proposeWorkoutPatch"
  ) {
    return "generating_workout";
  }

  if (
    toolName === "validateRoutineDraft" ||
    toolName === "validatePlanDraft" ||
    toolName === "validateWorkoutPatch" ||
    toolName === "evaluatePolicy"
  ) {
    return "validating_result";
  }

  if (toolName === "saveConversationArtifactRevision") {
    return "saving_result";
  }

  if (accessLevel === "generate" || accessLevel === "plan") {
    return "generating_workout";
  }

  if (accessLevel === "validate") {
    return "validating_result";
  }

  if (accessLevel === "write") {
    return "saving_result";
  }

  return "analyzing_request";
}

function emitAgentRuntimeActivity(
  input: RunAgentOrchestratorInput,
  stage: AgentActivityStage,
  status: AgentActivityStatus = "active",
) {
  input.onActivity?.({ stage, status });
}

function parseDecisionValue(value: unknown, registry: AgentToolRegistry) {
  if (typeof value === "string") {
    const parsedJson = parseAgentJsonObject(value);

    if (!parsedJson.ok) {
      return parsedJson;
    }

    return parseAgentToolDecision(parsedJson.value, registry);
  }

  return parseAgentToolDecision(value, registry);
}

function createToolFailureKey(toolName: string, input: unknown) {
  return `${toolName}:${stableStringify(input)}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
}

function addToolCall(state: AgentExecutionState, call: AgentToolCallRecord): AgentExecutionState {
  return agentExecutionStateSchema.parse({
    ...state,
    toolCalls: [...state.toolCalls, call],
    dependencyGraph: {
      nodes: [
        ...state.dependencyGraph.nodes,
        { id: call.id, kind: "tool_call", label: call.toolName },
      ],
      edges: state.dependencyGraph.edges,
    },
  });
}

function completeToolCall(
  state: AgentExecutionState,
  toolCallId: string,
  status: "success" | "failed",
  result: AgentToolResultRecord,
): AgentExecutionState {
  const finishedAt = toUtcISOString(new Date());
  const updatedCalls = state.toolCalls.map((call) => (
    call.id === toolCallId
      ? { ...call, status, finishedAt }
      : call
  ));
  const graph = addToolResultToGraph(state.dependencyGraph, toolCallId, result);
  const canProduceResources = isAgentToolResultConsumable(result);

  return agentExecutionStateSchema.parse({
    ...state,
    toolCalls: updatedCalls,
    toolResults: [...state.toolResults, result],
    dependencyGraph: graph,
    repairSummary: result.decisionFeedback
      ? recordFeedbackInRepairSummary(state.repairSummary, result.decisionFeedback)
      : state.repairSummary,
    candidateSets: canProduceResources && result.candidateSetId
      ? {
          ...state.candidateSets,
          [result.candidateSetId]: {
            toolResultId: result.toolResultId,
            toolName: result.toolName,
            satisfied: result.fulfillment?.satisfied,
            fulfillment: result.fulfillment,
            output: result.output,
          },
        }
      : state.candidateSets,
  });
}

function recordSyntheticToolFailure(
  state: AgentExecutionState,
  decision: AgentToolDecision & { action: "call_tool" },
  stepIndex: number,
  code: "unknown_tool",
  toolCallId = createAgentId("tool_call"),
) {
  const result = createToolResultRecord({
    toolCallId,
    toolName: decision.toolName,
    result: {
      ok: false,
      error: {
        code,
        message: `Agent requested unregistered tool: ${decision.toolName}`,
        retryable: false,
      },
      traceSummary: { stepIndex, toolName: decision.toolName },
    },
  });
  const withCall = addToolCall(state, {
    id: toolCallId,
    toolName: decision.toolName,
    input: decision.input,
    status: "failed",
    startedAt: toUtcISOString(new Date()),
    finishedAt: toUtcISOString(new Date()),
    reason: decision.reason,
  });

  return completeToolCall(withCall, toolCallId, "failed", result);
}

type RecoverableDecisionFeedback = {
  toolCall: AgentToolCallRecord;
  result: AgentToolResultRecord;
};

type DuplicateToolFailureEntry = {
  toolName: string;
  originalFailureCode: AgentToolErrorCode;
  originalMessage: string;
  firstToolResultId: string;
  latestToolResultId: string;
  repeatCount: number;
};

function createDuplicateToolFailureResultRecord(input: {
  toolCallId: string;
  toolName: string;
  duplicateFailureKey: string;
  duplicateFailure: DuplicateToolFailureEntry;
  state: AgentExecutionState;
  limits: AgentRuntimeLimits;
  stepIndex: number;
}): AgentToolResultRecord {
  const toolResultId = createAgentId("tool_result");
  const detail = {
    duplicateFailureKey: input.duplicateFailureKey,
    originalFailureCode: input.duplicateFailure.originalFailureCode,
    originalMessage: input.duplicateFailure.originalMessage,
    firstToolResultId: input.duplicateFailure.firstToolResultId,
    latestToolResultId: toolResultId,
    repeatCount: input.duplicateFailure.repeatCount,
  };

  return withResourceSummary({
    toolResultId,
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    status: "failed",
    modelSummary: detail,
    traceSummary: {
      code: "duplicate_tool_failure",
      message: "同一工具和同一输入已经产生不可重试失败，runtime 已阻止重复执行底层工具。",
      ...detail,
    },
    error: {
      code: "duplicate_tool_failure",
      message: "Duplicate non-retryable tool failure was suppressed by Agent runtime.",
      retryable: false,
      detail,
    },
    decisionFeedback: createDuplicateToolFailureFeedback({
      state: input.state,
      toolName: input.toolName,
      duplicateFailureKey: input.duplicateFailureKey,
      duplicateFailure: input.duplicateFailure,
      latestToolResultId: toolResultId,
      limits: input.limits,
      stepIndex: input.stepIndex,
    }),
  });
}

function createFeedbackForParseFailure(input: {
  state: AgentExecutionState;
  rawDecision: unknown;
  parseFailure: Extract<AgentToolDecisionParseResult, { ok: false }>;
  stepIndex: number;
  remainingSteps: number;
  limits: AgentRuntimeLimits;
}): RecoverableDecisionFeedback | null {
  const finalStatus = readRawFinalResultStatus(input.rawDecision);

  if (
    input.parseFailure.code === "invalid_decision"
    && (finalStatus === "generated" || finalStatus === "patched")
    && !input.state.toolResults.some((result) => result.revisionId)
  ) {
    const saveInput = createRecommendedArtifactSaveInput(input.state);

    if (saveInput) {
      return createSyntheticDecisionFeedback({
        state: input.state,
        rawInput: { rawDecision: summarizeUnknown(input.rawDecision) },
        code: "premature_final_result_before_save",
        errorCode: "premature_final_result_before_save",
        message: "generated/patched 必须在 saveConversationArtifactRevision 成功返回 revisionId 后才能作为 final_result。",
        failedAction: `final_result.${finalStatus}`,
        retryable: true,
        missingResources: [{ kind: "revision", reason: "final_result 缺少当前 run 已登记的 revisionId producer。" }],
        recommendedNextTool: "saveConversationArtifactRevision",
        recommendedInput: saveInput,
        sanitizedReason: "模型在保存 artifact 前提前返回非法 final_result，runtime 要求继续调用保存工具。",
        traceExtra: {
          stepIndex: input.stepIndex,
          parseFailure: summarizeParseFailure(input.parseFailure),
        },
        limits: input.limits,
        stepIndex: input.stepIndex,
        remainingSteps: input.remainingSteps,
      });
    }
  }

  const code: AgentDecisionFeedbackCode = input.parseFailure.code === "invalid_json"
    ? "invalid_json"
    : input.parseFailure.code === "unknown_tool"
      ? "invalid_decision"
      : "invalid_decision";
  const retryable = input.parseFailure.code !== "unknown_tool";

  if (!retryable) {
    return null;
  }

  return createSyntheticDecisionFeedback({
    state: input.state,
    rawInput: { rawDecision: summarizeUnknown(input.rawDecision) },
    code,
    errorCode: input.parseFailure.code,
    message: input.parseFailure.message,
    failedAction: "agent_tool_decision",
    retryable,
    missingResources: [],
    recommendedNextTool: undefined,
    recommendedInput: undefined,
    sanitizedReason: "模型输出没有通过 Agent decision JSON/Schema 合同，下一轮必须只返回合法 JSON 对象。",
    traceExtra: {
      stepIndex: input.stepIndex,
      parseFailure: summarizeParseFailure(input.parseFailure),
    },
    limits: input.limits,
    stepIndex: input.stepIndex,
    remainingSteps: input.remainingSteps,
  });
}

function createFeedbackForFinalResultReferenceFailure(input: {
  state: AgentExecutionState;
  decision: AgentToolDecision & { action: "final_result" };
  referenceValidation: Extract<FinalResultReferenceValidation, { ok: false }>;
  stepIndex: number;
  remainingSteps: number;
  limits: AgentRuntimeLimits;
}): RecoverableDecisionFeedback | null {
  const answeredEscape = input.referenceValidation.missing.some((item) => (
    item.reason === "answered_not_allowed_after_executable_workout_chain_started"
  ));

  if (answeredEscape) {
    const saveInput = createRecommendedArtifactSaveInput(input.state);

    return createSyntheticDecisionFeedback({
      state: input.state,
      rawInput: summarizeDecisionForTrace(input.decision),
      code: "invalid_decision",
      errorCode: "premature_final_result_before_save",
      message: "Routine / plan / patch 执行型工具链已经启动，不能用 answered 自由文本作为结构化生成收口。",
      failedAction: `final_result.${input.decision.result.status}`,
      retryable: true,
      hardBoundary: true,
      missingResources: input.referenceValidation.missing.map((item) => ({
        kind: item.kind,
        id: item.id,
        reason: item.reason ?? "answered_escape_after_executable_chain",
      })),
      recommendedNextTool: saveInput ? "saveConversationArtifactRevision" : recommendExecutableChainRecoveryTool(input.state),
      recommendedInput: saveInput ?? undefined,
      sanitizedReason: "本轮已进入 routine/plan/patch 执行链，模型必须继续 validation/policy/save，或返回 needs_clarification、blocked、failed。",
      traceExtra: {
        stepIndex: input.stepIndex,
        finalStatus: input.decision.result.status,
        missing: input.referenceValidation.missing,
      },
      limits: input.limits,
      stepIndex: input.stepIndex,
      remainingSteps: input.remainingSteps,
    });
  }

  const saveInput = input.referenceValidation.missing.some((item) => item.kind === "revision")
    ? createRecommendedArtifactSaveInput(input.state)
    : null;

  if (!saveInput) {
    return null;
  }

  return createSyntheticDecisionFeedback({
    state: input.state,
    rawInput: summarizeDecisionForTrace(input.decision),
    code: "unregistered_resource_reference",
    errorCode: "unregistered_resource_reference",
    message: input.referenceValidation.message,
    failedAction: `final_result.${input.decision.result.status}`,
    retryable: true,
    missingResources: input.referenceValidation.missing.map((item) => ({
      kind: item.kind,
      id: item.id,
      reason: "final result 引用了当前 run 中没有 producer 的资源。",
    })),
    unregisteredReferences: input.referenceValidation.missing.map((item) => ({
      kind: item.kind,
      id: item.id,
      reason: "missing_producer",
    })),
    recommendedNextTool: "saveConversationArtifactRevision",
    recommendedInput: saveInput,
    sanitizedReason: "模型 final_result 引用了未登记资源，runtime 拒绝该成功结果并推荐保存工具。",
    traceExtra: {
      stepIndex: input.stepIndex,
      finalStatus: input.decision.result.status,
      missing: input.referenceValidation.missing,
    },
    limits: input.limits,
    stepIndex: input.stepIndex,
    remainingSteps: input.remainingSteps,
  });
}

function projectFinalResultFromRegisteredFacts(input: {
  state: AgentExecutionState;
  rawDecision: unknown;
  parseFailure?: Extract<AgentToolDecisionParseResult, { ok: false }>;
  referenceValidation?: FinalResultReferenceValidation;
}): { result: AgentExecutionResult; sourceToolResultId: string; reason: string } | null {
  const rawStatus = readRawFinalResultStatus(input.rawDecision);
  const rawResult = readRawFinalResultObject(input.rawDecision);

  if (rawStatus === "answered") {
    return projectNeedsClarificationFromAskClarification(input.state);
  }

  if (
    rawStatus === "generated"
    && (
      !input.parseFailure
      || (
        input.parseFailure.code === "invalid_decision"
        && hasGeneratedResourceContractIssue(input.parseFailure)
      )
      || input.referenceValidation?.missing.some((item) => item.kind === "revision")
    )
  ) {
    const saved = findUniqueSuccessfulArtifactSaveResult(input.state);

    if (!saved) {
      return null;
    }

    const generated = projectGeneratedResultFromSave(saved, rawResult);

    return generated
      ? {
          result: generated,
          sourceToolResultId: saved.toolResultId,
          reason: "模型 final_result 缺少或引用错误的已登记保存资源，runtime 从 saveConversationArtifactRevision 结果投影 generated 合同。",
        }
      : null;
  }

  if (
    rawStatus === "patched"
    && (
      !input.parseFailure
      || input.referenceValidation?.missing.some((item) => item.kind === "revision")
    )
  ) {
    const saved = findUniqueSuccessfulArtifactSaveResult(input.state);
    const patch = findUniqueSuccessfulPatchResult(input.state);

    if (!saved || !patch) {
      return null;
    }

    const patched = projectPatchedResultFromSaveAndPatch(saved, patch, rawResult);

    return patched
      ? {
          result: patched,
          sourceToolResultId: saved.toolResultId,
          reason: "模型 final_result 缺少或引用错误的已登记保存资源，runtime 从 patch 与 save 工具结果投影 patched 合同。",
        }
      : null;
  }

  return null;
}

function projectNeedsClarificationFromAskClarification(
  state: AgentExecutionState,
  sourceResult?: AgentToolResultRecord,
): { result: AgentExecutionResult & { status: "needs_clarification" }; sourceToolResultId: string; reason: string } | null {
  const clarification = sourceResult?.toolName === "askClarification" && sourceResult.status === "success"
    ? sourceResult
    : findLatestAskClarificationResult(state);

  if (!clarification || clarification.status !== "success") {
    return null;
  }

  const output = clarification.output && typeof clarification.output === "object"
    ? clarification.output as Record<string, unknown>
    : {};
  const question = asString(output.question);

  if (!question) {
    return null;
  }

  return {
    result: {
      status: "needs_clarification",
      question,
      assistantSuggestions: readAssistantSuggestions(output.assistantSuggestions),
      blockingReasons: flattenStringIds(output.blockingReasons),
      usedToolResultIds: collectClarificationEvidenceToolResultIds(state, clarification.toolResultId),
    },
    sourceToolResultId: clarification.toolResultId,
    reason: "askClarification 工具已成功返回澄清问题，runtime 将其稳定投影为 needs_clarification。",
  };
}

function findLatestAskClarificationResult(state: AgentExecutionState) {
  return [...state.toolResults]
    .reverse()
    .find((result) => result.toolName === "askClarification" && result.status === "success");
}

function collectClarificationEvidenceToolResultIds(
  state: AgentExecutionState,
  clarificationToolResultId: string,
) {
  const diagnosticIds = state.toolResults
    .filter((result) => result.toolResultId !== clarificationToolResultId)
    .filter((result) => isAgentToolResultDiagnostic(result))
    .filter((result) => result.toolName !== "agentDecisionFeedback")
    .slice(-4)
    .map((result) => result.toolResultId);

  return uniqueStringIds([...diagnosticIds, clarificationToolResultId]);
}

function readAssistantSuggestions(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const label = asString(record.label);
    const message = asString(record.message);

    return label && message ? [{ label, message }] : [];
  });
}

function recordSyntheticDecisionFeedback(
  state: AgentExecutionState,
  feedback: RecoverableDecisionFeedback,
  _limits: AgentRuntimeLimits,
) {
  const withCall = addToolCall(state, feedback.toolCall);

  return completeToolCall(withCall, feedback.toolCall.id, "failed", feedback.result);
}

function createSyntheticDecisionFeedback(input: {
  state: AgentExecutionState;
  rawInput: unknown;
  code: AgentDecisionFeedbackCode;
  errorCode: AgentToolErrorCode;
  message: string;
  failedAction?: string;
  retryable: boolean;
  hardBoundary?: boolean;
  missingResources?: AgentDecisionFeedbackResourceReference[];
  unregisteredReferences?: AgentDecisionFeedbackResourceReference[];
  recommendedNextTool?: string;
  recommendedInput?: unknown;
  sanitizedReason?: string;
  repeat?: AgentDecisionFeedback["repeat"];
  traceExtra?: Record<string, unknown>;
  limits: AgentRuntimeLimits;
  stepIndex: number;
  remainingSteps: number;
}): RecoverableDecisionFeedback {
  const toolCallId = createAgentId("tool_call");
  const feedback = createDecisionFeedback({
    state: input.state,
    code: input.code,
    message: input.message,
    failedAction: input.failedAction,
    retryable: input.retryable,
    hardBoundary: input.hardBoundary,
    missingResources: input.missingResources,
    unregisteredReferences: input.unregisteredReferences,
    recommendedNextTool: input.recommendedNextTool,
    recommendedInput: input.recommendedInput,
    sanitizedReason: input.sanitizedReason,
    repeat: input.repeat,
    limits: input.limits,
    stepIndex: input.stepIndex,
    remainingSteps: input.remainingSteps,
  });

  return {
    toolCall: {
      id: toolCallId,
      toolName: "agentDecisionFeedback",
      input: input.rawInput,
      status: "failed",
      startedAt: toUtcISOString(new Date()),
      finishedAt: toUtcISOString(new Date()),
      reason: input.sanitizedReason ?? input.message,
    },
    result: withResourceSummary({
      toolResultId: createAgentId("tool_result"),
      toolCallId,
      toolName: "agentDecisionFeedback",
      status: "failed",
      modelSummary: createFeedbackModelSummary(feedback),
      traceSummary: {
        ...createFeedbackModelSummary(feedback),
        ...input.traceExtra,
      },
      error: {
        code: input.errorCode,
        message: input.message,
        retryable: input.retryable,
        detail: createFeedbackModelSummary(feedback),
      },
      decisionFeedback: feedback,
    }),
  };
}

function createDecisionFeedback(input: {
  state: AgentExecutionState;
  code: AgentDecisionFeedbackCode;
  message: string;
  failedAction?: string;
  retryable: boolean;
  hardBoundary?: boolean;
  missingResources?: AgentDecisionFeedbackResourceReference[];
  unregisteredReferences?: AgentDecisionFeedbackResourceReference[];
  recommendedNextTool?: string;
  recommendedInput?: unknown;
  sanitizedReason?: string;
  repeat?: AgentDecisionFeedback["repeat"];
  limits: AgentRuntimeLimits;
  stepIndex: number;
  remainingSteps: number;
}): AgentDecisionFeedback {
  const sameCodeCount = input.state.repairSummary.repairFeedbackCodes.filter((code) => code === input.code).length;
  const budget = {
    ...createRepairBudgetSnapshot(input.state, input.limits, input.stepIndex),
    sameCodeCount,
  };

  return {
    code: input.code,
    message: input.message,
    failedAction: input.failedAction,
    retryable: input.retryable,
    hardBoundary: input.hardBoundary ?? false,
    availableResources: collectAvailableResources(input.state),
    missingResources: input.missingResources ?? [],
    unregisteredReferences: input.unregisteredReferences ?? [],
    recommendedNextTool: input.recommendedNextTool,
    recommendedInput: input.recommendedInput,
    sanitizedReason: input.sanitizedReason,
    repeat: input.repeat,
    budget: {
      ...budget,
      remainingSteps: input.remainingSteps,
    },
  };
}

function createFeedbackModelSummary(feedback: AgentDecisionFeedback) {
  return {
    code: feedback.code,
    message: feedback.message,
    failedAction: feedback.failedAction,
    retryable: feedback.retryable,
    hardBoundary: feedback.hardBoundary,
    availableResources: feedback.availableResources,
    missingResources: feedback.missingResources,
    unregisteredReferences: feedback.unregisteredReferences,
    recommendedToolName: feedback.recommendedNextTool,
    recommendedNextTool: feedback.recommendedNextTool,
    recommendedInput: feedback.recommendedInput,
    sanitizedReason: feedback.sanitizedReason,
    repeat: feedback.repeat,
    budget: feedback.budget,
  };
}

function createToolInputSchemaFeedback(input: {
  state: AgentExecutionState;
  toolName: string;
  issues: Array<{ path: string; message: string }>;
  limits: AgentRuntimeLimits;
  stepIndex: number;
}): AgentDecisionFeedback {
  return createDecisionFeedback({
    state: input.state,
    code: "schema_validation_failed",
    message: "Agent tool input did not match tool schema.",
    failedAction: input.toolName,
    retryable: true,
    missingResources: input.issues.map((issue) => ({
      kind: "tool_result",
      reason: issue.path ? `${issue.path}: ${issue.message}` : issue.message,
    })),
    sanitizedReason: "工具输入不满足 Schema，模型必须基于 registry inputFields 和已登记资源重新构造输入。",
    limits: input.limits,
    stepIndex: input.stepIndex,
    remainingSteps: input.limits.maxSteps - input.stepIndex - 1,
  });
}

function createToolDependencyFeedback(input: {
  state: AgentExecutionState;
  toolName: string;
  dependencyFailure: AgentToolExecutionResult<never>;
  limits: AgentRuntimeLimits;
  stepIndex: number;
}): AgentDecisionFeedback | undefined {
  if (input.dependencyFailure.ok) {
    return undefined;
  }

  const issues = readDependencyIssues(input.dependencyFailure.error.detail);
  const missingResources = issues.map((issue) => ({
    kind: issue.kind,
    id: issue.id,
    reason: issue.reason,
  }));

  return createDecisionFeedback({
    state: input.state,
    code: "invalid_dependency",
    message: input.dependencyFailure.error.message,
    failedAction: input.toolName,
    retryable: hasUsefulResourceForRepair(input.state) && !isHardBoundaryToolErrorCode(input.dependencyFailure.error.code),
    hardBoundary: isHardBoundaryToolErrorCode(input.dependencyFailure.error.code),
    missingResources,
    recommendedNextTool: recommendToolForMissingDependencies(missingResources),
    sanitizedReason: "工具输入引用了当前 run 中没有登记或不可消费的资源；下一轮只能使用 availableResources 中的 id。",
    limits: input.limits,
    stepIndex: input.stepIndex,
    remainingSteps: input.limits.maxSteps - input.stepIndex - 1,
  });
}

function createToolResultFeedback(input: {
  state: AgentExecutionState;
  toolName: string;
  result: AgentToolExecutionResult<unknown>;
  limits: AgentRuntimeLimits;
  stepIndex: number;
}): AgentDecisionFeedback | undefined {
  if (input.result.ok && input.result.fulfillment?.satisfied !== false) {
    return undefined;
  }

  if (isPartialCandidateToolExecutionResult(input.toolName, input.result)) {
    return undefined;
  }

  if (!input.result.ok) {
    const hardBoundary = isHardBoundaryToolErrorCode(input.result.error.code);

    return createDecisionFeedback({
      state: input.state,
      code: hardBoundary ? "hard_boundary_failure" : "tool_failed",
      message: input.result.error.message,
      failedAction: input.toolName,
      retryable: !hardBoundary && input.result.error.retryable,
      hardBoundary,
      sanitizedReason: hardBoundary
        ? "工具失败触及权限、Policy 或不可恢复边界，runtime 不要求模型继续猜测。"
        : "工具返回结构化失败，模型只能基于该失败、dependency graph 和已登记资源重新决策。",
      limits: input.limits,
      stepIndex: input.stepIndex,
      remainingSteps: input.limits.maxSteps - input.stepIndex - 1,
    });
  }

  return createDecisionFeedback({
    state: input.state,
    code: "tool_result_unsatisfied",
    message: "Tool result did not satisfy its result requirements.",
    failedAction: input.toolName,
    retryable: true,
    missingResources: (input.result.fulfillment?.unmetResultRequirements ?? []).map((reason) => ({
      kind: "tool_result",
      reason,
    })),
    sanitizedReason: "工具返回 satisfied=false，只能作为失败事实和摘要进入下一轮，不能被后续工具消费。",
    limits: input.limits,
    stepIndex: input.stepIndex,
    remainingSteps: input.limits.maxSteps - input.stepIndex - 1,
  });
}

// partial candidate set 是已执行搜索的诊断资源，不能被压成 repair feedback，否则模型会丢失候选摘要。
function isPartialCandidateToolExecutionResult(
  toolName: string,
  result: AgentToolExecutionResult<unknown>,
) {
  if (toolName !== "searchExercises" || !result.ok || result.fulfillment?.satisfied !== false) {
    return false;
  }

  const output = result.output && typeof result.output === "object" ? result.output as Record<string, unknown> : {};
  return Array.isArray(output.candidates) && output.candidates.length > 0;
}

function createDuplicateToolFailureFeedback(input: {
  state: AgentExecutionState;
  toolName: string;
  duplicateFailureKey: string;
  duplicateFailure: DuplicateToolFailureEntry;
  latestToolResultId: string;
  limits: AgentRuntimeLimits;
  stepIndex: number;
}): AgentDecisionFeedback {
  return createDecisionFeedback({
    state: input.state,
    code: "duplicate_tool_failure",
    message: "同一工具、同一输入和相同失败码已经失败，runtime 已熔断该路径。",
    failedAction: input.toolName,
    retryable: true,
    repeat: {
      failureKey: input.duplicateFailureKey,
      originalFailureCode: input.duplicateFailure.originalFailureCode,
      repeatCount: input.duplicateFailure.repeatCount,
      firstToolResultId: input.duplicateFailure.firstToolResultId,
      latestToolResultId: input.latestToolResultId,
      recommendedAlternative: "改用其他已登记资源、调整结构化输入，或返回 blocked/failed。",
    },
    sanitizedReason: "重复不可重试工具失败已被熔断，下一轮不能继续执行同一输入。",
    limits: input.limits,
    stepIndex: input.stepIndex,
    remainingSteps: input.limits.maxSteps - input.stepIndex - 1,
  });
}

function createRecommendedArtifactSaveInput(state: AgentExecutionState) {
  const draft = findLatestToolResultWith(state, "draftId");
  const validation = findLatestToolResultWith(state, "validationId");
  const policy = findLatestToolResultWith(state, "policyDecisionId");
  const draftId = draft?.draftId;
  const validationId = validation?.validationId;
  const policyDecisionId = policy?.policyDecisionId;
  const candidateSetId = validation?.candidateSetId ?? draft?.candidateSetId;
  const artifactKind = readStringField(policy?.output, "artifactKind")
    ?? readStringField(draft?.output, "draftKind");

  if (!draftId || !validationId || !policyDecisionId || !candidateSetId || !isArtifactKind(artifactKind)) {
    return null;
  }

  return {
    artifactKind,
    draftId,
    candidateSetId,
    validationId,
    policyDecisionId,
    validationPassed: true,
    policyAllowed: true,
  };
}

function collectAvailableResources(state: AgentExecutionState): AgentDecisionFeedbackAvailableResources {
  const consumable: AgentAvailableResourceIds = {
    toolResultIds: [],
    candidateSetIds: [],
    artifactPayloadIds: [],
    editPlanIds: [],
    draftIds: [],
    patchIds: [],
    validationIds: [],
    policyDecisionIds: [],
    confirmationIds: [],
    revisionIds: [],
    operationResultIds: [],
  };
  const diagnostic: AgentDiagnosticResourceIds = {
    toolResultIds: [],
    candidateSetIds: [],
    partialCandidateSetIds: [],
    failedToolResultIds: [],
    feedbackToolResultIds: [],
    clarificationToolResultIds: [],
  };

  for (const result of state.toolResults) {
    if (isAgentToolResultConsumable(result)) {
      pushUnique(consumable.toolResultIds, result.toolResultId);
      pushUnique(consumable.candidateSetIds, result.candidateSetId);
      pushUnique(consumable.artifactPayloadIds, result.artifactPayloadId);
      pushUnique(consumable.editPlanIds, result.editPlanId);
      pushUnique(consumable.draftIds, result.draftId);
      pushUnique(consumable.patchIds, result.patchId);
      pushUnique(consumable.validationIds, result.validationId);
      pushUnique(consumable.policyDecisionIds, result.policyDecisionId);
      pushUnique(consumable.confirmationIds, result.confirmationId);
      pushUnique(consumable.revisionIds, result.revisionId);
      pushUnique(consumable.operationResultIds, result.operationResultId);
      continue;
    }

    pushUnique(diagnostic.toolResultIds, result.toolResultId);
    pushUnique(diagnostic.candidateSetIds, result.candidateSetId);

    if (resolveAgentToolResultResourceRole(result) === "partial") {
      pushUnique(diagnostic.partialCandidateSetIds, result.candidateSetId);
    }
    if (result.status !== "success" && !result.decisionFeedback) {
      pushUnique(diagnostic.failedToolResultIds, result.toolResultId);
    }
    if (result.decisionFeedback) {
      pushUnique(diagnostic.feedbackToolResultIds, result.toolResultId);
    }
    if (result.toolName === "askClarification") {
      pushUnique(diagnostic.clarificationToolResultIds, result.toolResultId);
    }
  }

  return {
    ...consumable,
    consumable,
    diagnostic,
  };
}

function createRepairBudgetSnapshot(
  state: AgentExecutionState,
  limits: AgentRuntimeLimits,
  stepIndex: number,
) {
  return {
    repairTurnCount: state.repairSummary.repairTurnCount,
    maxRepairTurns: limits.maxRepairTurns,
    remainingRepairTurns: Math.max(0, limits.maxRepairTurns - state.repairSummary.repairTurnCount),
    sameCodeCount: 0,
    maxSameCodePerRun: limits.maxSameFeedbackCodePerRun,
    remainingSteps: Math.max(0, limits.maxSteps - stepIndex - 1),
  };
}

function evaluateRepairBudget(
  state: AgentExecutionState,
  feedback: AgentDecisionFeedback | undefined,
  limits: AgentRuntimeLimits,
  stepIndex: number,
): { ok: true } | { ok: false; reason: string } {
  if (!feedback || feedback.hardBoundary || !feedback.retryable) {
    return { ok: false, reason: "feedback is not retryable or crosses a hard boundary." };
  }

  if (stepIndex + 1 >= limits.maxSteps) {
    return { ok: false, reason: "repair_budget_exhausted:max_steps" };
  }

  if (state.repairSummary.repairTurnCount >= limits.maxRepairTurns) {
    return { ok: false, reason: "repair_budget_exhausted:max_repair_turns" };
  }

  const sameCodeCount = state.repairSummary.repairFeedbackCodes.filter((code) => code === feedback.code).length;

  if (sameCodeCount >= limits.maxSameFeedbackCodePerRun) {
    return { ok: false, reason: `repair_budget_exhausted:same_code:${feedback.code}` };
  }

  return { ok: true };
}

function recordFeedbackInRepairSummary(
  summary: AgentRepairSummary,
  feedback: AgentDecisionFeedback,
): AgentRepairSummary {
  return {
    ...summary,
    repairTurnCount: summary.repairTurnCount + (feedback.retryable && !feedback.hardBoundary ? 1 : 0),
    repairFeedbackCodes: [...summary.repairFeedbackCodes, feedback.code],
    unregisteredResourceReferences: uniqueFeedbackReferences([
      ...summary.unregisteredResourceReferences,
      ...feedback.unregisteredReferences,
    ]),
    fusedFailureCount: summary.fusedFailureCount + (feedback.code === "duplicate_tool_failure" ? 1 : 0),
    rawFeedbackCount: summary.rawFeedbackCount + 1,
  };
}

function recordRepairBudgetExhaustion(
  state: AgentExecutionState,
  reason: string,
): AgentExecutionState {
  return agentExecutionStateSchema.parse({
    ...state,
    repairSummary: {
      ...state.repairSummary,
      repairBudgetExhaustedReason: reason,
    },
  });
}

function recordFinalProjection(
  state: AgentExecutionState,
  sourceToolResultId: string,
): AgentExecutionState {
  return agentExecutionStateSchema.parse({
    ...state,
    repairSummary: {
      ...state.repairSummary,
      finalProjectionSourceToolResultId: sourceToolResultId,
    },
  });
}

function pushUnique(values: string[], value: string | undefined) {
  if (value && !values.includes(value)) {
    values.push(value);
  }
}

function uniqueFeedbackReferences(
  references: AgentDecisionFeedbackResourceReference[],
) {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.kind}:${reference.id ?? ""}:${reference.reason ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function hasUsefulResourceForRepair(state: AgentExecutionState) {
  const available = collectAvailableResources(state);
  return Object.entries(available).some(([key, ids]) => (
    key !== "consumable" &&
    key !== "diagnostic" &&
    Array.isArray(ids) &&
    ids.length > 0
  ));
}

function recommendToolForMissingDependencies(
  missing: AgentDecisionFeedbackResourceReference[],
) {
  const kinds = new Set(missing.map((item) => item.kind));

  if (kinds.has("revision") || (kinds.has("validation") && kinds.has("policy_decision"))) {
    return "saveConversationArtifactRevision";
  }

  if (kinds.has("validation")) {
    return "validateRoutineDraft";
  }

  if (kinds.has("policy_decision")) {
    return "evaluatePolicy";
  }

  if (kinds.has("draft")) {
    return "generateRoutineDraft";
  }

  return undefined;
}

function recommendExecutableChainRecoveryTool(state: AgentExecutionState) {
  const latest = [...state.toolResults].reverse();

  if (latest.some((result) => result.toolName === "askClarification")) {
    return undefined;
  }

  if (latest.some((result) => resolveAgentToolResultResourceRole(result) === "partial")) {
    return "askClarification";
  }

  if (latest.some((result) => result.toolName === "generateRoutineDraft")) {
    return "validateRoutineDraft";
  }

  if (latest.some((result) => result.toolName === "generatePlanDraft")) {
    return "validatePlanDraft";
  }

  if (latest.some((result) => result.toolName === "proposeWorkoutPatch")) {
    return "validateWorkoutPatch";
  }

  return undefined;
}

function readDependencyIssues(detail: unknown): AgentDecisionFeedbackResourceReference[] {
  const record = detail && typeof detail === "object" ? detail as Record<string, unknown> : {};
  const issues = Array.isArray(record.issues) ? record.issues : [];

  return issues.flatMap((issue) => {
    const issueRecord = issue && typeof issue === "object" ? issue as Record<string, unknown> : {};
    const kind = normalizeFeedbackResourceKind(issueRecord.kind);

    return kind
      ? [{
          kind,
          id: asString(issueRecord.id),
          reason: asString(issueRecord.reason) ?? "missing_required_dependency",
        }]
      : [];
  });
}

function normalizeFeedbackResourceKind(value: unknown): AgentDecisionFeedbackResourceKind | undefined {
  if (
    value === "tool_result" ||
    value === "candidate_set" ||
    value === "artifact_payload" ||
    value === "workout_edit_plan" ||
    value === "draft" ||
    value === "patch" ||
    value === "validation" ||
    value === "policy_decision" ||
    value === "confirmation" ||
    value === "revision" ||
    value === "operation_result"
  ) {
    return value;
  }

  return undefined;
}

function isHardBoundaryToolErrorCode(code: AgentToolErrorCode) {
  return code === "forbidden" ||
    code === "policy_blocked" ||
    code === "hard_failure" ||
    code === "persistence_failed";
}

function shouldTerminateAfterToolResult(result: AgentToolResultRecord) {
  return Boolean(result.error && isHardBoundaryToolErrorCode(result.error.code));
}

function summarizeParseFailure(parseFailure: Extract<AgentToolDecisionParseResult, { ok: false }>) {
  return {
    code: parseFailure.code,
    message: parseFailure.message,
    detail: parseFailure.detail,
  };
}

function projectGeneratedResultFromSave(
  saved: AgentToolResultRecord,
  rawResult: Record<string, unknown> | null,
): (AgentExecutionResult & { status: "generated" }) | null {
  const artifactId = readStringField(saved.output, "artifactId") ?? saved.revisionId;
  const revisionId = saved.revisionId ?? readStringField(saved.output, "revisionId");
  const validationId = saved.validationId ?? readStringField(saved.output, "validationId");
  const policyDecisionId = saved.policyDecisionId ?? readStringField(saved.output, "policyDecisionId");
  const artifactKind = readStringField(saved.output, "artifactKind");
  const title = readStringField(saved.output, "title");
  const summary = readStringField(saved.output, "summary");

  if (!artifactId || !revisionId || !validationId || !isArtifactKind(artifactKind) || !title) {
    return null;
  }

  return {
    status: "generated",
    artifact: {
      artifactId,
      revisionId,
      kind: artifactKind,
      title,
      ...(summary ? { summary } : {}),
    },
    revisionId,
    validationId,
    ...(policyDecisionId ? { policyDecisionId } : {}),
    usedToolResultIds: uniqueStringIds([
      ...flattenStringIds(rawResult?.usedToolResultIds),
      saved.toolResultId,
    ]),
  };
}

function projectPatchedResultFromSaveAndPatch(
  saved: AgentToolResultRecord,
  patch: AgentToolResultRecord,
  rawResult: Record<string, unknown> | null,
): (AgentExecutionResult & { status: "patched" }) | null {
  const artifactId = readStringField(saved.output, "artifactId") ?? saved.revisionId;
  const revisionId = saved.revisionId ?? readStringField(saved.output, "revisionId");
  const validationId = saved.validationId ?? readStringField(saved.output, "validationId");
  const policyDecisionId = saved.policyDecisionId ?? readStringField(saved.output, "policyDecisionId");
  const artifactKind = readStringField(saved.output, "artifactKind");
  const title = readStringField(saved.output, "title");
  const summary = readStringField(saved.output, "summary");
  const patchId = patch.patchId ?? readStringField(patch.output, "patchId");
  const sourceArtifactId = readStringField(patch.modelSummary, "targetArtifactId")
    ?? readNestedPatchTargetArtifactId(patch.output);
  const changedExerciseIds = flattenStringIds(readNestedValue(patch.output, ["patch", "operations"]))
    .filter(Boolean);

  if (!artifactId || !revisionId || !validationId || !isArtifactKind(artifactKind) || !title || !patchId || !sourceArtifactId) {
    return null;
  }

  return {
    status: "patched",
    patchResult: {
      patchId,
      sourceArtifactId,
      changedExerciseIds,
      summary: readStringField(rawResult?.patchResult, "summary")
        ?? readStringField(patch.modelSummary, "summary")
        ?? "训练内容已按结构化 patch 更新。",
    },
    artifact: {
      artifactId,
      revisionId,
      kind: artifactKind,
      title,
      ...(summary ? { summary } : {}),
    },
    revisionId,
    validationId,
    ...(policyDecisionId ? { policyDecisionId } : {}),
    usedToolResultIds: uniqueStringIds([
      ...flattenStringIds(rawResult?.usedToolResultIds),
      patch.toolResultId,
      saved.toolResultId,
    ]),
  };
}

function readNestedPatchTargetArtifactId(value: unknown) {
  const target = readNestedValue(value, ["patch", "target"]);
  return readStringField(target, "artifactId");
}

function readNestedValue(value: unknown, path: string[]): unknown {
  return path.reduce((current, key) => (
    current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined
  ), value);
}

function createToolResultRecord(input: {
  toolCallId: string;
  toolName: string;
  result: AgentToolExecutionResult<unknown>;
  decisionFeedback?: AgentDecisionFeedback;
}): AgentToolResultRecord {
  if (!input.result.ok) {
    return withResourceSummary({
      toolResultId: createAgentId("tool_result"),
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      status: input.result.error.code === "policy_blocked" ? "blocked" : "failed",
      modelSummary: input.decisionFeedback ? createFeedbackModelSummary(input.decisionFeedback) : undefined,
      traceSummary: input.result.traceSummary,
      error: input.result.error,
      decisionFeedback: input.decisionFeedback,
    });
  }

  const ids = extractStructuredIds(input.result.output);
  const satisfied = input.result.fulfillment?.satisfied !== false;
  const decisionFeedback = input.decisionFeedback;
  const partial = !satisfied && !decisionFeedback && isPartialCandidateToolExecutionResult(input.toolName, input.result);

  return withResourceSummary({
    toolResultId: input.result.toolResultId,
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    status: (satisfied || partial) && !decisionFeedback ? "success" : "failed",
    output: input.result.output,
    modelSummary: decisionFeedback ? createFeedbackModelSummary(decisionFeedback) : input.result.modelSummary,
    traceSummary: input.result.traceSummary,
    error: decisionFeedback
      ? {
          code: decisionFeedback.code === "tool_result_unsatisfied" ? "unverifiable_result" : "tool_execution_failed",
          message: decisionFeedback.message,
          retryable: decisionFeedback.retryable,
        }
      : undefined,
    fulfillment: input.result.fulfillment,
    decisionFeedback,
    ...ids,
  });
}

function withResourceSummary(record: Omit<AgentToolResultRecord, "resourceRole" | "resourceSummary">): AgentToolResultRecord {
  const resourceRole = record.toolName === "askClarification"
    ? "diagnostic"
    : resolveAgentToolResultResourceRole(record);
  const withRole = {
    ...record,
    resourceRole,
  };

  return {
    ...withRole,
    resourceSummary: createAgentToolResultResourceSummary(withRole),
  };
}

function addToolResultToGraph(
  graph: AgentDependencyGraph,
  toolCallId: string,
  result: AgentToolResultRecord,
): AgentDependencyGraph {
  const resultNode = {
    id: result.toolResultId,
    kind: "tool_result" as const,
    label: result.toolName,
  };
  const canProduceResources = isAgentToolResultConsumable(result);
  const resourceNodes = canProduceResources
    ? [
        result.candidateSetId ? { id: result.candidateSetId, kind: "candidate_set" as const, label: "candidateSet" } : null,
        result.artifactPayloadId ? { id: result.artifactPayloadId, kind: "artifact_payload" as const, label: "artifactPayload" } : null,
        result.validationId ? { id: result.validationId, kind: "validation" as const, label: "validation" } : null,
        result.policyDecisionId ? { id: result.policyDecisionId, kind: "policy_decision" as const, label: "policyDecision" } : null,
        result.confirmationId ? { id: result.confirmationId, kind: "confirmation" as const, label: "confirmation" } : null,
        result.editPlanId ? { id: result.editPlanId, kind: "workout_edit_plan" as const, label: "workoutEditPlan" } : null,
        result.draftId ? { id: result.draftId, kind: "draft" as const, label: "draft" } : null,
        result.patchId ? { id: result.patchId, kind: "patch" as const, label: "patch" } : null,
      ].filter((node): node is NonNullable<typeof node> => Boolean(node))
    : [];

  return {
    nodes: [...graph.nodes, resultNode, ...resourceNodes],
    edges: [
      ...graph.edges,
      { from: toolCallId, to: result.toolResultId, relation: "produces" },
      ...resourceNodes.map((node) => ({
        from: result.toolResultId,
        to: node.id,
        relation: relationForDependencyKind(node.kind),
      })),
    ],
  };
}

function finishWithResult(
  state: AgentExecutionState,
  result: AgentExecutionResult,
  trace: AiTraceLogger | undefined,
  reason: string,
  linkage: {
    loopTurnId?: string;
    loopTurnIndex?: number;
    modelCallId?: string;
    visibleToolResultIds?: string[];
    usedToolResultIds?: string[];
    finalProjectionSourceToolResultId?: string;
    repairBudgetExhaustedReason?: string;
  } = {},
): AgentExecutionState {
  const finalResultId = createAgentId("final_result");
  const usedToolResultIds = "usedToolResultIds" in result ? result.usedToolResultIds : [];
  const usedResourceClassification = classifyUsedToolResultIds(state, usedToolResultIds);
  const finalState = agentExecutionStateSchema.parse({
    ...state,
    finalResult: result,
    dependencyGraph: {
      nodes: [
        ...state.dependencyGraph.nodes,
        { id: finalResultId, kind: "final_result", label: result.status },
      ],
      edges: [
        ...state.dependencyGraph.edges,
        ...usedToolResultIds.map((toolResultId) => ({
          from: toolResultId,
          to: finalResultId,
          relation: "projects",
        })),
      ],
    },
  });

  trace?.addStep({
    name: "agent_final_result",
    type: "agent_final_result",
    output: result,
    metadata: {
      reason,
      status: result.status,
      loopTurnId: linkage.loopTurnId,
      loopTurnIndex: linkage.loopTurnIndex,
      modelCallId: linkage.modelCallId,
      visibleToolResultIds: linkage.visibleToolResultIds,
      usedToolResultIds: linkage.usedToolResultIds ?? usedToolResultIds,
      usedConsumableToolResultIds: usedResourceClassification.consumable,
      usedDiagnosticToolResultIds: usedResourceClassification.diagnostic,
      usedPartialToolResultIds: usedResourceClassification.partial,
      usedFeedbackToolResultIds: usedResourceClassification.feedback,
      repairFeedbackCodes: finalState.repairSummary.repairFeedbackCodes,
      repairTurnCount: finalState.repairSummary.repairTurnCount,
      finalProjectionSourceToolResultId: linkage.finalProjectionSourceToolResultId
        ?? finalState.repairSummary.finalProjectionSourceToolResultId,
      unregisteredResourceReferences: finalState.repairSummary.unregisteredResourceReferences,
      fusedFailureCount: finalState.repairSummary.fusedFailureCount,
      repairBudgetExhaustedReason: linkage.repairBudgetExhaustedReason
        ?? finalState.repairSummary.repairBudgetExhaustedReason,
      dependencyGraphNodeCount: finalState.dependencyGraph.nodes.length,
      legacyPathSkip: createLegacyPathSkip(),
    },
  });

  return finalState;
}

// createToolResultTraceMetadata 统一写入 Agent loop 的结构化关联字段，页面和导出只依赖这些 id 建链。
function createToolResultTraceMetadata(input: {
  stepIndex: number;
  loopTurnId: string;
  loopTurnIndex: number;
  modelCallId: string;
  toolCallId: string;
  resultRecord: AgentToolResultRecord | undefined;
  durationMs: number;
  failureCode?: string;
  repairSummary?: AgentRepairSummary;
}) {
  const feedback = input.resultRecord?.decisionFeedback;
  return {
    aiStage: "agent_tool_execution",
    loopTurnId: input.loopTurnId,
    loopTurnIndex: input.loopTurnIndex,
    modelCallId: input.modelCallId,
    toolCallId: input.toolCallId,
    toolResultId: input.resultRecord?.toolResultId,
    toolName: input.resultRecord?.toolName,
    status: input.resultRecord?.status,
    failureCode: input.failureCode,
    durationMs: input.durationMs,
    stepIndex: input.stepIndex,
    candidateSetId: input.resultRecord?.candidateSetId,
    artifactPayloadId: input.resultRecord?.artifactPayloadId,
    validationId: input.resultRecord?.validationId,
    policyDecisionId: input.resultRecord?.policyDecisionId,
    confirmationId: input.resultRecord?.confirmationId,
    revisionId: input.resultRecord?.revisionId,
    operationResultId: input.resultRecord?.operationResultId,
      operationKind: input.resultRecord?.fulfillment?.operationKind,
      operation: input.resultRecord?.fulfillment?.operation,
      satisfied: input.resultRecord?.fulfillment?.satisfied,
      resourceRole: input.resultRecord ? resolveAgentToolResultResourceRole(input.resultRecord) : undefined,
      resourceSummary: input.resultRecord?.resourceSummary,
      diagnosticReferenceAllowed: input.resultRecord ? isAgentToolResultDiagnostic(input.resultRecord) : undefined,
      partialCandidate: summarizePartialCandidateForTrace(input.resultRecord),
      producedResources: input.resultRecord?.fulfillment?.producedResources,
    evidence: input.resultRecord?.fulfillment?.evidence,
    unmetResultRequirements: input.resultRecord?.fulfillment?.unmetResultRequirements,
    agentDecisionFeedback: feedback ? createFeedbackModelSummary(feedback) : undefined,
    repairFeedbackCode: feedback?.code,
    repairFeedbackRetryable: feedback?.retryable,
    repairRecommendedNextTool: feedback?.recommendedNextTool,
    repairKeyResources: feedback?.availableResources,
    repairBudget: feedback?.budget,
    repairTurnCount: input.repairSummary?.repairTurnCount,
    remainingRepairTurns: feedback?.budget?.remainingRepairTurns,
    repairFeedbackCodes: input.repairSummary?.repairFeedbackCodes,
    fusedFailureCount: input.repairSummary?.fusedFailureCount,
    repairBudgetExhaustedReason: input.repairSummary?.repairBudgetExhaustedReason,
    artifactRevisionResolution: summarizeArtifactRevisionResolutionForTrace(input.resultRecord),
    duplicateToolFailure: summarizeDuplicateToolFailureForTrace(input.resultRecord),
  };
}

function classifyUsedToolResultIds(state: AgentExecutionState, usedToolResultIds: string[]) {
  const consumable: string[] = [];
  const diagnostic: string[] = [];
  const partial: string[] = [];
  const feedback: string[] = [];

  for (const id of usedToolResultIds) {
    const result = findToolResultById(state, id);
    if (!result) {
      continue;
    }

    const role = resolveAgentToolResultResourceRole(result);
    if (role === "consumable") {
      consumable.push(id);
    } else {
      diagnostic.push(id);
    }
    if (role === "partial") {
      partial.push(id);
    }
    if (role === "feedback") {
      feedback.push(id);
    }
  }

  return { consumable, diagnostic, partial, feedback };
}

function summarizePartialCandidateForTrace(result: AgentToolResultRecord | undefined) {
  if (!result || resolveAgentToolResultResourceRole(result) !== "partial") {
    return undefined;
  }

  const output = result.output && typeof result.output === "object" ? result.output as Record<string, unknown> : {};
  const diagnostics = output.diagnostics && typeof output.diagnostics === "object"
    ? output.diagnostics as Record<string, unknown>
    : {};
  const candidateCount = Array.isArray(output.candidates) ? output.candidates.length : undefined;

  return {
    candidateSetId: result.candidateSetId,
    candidateUse: asString(output.candidateUse),
    candidateCount,
    unmetResultRequirements: flattenStringIds(diagnostics.unmetResultRequirements),
    resultRequirementProof: diagnostics.resultRequirementProof,
    recoveryOptions: output.recoveryOptions,
  };
}

function summarizeArtifactRevisionResolutionForTrace(result: AgentToolResultRecord | undefined) {
  const output = result?.output && typeof result.output === "object" ? result.output as Record<string, unknown> : undefined;
  const revisionResolution = output?.revisionResolution && typeof output.revisionResolution === "object"
    ? output.revisionResolution as Record<string, unknown>
    : output?.sourceArtifactRevisionResolution && typeof output.sourceArtifactRevisionResolution === "object"
      ? output.sourceArtifactRevisionResolution as Record<string, unknown>
      : undefined;
  const requestedArtifactId = asString(output?.requestedArtifactId)
    ?? asString(output?.sourceArtifactId)
    ?? asString(revisionResolution?.requestedArtifactId);
  const activeArtifactId = asString(revisionResolution?.activeArtifactId)
    ?? asString(output?.activeSourceArtifactId);

  if (!revisionResolution || !requestedArtifactId || !activeArtifactId) {
    return undefined;
  }

  return {
    status: asString(revisionResolution.status),
    requestedArtifactId,
    activeArtifactId,
  };
}

function summarizeDuplicateToolFailureForTrace(result: AgentToolResultRecord | undefined) {
  if (result?.error?.code !== "duplicate_tool_failure") {
    return undefined;
  }

  const detail = result.error.detail && typeof result.error.detail === "object"
    ? result.error.detail as Record<string, unknown>
    : {};

  return {
    duplicateFailureKey: asString(detail.duplicateFailureKey),
    originalFailureCode: asString(detail.originalFailureCode),
    firstToolResultId: asString(detail.firstToolResultId),
    latestToolResultId: asString(detail.latestToolResultId),
    repeatCount: typeof detail.repeatCount === "number" ? detail.repeatCount : undefined,
  };
}

function getDecisionUsedToolResultIds(decision: AgentToolDecision) {
  if (decision.action === "final_result") {
    return getResultUsedToolResultIds(decision.result);
  }

  return collectDependencyIdsFromInput(decision.input, "tool_result");
}

function getResultUsedToolResultIds(result: AgentExecutionResult) {
  return "usedToolResultIds" in result ? result.usedToolResultIds : [];
}

function maybeCheckpoint(
  state: AgentExecutionState,
  limits: AgentRuntimeLimits,
  stepIndex: number,
): AgentExecutionState {
  if ((stepIndex + 1) % limits.checkpointEverySteps !== 0) {
    return state;
  }

  const checkpoint: AgentCheckpoint = {
    checkpointId: createAgentId("checkpoint"),
    runId: state.runId,
    stepIndex,
    createdAt: toUtcISOString(new Date()),
    resumeToken: createAgentId("resume"),
    summary: `steps=${stepIndex + 1}; tools=${state.toolResults.length}; final=${state.finalResult?.status ?? "pending"}`,
  };

  return agentExecutionStateSchema.parse({
    ...state,
    checkpoints: [...state.checkpoints, checkpoint],
  });
}

function createFailedResult(failureCode: AgentToolErrorCode | AgentHardFailureCode): AgentExecutionResult {
  return {
    status: "failed",
    failureCode,
    recoverySuggestions: [],
    usedToolResultIds: [],
  };
}

function relationForDependencyKind(kind: AgentToolDependencyKind) {
  if (kind === "validation") {
    return "validates" as const;
  }

  if (kind === "policy_decision" || kind === "confirmation") {
    return "authorizes" as const;
  }

  return "produces" as const;
}

function extractStructuredIds(output: unknown) {
  if (!output || typeof output !== "object") {
    return {};
  }

  const record = output as Record<string, unknown>;

  return {
    candidateSetId: asString(record.candidateSetId),
    artifactPayloadId: asString(record.artifactPayloadId),
    editPlanId: asString(record.editPlanId),
    draftId: asString(record.draftId),
    patchId: asString(record.patchId),
    validationId: asString(record.validationId),
    policyDecisionId: asString(record.policyDecisionId),
    confirmationId: asString(record.confirmationId),
    revisionId: asString(record.revisionId),
    operationResultId: asString(record.operationResultId),
  };
}

// validateToolDependencies makes declared dependencies executable: ids must come from this run's tool results.
function validateToolDependencies(
  tool: AgentToolDefinition<unknown, unknown>,
  input: unknown,
  state: AgentExecutionState,
): AgentToolExecutionResult<never> | null {
  const issues: Array<{ kind: AgentToolDependencyKind; id?: string; reason: string }> = [];

  for (const dependency of tool.dependencies) {
    const ids = collectDependencyIdsFromInput(input, dependency.kind);
    if (dependency.required && ids.length === 0) {
      issues.push({ kind: dependency.kind, reason: "missing_required_dependency" });
      continue;
    }

    for (const id of ids) {
      if (!stateHasDependencyId(state, dependency.kind, id)) {
        issues.push({ kind: dependency.kind, id, reason: "dependency_not_registered_in_current_run" });
      }
    }
  }

  if (issues.length === 0) {
    return null;
  }

  return {
    ok: false,
    error: {
      code: "invalid_dependency",
      message: "Agent tool input referenced dependencies that are missing from the current run.",
      retryable: true,
      detail: { toolName: tool.name, issues },
    },
    traceSummary: { toolName: tool.name, issues },
  };
}

type FinalResultReferenceValidation =
  | { ok: true; missing: [] }
  | {
      ok: false;
      message: string;
      missing: Array<{ kind: AgentDecisionFeedbackResourceKind; id: string; reason?: string }>;
    };

function validateFinalResultReferences(
  state: AgentExecutionState,
  result: AgentExecutionResult,
): FinalResultReferenceValidation {
  const missing: Array<{ kind: AgentDecisionFeedbackResourceKind; id: string; reason?: string }> = [];
  const usedToolResultIds = "usedToolResultIds" in result ? result.usedToolResultIds : [];
  const allowDiagnosticToolResults = allowsDiagnosticToolResultReferences(result.status);
  const requireConsumableToolResults = requiresConsumableFinalResultReferences(result.status);

  if (result.status === "answered" && hasExecutableWorkoutChainStarted(state)) {
    missing.push({
      kind: "tool_result",
      id: "answered",
      reason: "answered_not_allowed_after_executable_workout_chain_started",
    });
  }

  for (const toolResultId of usedToolResultIds) {
    const toolResult = findToolResultById(state, toolResultId);

    if (!toolResult) {
      missing.push({ kind: "tool_result", id: toolResultId, reason: "tool_result_not_registered_in_current_run" });
      continue;
    }

    if (requireConsumableToolResults && !isAgentToolResultConsumable(toolResult)) {
      missing.push({ kind: "tool_result", id: toolResultId, reason: "tool_result_not_consumable_for_success_final_result" });
      continue;
    }

    if (!requireConsumableToolResults && !allowDiagnosticToolResults && !isAgentToolResultConsumable(toolResult)) {
      missing.push({ kind: "tool_result", id: toolResultId, reason: "diagnostic_tool_result_not_allowed_for_final_result" });
    }
  }

  if ("validationId" in result && result.validationId && !stateHasDependencyId(state, "validation", result.validationId)) {
    missing.push({ kind: "validation", id: result.validationId, reason: "validation_not_produced_by_consumable_tool_result" });
  }

  if ("policyDecisionId" in result && result.policyDecisionId && !stateHasDependencyId(state, "policy_decision", result.policyDecisionId)) {
    missing.push({ kind: "policy_decision", id: result.policyDecisionId, reason: "policy_decision_not_produced_by_consumable_tool_result" });
  }

  if ("revisionId" in result && result.revisionId && !state.toolResults.some((toolResult) => toolResult.revisionId === result.revisionId)) {
    missing.push({ kind: "revision", id: result.revisionId, reason: "revision_not_produced_in_current_run" });
  }

  if ("revisionId" in result && result.revisionId && !findSuccessfulProducer(state, "revisionId", result.revisionId, usedToolResultIds)) {
    missing.push({ kind: "revision", id: result.revisionId, reason: "revision_producer_not_successful_or_not_used" });
  }

  if (result.status === "patched" && !stateHasDependencyId(state, "patch", result.patchResult.patchId)) {
    missing.push({ kind: "patch", id: result.patchResult.patchId, reason: "patch_result_not_produced_by_consumable_tool_result" });
  }

  if (result.status === "completed_operation") {
    const operationProducer = findSuccessfulProducer(state, "operationResultId", result.operationResultId, usedToolResultIds);
    if (!operationProducer) {
      missing.push({ kind: "operation_result", id: result.operationResultId, reason: "operation_result_not_produced_or_not_used" });
    }
  }

  return missing.length === 0
    ? { ok: true, missing: [] }
    : {
        ok: false,
        message: `Agent final result referenced unregistered dependencies: ${missing.map((item) => `${item.kind}:${item.id}`).join(", ")}`,
        missing,
      };
}

function allowsDiagnosticToolResultReferences(status: AgentExecutionResult["status"]) {
  return status === "answered" ||
    status === "blocked" ||
    status === "failed" ||
    status === "needs_clarification";
}

function requiresConsumableFinalResultReferences(status: AgentExecutionResult["status"]) {
  return status === "generated" ||
    status === "patched" ||
    status === "completed_operation";
}

function findToolResultById(state: AgentExecutionState, toolResultId: string) {
  return state.toolResults.find((toolResult) => toolResult.toolResultId === toolResultId);
}

function hasExecutableWorkoutChainStarted(state: AgentExecutionState) {
  return state.toolResults.some((result) => isExecutableWorkoutToolResult(result));
}

function isExecutableWorkoutToolResult(result: AgentToolResultRecord) {
  if (
    result.toolName === "generateRoutineDraft" ||
    result.toolName === "generatePlanDraft" ||
    result.toolName === "proposeWorkoutPatch" ||
    result.toolName === "validateRoutineDraft" ||
    result.toolName === "validatePlanDraft" ||
    result.toolName === "validateWorkoutPatch" ||
    result.toolName === "saveConversationArtifactRevision"
  ) {
    return true;
  }

  if (result.toolName !== "searchExercises") {
    return false;
  }

  const candidateUse = readStringField(result.output, "candidateUse") ?? readStringField(result.modelSummary, "candidateUse");
  return candidateUse === "routine" || candidateUse === "plan" || candidateUse === "patch";
}

function findSuccessfulProducer(
  state: AgentExecutionState,
  key: "revisionId" | "operationResultId",
  id: string,
  usedToolResultIds: string[],
) {
  return state.toolResults.find((toolResult) => (
    isAgentToolResultConsumable(toolResult)
    && toolResult[key] === id
    && usedToolResultIds.includes(toolResult.toolResultId)
  ));
}

function collectDependencyIdsFromInput(input: unknown, kind: AgentToolDependencyKind): string[] {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const ids: unknown[] = [];

  switch (kind) {
    case "tool_result":
      ids.push(record.toolResultId, record.toolResultIds, record.usedToolResultIds);
      break;
    case "candidate_set":
      ids.push(record.candidateSetId, record.requiredCandidateSetIds);
      break;
    case "artifact_payload":
      ids.push(record.artifactPayloadId, record.sourceArtifactPayloadId);
      break;
    case "workout_edit_plan":
      ids.push(record.editPlanId, record.sourceEditPlanId, readNestedString(record.editPlan, "editPlanId"));
      break;
    case "draft":
      ids.push(record.draftId, record.sourceDraftId);
      break;
    case "patch":
      ids.push(record.patchId, readNestedString(record.patch, "patchId"));
      break;
    case "validation":
      ids.push(record.validationId);
      break;
    case "policy_decision":
      ids.push(record.policyDecisionId);
      break;
    case "confirmation":
      ids.push(record.confirmationId);
      break;
  }

  return ids.flatMap(flattenStringIds);
}

function stateHasDependencyId(state: AgentExecutionState, kind: AgentToolDependencyKind, id: string) {
  return state.toolResults.some((result) => {
    if (!isAgentToolResultConsumable(result)) {
      return false;
    }

    switch (kind) {
      case "tool_result":
        return result.toolResultId === id;
      case "candidate_set":
        return result.candidateSetId === id;
      case "artifact_payload":
        return result.artifactPayloadId === id;
      case "workout_edit_plan":
        return result.editPlanId === id;
      case "draft":
        return result.draftId === id;
      case "patch":
        return result.patchId === id;
      case "validation":
        return result.validationId === id;
      case "policy_decision":
        return result.policyDecisionId === id;
      case "confirmation":
        return result.confirmationId === id;
    }
  });
}

function readNestedString(value: unknown, key: string) {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function readRawFinalResultStatus(value: unknown) {
  const decision = readDecisionObject(value);
  const result = readRawFinalResultObject(value);

  return decision?.action === "final_result" && typeof result?.status === "string"
    ? result.status
    : undefined;
}

function readRawFinalResultObject(value: unknown): Record<string, unknown> | null {
  const decision = readDecisionObject(value);

  return decision && typeof decision.result === "object" && decision.result !== null
    ? decision.result as Record<string, unknown>
    : null;
}

function readDecisionObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    const parsedJson = parseAgentJsonObject(value);
    return parsedJson.ok && parsedJson.value && typeof parsedJson.value === "object" && !Array.isArray(parsedJson.value)
      ? parsedJson.value as Record<string, unknown>
      : null;
  }

  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readStringField(value: unknown, key: string) {
  return asString(readNestedString(value, key));
}

function hasGeneratedResourceContractIssue(parseFailure: Extract<AgentToolDecisionParseResult, { ok: false }>) {
  if (!Array.isArray(parseFailure.detail)) {
    return false;
  }

  const resourcePaths = new Set(["result.artifact", "result.revisionId", "result.validationId"]);

  return parseFailure.detail.some((issue) => (
    issue
    && typeof issue === "object"
    && resourcePaths.has(String((issue as Record<string, unknown>).path))
  ));
}

function findUniqueSuccessfulArtifactSaveResult(state: AgentExecutionState) {
  const matches = state.toolResults.filter((result) => (
    isAgentToolResultConsumable(result)
    && result.toolName === "saveConversationArtifactRevision"
    && Boolean(result.revisionId)
  ));

  return matches.length === 1 ? matches[0] : null;
}

function findUniqueSuccessfulPatchResult(state: AgentExecutionState) {
  const matches = state.toolResults.filter((result) => (
    isAgentToolResultConsumable(result)
    && Boolean(result.patchId)
  ));

  return matches.length === 1 ? matches[0] : null;
}

function findLatestToolResultWith(
  state: AgentExecutionState,
  key: "draftId" | "validationId" | "policyDecisionId",
) {
  return [...state.toolResults]
    .reverse()
    .find((result) => isAgentToolResultConsumable(result) && Boolean(result[key]));
}

function isArtifactKind(value: unknown): value is "routine" | "plan" {
  return value === "routine" || value === "plan";
}

function flattenStringIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(flattenStringIds);
  }
  return typeof value === "string" && value.trim() ? [value] : [];
}

function uniqueStringIds(values: string[]) {
  return [...new Set(values.filter((value) => value.trim()))];
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function summarizeDecisionForTrace(decision: AgentToolDecision) {
  if (decision.action === "final_result") {
    return {
      action: decision.action,
      status: decision.result.status,
      reason: decision.reason,
    };
  }

  return {
    action: decision.action,
    toolName: decision.toolName,
    reason: decision.reason,
    input: summarizeUnknown(decision.input),
  };
}

function summarizeContextForTrace(context: ContextPackage) {
  return {
    latestUserMessage: context.latestUserMessage,
    recentMessages: context.recentMessages.map((message) => ({
      id: message.id,
      role: message.role,
      chars: message.content.length,
      createdAt: message.createdAt,
    })),
    recentArtifacts: context.recentArtifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      revisionId: artifact.revisionId,
      kind: artifact.kind,
      title: artifact.title,
      exerciseCount: artifact.exerciseIds.length,
      exerciseIds: artifact.exerciseIds.slice(0, 12),
      updatedAt: artifact.updatedAt,
    })),
    memorySnapshot: context.memorySnapshot
      ? {
          snapshotId: context.memorySnapshot.snapshotId,
          facts: context.memorySnapshot.facts.length,
          preferences: context.memorySnapshot.preferences.length,
          avoidances: context.memorySnapshot.avoidances.length,
        }
      : undefined,
    optionalContextSnapshot: context.optionalContextSnapshot
      ? {
          snapshotId: context.optionalContextSnapshot.snapshotId,
          sourceMessageIds: context.optionalContextSnapshot.sourceMessageIds,
          factSourceWarning: context.optionalContextSnapshot.factSourceWarning,
        }
      : undefined,
    provenance: context.provenance,
    limits: context.limits,
  };
}

function summarizeUnknown(value: unknown) {
  if (typeof value === "string") {
    return value.length > 400 ? `${value.slice(0, 400)}...` : value;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return JSON.parse(JSON.stringify(value));
}

function createLegacyPathSkip() {
  return {
    intentFirst: true,
    normalize: true,
    summaryOnlyContext: true,
    referenceResolverFirst: true,
    readonlyToolLoop: true,
    assistantActionEvent: true,
  } as const;
}

function createAgentId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
