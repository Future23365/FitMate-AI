import type {
  BasicChatFixture,
  BasicChatFlow,
} from "@/lib/shared/llm-blackbox/basic-chat-fixture-schema";
import type { ChatMessage, ChatVisibleOutput } from "@/features/chat/types";

export type LlmBlackboxExecutionStatus =
  | "queued"
  | "running"
  | "passed"
  | "failed"
  | "skipped"
  | "cancelled";

export type LlmBlackboxRunStatus =
  | "running"
  | "completed"
  | "stopped"
  | "failed";

export type LlmBlackboxRunMode = "single" | "all";

export type LlmBlackboxReviewStatus =
  | "unreviewed"
  | "accepted"
  | "rejected"
  | "needs_followup";

export type LlmBlackboxTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type LlmBlackboxTokenDiagnostics = {
  source: "dev_trace_store";
  status: "available" | "missing" | "unavailable";
  usage?: LlmBlackboxTokenUsage;
  traceId?: string;
  reason?: string;
};

export type LlmBlackboxTurnResult = {
  id: string;
  flowId: string;
  flowGoal: string;
  turnIndex: number;
  userInput: string;
  expectedOutput: string;
  status: LlmBlackboxExecutionStatus;
  reviewStatus: LlmBlackboxReviewStatus;
  reviewNote?: string;
  assistantText: string;
  assistantMessage?: ChatMessage;
  visibleOutputs: ChatVisibleOutput[];
  visibleOutputKinds: string[];
  suggestedQuestions: string[];
  safeErrorMessage?: string;
  eventTypes: string[];
  conversationId?: string;
  responseMessageId?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  resultReason?: string;
  failureReason?: string;
  tokenDiagnostics?: LlmBlackboxTokenDiagnostics;
};

export type LlmBlackboxFlowResult = {
  id: string;
  goal: string;
  status: LlmBlackboxExecutionStatus;
  reviewStatus: LlmBlackboxReviewStatus;
  reviewNote?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  turns: LlmBlackboxTurnResult[];
};

export type LlmBlackboxReviewRun = {
  id: string;
  mode: LlmBlackboxRunMode;
  status: LlmBlackboxRunStatus;
  sourcePath: string;
  selectedFlowIds: string[];
  createdAt: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  stopReason?: string;
  flows: LlmBlackboxFlowResult[];
};

export type LlmBlackboxRunStats = {
  flowTotal: number;
  turnTotal: number;
  passedTurnCount: number;
  failedTurnCount: number;
  skippedTurnCount: number;
  cancelledTurnCount: number;
  runningTurnCount: number;
  queuedTurnCount: number;
  unreviewedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  needsFollowupCount: number;
  durationMs: number;
  tokenAvailableCount: number;
  tokenMissingCount: number;
  tokenUnavailableCount: number;
  tokenUsage?: LlmBlackboxTokenUsage;
};

type CreateRunInput = {
  fixture: BasicChatFixture;
  flows: BasicChatFlow[];
  mode: LlmBlackboxRunMode;
  now?: Date;
  createId?: () => string;
};

type TurnSnapshotInput = {
  assistantMessage?: ChatMessage;
  eventTypes: string[];
  safeErrorMessage?: string;
};

type CompleteTurnInput = TurnSnapshotInput & {
  status: "passed" | "failed" | "cancelled";
  endedAt: Date;
  durationMs: number;
  resultReason?: string;
  failureReason?: string;
  tokenDiagnostics?: LlmBlackboxTokenDiagnostics;
};

// createLlmBlackboxReviewRun 把 fixture flow 投影成审核页专用 run，不让 UI 直接依赖 JSON 原始 shape。
export function createLlmBlackboxReviewRun({
  createId = createBrowserSafeId,
  fixture,
  flows,
  mode,
  now = new Date(),
}: CreateRunInput): LlmBlackboxReviewRun {
  const timestamp = now.toISOString();

  return {
    id: createId(),
    mode,
    status: "running",
    sourcePath: fixture.sourcePath,
    selectedFlowIds: flows.map((flow) => flow.id),
    createdAt: timestamp,
    startedAt: timestamp,
    flows: flows.map((flow) => ({
      id: flow.id,
      goal: flow.goal,
      status: "queued",
      reviewStatus: "unreviewed",
      turns: flow.turns.map((turn) => ({
        id: `${flow.id}:${turn.index}`,
        flowId: flow.id,
        flowGoal: flow.goal,
        turnIndex: turn.index,
        userInput: turn.userInput,
        expectedOutput: turn.expectation,
        status: "queued",
        reviewStatus: "unreviewed",
        assistantText: "",
        visibleOutputs: [],
        visibleOutputKinds: [],
        suggestedQuestions: [],
        eventTypes: [],
      })),
    })),
  };
}

