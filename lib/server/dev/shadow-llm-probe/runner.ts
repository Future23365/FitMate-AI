import "server-only";

import { randomUUID } from "node:crypto";

import { agentRuntimeConfig } from "@/lib/server/config";
import {
  createProductionLangChainToolCatalog,
  executeLangChainToolWrapper,
  langChainFinalResponseToolName,
  type LangChainToolWrapper,
} from "@/lib/server/langchain-agent";
import {
  ShadowLlmProbeDecisionSchema,
  type ShadowLlmProbeDecision,
  type ShadowLlmProbeInput,
  type ShadowLlmProbeManifest,
  type ShadowLlmProbeToolResult,
} from "@/lib/shared/shadow-llm-probe/schema";

import { createShadowLlmProbeFileStore } from "./file-store";
import { createShadowLlmProbeInput } from "./input-exporter";

export type ShadowLlmProbeRunnerOptions = {
  cwd?: string;
  toolWrappers?: readonly LangChainToolWrapper[];
};

export type StartShadowLlmProbeOptions = ShadowLlmProbeRunnerOptions & {
  message: string;
  userId?: string;
  conversationId?: string;
};

/** startShadowLlmProbeRun 为单条用户消息创建 dev-only shadow run，不调用真实模型。 */
export async function startShadowLlmProbeRun(options: StartShadowLlmProbeOptions) {
  const store = createShadowLlmProbeFileStore(options.cwd);
  const runId = createRunId();
  const roundId = "round-001";
  const now = new Date().toISOString();
  const actor = {
    userId: options.userId ?? agentRuntimeConfig.shadowLlmProbe.defaultUserId,
    conversationId: options.conversationId ?? agentRuntimeConfig.shadowLlmProbe.defaultConversationId,
  };
  const input = createShadowLlmProbeInput({
    runId,
    roundId,
    message: options.message,
    toolWrappers: options.toolWrappers,
  });
  const manifest: ShadowLlmProbeManifest = {
    schemaVersion: 1,
    runId,
    createdAt: now,
    updatedAt: now,
    status: "active",
    activeRoundId: roundId,
    inputSource: input.inputSource,
    actor,
    rounds: [{
      roundId,
      inputPath: store.inputPath(runId, roundId),
      decisionPath: store.decisionPath(runId, roundId),
    }],
    toolCallsUsed: 0,
  };

  await store.ensureRunDir(runId);
  await store.writeInput(input);
  await store.writeManifest(manifest);

  return {
    runId,
    manifestPath: store.manifestPath(runId),
    inputPath: store.inputPath(runId, roundId),
    decisionPath: store.decisionPath(runId, roundId),
    reportPath: store.reportMarkdownPath(runId),
  };
}

