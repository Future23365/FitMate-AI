import type { AiTrace, AiTraceStatus, AiTraceStep } from "@/lib/server/dev/ai-trace-store";

export type AgentTracePhaseBoundary =
  | "context"
  | "tool_decision"
  | "tool_execution"
  | "domain_gate"
  | "persistence"
  | "response_writer"
  | "post_processing"
  | "legacy_compatibility";

export type AgentToolTimelineStatus =
  | "success"
  | "failed"
  | "skipped"
  | "missing_result"
  | "missing_decision"
  | "unlinked_result";

export type AgentResourceKind =
  | "candidateSetId"
  | "artifactPayloadId"
  | "validationId"
  | "policyDecisionId"
  | "confirmationId"
  | "revisionId"
  | "toolResultId"
  | "artifactEventId"
  | "operationResultId";

export type AgentTraceStepReference = {
  stepId: string;
  stepName: string;
  stepType: AiTraceStep["type"];
  index: number;
  source: "input" | "output" | "metadata" | "error" | "trace";
};

export type AgentTraceRunSummary = {
  traceId: string;
  runId: string;
  route: string;
  status: AiTraceStatus;
  durationMs?: number;
  tokenUsage: AgentTraceTokenUsage | null;
  finalResultStatus: string;
  finalResultCode?: string;
  finalResultReason?: string;
  userVisibleReply?: string;
  failureCodes: string[];
  toolCallCount: number;
  legacyPathStatus: string;
  resultKind: "artifact" | "patch" | "clarification" | "blocked" | "failed" | "answered" | "operation" | "unknown";
};

export type AgentTracePhaseGroup = {
  id: AgentTracePhaseBoundary;
  title: string;
  description: string;
  status: AiTraceStatus;
  steps: AiTraceStep[];
  durationMs?: number;
  tokenUsage: AgentTraceTokenUsage | null;
};

export type AgentToolTimelineItem = {
  id: string;
  stepIndex: number | null;
  toolName: string;
  status: AgentToolTimelineStatus;
  durationMs?: number;
  parameterSummary: string;
  outputSummary: string;
  failureCode?: string;
  toolResultId?: string;
  modelStage?: string;
  decisionStep?: AgentTraceStepReference;
  resultStep?: AgentTraceStepReference;
  downstreamUsage: string[];
};

export type AgentResourceLink = {
  kind: AgentResourceKind;
  id: string;
  producers: AgentTraceStepReference[];
  consumers: AgentTraceStepReference[];
  toolNames: string[];
};

export type AgentDiagnosticFinding = {
  id: string;
  boundary: AgentTracePhaseBoundary;
  severity: "info" | "warning" | "error";
  code: string;
  reason: string;
  step?: AgentTraceStepReference;
  recoveryPath?: string;
  blockingReason?: string;
};

export type AgentLegacyCompatibility = {
  hasAgentStages: boolean;
  status: "agent_run" | "legacy_trace";
  message: string;
  skippedPaths: string[];
};

export type AgentTraceTokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type AgentTraceViewModel = {
  hasAgentStages: boolean;
  runSummary: AgentTraceRunSummary;
  phaseGroups: AgentTracePhaseGroup[];
  toolTimeline: AgentToolTimelineItem[];
  resourceLinks: AgentResourceLink[];
  diagnosticFindings: AgentDiagnosticFinding[];
  legacyCompatibility: AgentLegacyCompatibility;
};

type PhaseDefinition = Omit<AgentTracePhaseGroup, "status" | "steps" | "durationMs" | "tokenUsage">;