// createQueuedLlmBlackboxFlowResult 为尚未运行的 fixture flow 生成只读队列态，供累计审核视图补齐列表。
export function createQueuedLlmBlackboxFlowResult(flow: BasicChatFlow): LlmBlackboxFlowResult {
  return {
    id: flow.id,
    goal: flow.goal,
    status: "queued",
    reviewStatus: "unreviewed",
    turns: flow.turns.map((turn) => ({
      id: `${flow.id}:${turn.index}`,
      flowId: flow.id,
      flowGoal: flow.goal,
      turnIndex: turn.index,
      userInput: turn.userInput,
      expectedOutput: turn.expectation,
      status: "queued",
      reviewStatus: "unreviewed",
      assistantText: "",
      visibleOutputs: [],
      visibleOutputKinds: [],
      suggestedQuestions: [],
      eventTypes: [],
    })),
  };
}

// mergeFixtureFlowsWithLatestRunResults 形成左侧列表的累计视图：优先展示当前选中批次，其余 flow 使用最近一次运行结果。
export function mergeFixtureFlowsWithLatestRunResults(
  fixtureFlows: BasicChatFlow[],
  runs: LlmBlackboxReviewRun[],
  preferredRun?: LlmBlackboxReviewRun | null,
) {
  const preferredFlowById = new Map(preferredRun?.flows.map((flow) => [flow.id, flow]) ?? []);
  const latestFlowById = new Map<string, LlmBlackboxFlowResult>();

  for (const run of sortReviewRunsByCreatedAtDesc(runs)) {
    for (const flow of run.flows) {
      if (!latestFlowById.has(flow.id)) {
        latestFlowById.set(flow.id, flow);
      }
    }
  }

  return fixtureFlows.map((flow) =>
    preferredFlowById.get(flow.id) ?? latestFlowById.get(flow.id) ?? createQueuedLlmBlackboxFlowResult(flow),
  );
}

// findLatestLlmBlackboxRunForFlow 定位某个 flow 最近一次所属 run，人工审核写回时不能误写当前 activeRun。
export function findLatestLlmBlackboxRunForFlow(
  runs: LlmBlackboxReviewRun[],
  flowId: string,
) {
  return sortReviewRunsByCreatedAtDesc(runs).find((run) =>
    run.flows.some((flow) => flow.id === flowId),
  );
}

// findLatestLlmBlackboxFlowResult 为详情区读取累计视图中的最新 flow 结果，避免切换 activeRun 后旧结果消失。
export function findLatestLlmBlackboxFlowResult(
  runs: LlmBlackboxReviewRun[],
  flowId: string,
) {
  return findLatestLlmBlackboxRunForFlow(runs, flowId)
    ?.flows.find((flow) => flow.id === flowId);
}

// startLlmBlackboxTurn 只标记当前 turn 的执行边界，实际请求仍由 headless runner adapter 发出。
export function startLlmBlackboxTurn(
  run: LlmBlackboxReviewRun,
  input: {
    flowId: string;
    turnIndex: number;
    conversationId: string;
    responseMessageId: string;
    startedAt: Date;
  },
): LlmBlackboxReviewRun {
  return mapRunTurn(run, input.flowId, input.turnIndex, (turn) => ({
    ...turn,
    status: "running",
    conversationId: input.conversationId,
    responseMessageId: input.responseMessageId,
    startedAt: input.startedAt.toISOString(),
  }), (flow) => ({
    ...flow,
    status: "running",
    startedAt: flow.startedAt ?? input.startedAt.toISOString(),
  }));
}

// updateRunningLlmBlackboxTurnSnapshot 保存 stream 中间态，供审核页实时预览用户可见气泡。
export function updateRunningLlmBlackboxTurnSnapshot(
  run: LlmBlackboxReviewRun,
  flowId: string,
  turnIndex: number,
  input: TurnSnapshotInput,
): LlmBlackboxReviewRun {
  return mapRunTurn(run, flowId, turnIndex, (turn) => mergeTurnSnapshot(turn, input));
}