/** continueShadowLlmProbeRun 校验 Codex decision 并确定性推进 tool、下一轮 input 或终态 manifest。 */
export async function continueShadowLlmProbeRun(options: ShadowLlmProbeRunnerOptions & { runId: string }) {
  const store = createShadowLlmProbeFileStore(options.cwd);
  const manifest = await store.readManifest(options.runId);

  if (manifest.status !== "active") {
    return {
      status: manifest.status,
      runId: manifest.runId,
      message: `Shadow run 已处于终态：${manifest.status}`,
      reportPath: store.reportMarkdownPath(manifest.runId),
    };
  }

  const currentInput = await store.readInput(manifest.runId, manifest.activeRoundId);
  const decisionResult = await readAndValidateDecision({
    store,
    manifest,
    input: currentInput,
    toolWrappers: options.toolWrappers ?? createProductionLangChainToolCatalog(),
  });

  if (!decisionResult.ok) {
    const updated = closeManifest(manifest, "decision_validation_failed", decisionResult.reason);
    await store.writeManifest(updated);
    return { status: updated.status, runId: updated.runId, message: decisionResult.reason };
  }

  const decision = decisionResult.decision;
  if (decision.decision === "contract_gap") {
    const updated = closeManifest(manifest, "contract_gap", summarizeDecisionGap(decision));
    await store.writeManifest(updated);
    return { status: updated.status, runId: updated.runId, message: updated.terminal?.reason ?? "" };
  }

  if (decision.decision === "final_answer") {
    const updated = closeManifest(manifest, "final_answer", decision.finalAnswer?.rationale ?? "Codex Shadow 决策进入 final_answer。");
    await store.writeManifest(updated);
    return { status: updated.status, runId: updated.runId, message: updated.terminal?.reason ?? "" };
  }

  const toolWrappers = options.toolWrappers ?? createProductionLangChainToolCatalog();
  const tool = toolWrappers.find((wrapper) => wrapper.name === decision.toolName);

  if (!tool) {
    const updated = closeManifest(manifest, "decision_validation_failed", `tool_not_available: ${decision.toolName ?? "<empty>"}`);
    await store.writeManifest(updated);
    return { status: updated.status, runId: updated.runId, message: updated.terminal?.reason ?? "" };
  }

  const execution = await executeLangChainToolWrapper(
    tool,
    decision.toolInput,
    { actor: manifest.actor },
    { toolCallId: `${manifest.activeRoundId}:${tool.name}` },
  );
  const toolResult: ShadowLlmProbeToolResult = {
    schemaVersion: 1,
    runId: manifest.runId,
    roundId: manifest.activeRoundId,
    toolName: tool.name,
    status: execution.record.status === "failed" ? "failed" : "succeeded",
    modelVisibleSummary: execution.modelMessage,
    executionRecord: toShadowJson(execution.record),
  };

  await store.writeToolResult(toolResult);

  if (execution.record.status === "failed") {
    const updated = closeManifest(manifest, "tool_execution_failed", execution.record.failureCode ?? "tool_execution_failed");
    await store.writeManifest(updated);
    return { status: updated.status, runId: updated.runId, message: updated.terminal?.reason ?? "" };
  }

  if (manifest.toolCallsUsed + 1 >= agentRuntimeConfig.langChain.runBudget.maxToolCalls) {
    const updated = closeManifest({
      ...manifest,
      toolCallsUsed: manifest.toolCallsUsed + 1,
    }, "budget_exhausted", "Shadow Probe 业务 tool 调用预算已耗尽。");
    await store.writeManifest(updated);
    return { status: updated.status, runId: updated.runId, message: updated.terminal?.reason ?? "" };
  }

  const nextRoundId = formatRoundId(manifest.rounds.length + 1);
  if (manifest.rounds.length + 1 > agentRuntimeConfig.shadowLlmProbe.maxRounds) {
    const updated = closeManifest(manifest, "budget_exhausted", "Shadow Probe 轮次预算已耗尽。");
    await store.writeManifest(updated);
    return { status: updated.status, runId: updated.runId, message: updated.terminal?.reason ?? "" };
  }

  const nextInput = createNextRoundInput({
    previousInput: currentInput,
    nextRoundId,
    toolResult,
    toolCallsUsed: manifest.toolCallsUsed + 1,
    toolWrappers,
  });
  await store.writeInput(nextInput);
  const nextManifest: ShadowLlmProbeManifest = {
    ...manifest,
    updatedAt: new Date().toISOString(),
    activeRoundId: nextRoundId,
    toolCallsUsed: manifest.toolCallsUsed + 1,
    rounds: [
      ...manifest.rounds.map((round) => round.roundId === manifest.activeRoundId
        ? { ...round, toolResultPath: store.toolResultPath(manifest.runId, manifest.activeRoundId) }
        : round),
      {
        roundId: nextRoundId,
        inputPath: store.inputPath(manifest.runId, nextRoundId),
        decisionPath: store.decisionPath(manifest.runId, nextRoundId),
      },
    ],
  };
  await store.writeManifest(nextManifest);

  return {
    status: "active" as const,
    runId: manifest.runId,
    inputPath: store.inputPath(manifest.runId, nextRoundId),
    decisionPath: store.decisionPath(manifest.runId, nextRoundId),
    reportPath: store.reportMarkdownPath(manifest.runId),
  };
}

/** getShadowLlmProbeStatus 只读取 manifest，帮助 CLI 告知下一步应写 decision、continue 或 report。 */
export async function getShadowLlmProbeStatus(options: ShadowLlmProbeRunnerOptions & { runId?: string }) {
  const store = createShadowLlmProbeFileStore(options.cwd);

  if (!options.runId) {
    return { runs: await store.listRuns() };
  }

  const manifest = await store.readManifest(options.runId);
  const activeRound = manifest.rounds.find((round) => round.roundId === manifest.activeRoundId);

  return {
    runId: manifest.runId,
    status: manifest.status,
    activeRoundId: manifest.activeRoundId,
    nextDecisionPath: manifest.status === "active" ? activeRound?.decisionPath : undefined,
    reportPath: store.reportMarkdownPath(manifest.runId),
  };
}

