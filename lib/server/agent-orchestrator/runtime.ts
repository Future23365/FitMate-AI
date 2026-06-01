import "server-only";

import type { AiTraceLogger } from "@/lib/server/dev/ai-trace-logger";
import { toUtcISOString } from "@/lib/shared/time/utc-date-time";

import {
  agentExecutionStateSchema,
  defaultAgentRuntimeLimits,
  type AgentCheckpoint,
  type AgentDependencyGraph,
  type AgentExecutionResult,
  type AgentExecutionState,
  type AgentHardFailureCode,
  type AgentRuntimeLimits,
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
  type AgentToolExecutionResult,
} from "./tool-registry";

export type AgentDecisionProviderInput = {
  state: AgentExecutionState;
  registry: ReturnType<AgentToolRegistry["listModelDefinitions"]>;
  remainingSteps: number;
};

export type AgentDecisionProvider = (
  input: AgentDecisionProviderInput,
) => Promise<unknown> | unknown;

export type RunAgentOrchestratorInput = {
  runId?: string;
  userId: string;
  sessionId: string;
  context: ContextPackage;
  registry: AgentToolRegistry;
  decideNext: AgentDecisionProvider;
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

    const rawDecision = await input.decideNext({
      state,
      registry: input.registry.listModelDefinitions(),
      remainingSteps: limits.maxSteps - stepIndex,
    });
    const parsedDecision = parseDecisionValue(rawDecision, input.registry);

    if (!parsedDecision.ok) {
      input.trace?.addStep({
        name: "agent_tool_decision_parse_failed",
        type: "agent_tool_decision",
        status: "failed",
        input: { rawDecision: summarizeUnknown(rawDecision) },
        error: parsedDecision,
        metadata: { stepIndex, failureCode: parsedDecision.code },
      });
      state = finishWithResult(state, createFailedResult("model_output_invalid"), input.trace, parsedDecision.message);
      break;
    }

    const decision = parsedDecision.decision;
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
      metadata: { stepIndex, remainingSteps: limits.maxSteps - stepIndex - 1 },
    });

    if (decision.action === "final_result") {
      const referenceValidation = validateFinalResultReferences(state, decision.result);
      state = finishWithResult(
        state,
        referenceValidation.ok ? decision.result : createFailedResult("model_output_invalid"),
        input.trace,
        referenceValidation.ok ? decision.reason : referenceValidation.message,
      );
      state = maybeCheckpoint(state, limits, stepIndex);
      break;
    }

    const tool = input.registry.get(decision.toolName);

    if (!tool) {
      state = recordSyntheticToolFailure(state, decision, stepIndex, "unknown_tool");
      state = maybeCheckpoint(state, limits, stepIndex);
      continue;
    }

    const parsedInput = tool.inputSchema.safeParse(decision.input);
    const toolCallId = createAgentId("tool_call");
    const startedAt = toUtcISOString(new Date());
    const callRecord: AgentToolCallRecord = {
      id: toolCallId,
      toolName: decision.toolName,
      input: parsedInput.success ? parsedInput.data : decision.input,
      status: parsedInput.success ? "pending" : "failed",
      startedAt,
      reason: decision.reason,
    };
    state = addToolCall(state, callRecord);

    if (!parsedInput.success) {
      const failedRecord = createToolResultRecord({
        toolCallId,
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
      });
      state = completeToolCall(state, toolCallId, "failed", failedRecord);
      input.trace?.addStep({
        name: "agent_tool_result",
        type: "agent_tool_result",
        status: "failed",
        input: summarizeDecisionForTrace(decision),
        output: failedRecord.traceSummary,
        error: failedRecord.error,
        metadata: { stepIndex, toolResultId: failedRecord.toolResultId },
      });
      state = maybeCheckpoint(state, limits, stepIndex);
      continue;
    }

    const dependencyFailure = validateToolDependencies(tool, parsedInput.data, state);
    if (dependencyFailure) {
      const failedRecord = createToolResultRecord({
        toolCallId,
        toolName: decision.toolName,
        result: dependencyFailure,
      });
      state = completeToolCall(state, toolCallId, "failed", failedRecord);
      input.trace?.addStep({
        name: "agent_tool_result",
        type: "agent_tool_result",
        status: "failed",
        input: summarizeDecisionForTrace(decision),
        output: failedRecord.traceSummary,
        error: failedRecord.error,
        metadata: { stepIndex, toolResultId: failedRecord.toolResultId },
      });
      state = maybeCheckpoint(state, limits, stepIndex);
      continue;
    }

    const result = await tool.execute(parsedInput.data, {
      runId,
      userId: input.userId,
      sessionId: input.sessionId,
      traceId: input.trace?.id,
      deadlineAt,
    });
    const resultRecord = createToolResultRecord({
      toolCallId,
      toolName: decision.toolName,
      result,
    });
    state = completeToolCall(state, toolCallId, result.ok ? "success" : "failed", resultRecord);
    input.trace?.addStep({
      name: "agent_tool_result",
      type: "agent_tool_result",
      status: result.ok ? "success" : "failed",
      input: summarizeDecisionForTrace(decision),
      output: resultRecord.traceSummary,
      error: result.ok ? undefined : result.error,
      metadata: {
        stepIndex,
        toolResultId: resultRecord.toolResultId,
        candidateSetId: resultRecord.candidateSetId,
        artifactPayloadId: resultRecord.artifactPayloadId,
        validationId: resultRecord.validationId,
        policyDecisionId: resultRecord.policyDecisionId,
        confirmationId: resultRecord.confirmationId,
        revisionId: resultRecord.revisionId,
      },
    });
    state = maybeCheckpoint(state, limits, stepIndex);
  }

  if (!state.finalResult) {
    state = finishWithResult(state, createFailedResult("step_limit_exceeded"), input.trace, "Agent loop reached step limit.");
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
    legacyPathSkip: createLegacyPathSkip(),
  };
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

  return agentExecutionStateSchema.parse({
    ...state,
    toolCalls: updatedCalls,
    toolResults: [...state.toolResults, result],
    dependencyGraph: graph,
  });
}