const phaseDefinitions: PhaseDefinition[] = [
  {
    id: "context",
    title: "ContextPackage（上下文包）",
    description: "上下文构建、事实来源、截断策略和 Agent 可见输入。",
  },
  {
    id: "tool_decision",
    title: "Tool decision（工具决策）",
    description: "模型工具决策、解析失败、repair 和终止决策。",
  },
  {
    id: "tool_execution",
    title: "Tool execution（工具执行）",
    description: "工具执行结果、toolResultId、候选池、payload 和工具错误。",
  },
  {
    id: "domain_gate",
    title: "Validator / Policy gate（校验与策略门）",
    description: "validation、policy、confirmation 等领域边界检查。",
  },
  {
    id: "persistence",
    title: "Persistence（持久化）",
    description: "revision、artifact event 和写入结果。",
  },
  {
    id: "response_writer",
    title: "Response Writer（回复写入器）",
    description: "AgentExecutionResult 到用户可见回复的投影与引用检查。",
  },
  {
    id: "post_processing",
    title: "Post-processing（后处理）",
    description: "summary update、后处理和后台步骤。",
  },
  {
    id: "legacy_compatibility",
    title: "Legacy compatibility（旧链路兼容）",
    description: "旧 intent-first 路径、兼容事件和未记录 Agent run 的提示。",
  },
];

const resourceKeys = [
  "candidateSetId",
  "artifactPayloadId",
  "validationId",
  "policyDecisionId",
  "confirmationId",
  "revisionId",
  "toolResultId",
  "artifactEventId",
  "operationResultId",
] as const;

// buildAgentTraceViewModel 将原始 AiTrace 转成 Tool-first Agent 诊断页使用的稳定展示模型。
export function buildAgentTraceViewModel(trace: AiTrace): AgentTraceViewModel {
  const hasAgentStages = trace.steps.some(isAgentStep);
  const resourceLinks = buildResourceLinks(trace);
  const toolTimeline = buildToolTimeline(trace, resourceLinks);
  const diagnosticFindings = buildDiagnosticFindings(trace, toolTimeline, resourceLinks, hasAgentStages);
  const runSummary = buildRunSummary(trace, toolTimeline, diagnosticFindings, hasAgentStages);

  return {
    hasAgentStages,
    runSummary,
    phaseGroups: buildPhaseGroups(trace, hasAgentStages),
    toolTimeline,
    resourceLinks,
    diagnosticFindings,
    legacyCompatibility: buildLegacyCompatibility(trace, hasAgentStages),
  };
}

// createAgentTraceDiagnosisLogEntry 输出可复制到日志文件的窄诊断摘要，不替代原始 trace payload。
export function createAgentTraceDiagnosisLogEntry(viewModel: AgentTraceViewModel) {
  return compactObject({
    runSummary: viewModel.runSummary,
    phaseGroups: viewModel.phaseGroups.map((group) => ({
      id: group.id,
      title: group.title,
      status: group.status,
      eventCount: group.steps.length,
      durationMs: group.durationMs,
      tokenUsage: group.tokenUsage,
      stepIds: group.steps.map((step) => step.id),
    })),
    toolTimeline: viewModel.toolTimeline,
    resourceLinks: viewModel.resourceLinks,
    diagnosticFindings: viewModel.diagnosticFindings,
    legacyCompatibility: viewModel.legacyCompatibility,
  });
}

function buildRunSummary(
  trace: AiTrace,
  toolTimeline: AgentToolTimelineItem[],
  findings: AgentDiagnosticFinding[],
  hasAgentStages: boolean,
): AgentTraceRunSummary {
  const finalResult = getFinalResult(trace);
  const finalStatus = getString(finalResult?.status) ?? trace.finalDecision?.status ?? trace.status;
  const failureCodes = uniqueStrings([
    ...findings.map((finding) => finding.code),
    ...trace.steps.map((step) => getFailureCode(step)).filter(isString),
    trace.finalDecision?.code,
  ].filter(isString));

  return {
    traceId: trace.id,
    runId: trace.runId,
    route: trace.route,
    status: trace.status,
    durationMs: trace.durationMs,
    tokenUsage: getTraceTokenUsage(trace),
    finalResultStatus: finalStatus,
    finalResultCode: getString(finalResult?.failureCode) ?? trace.finalDecision?.code,
    finalResultReason: getString(finalResult?.reason) ?? trace.finalDecision?.reason,
    userVisibleReply: getFinalUserVisibleAnswer(trace),
    failureCodes,
    toolCallCount: toolTimeline.filter((item) => item.status !== "missing_decision").length,
    legacyPathStatus: hasAgentStages
      ? "legacy path（旧链路）已跳过或隔离"
      : "legacy trace（旧格式链路）未记录 Agent stages（智能体阶段）",
    resultKind: getResultKind(finalStatus),
  };
}