// completeLlmBlackboxTurn 写入每轮最终用户可见结果和诊断，expectedOutput 只作为人工审核对照保留。
export function completeLlmBlackboxTurn(
  run: LlmBlackboxReviewRun,
  flowId: string,
  turnIndex: number,
  input: CompleteTurnInput,
): LlmBlackboxReviewRun {
  const endedAt = input.endedAt.toISOString();
  const nextRun = mapRunTurn(run, flowId, turnIndex, (turn) => ({
    ...mergeTurnSnapshot(turn, input),
    status: input.status,
    endedAt,
    durationMs: input.durationMs,
    resultReason: input.resultReason,
    failureReason: input.failureReason,
    tokenDiagnostics: input.tokenDiagnostics,
  }));

  return updateFlowAfterTurnChange(nextRun, flowId, input.endedAt);
}

// skipRemainingFlowTurnsAfterFailure 保持同 flow 多轮上下文一致：前序失败后不伪造后续轮次上下文。
export function skipRemainingFlowTurnsAfterFailure(
  run: LlmBlackboxReviewRun,
  flowId: string,
  afterTurnIndex: number,
  reason: string,
  endedAt = new Date(),
): LlmBlackboxReviewRun {
  const nextRun = {
    ...run,
    flows: run.flows.map((flow) => {
      if (flow.id !== flowId) {
        return flow;
      }

      return {
        ...flow,
        status: "failed" as const,
        endedAt: endedAt.toISOString(),
        durationMs: calculateDurationMs(flow.startedAt, endedAt),
        turns: flow.turns.map((turn) => (
          turn.turnIndex > afterTurnIndex && turn.status === "queued"
            ? {
                ...turn,
                status: "skipped" as const,
                endedAt: endedAt.toISOString(),
                failureReason: reason,
              }
            : turn
        )),
      };
    }),
  };

  return nextRun;
}

// cancelPendingLlmBlackboxWork 将还未完成的队列收口为 cancelled，避免停止后继续显示 queued。
export function cancelPendingLlmBlackboxWork(
  run: LlmBlackboxReviewRun,
  reason: string,
  endedAt = new Date(),
): LlmBlackboxReviewRun {
  const endedAtText = endedAt.toISOString();
  const flows = run.flows.map((flow) => {
    const turns = flow.turns.map((turn) => (
      turn.status === "queued" || turn.status === "running"
        ? {
            ...turn,
            status: "cancelled" as const,
            endedAt: endedAtText,
            failureReason: reason,
          }
        : turn
    ));

    return {
      ...flow,
      turns,
      status: deriveFlowStatus(turns),
      endedAt: flow.endedAt ?? endedAtText,
      durationMs: flow.durationMs ?? calculateDurationMs(flow.startedAt, endedAt),
    };
  });

  return {
    ...run,
    status: "stopped",
    stopReason: reason,
    endedAt: endedAtText,
    durationMs: calculateDurationMs(run.startedAt, endedAt),
    flows,
  };
}

// finalizeLlmBlackboxRun 表达批次结束，不把某个 flow 失败升级成阻断整个批次的异常。
export function finalizeLlmBlackboxRun(
  run: LlmBlackboxReviewRun,
  endedAt = new Date(),
): LlmBlackboxReviewRun {
  const endedAtText = endedAt.toISOString();
  const hasFailed = run.flows.some((flow) => flow.turns.some((turn) => turn.status === "failed"));
  const hasCancelled = run.flows.some((flow) => flow.turns.some((turn) => turn.status === "cancelled"));

  return {
    ...run,
    status: hasCancelled ? "stopped" : hasFailed ? "failed" : "completed",
    endedAt: endedAtText,
    durationMs: calculateDurationMs(run.startedAt, endedAt),
    flows: run.flows.map((flow) => ({
      ...flow,
      status: deriveFlowStatus(flow.turns),
      endedAt: flow.endedAt ?? endedAtText,
      durationMs: flow.durationMs ?? calculateDurationMs(flow.startedAt, endedAt),
    })),
  };
}

export function updateLlmBlackboxTurnReview(
  run: LlmBlackboxReviewRun,
  flowId: string,
  turnIndex: number,
  reviewStatus: LlmBlackboxReviewStatus,
  reviewNote?: string,
): LlmBlackboxReviewRun {
  return mapRunTurn(run, flowId, turnIndex, (turn) => ({
    ...turn,
    reviewStatus,
    reviewNote,
  }));
}

