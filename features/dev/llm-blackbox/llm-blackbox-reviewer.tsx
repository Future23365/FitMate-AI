"use client";

import { useMemo } from "react";

import { SymbolIcon } from "@/components/app/symbol-icon";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChatTranscript } from "@/features/chat/components/chat-transcript";
import type { ChatMessage } from "@/features/chat/types";
import {
  calculateLlmBlackboxRunStats,
  type LlmBlackboxFlowResult,
  type LlmBlackboxReviewStatus,
  type LlmBlackboxRunStats,
  type LlmBlackboxTurnResult,
} from "@/features/dev/llm-blackbox/review-state";
import { LlmBlackboxBodyScrollScope } from "@/features/dev/llm-blackbox/llm-blackbox-body-scroll-scope";
import { useLlmBlackboxReviewRunner } from "@/features/dev/llm-blackbox/use-llm-blackbox-review-runner";
import type {
  BasicChatFixture,
  BasicChatFlow,
} from "@/lib/shared/llm-blackbox/basic-chat-fixture-schema";

type LlmBlackboxReviewerProps = {
  fixture: BasicChatFixture;
};

const reviewOptions: Array<{ value: LlmBlackboxReviewStatus; label: string; icon: string }> = [
  { value: "accepted", label: "通过", icon: "check_circle" },
  { value: "rejected", label: "拒绝", icon: "cancel" },
  { value: "needs_followup", label: "跟进", icon: "flag" },
  { value: "unreviewed", label: "未审", icon: "radio_button_unchecked" },
];