function buildPhaseGroups(trace: AiTrace, hasAgentStages: boolean): AgentTracePhaseGroup[] {
  return phaseDefinitions.map((definition) => {
    const steps = trace.steps.filter((step) => classifyPhaseBoundary(step, hasAgentStages) === definition.id);

    return {
      ...definition,
      status: mergeStepStatus(steps),
      steps,
      durationMs: getStepsDurationMs(steps),
      tokenUsage: getStepsTokenUsage(steps),
    };
  });
}

function buildToolTimeline(trace: AiTrace, resourceLinks: AgentResourceLink[]): AgentToolTimelineItem[] {
  const decisions = trace.steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => step.type === "agent_tool_decision");
  const results = trace.steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => step.type === "agent_tool_result");
  const resultsByIndex = new Map<number, Array<{ step: AiTraceStep; index: number }>>();
  const consumedResultIndexes = new Set<number>();

  for (const result of results) {
    const stepIndex = getStepIndex(result.step);

    if (stepIndex === null) {
      continue;
    }

    const bucket = resultsByIndex.get(stepIndex) ?? [];
    bucket.push(result);
    resultsByIndex.set(stepIndex, bucket);
  }

  const timeline: AgentToolTimelineItem[] = decisions.map(({ step, index }) => {
    const stepIndex = getStepIndex(step);
    const result = stepIndex === null ? undefined : resultsByIndex.get(stepIndex)?.shift();

    if (result) {
      consumedResultIndexes.add(result.index);
    }

    return createToolTimelineItem({
      id: `decision:${step.id}`,
      stepIndex,
      decision: { step, index },
      result,
      resourceLinks,
    });
  });

  for (const result of results) {
    if (consumedResultIndexes.has(result.index)) {
      continue;
    }

    timeline.push(createToolTimelineItem({
      id: `result:${result.step.id}`,
      stepIndex: getStepIndex(result.step),
      result,
      resourceLinks,
    }));
  }

  return timeline.sort((left, right) => {
    const leftIndex = left.stepIndex ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = right.stepIndex ?? Number.MAX_SAFE_INTEGER;

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.id.localeCompare(right.id);
  });
}

function createToolTimelineItem(input: {
  id: string;
  stepIndex: number | null;
  decision?: { step: AiTraceStep; index: number };
  result?: { step: AiTraceStep; index: number };
  resourceLinks: AgentResourceLink[];
}): AgentToolTimelineItem {
  const decision = input.decision?.step;
  const result = input.result?.step;
  const toolName = getToolName(decision) ?? getToolName(result) ?? "unknown_tool";
  const status = getToolTimelineStatus(decision, result);
  const producedResourceIds = getProducedResourceIds(result);

  return {
    id: input.id,
    stepIndex: input.stepIndex,
    toolName,
    status,
    durationMs: result?.durationMs ?? decision?.durationMs,
    parameterSummary: summarizeToolParameters(decision ?? result),
    outputSummary: summarizeToolOutput(result),
    failureCode: getFailureCode(result) ?? getFailureCode(decision),
    toolResultId: getResourceValue(result, "toolResultId"),
    modelStage: getAiStage(decision) ?? getAiStage(result),
    decisionStep: input.decision ? toStepReference(input.decision.step, input.decision.index, "input") : undefined,
    resultStep: input.result ? toStepReference(input.result.step, input.result.index, "output") : undefined,
    downstreamUsage: getDownstreamUsage(producedResourceIds, input.resourceLinks, result?.id),
  };
}