export function updateLlmBlackboxFlowReview(
  run: LlmBlackboxReviewRun,
  flowId: string,
  reviewStatus: LlmBlackboxReviewStatus,
  reviewNote?: string,
): LlmBlackboxReviewRun {
  return {
    ...run,
    flows: run.flows.map((flow) => (
      flow.id === flowId
        ? { ...flow, reviewStatus, reviewNote }
        : flow
    )),
  };
}

// calculateLlmBlackboxRunStats 为页面和测试提供同一批次统计口径。
export function calculateLlmBlackboxRunStats(run: LlmBlackboxReviewRun): LlmBlackboxRunStats {
  return calculateLlmBlackboxFlowStats(
    run.flows,
    run.durationMs ?? calculateDurationMs(run.startedAt, run.endedAt ? new Date(run.endedAt) : new Date()),
  );
}

// calculateLlmBlackboxLatestFlowStats 汇总累计审核视图，统计口径和左侧最新 flow 状态保持一致。
export function calculateLlmBlackboxLatestFlowStats(flows: LlmBlackboxFlowResult[]): LlmBlackboxRunStats {
  return calculateLlmBlackboxFlowStats(
    flows,
    flows.reduce((total, flow) => total + (flow.durationMs ?? 0), 0),
  );
}

function calculateLlmBlackboxFlowStats(
  flows: LlmBlackboxFlowResult[],
  durationMs: number,
): LlmBlackboxRunStats {
  const turns = flows.flatMap((flow) => flow.turns);
  const tokenDiagnostics = turns.map((turn) => turn.tokenDiagnostics).filter(Boolean) as LlmBlackboxTokenDiagnostics[];
  const tokenUsage = mergeTokenUsage(tokenDiagnostics.map((diagnostic) => diagnostic.usage));

  return {
    flowTotal: flows.length,
    turnTotal: turns.length,
    passedTurnCount: turns.filter((turn) => turn.status === "passed").length,
    failedTurnCount: turns.filter((turn) => turn.status === "failed").length,
    skippedTurnCount: turns.filter((turn) => turn.status === "skipped").length,
    cancelledTurnCount: turns.filter((turn) => turn.status === "cancelled").length,
    runningTurnCount: turns.filter((turn) => turn.status === "running").length,
    queuedTurnCount: turns.filter((turn) => turn.status === "queued").length,
    unreviewedCount: turns.filter((turn) => turn.reviewStatus === "unreviewed").length,
    acceptedCount: turns.filter((turn) => turn.reviewStatus === "accepted").length,
    rejectedCount: turns.filter((turn) => turn.reviewStatus === "rejected").length,
    needsFollowupCount: turns.filter((turn) => turn.reviewStatus === "needs_followup").length,
    durationMs,
    tokenAvailableCount: tokenDiagnostics.filter((item) => item.status === "available").length,
    tokenMissingCount: tokenDiagnostics.filter((item) => item.status === "missing").length,
    tokenUnavailableCount: tokenDiagnostics.filter((item) => item.status === "unavailable").length,
    tokenUsage,
  };
}

export function hasLlmBlackboxUserVisibleAnswer(turn: Pick<
  LlmBlackboxTurnResult,
  "assistantText" | "visibleOutputs" | "suggestedQuestions" | "safeErrorMessage"
>) {
  return Boolean(
    turn.assistantText.trim()
    || turn.visibleOutputs.length > 0
    || turn.suggestedQuestions.length > 0
    || turn.safeErrorMessage?.trim(),
  );
}

export function createTurnCompletionReason(turn: Pick<
  LlmBlackboxTurnResult,
  "assistantText" | "visibleOutputs" | "suggestedQuestions" | "safeErrorMessage"
>) {
  const visibleParts = [
    turn.assistantText.trim() ? "assistant_text" : undefined,
    turn.visibleOutputs.length > 0 ? "visible_output" : undefined,
    turn.suggestedQuestions.length > 0 ? "suggested_questions" : undefined,
    turn.safeErrorMessage?.trim() ? "safe_error_message" : undefined,
  ].filter(Boolean);

  return visibleParts.length > 0
    ? `收到用户可见回答：${visibleParts.join(", ")}`
    : "聊天响应已结束，但没有 assistant 文本、可见输出、建议提问或安全兜底文案。";
}