// LlmBlackboxReviewer 是开发态人工审核工作台，只消费 fixture、runner 状态和只读消息展示组件。
export function LlmBlackboxReviewer({ fixture }: LlmBlackboxReviewerProps) {
  const runner = useLlmBlackboxReviewRunner(fixture);
  const flowList = useMemo(
    () => mergeFixtureFlowsWithRunResults(fixture.flows, runner.activeRun?.flows),
    [fixture.flows, runner.activeRun],
  );
  const transcriptMessages = useMemo(
    () => buildTranscriptMessages(runner.selectedFlow),
    [runner.selectedFlow],
  );
  const fallbackStats = useMemo(
    () => runner.activeRun ? calculateLlmBlackboxRunStats(runner.activeRun) : null,
    [runner.activeRun],
  );
  const stats = runner.activeRunStats ?? fallbackStats;

  function handleRunAll() {
    const accepted = window.confirm("运行全部 flow 会真实调用 /api/chat 和模型服务，确认继续？");

    if (accepted) {
      void runner.runAllFlows();
    }
  }

  return (
    <div className="app-mesh-bg min-h-screen text-ink">
      <LlmBlackboxBodyScrollScope />
      <header className="sticky top-0 z-10 border-b border-line/70 bg-white/92 px-xl py-lg shadow-nav backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-md">
          <div>
            <h1 className="font-headline-md text-headline-md font-extrabold text-ink">
              LLM 黑盒审核
            </h1>
            <p className="mt-1 font-body-sm text-body-sm text-muted">
              {fixture.sourcePath} · {fixture.stats.flowCount} flows · {fixture.stats.turnCount} turns
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-sm">
            <Button
              disabled={runner.isRunning || !runner.selectedFlowId}
              onClick={() => void runner.runSingleFlow(runner.selectedFlowId)}
              type="button"
            >
              <SymbolIcon>play_arrow</SymbolIcon>
              运行当前
            </Button>
            <Button
              disabled={runner.isRunning || fixture.flows.length === 0}
              onClick={handleRunAll}
              type="button"
              variant="secondary"
            >
              <SymbolIcon>playlist_play</SymbolIcon>
              运行全部
            </Button>
            <Button
              disabled={!runner.isRunning}
              onClick={runner.stopRun}
              type="button"
              variant="outline"
            >
              <SymbolIcon>stop</SymbolIcon>
              停止
            </Button>
            <Button
              disabled={runner.isRunning || runner.runs.length === 0}
              onClick={runner.clearRuns}
              type="button"
              variant="ghost"
            >
              <SymbolIcon>delete</SymbolIcon>
              清空
            </Button>
          </div>
        </div>
        <RunSelector
          activeRunId={runner.activeRunId}
          runs={runner.runs}
          onSelectRun={runner.setActiveRunId}
        />
      </header>

      <main className="grid items-start gap-lg px-xl py-lg xl:grid-cols-[320px_minmax(0,1fr)_380px]">
        <FlowListPanel
          activeRun={runner.activeRun}
          flows={flowList}
          selectedFlowId={runner.selectedFlow?.id ?? runner.selectedFlowId}
          onRunFlow={(flowId) => void runner.runSingleFlow(flowId)}
          onSelectFlow={(flowId) => {
            runner.setSelectedFlowId(flowId);
            runner.setSelectedTurnKey(null);
          }}
          onSetFlowReviewStatus={runner.setFlowReviewStatus}
          isRunning={runner.isRunning}
        />

        <Card className="rounded-[18px] py-0">
          <CardHeader className="border-b border-line bg-white px-lg py-md">
            <div className="flex items-start justify-between gap-md">
              <div>
                <CardTitle className="text-title-md">
                  {runner.selectedFlow?.id ?? "未选择 flow"}
                </CardTitle>
                <p className="mt-1 font-body-sm text-body-sm text-muted">
                  {runner.selectedFlow?.goal ?? "选择一个 flow 查看转录"}
                </p>
              </div>
              {runner.selectedFlow ? (
                <StatusBadge status={runner.selectedFlow.status} />
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="bg-surface-container-low px-lg py-lg">
            {transcriptMessages.length > 0 ? (
              <ChatTranscript
                className="mx-auto flex max-w-4xl flex-col gap-md"
                messages={transcriptMessages}
              />
            ) : (
              <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-line bg-white p-lg text-center font-body-sm text-body-sm text-muted">
                当前 flow 尚未产生可见转录。运行后会展示用户消息、assistant 文本、训练卡片和建议提问。
              </div>
            )}
          </CardContent>
        </Card>

        <TurnDetailPanel
          activeRunStats={stats}
          selectedTurn={runner.selectedTurn}
          onSelectTurn={(turnIndex) => {
            if (runner.selectedFlow) {
              runner.setSelectedTurnKey({ flowId: runner.selectedFlow.id, turnIndex });
            }
          }}
          selectedFlow={runner.selectedFlow}
          onSetTurnReviewStatus={runner.setTurnReviewStatus}
        />
      </main>
    </div>
  );
}

function RunSelector({
  activeRunId,
  onSelectRun,
  runs,
}: {
  activeRunId: string | null;
  runs: ReturnType<typeof useLlmBlackboxReviewRunner>["runs"];
  onSelectRun: (runId: string) => void;
}) {
  if (runs.length === 0) {
    return null;
  }

  return (
    <div className="mt-md flex flex-wrap items-center gap-sm">
      <span className="font-label-sm text-label-sm font-bold text-muted">运行批次</span>
      {runs.map((run) => (
        <button
          className={`rounded-full border px-sm py-1 font-label-sm text-label-sm transition-colors ${
            run.id === activeRunId
              ? "border-primary bg-primary-soft text-primary"
              : "border-line bg-white text-muted hover:border-primary/35 hover:text-primary"
          }`}
          key={run.id}
          onClick={() => onSelectRun(run.id)}
          type="button"
        >
          {run.mode === "all" ? "全部" : run.selectedFlowIds.join(", ")} · {formatTime(run.startedAt)}
        </button>
      ))}
    </div>
  );
}

function FlowListPanel({
  activeRun,
  flows,
  isRunning,
  onRunFlow,
  onSelectFlow,
  onSetFlowReviewStatus,
  selectedFlowId,
}: {
  activeRun: ReturnType<typeof useLlmBlackboxReviewRunner>["activeRun"];
  flows: LlmBlackboxFlowResult[];
  isRunning: boolean;
  selectedFlowId: string;
  onRunFlow: (flowId: string) => void;
  onSelectFlow: (flowId: string) => void;
  onSetFlowReviewStatus: (flowId: string, status: LlmBlackboxReviewStatus) => void;
}) {
  return (
    <Card className="rounded-[18px] py-0">
      <CardHeader className="border-b border-line px-lg py-md">
        <CardTitle className="text-title-md">Flow 列表</CardTitle>
      </CardHeader>
      <CardContent className="space-y-sm px-md py-md">
        {flows.map((flow) => (
          <div
            className={`rounded-xl border bg-white p-md transition-colors ${
              flow.id === selectedFlowId
                ? "border-primary/45 shadow-[0_10px_24px_rgba(36,89,230,0.12)]"
                : "border-line hover:border-primary/30"
            }`}
            key={flow.id}
          >
            <button
              className="block w-full text-left"
              onClick={() => onSelectFlow(flow.id)}
              type="button"
            >
              <div className="flex items-start justify-between gap-sm">
                <div>
                  <p className="font-label-md text-label-md font-extrabold text-ink">{flow.id}</p>
                  <p className="mt-1 line-clamp-2 font-body-sm text-body-sm leading-relaxed text-muted">
                    {flow.goal}
                  </p>
                </div>
                <StatusBadge status={flow.status} />
              </div>
              <p className="mt-sm font-label-sm text-label-sm text-muted">
                {flow.turns.length} turns · 人工 {reviewStatusLabel(flow.reviewStatus)}
              </p>
            </button>
            <div className="mt-sm flex flex-wrap gap-xs">
              <Button
                disabled={isRunning}
                onClick={() => onRunFlow(flow.id)}
                size="sm"
                type="button"
                variant="outline"
              >
                <SymbolIcon>play_arrow</SymbolIcon>
                运行
              </Button>
              {activeRun?.flows.some((runFlow) => runFlow.id === flow.id) ? (
                reviewOptions.map((option) => (
                  <button
                    className={`rounded-full border px-xs py-1 font-label-xs text-label-xs ${
                      flow.reviewStatus === option.value
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-line bg-surface-container-low text-muted"
                    }`}
                    key={option.value}
                    onClick={() => onSetFlowReviewStatus(flow.id, option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// mergeFixtureFlowsWithRunResults 用完整 fixture 保持左侧列表稳定，只把当前 run 的结果叠加到对应 flow。
export function mergeFixtureFlowsWithRunResults(
  fixtureFlows: BasicChatFlow[],
  runFlows: LlmBlackboxFlowResult[] | undefined,
) {
  const runFlowById = new Map(runFlows?.map((flow) => [flow.id, flow]) ?? []);

  return fixtureFlows.map((flow) => runFlowById.get(flow.id) ?? toQueuedFlowResult(flow));
}

function TurnDetailPanel({
  activeRunStats,
  onSelectTurn,
  onSetTurnReviewStatus,
  selectedFlow,
  selectedTurn,
}: {
  activeRunStats: LlmBlackboxRunStats | null;
  selectedFlow: LlmBlackboxFlowResult | null;
  selectedTurn: LlmBlackboxTurnResult | null;
  onSelectTurn: (turnIndex: number) => void;
  onSetTurnReviewStatus: (flowId: string, turnIndex: number, status: LlmBlackboxReviewStatus) => void;
}) {
  return (
    <div className="space-y-lg">
      <Card className="rounded-[18px] py-0">
        <CardHeader className="border-b border-line px-lg py-md">
          <CardTitle className="text-title-md">统计摘要</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-sm px-lg py-md">
          <Metric label="Flow" value={String(activeRunStats?.flowTotal ?? 0)} />
          <Metric label="Turn" value={String(activeRunStats?.turnTotal ?? 0)} />
          <Metric label="通过" value={String(activeRunStats?.passedTurnCount ?? 0)} />
          <Metric label="失败" value={String(activeRunStats?.failedTurnCount ?? 0)} />
          <Metric label="跳过" value={String(activeRunStats?.skippedTurnCount ?? 0)} />
          <Metric label="停止" value={String(activeRunStats?.cancelledTurnCount ?? 0)} />
          <Metric label="人工通过" value={String(activeRunStats?.acceptedCount ?? 0)} />
          <Metric label="需跟进" value={String(activeRunStats?.needsFollowupCount ?? 0)} />
          <Metric label="耗时" value={formatDuration(activeRunStats?.durationMs ?? 0)} />
          <Metric label="Token" value={formatTokenStats(activeRunStats)} />
        </CardContent>
      </Card>

      <Card className="rounded-[18px] py-0">
        <CardHeader className="border-b border-line px-lg py-md">
          <CardTitle className="text-title-md">Turn 详情</CardTitle>
        </CardHeader>
        <CardContent className="space-y-md px-lg py-md">
          {selectedFlow ? (
            <div className="flex flex-wrap gap-xs">
              {selectedFlow.turns.map((turn) => (
                <button
                  className={`rounded-full border px-sm py-1 font-label-sm text-label-sm ${
                    selectedTurn?.turnIndex === turn.turnIndex
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-line bg-white text-muted"
                  }`}
                  key={turn.id}
                  onClick={() => onSelectTurn(turn.turnIndex)}
                  type="button"
                >
                  T{turn.turnIndex}
                </button>
              ))}
            </div>
          ) : null}

          {selectedTurn ? (
            <>
              <div className="flex items-center justify-between gap-sm">
                <StatusBadge status={selectedTurn.status} />
                <span className="font-label-sm text-label-sm text-muted">
                  {formatDuration(selectedTurn.durationMs ?? 0)}
                </span>
              </div>
              <DetailBlock title="userInput" value={selectedTurn.userInput} />
              <DetailBlock title="expectedOutput" value={selectedTurn.expectedOutput} />
              <DetailBlock
                title="实际输出"
                value={[
                  selectedTurn.assistantText || "(无 assistant 文本)",
                  selectedTurn.visibleOutputKinds.length
                    ? `visibleOutputs: ${selectedTurn.visibleOutputKinds.join(", ")}`
                    : "visibleOutputs: missing",
                  selectedTurn.suggestedQuestions.length
                    ? `suggestedQuestions: ${selectedTurn.suggestedQuestions.join(" / ")}`
                    : "suggestedQuestions: missing",
                ].join("\n")}
              />
              <DetailBlock
                title="诊断"
                value={[
                  `conversationId: ${selectedTurn.conversationId ?? "missing"}`,
                  `responseMessageId: ${selectedTurn.responseMessageId ?? "missing"}`,
                  `eventTypes: ${selectedTurn.eventTypes.join(", ") || "missing"}`,
                  `token: ${formatTurnToken(selectedTurn)}`,
                  selectedTurn.resultReason ? `result: ${selectedTurn.resultReason}` : null,
                  selectedTurn.failureReason ? `failure: ${selectedTurn.failureReason}` : null,
                ].filter(Boolean).join("\n")}
              />
              <div className="space-y-sm">
                <p className="font-label-sm text-label-sm font-bold text-muted">人工审核</p>
                <div className="flex flex-wrap gap-xs">
                  {reviewOptions.map((option) => (
                    <Button
                      key={option.value}
                      onClick={() => onSetTurnReviewStatus(selectedTurn.flowId, selectedTurn.turnIndex, option.value)}
                      size="sm"
                      type="button"
                      variant={selectedTurn.reviewStatus === option.value ? "secondary" : "outline"}
                    >
                      <SymbolIcon>{option.icon}</SymbolIcon>
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="font-body-sm text-body-sm text-muted">选择一个 flow 或 turn 查看详情。</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-sm">
      <p className="font-label-xs text-label-xs font-bold text-muted">{label}</p>
      <p className="mt-1 font-title-md text-title-md font-extrabold text-ink">{value}</p>
    </div>
  );
}

function DetailBlock({ title, value }: { title: string; value: string }) {
  return (
    <section className="rounded-xl border border-line bg-surface-container-low p-md">
      <p className="font-label-sm text-label-sm font-bold text-muted">{title}</p>
      <pre className="mt-sm whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-ink">
        {value}
      </pre>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = getStatusTone(status);

  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-xs py-1 font-label-xs text-label-xs font-bold ${tone}`}>
      {statusLabel(status)}
    </span>
  );
}

function buildTranscriptMessages(flow: LlmBlackboxFlowResult | null): ChatMessage[] {
  if (!flow) {
    return [];
  }

  return flow.turns.flatMap((turn) => {
    if (turn.status === "queued" || turn.status === "skipped") {
      return [];
    }

    const userMessage: ChatMessage = {
      id: `${turn.id}:user`,
      role: "user",
      content: turn.userInput,
      createdAt: turn.startedAt,
    };
    const assistantMessage = turn.assistantMessage ?? (
      turn.status === "running"
        ? {
            id: `${turn.id}:assistant`,
            role: "assistant" as const,
            content: "",
            createdAt: turn.startedAt,
            isReasoning: true,
          }
        : undefined
    );

    return assistantMessage ? [userMessage, assistantMessage] : [userMessage];
  });
}

function toQueuedFlowResult(flow: BasicChatFlow): LlmBlackboxFlowResult {
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

function getStatusTone(status: string) {
  switch (status) {
    case "passed":
    case "completed":
      return "border-green-200 bg-green-50 text-green-700";
    case "failed":
      return "border-red-200 bg-red-50 text-red-700";
    case "running":
      return "border-primary/25 bg-primary-soft text-primary";
    case "skipped":
    case "cancelled":
    case "stopped":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-line bg-surface-container-low text-muted";
  }
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    queued: "排队",
    running: "运行中",
    passed: "通过",
    failed: "失败",
    skipped: "跳过",
    cancelled: "已停止",
    completed: "完成",
    stopped: "停止",
  };

  return labels[status] ?? status;
}

function reviewStatusLabel(status: LlmBlackboxReviewStatus) {
  const labels: Record<LlmBlackboxReviewStatus, string> = {
    unreviewed: "未审",
    accepted: "通过",
    rejected: "拒绝",
    needs_followup: "需跟进",
  };

  return labels[status];
}

function formatDuration(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return "0s";
  }

  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatTime(value: string) {
  const date = new Date(value);

  return Number.isFinite(date.getTime())
    ? `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`
    : value;
}

function formatTokenStats(stats: LlmBlackboxRunStats | null) {
  if (!stats) {
    return "missing";
  }

  if (stats.tokenUsage) {
    return String(stats.tokenUsage.totalTokens);
  }

  return `missing ${stats.tokenMissingCount}`;
}

function formatTurnToken(turn: LlmBlackboxTurnResult) {
  if (!turn.tokenDiagnostics) {
    return "missing";
  }

  if (turn.tokenDiagnostics.status !== "available") {
    return `${turn.tokenDiagnostics.status}${turn.tokenDiagnostics.reason ? ` (${turn.tokenDiagnostics.reason})` : ""}`;
  }

  return `total=${turn.tokenDiagnostics.usage?.totalTokens ?? 0}, prompt=${turn.tokenDiagnostics.usage?.promptTokens ?? 0}, completion=${turn.tokenDiagnostics.usage?.completionTokens ?? 0}`;
}