function buildResourceLinks(trace: AiTrace): AgentResourceLink[] {
  const links = new Map<string, AgentResourceLink>();

  trace.steps.forEach((step, index) => {
    for (const occurrence of collectResourceOccurrences(step)) {
      const role = getResourceOccurrenceRole(step, occurrence.source);
      const key = `${occurrence.kind}:${occurrence.id}`;
      const link = links.get(key) ?? {
        kind: occurrence.kind,
        id: occurrence.id,
        producers: [],
        consumers: [],
        toolNames: [],
      };
      const reference = toStepReference(step, index, occurrence.source);

      if (role === "producer") {
        link.producers.push(reference);
      } else {
        link.consumers.push(reference);
      }

      const toolName = getToolName(step);

      if (toolName) {
        link.toolNames = uniqueStrings([...link.toolNames, toolName]);
      }

      links.set(key, link);
    }
  });

  return [...links.values()].sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`));
}

function buildDiagnosticFindings(
  trace: AiTrace,
  toolTimeline: AgentToolTimelineItem[],
  resourceLinks: AgentResourceLink[],
  hasAgentStages: boolean,
): AgentDiagnosticFinding[] {
  const findings: AgentDiagnosticFinding[] = [];

  trace.steps.forEach((step, index) => {
    if (step.status !== "failed" && step.type !== "error") {
      return;
    }

    const code = getFailureCode(step) ?? "step_failed";
    findings.push({
      id: `step:${step.id}:${code}`,
      boundary: classifyPhaseBoundary(step, hasAgentStages),
      severity: "error",
      code,
      reason: getFailureReason(step),
      step: toStepReference(step, index, "error"),
      recoveryPath: getRecoveryPath(code),
      blockingReason: getBlockingReason(step),
    });
  });

  for (const item of toolTimeline) {
    if (item.status === "missing_result") {
      findings.push({
        id: `tool:${item.id}:missing_result`,
        boundary: "tool_execution",
        severity: "warning",
        code: "missing_result",
        reason: `${item.toolName} 有工具决策但没有匹配的 agent_tool_result。`,
        step: item.decisionStep,
        recoveryPath: "检查 Agent runtime 是否在工具执行前中断，或 result step 是否缺失 stepIndex。",
      });
    }

    if (item.status === "missing_decision" || item.status === "unlinked_result") {
      findings.push({
        id: `tool:${item.id}:${item.status}`,
        boundary: "tool_decision",
        severity: "warning",
        code: item.status,
        reason: `${item.toolName} 有工具结果但没有可配对的 agent_tool_decision。`,
        step: item.resultStep,
        recoveryPath: "检查 decision step 是否被记录，或 stepIndex 是否在 decision/result 之间保持一致。",
      });
    }
  }

  for (const link of resourceLinks) {
    if (link.producers.length === 0 || link.consumers.length > 0 || link.kind === "toolResultId") {
      continue;
    }

    findings.push({
      id: `resource:${link.kind}:${link.id}:orphaned`,
      boundary: getResourceBoundary(link.kind),
      severity: "warning",
      code: "orphaned_resource",
      reason: `${link.kind}=${link.id} 已产生，但没有被 final result、domain gate、persistence 或 Response Writer 消费。`,
      step: link.producers[0],
      recoveryPath: "从资源关联区进入对应 step 的 Raw JSON，确认下游是否遗漏引用。",
    });
  }

  const finalResult = getFinalResult(trace);
  const missingFinalReferences = getFinalResultResourceIds(finalResult)
    .filter((resourceId) => !resourceLinks.some((link) => link.id === resourceId && link.producers.length > 0));

  for (const resourceId of missingFinalReferences) {
    findings.push({
      id: `response_writer:missing_reference:${resourceId}`,
      boundary: "response_writer",
      severity: "error",
      code: "response_writer_reference_missing",
      reason: `Agent final result 或 Response Writer 引用了未在本轮产生的资源：${resourceId}。`,
      recoveryPath: "检查 final result、tool timeline 和 Response Writer 引用是否来自同一轮 Agent run。",
    });
  }

  if (!hasAgentStages) {
    findings.push({
      id: "legacy:no_agent_stages",
      boundary: "legacy_compatibility",
      severity: "info",
      code: "legacy_trace_without_agent_stages",
      reason: "这条 trace 没有记录 Agent stages，页面按 legacy 流程展示，不自动判断为业务失败。",
      recoveryPath: "如果它本应走 Tool-first Agent，检查 /api/chat 是否进入新编排入口。",
    });
  }

  return dedupeFindings(findings);
}

function buildLegacyCompatibility(trace: AiTrace, hasAgentStages: boolean): AgentLegacyCompatibility {
  const skippedPaths = uniqueStrings(
    trace.steps.flatMap((step) => getLegacySkippedPaths(step)),
  );

  if (!hasAgentStages) {
    return {
      hasAgentStages: false,
      status: "legacy_trace",
      message: "未记录 Agent run 诊断信息；这可能是旧 trace 或非聊天 trace，不代表业务失败。",
      skippedPaths: [],
    };
  }

  return {
    hasAgentStages: true,
    status: "agent_run",
    message: skippedPaths.length > 0
      ? "Agent run 已记录 legacy path skip 信号，旧 intent-first 路径只作为兼容信息保留。"
      : "Agent run 已记录；未发现明确 legacy path skip 字段。",
    skippedPaths,
  };
}

function classifyPhaseBoundary(step: AiTraceStep, hasAgentStages: boolean): AgentTracePhaseBoundary {
  const aiStage = getAiStage(step);

  if (step.type === "agent_context" || aiStage === "agent_context_build") {
    return "context";
  }

  if (step.type === "agent_tool_decision" || aiStage === "agent_tool_decision") {
    return "tool_decision";
  }

  if (step.type === "agent_tool_result" || aiStage === "agent_tool_execution") {
    return "tool_execution";
  }

  if (
    step.type === "validation" ||
    isResourcePresent(step, "validationId") ||
    isResourcePresent(step, "policyDecisionId") ||
    isResourcePresent(step, "confirmationId") ||
    step.name.toLowerCase().includes("policy")
  ) {
    return "domain_gate";
  }

  if (step.type === "persistence" || isResourcePresent(step, "revisionId") || isResourcePresent(step, "artifactEventId")) {
    return "persistence";
  }

  if (
    step.type === "response_write" ||
    step.type === "final_response" ||
    step.type === "agent_final_result" ||
    aiStage === "agent_response_writer"
  ) {
    return "response_writer";
  }

  if (isConversationMemoryStep(step) || aiStage === "agent_summary_update") {
    return "post_processing";
  }

  return hasAgentStages ? "legacy_compatibility" : "legacy_compatibility";
}

function isAgentStep(step: AiTraceStep) {
  return (
    step.type === "agent_context" ||
    step.type === "agent_tool_decision" ||
    step.type === "agent_tool_result" ||
    step.type === "agent_final_result" ||
    getAiStage(step)?.startsWith("agent_") === true
  );
}

function getToolTimelineStatus(decision: AiTraceStep | undefined, result: AiTraceStep | undefined): AgentToolTimelineStatus {
  if (decision && !result) {
    return "missing_result";
  }

  if (!decision && result) {
    return getStepIndex(result) === null ? "unlinked_result" : "missing_decision";
  }

  if (result?.status === "failed" || decision?.status === "failed") {
    return "failed";
  }

  const status = getString(result?.metadata?.status) ?? getString(result?.output && isRecord(result.output) ? result.output.status : undefined);

  if (status === "skipped") {
    return "skipped";
  }

  return "success";
}

function collectResourceOccurrences(step: AiTraceStep) {
  const occurrences: Array<{
    kind: AgentResourceKind;
    id: string;
    source: AgentTraceStepReference["source"];
  }> = [];

  for (const source of ["input", "output", "metadata", "error"] as const) {
    occurrences.push(...collectResourcesFromValue(step[source], source));
  }

  return occurrences;
}

function collectResourcesFromValue(value: unknown, source: AgentTraceStepReference["source"]) {
  const occurrences: Array<{
    kind: AgentResourceKind;
    id: string;
    source: AgentTraceStepReference["source"];
  }> = [];

  function visit(item: unknown) {
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }

    if (!isRecord(item)) {
      return;
    }

    for (const [key, child] of Object.entries(item)) {
      if (isResourceKey(key) && typeof child === "string" && child.trim()) {
        occurrences.push({ kind: key, id: child.trim(), source });
      }

      if (Array.isArray(child) || isRecord(child)) {
        visit(child);
      }
    }
  }

  visit(value);

  return occurrences;
}

function getResourceOccurrenceRole(
  step: AiTraceStep,
  source: AgentTraceStepReference["source"],
): "producer" | "consumer" {
  if (
    source === "input" ||
    step.type === "agent_final_result" ||
    step.type === "response_write" ||
    step.type === "final_response"
  ) {
    return "consumer";
  }

  if (step.type === "agent_tool_result" || step.type === "validation" || step.type === "persistence") {
    return "producer";
  }

  return source === "output" || source === "metadata" ? "producer" : "consumer";
}

function toStepReference(
  step: AiTraceStep,
  index: number,
  source: AgentTraceStepReference["source"],
): AgentTraceStepReference {
  return {
    stepId: step.id,
    stepName: step.name,
    stepType: step.type,
    index,
    source,
  };
}

function getProducedResourceIds(step: AiTraceStep | undefined) {
  if (!step) {
    return [];
  }

  return collectResourceOccurrences(step)
    .filter((occurrence) => getResourceOccurrenceRole(step, occurrence.source) === "producer")
    .map((occurrence) => occurrence.id);
}

function getDownstreamUsage(resourceIds: string[], links: AgentResourceLink[], producerStepId: string | undefined) {
  const usage = links
    .filter((link) => resourceIds.includes(link.id))
    .flatMap((link) => link.consumers)
    .filter((consumer) => consumer.stepId !== producerStepId)
    .map((consumer) => `${consumer.stepName} (${consumer.stepType})`);

  return uniqueStrings(usage);
}

function getFinalResultResourceIds(value: unknown) {
  if (!isRecord(value)) {
    return [];
  }

  return collectResourcesFromValue(value, "trace").map((occurrence) => occurrence.id);
}

function getFinalResult(trace: AiTrace): Record<string, unknown> | null {
  const finalStep = [...trace.steps].reverse().find((step) => step.type === "agent_final_result");

  if (isRecord(finalStep?.output)) {
    return finalStep.output;
  }

  const decisionStep = [...trace.steps].reverse().find((step) => {
    const input = isRecord(step.input) ? step.input : null;

    return step.type === "agent_tool_decision" && input?.action === "final_result" && isRecord(input.result);
  });
  const input = isRecord(decisionStep?.input) ? decisionStep.input : null;

  if (isRecord(input?.result)) {
    return input.result;
  }

  return isRecord(trace.finalDecision) ? trace.finalDecision : null;
}

function getResultKind(status: string): AgentTraceRunSummary["resultKind"] {
  if (status === "generated") {
    return "artifact";
  }

  if (status === "patched") {
    return "patch";
  }

  if (status === "needs_clarification") {
    return "clarification";
  }

  if (status === "blocked") {
    return "blocked";
  }

  if (status === "failed" || status === "hard_failure" || status === "recoverable_failure") {
    return "failed";
  }

  if (status === "answered" || status === "success") {
    return "answered";
  }

  if (status === "completed_operation") {
    return "operation";
  }

  return "unknown";
}

function getToolName(step: AiTraceStep | undefined) {
  if (!step) {
    return undefined;
  }

  const input = isRecord(step.input) ? step.input : {};
  const output = isRecord(step.output) ? step.output : {};
  const metadata = isRecord(step.metadata) ? step.metadata : {};
  const nestedInput = isRecord(input.input) ? input.input : {};

  return getString(input.toolName)
    ?? getString(output.toolName)
    ?? getString(metadata.toolName)
    ?? getString(nestedInput.toolName);
}

function summarizeToolParameters(step: AiTraceStep | undefined) {
  if (!step) {
    return "未记录工具参数。";
  }

  const input = isRecord(step.input) ? step.input : {};
  const toolInput = isRecord(input.input) ? input.input : input;
  const entries = Object.entries(toolInput)
    .filter(([key]) => !resourceKeys.includes(key as AgentResourceKind))
    .slice(0, 6)
    .map(([key, value]) => `${key}=${summarizeValue(value)}`);

  return entries.length > 0 ? entries.join("；") : "未记录可读参数摘要。";
}

function summarizeToolOutput(step: AiTraceStep | undefined) {
  if (!step) {
    return "未记录工具执行结果。";
  }

  if (step.error) {
    return getFailureReason(step);
  }

  if (typeof step.output === "string") {
    return step.output.slice(0, 180);
  }

  if (!isRecord(step.output)) {
    return step.status === "success" ? "工具执行成功。" : "未记录可读输出。";
  }

  const summaryFields = [
    "status",
    "message",
    "summary",
    "reason",
    "candidateStatus",
    "relevantCandidateCount",
    "artifactId",
    "revisionId",
    "validationId",
    "policyDecisionId",
  ];
  const entries = summaryFields
    .filter((key) => step.output && isRecord(step.output) && step.output[key] !== undefined)
    .map((key) => `${key}=${summarizeValue(isRecord(step.output) ? step.output[key] : undefined)}`);

  return entries.length > 0 ? entries.join("；") : "工具执行成功，详细输出见 Raw JSON。";
}

function getResourceValue(step: AiTraceStep | undefined, key: AgentResourceKind) {
  if (!step) {
    return undefined;
  }

  const metadata = isRecord(step.metadata) ? step.metadata : {};
  const output = isRecord(step.output) ? step.output : {};

  return getString(metadata[key]) ?? getString(output[key]);
}

function isResourcePresent(step: AiTraceStep, key: AgentResourceKind) {
  return Boolean(getResourceValue(step, key));
}

function getStepIndex(step: AiTraceStep) {
  const metadata = isRecord(step.metadata) ? step.metadata : {};
  const input = isRecord(step.input) ? step.input : {};
  const index = metadata.stepIndex ?? input.stepIndex;

  return typeof index === "number" && Number.isInteger(index) ? index : null;
}

function getAiStage(step: AiTraceStep | undefined) {
  if (!step) {
    return undefined;
  }

  const metadata = isRecord(step.metadata) ? step.metadata : {};
  const output = isRecord(step.output) ? step.output : {};

  return getString(metadata.aiStage) ?? getString(output.aiStage);
}

function getFailureCode(step: AiTraceStep | undefined) {
  if (!step) {
    return undefined;
  }

  const metadata = isRecord(step.metadata) ? step.metadata : {};
  const output = isRecord(step.output) ? step.output : {};
  const error = isRecord(step.error) ? step.error : {};

  return getString(error.code)
    ?? getString(metadata.failureCode)
    ?? getString(metadata.code)
    ?? getString(output.failureCode)
    ?? getString(output.code);
}

function getFailureReason(step: AiTraceStep) {
  const output = isRecord(step.output) ? step.output : {};
  const error = isRecord(step.error) ? step.error : {};

  return getString(error.message)
    ?? getString(output.message)
    ?? getString(output.reason)
    ?? getString(step.error)
    ?? `${step.name} 失败，展开 Raw JSON 查看详情。`;
}

function getBlockingReason(step: AiTraceStep) {
  const output = isRecord(step.output) ? step.output : {};
  const error = isRecord(step.error) ? step.error : {};

  return getString(output.blockReason) ?? getString(error.blockReason);
}

function getRecoveryPath(code: string) {
  if (code.includes("schema") || code.includes("model_output")) {
    return "检查 tool decision 结构、repair 输入和模型输出 schema。";
  }

  if (code.includes("policy") || code.includes("confirmation")) {
    return "检查 PolicyEngine / ConfirmationGate 的决策和目标资源。";
  }

  if (code.includes("persistence") || code.includes("revision")) {
    return "检查写入服务、revisionId 和 artifact event。";
  }

  return "从关联 step 的 Raw JSON 入口继续排查。";
}

function getResourceBoundary(kind: AgentResourceKind): AgentTracePhaseBoundary {
  if (kind === "validationId" || kind === "policyDecisionId" || kind === "confirmationId") {
    return "domain_gate";
  }

  if (kind === "revisionId" || kind === "artifactEventId" || kind === "operationResultId") {
    return "persistence";
  }

  return "tool_execution";
}

function getLegacySkippedPaths(step: AiTraceStep) {
  const metadata = isRecord(step.metadata) ? step.metadata : {};
  const input = isRecord(step.input) ? step.input : {};
  const legacyPathSkip = isRecord(metadata.legacyPathSkip)
    ? metadata.legacyPathSkip
    : isRecord(input.legacyPathSkip)
      ? input.legacyPathSkip
      : {};

  return Object.entries(legacyPathSkip)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
}

function getFinalUserVisibleAnswer(trace: AiTrace) {
  const preferredSteps = [...trace.steps].reverse().filter((step) => {
    if (isConversationMemoryStep(step)) {
      return false;
    }

    return (
      step.type === "final_response" ||
      step.type === "response_write" ||
      step.type === "agent_final_result" ||
      getAiStage(step) === "agent_response_writer" ||
      (step.type === "model_response" && getAiStage(step) === "chat_final_response")
    );
  });

  for (const step of preferredSteps) {
    const answer = getAnswerTextFromValue(step.output);

    if (answer) {
      return answer;
    }
  }

  return undefined;
}

function getAnswerTextFromValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of ["content", "assistantReply", "reply", "message", "text", "finalAnswer", "question"]) {
    const text = getString(value[key]);

    if (text?.trim()) {
      return text.trim();
    }
  }

  const replyContext = isRecord(value.replyContext) ? value.replyContext : null;

  return replyContext ? getAnswerTextFromValue(replyContext) : undefined;
}

function isConversationMemoryStep(step: AiTraceStep) {
  return step.name.includes("聊天上下文总结") || getAiStage(step) === "agent_summary_update";
}

function mergeStepStatus(steps: AiTraceStep[]): AiTraceStatus {
  if (steps.some((step) => step.status === "failed")) {
    return "failed";
  }

  if (steps.some((step) => step.status === "running")) {
    return "running";
  }

  return "success";
}

function getStepsDurationMs(steps: AiTraceStep[]) {
  const durations = steps
    .map((step) => step.durationMs)
    .filter((duration): duration is number => typeof duration === "number");

  if (durations.length > 0) {
    return durations.reduce((sum, duration) => sum + duration, 0);
  }

  return undefined;
}

function getTraceTokenUsage(trace: AiTrace) {
  return getStepsTokenUsage(trace.steps);
}

function getStepsTokenUsage(steps: AiTraceStep[]) {
  const usage = steps.reduce<AgentTraceTokenUsage>((sum, step) => {
    const stepUsage = getTokenUsage(step);

    if (!stepUsage) {
      return sum;
    }

    return {
      prompt_tokens: addOptionalNumbers(sum.prompt_tokens, stepUsage.prompt_tokens),
      completion_tokens: addOptionalNumbers(sum.completion_tokens, stepUsage.completion_tokens),
      total_tokens: addOptionalNumbers(sum.total_tokens, stepUsage.total_tokens),
    };
  }, {});

  return hasTokenUsage(usage) ? usage : null;
}

function getTokenUsage(step: AiTraceStep): AgentTraceTokenUsage | null {
  const metadata = isRecord(step.metadata) ? step.metadata : {};
  const output = isRecord(step.output) ? step.output : {};
  const usage = isRecord(metadata.tokenUsage)
    ? metadata.tokenUsage
    : isRecord(output.usage)
      ? output.usage
      : isRecord(output.tokenUsage)
        ? output.tokenUsage
        : null;

  if (!usage) {
    return null;
  }

  return {
    prompt_tokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
    completion_tokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined,
    total_tokens: typeof usage.total_tokens === "number" ? usage.total_tokens : undefined,
  };
}

function hasTokenUsage(usage: AgentTraceTokenUsage) {
  return (
    usage.prompt_tokens !== undefined ||
    usage.completion_tokens !== undefined ||
    usage.total_tokens !== undefined
  );
}

function addOptionalNumbers(left: number | undefined, right: number | undefined) {
  if (right === undefined) {
    return left;
  }

  return (left ?? 0) + right;
}

function isResourceKey(key: string): key is AgentResourceKind {
  return resourceKeys.includes(key as AgentResourceKind);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function summarizeValue(value: unknown) {
  if (typeof value === "string") {
    return value.length > 80 ? `${value.slice(0, 80)}...` : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `${value.length} items`;
  }

  if (isRecord(value)) {
    return `${Object.keys(value).length} fields`;
  }

  return value === undefined || value === null ? "-" : String(value);
}

function compactObject<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""),
  );
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.filter(isString))];
}

function dedupeFindings(findings: AgentDiagnosticFinding[]) {
  const seen = new Set<string>();
  const result: AgentDiagnosticFinding[] = [];

  for (const finding of findings) {
    if (seen.has(finding.id)) {
      continue;
    }

    seen.add(finding.id);
    result.push(finding);
  }

  return result;
}