function mapRunTurn(
  run: LlmBlackboxReviewRun,
  flowId: string,
  turnIndex: number,
  turnMapper: (turn: LlmBlackboxTurnResult) => LlmBlackboxTurnResult,
  flowMapper: (flow: LlmBlackboxFlowResult) => LlmBlackboxFlowResult = (flow) => flow,
): LlmBlackboxReviewRun {
  return {
    ...run,
    flows: run.flows.map((flow) => {
      if (flow.id !== flowId) {
        return flow;
      }

      return flowMapper({
        ...flow,
        turns: flow.turns.map((turn) => (
          turn.turnIndex === turnIndex ? turnMapper(turn) : turn
        )),
      });
    }),
  };
}

function mergeTurnSnapshot(
  turn: LlmBlackboxTurnResult,
  input: TurnSnapshotInput,
): LlmBlackboxTurnResult {
  const assistantMessage = input.assistantMessage ?? turn.assistantMessage;
  const visibleOutputs = assistantMessage?.visibleOutputs ?? turn.visibleOutputs;
  const suggestedQuestions = assistantMessage?.suggestedQuestions ?? turn.suggestedQuestions;
  const assistantText = assistantMessage?.content ?? turn.assistantText;

  return {
    ...turn,
    assistantMessage,
    assistantText,
    visibleOutputs,
    visibleOutputKinds: visibleOutputs.map((output) => `${output.outputType}@${output.schemaVersion}`),
    suggestedQuestions,
    safeErrorMessage: input.safeErrorMessage ?? turn.safeErrorMessage,
    eventTypes: input.eventTypes,
  };
}

function updateFlowAfterTurnChange(
  run: LlmBlackboxReviewRun,
  flowId: string,
  endedAt: Date,
): LlmBlackboxReviewRun {
  return {
    ...run,
    flows: run.flows.map((flow) => {
      if (flow.id !== flowId) {
        return flow;
      }

      const status = deriveFlowStatus(flow.turns);
      const isTerminal = status === "passed" || status === "failed" || status === "cancelled" || status === "skipped";

      return {
        ...flow,
        status,
        endedAt: isTerminal ? endedAt.toISOString() : flow.endedAt,
        durationMs: isTerminal ? calculateDurationMs(flow.startedAt, endedAt) : flow.durationMs,
      };
    }),
  };
}

function deriveFlowStatus(turns: LlmBlackboxTurnResult[]): LlmBlackboxExecutionStatus {
  if (turns.some((turn) => turn.status === "failed")) {
    return "failed";
  }

  if (turns.some((turn) => turn.status === "running")) {
    return "running";
  }

  if (turns.some((turn) => turn.status === "cancelled")) {
    return "cancelled";
  }

  if (turns.every((turn) => turn.status === "skipped")) {
    return "skipped";
  }

  if (turns.every((turn) => turn.status === "passed")) {
    return "passed";
  }

  if (turns.every((turn) => turn.status === "queued")) {
    return "queued";
  }

  return "running";
}

function mergeTokenUsage(usages: Array<LlmBlackboxTokenUsage | undefined>) {
  const present = usages.filter((usage): usage is LlmBlackboxTokenUsage => Boolean(usage));

  if (present.length === 0) {
    return undefined;
  }

  return present.reduce(
    (total, usage) => ({
      promptTokens: total.promptTokens + usage.promptTokens,
      completionTokens: total.completionTokens + usage.completionTokens,
      totalTokens: total.totalTokens + usage.totalTokens,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  );
}

function calculateDurationMs(startedAt: string | undefined, endedAt: Date) {
  if (!startedAt) {
    return 0;
  }

  const startedMs = new Date(startedAt).getTime();

  return Number.isFinite(startedMs) ? Math.max(0, endedAt.getTime() - startedMs) : 0;
}

function sortReviewRunsByCreatedAtDesc(runs: LlmBlackboxReviewRun[]) {
  return [...runs].sort((left, right) => getRunCreatedTime(right) - getRunCreatedTime(left));
}

function getRunCreatedTime(run: LlmBlackboxReviewRun) {
  const time = new Date(run.createdAt).getTime();

  return Number.isFinite(time) ? time : 0;
}

function createBrowserSafeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `llm-blackbox-${crypto.randomUUID()}`;
  }

  return `llm-blackbox-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