async function readAndValidateDecision(input: {
  store: ReturnType<typeof createShadowLlmProbeFileStore>;
  manifest: ShadowLlmProbeManifest;
  input: ShadowLlmProbeInput;
  toolWrappers: readonly LangChainToolWrapper[];
}): Promise<
  | { ok: true; decision: ShadowLlmProbeDecision }
  | { ok: false; reason: string }
> {
  let decision: ShadowLlmProbeDecision;
  try {
    decision = await input.store.readDecision(input.manifest.runId, input.manifest.activeRoundId);
  } catch (error) {
    return { ok: false, reason: `decision_read_or_schema_failed: ${error instanceof Error ? error.message : String(error)}` };
  }

  if (decision.runId !== input.manifest.runId || decision.roundId !== input.manifest.activeRoundId) {
    return { ok: false, reason: "decision_run_or_round_mismatch" };
  }

  if (!decision.contaminationAudit.usedOnlyShadowInput) {
    return { ok: false, reason: "contamination_audit_failed" };
  }

  if (decision.decision !== "call_tool") {
    return { ok: true, decision };
  }

  if (decision.toolName === langChainFinalResponseToolName) {
    return { ok: false, reason: "fitmate_final_response_must_use_final_answer_decision" };
  }

  const exposedToolNames = new Set(input.input.tools.map((tool) => tool.name));
  if (!decision.toolName || !exposedToolNames.has(decision.toolName)) {
    return { ok: false, reason: `tool_not_available: ${decision.toolName ?? "<empty>"}` };
  }

  const tool = input.toolWrappers.find((wrapper) => wrapper.name === decision.toolName);
  if (!tool) {
    return { ok: false, reason: `tool_not_registered: ${decision.toolName}` };
  }

  const parsedInput = tool.inputSchema.safeParse(decision.toolInput);
  if (!parsedInput.success) {
    return { ok: false, reason: `tool_schema_invalid: ${parsedInput.error.issues.map((issue) => issue.path.join(".") || "$").join(", ")}` };
  }

  return {
    ok: true,
    decision: ShadowLlmProbeDecisionSchema.parse({
      ...decision,
      toolInput: parsedInput.data,
    }),
  };
}

function createNextRoundInput(input: {
  previousInput: ShadowLlmProbeInput;
  nextRoundId: string;
  toolResult: ShadowLlmProbeToolResult;
  toolCallsUsed: number;
  toolWrappers: readonly LangChainToolWrapper[];
}) {
  return createShadowLlmProbeInput({
    runId: input.previousInput.runId,
    roundId: input.nextRoundId,
    message: input.previousInput.inputSource.messagePreview,
    messages: [
      ...input.previousInput.messages,
      {
        role: "tool",
        name: input.toolResult.toolName,
        toolCallId: `${input.toolResult.roundId}:${input.toolResult.toolName}`,
        content: input.toolResult.modelVisibleSummary,
      },
    ],
    toolResultSummaries: [
      ...input.previousInput.toolResultSummaries,
      {
        roundId: input.toolResult.roundId,
        toolName: input.toolResult.toolName,
        status: input.toolResult.status,
        content: input.toolResult.modelVisibleSummary,
      },
    ],
    toolCallsUsed: input.toolCallsUsed,
    toolWrappers: input.toolWrappers,
  });
}

function closeManifest(
  manifest: ShadowLlmProbeManifest,
  status: Exclude<ShadowLlmProbeManifest["status"], "active">,
  reason: string,
): ShadowLlmProbeManifest {
  return {
    ...manifest,
    status,
    updatedAt: new Date().toISOString(),
    terminal: {
      status,
      roundId: manifest.activeRoundId,
      reason,
    },
  };
}

function summarizeDecisionGap(decision: ShadowLlmProbeDecision) {
  return [
    ...decision.missingFacts,
    ...decision.contractConcerns.map((concern) => `${concern.category}: ${concern.summary}`),
  ].join("; ") || "Codex Shadow 决策报告合同缺口。";
}

function createRunId() {
  const timestamp = formatShanghaiRunTimestamp(new Date());
  return `shadow-${timestamp}-${randomUUID().slice(0, 8)}`;
}

/** formatShanghaiRunTimestamp 只服务人工可读的 shadow run 目录名；结构化时间字段仍使用 ISO UTC。 */
function formatShanghaiRunTimestamp(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}-${values.hour}${values.minute}`;
}

function formatRoundId(index: number) {
  return `round-${String(index).padStart(3, "0")}`;
}

function toShadowJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as ShadowLlmProbeToolResult["executionRecord"];
}