function recordSyntheticToolFailure(
  state: AgentExecutionState,
  decision: AgentToolDecision & { action: "call_tool" },
  stepIndex: number,
  code: "unknown_tool",
) {
  const toolCallId = createAgentId("tool_call");
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

function createToolResultRecord(input: {
  toolCallId: string;
  toolName: string;
  result: AgentToolExecutionResult<unknown>;
}): AgentToolResultRecord {
  if (!input.result.ok) {
    return {
      toolResultId: createAgentId("tool_result"),
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      status: input.result.error.code === "policy_blocked" ? "blocked" : "failed",
      traceSummary: input.result.traceSummary,
      error: input.result.error,
    };
  }

  const ids = extractStructuredIds(input.result.output);

  return {
    toolResultId: input.result.toolResultId,
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    status: "success",
    modelSummary: input.result.modelSummary,
    traceSummary: input.result.traceSummary,
    ...ids,
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
  const resourceNodes = [
    result.candidateSetId ? { id: result.candidateSetId, kind: "candidate_set" as const, label: "candidateSet" } : null,
    result.artifactPayloadId ? { id: result.artifactPayloadId, kind: "artifact_payload" as const, label: "artifactPayload" } : null,
    result.validationId ? { id: result.validationId, kind: "validation" as const, label: "validation" } : null,
    result.policyDecisionId ? { id: result.policyDecisionId, kind: "policy_decision" as const, label: "policyDecision" } : null,
    result.confirmationId ? { id: result.confirmationId, kind: "confirmation" as const, label: "confirmation" } : null,
    result.editPlanId ? { id: result.editPlanId, kind: "workout_edit_plan" as const, label: "workoutEditPlan" } : null,
    result.draftId ? { id: result.draftId, kind: "draft" as const, label: "draft" } : null,
    result.patchId ? { id: result.patchId, kind: "patch" as const, label: "patch" } : null,
  ].filter((node): node is NonNullable<typeof node> => Boolean(node));

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
): AgentExecutionState {
  const finalResultId = createAgentId("final_result");
  const usedToolResultIds = "usedToolResultIds" in result ? result.usedToolResultIds : [];
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
      usedToolResultIds,
      dependencyGraphNodeCount: finalState.dependencyGraph.nodes.length,
      legacyPathSkip: createLegacyPathSkip(),
    },
  });

  return finalState;
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

function validateFinalResultReferences(
  state: AgentExecutionState,
  result: AgentExecutionResult,
): { ok: true } | { ok: false; message: string } {
  const missing: Array<{ kind: AgentToolDependencyKind | "operation_result" | "revision"; id: string }> = [];
  const usedToolResultIds = "usedToolResultIds" in result ? result.usedToolResultIds : [];

  for (const toolResultId of usedToolResultIds) {
    if (!stateHasDependencyId(state, "tool_result", toolResultId)) {
      missing.push({ kind: "tool_result", id: toolResultId });
    }
  }

  if ("validationId" in result && result.validationId && !stateHasDependencyId(state, "validation", result.validationId)) {
    missing.push({ kind: "validation", id: result.validationId });
  }

  if ("policyDecisionId" in result && result.policyDecisionId && !stateHasDependencyId(state, "policy_decision", result.policyDecisionId)) {
    missing.push({ kind: "policy_decision", id: result.policyDecisionId });
  }

  if ("revisionId" in result && result.revisionId && !state.toolResults.some((toolResult) => toolResult.revisionId === result.revisionId)) {
    missing.push({ kind: "revision", id: result.revisionId });
  }

  if (result.status === "completed_operation" && !state.toolResults.some((toolResult) => toolResult.operationResultId === result.operationResultId)) {
    missing.push({ kind: "operation_result", id: result.operationResultId });
  }

  return missing.length === 0
    ? { ok: true }
    : {
        ok: false,
        message: `Agent final result referenced unregistered dependencies: ${missing.map((item) => `${item.kind}:${item.id}`).join(", ")}`,
      };
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

function flattenStringIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(flattenStringIds);
  }
  return typeof value === "string" && value.trim() ? [value] : [];
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
