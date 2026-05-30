"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { AiTrace, AiTraceStep } from "@/lib/server/dev/ai-trace-store";

type TraceResponse = {
  ok: boolean;
  traces?: AiTrace[];
  error?: string;
};

type SaveLogResponse = {
  ok: boolean;
  path?: string;
  error?: string;
};

type TraceStepGroup = {
  id: string;
  title: string;
  description: string;
  placement: "main_flow" | "out_of_flow";
  status: AiTrace["status"];
  steps: AiTraceStep[];
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
};

type TokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export function AiTraceViewer() {
  const [traces, setTraces] = useState<AiTrace[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [savingLogTarget, setSavingLogTarget] = useState<string | null>(null);
  const [saveLogMessage, setSaveLogMessage] = useState<string | null>(null);
  const lastAutoRefreshAtRef = useRef(0);

  const selectedTrace = useMemo(
    () => traces.find((trace) => trace.id === selectedTraceId) ?? traces[0] ?? null,
    [selectedTraceId, traces],
  );
  const selectedStepGroups = useMemo(
    () => (selectedTrace ? groupTraceSteps(selectedTrace.steps) : []),
    [selectedTrace],
  );
  const mainStepGroups = useMemo(
    () => selectedStepGroups.filter((group) => group.placement === "main_flow"),
    [selectedStepGroups],
  );
  const outOfFlowGroups = useMemo(
    () => selectedStepGroups.filter((group) => group.placement === "out_of_flow"),
    [selectedStepGroups],
  );
  const flowSwitchGroups = useMemo(
    () => [...mainStepGroups, ...outOfFlowGroups],
    [mainStepGroups, outOfFlowGroups],
  );
  const selectedGroup = useMemo(
    () => flowSwitchGroups.find((group) => group.id === selectedGroupId) ?? flowSwitchGroups[0] ?? null,
    [selectedGroupId, flowSwitchGroups],
  );

  const loadTraces = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/dev/ai-traces", {
        cache: "no-store",
      });
      const data = (await response.json()) as TraceResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Failed to load AI traces.");
      }

      setTraces(data.traces ?? []);
      setSelectedTraceId((current) => current ?? data.traces?.[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load AI traces.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const autoRefreshTraces = useCallback(() => {
    const now = Date.now();

    if (now - lastAutoRefreshAtRef.current < 500) {
      return;
    }

    lastAutoRefreshAtRef.current = now;
    void loadTraces();
  }, [loadTraces]);

  async function clearTraces() {
    await fetch("/api/dev/ai-traces", {
      method: "DELETE",
    });
    setTraces([]);
    setSelectedTraceId(null);
  }

  async function saveTraceLog(input: {
    targetId: string;
    target: Record<string, unknown>;
    payload: Record<string, unknown>;
  }) {
    setSavingLogTarget(input.targetId);
    setSaveLogMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/dev/ai-traces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target: input.target,
          payload: input.payload,
        }),
      });
      const data = (await response.json()) as SaveLogResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Failed to save AI trace log.");
      }

      setSaveLogMessage(`已保存到 ${data.path}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save AI trace log.");
    } finally {
      setSavingLogTarget(null);
    }
  }

  useEffect(() => {
    const initialRefreshTimer = window.setTimeout(() => {
      autoRefreshTraces();
    }, 0);

    function refreshWhenPageBecomesVisible() {
      if (document.visibilityState === "visible") {
        autoRefreshTraces();
      }
    }

    function refreshWhenWindowFocuses() {
      autoRefreshTraces();
    }

    document.addEventListener("visibilitychange", refreshWhenPageBecomesVisible);
    window.addEventListener("focus", refreshWhenWindowFocuses);

    return () => {
      window.clearTimeout(initialRefreshTimer);
      document.removeEventListener("visibilitychange", refreshWhenPageBecomesVisible);
      window.removeEventListener("focus", refreshWhenWindowFocuses);
    };
  }, [autoRefreshTraces]);

  return (
    <main className="flex h-screen bg-[#f6f8fb] text-slate-950">
      <aside className="flex w-[380px] shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold">AI Trace</h1>
              <p className="mt-1 text-xs text-slate-500">开发环境内置流程日志</p>
            </div>
            <button
              className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              type="button"
              onClick={() => void loadTraces()}
            >
              {isLoading ? "刷新中" : "刷新"}
            </button>
          </div>
          {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
          {saveLogMessage ? <p className="mt-3 break-words text-xs text-emerald-700">{saveLogMessage}</p> : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {traces.length === 0 ? (
            <div className="px-5 py-8 text-sm text-slate-500">还没有 Trace。发起一次聊天后这里会自动出现记录。</div>
          ) : (
            traces.map((trace) => (
              <button
                className={`block w-full border-b border-slate-100 px-5 py-4 text-left hover:bg-slate-50 ${
                  selectedTrace?.id === trace.id ? "bg-slate-100" : "bg-white"
                }`}
                key={trace.id}
                type="button"
                onClick={() => setSelectedTraceId(trace.id)}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-semibold">{trace.title}</span>
                  <StatusBadge status={trace.status} />
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <span>{trace.route}</span>
                  <span>{formatDuration(trace.durationMs)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                  <TokenUsageBadges usage={getTraceTokenUsage(trace)} compact />
                </div>
                <div className="mt-1 text-xs text-slate-400">{formatTime(trace.createdAt)}</div>
              </button>
            ))
          )}
        </div>

        <div className="border-t border-slate-200 p-4">
          <button
            className="w-full rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={traces.length === 0}
            onClick={() => void clearTraces()}
          >
            清空 Trace
          </button>
        </div>
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto">
        {selectedTrace ? (
          <div className="mx-auto max-w-[1600px] px-8 py-7">
            <TraceHero
              trace={selectedTrace}
              groups={mainStepGroups}
              isSaving={savingLogTarget === selectedTrace.id}
              onSaveLog={() => {
                void saveTraceLog({
                  targetId: selectedTrace.id,
                  target: {
                    type: "full_trace",
                    traceId: selectedTrace.id,
                    title: selectedTrace.title,
                  },
                  payload: createTraceLogPayload(selectedTrace, selectedStepGroups),
                });
              }}
            />

            <div className="mt-5 min-w-0 space-y-5">
              <TraceOverview trace={selectedTrace} />
              <TraceFlowNavigator
                groups={flowSwitchGroups}
                selectedGroupId={selectedGroup?.id ?? null}
                onSelect={setSelectedGroupId}
              />
              {selectedGroup ? (
                <StageInspector
                  trace={selectedTrace}
                  group={selectedGroup}
                  isSavingGroup={savingLogTarget === selectedGroup.id}
                  savingLogTarget={savingLogTarget}
                  onSaveGroupLog={() => {
                    void saveTraceLog({
                      targetId: selectedGroup.id,
                      target: {
                        type: "step_group",
                        traceId: selectedTrace.id,
                        groupId: selectedGroup.id,
                        title: selectedGroup.title,
                      },
                      payload: createGroupLogPayload(selectedTrace, selectedGroup),
                    });
                  }}
                  onSaveStepLog={(step) => {
                    void saveTraceLog({
                      targetId: step.id,
                      target: {
                        type: "step_event",
                        traceId: selectedTrace.id,
                        stepId: step.id,
                        title: getStepTitle(step),
                      },
                      payload: createStepLogPayload(selectedTrace, selectedGroup, step),
                    });
                  }}
                />
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
                  这条 Trace 还没有记录步骤。
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            选择一条 Trace 查看详情。
          </div>
        )}
      </section>
    </main>
  );
}

function TraceHero({
  trace,
  groups,
  isSaving,
  onSaveLog,
}: {
  trace: AiTrace;
  groups: TraceStepGroup[];
  isSaving: boolean;
  onSaveLog: () => void;
}) {
  const tokenUsage = getTraceTokenUsage(trace);

  return (
    <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold text-slate-950">{trace.title}</h2>
            <StatusBadge status={trace.status} />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            这条链路从请求入口开始，依次展示意图理解、动作候选、模型生成、服务端校验和最终返回。会话记忆更新单独放在流程外，避免和本轮回复生成混在一起。
          </p>
        </div>
        <button
          className="shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          disabled={isSaving}
          onClick={onSaveLog}
        >
          {isSaving ? "保存中" : "保存全链路log"}
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="接口路径" value={trace.route} description="本次 trace 关联的服务端入口。" />
        <MetricCard label="流程阶段" value={`${groups.length} 个`} description="按业务链路归并后的主要步骤。" />
        <MetricCard label="总耗时" value={formatDuration(trace.durationMs)} description="trace 从创建到结束的总耗时。" />
        <MetricCard
          label="Token"
          value={tokenUsage?.total_tokens ? formatNumber(tokenUsage.total_tokens) : "-"}
          description="模型输入和输出 token 合计。"
        />
      </div>
    </header>
  );
}

function MetricCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>
    </div>
  );
}

function TraceOverview({ trace }: { trace: AiTrace }) {
  const items = getTraceOverviewItems(trace);

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <SectionHeader
        eyebrow="Request"
        title="请求概览"
        description="先确认这次请求的入口、状态、时间、token 和 trace metadata，避免直接陷入原始 JSON。"
      />
      <div className="grid auto-rows-fr gap-3 border-t border-slate-100 p-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        {items.map((item) => (
          <FieldExplanationCard item={item} key={item.key} />
        ))}
      </div>
      {trace.metadata && !isEmptyValue(trace.metadata) ? (
        <div className="border-t border-slate-100 p-4">
          <TraceDataPanel title="原始 metadata" value={trace.metadata} defaultOpen={false} />
        </div>
      ) : null}
    </section>
  );
}

function TraceFlowNavigator({
  groups,
  selectedGroupId,
  onSelect,
}: {
  groups: TraceStepGroup[];
  selectedGroupId: string | null;
  onSelect: (groupId: string) => void;
}) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <SectionHeader
        eyebrow="Flow"
        title="流程步骤"
        description="按一次 AI 请求的主链路切换查看；会话记忆更新作为后处理模块，排在接口返回之后。"
      />
      <div className="space-y-3 border-t border-slate-100 p-4">
        {groups.map((group, index) => {
          const isSelected = group.id === selectedGroupId;
          const usage = getGroupTokenUsage(group);
          const isOutOfFlow = group.placement === "out_of_flow";
          const showOutOfFlowDivider = isOutOfFlow && groups[index - 1]?.placement !== "out_of_flow";
          const mainFlowIndex = groups.slice(0, index + 1).filter((item) => item.placement === "main_flow").length;

          return (
            <div className="min-w-0" key={group.id}>
              {showOutOfFlowDivider ? (
                <div className="mb-3 flex items-center gap-4 pt-1">
                  <div className="h-px flex-1 bg-slate-200" />
                  <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                    后处理模块
                  </div>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
              ) : null}
              <button
                className={`grid min-h-[92px] w-full min-w-0 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-4 rounded-xl border px-4 py-3 text-left transition ${
                  isSelected
                    ? "border-blue-300 bg-blue-50"
                    : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"
                }`}
                type="button"
                onClick={() => onSelect(group.id)}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    isSelected
                      ? "bg-blue-600 text-white"
                      : isOutOfFlow
                        ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100"
                        : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {isOutOfFlow ? "后" : mainFlowIndex}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-950">{group.title}</span>
                    <StatusDot status={group.status} />
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{group.description}</div>
                  {isOutOfFlow ? (
                    <span className="mt-2 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-blue-100">
                      后处理模块
                    </span>
                  ) : null}
                </div>
                <div className="flex max-w-[520px] flex-wrap justify-end gap-1.5 text-[11px] text-slate-500">
                  <Pill>{group.steps.length} 条事件</Pill>
                  <Pill>{formatDuration(group.durationMs)}</Pill>
                  <TokenUsageBadges usage={usage} compact />
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StageInspector({
  trace,
  group,
  isSavingGroup,
  savingLogTarget,
  onSaveGroupLog,
  onSaveStepLog,
}: {
  trace: AiTrace;
  group: TraceStepGroup;
  isSavingGroup: boolean;
  savingLogTarget: string | null;
  onSaveGroupLog: () => void;
  onSaveStepLog: (step: AiTraceStep) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-950">{group.title}</h3>
            <StatusBadge status={group.status} />
            <Pill>{group.steps.length} 条事件</Pill>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">{group.description}</p>
        </div>
        <button
          className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          disabled={isSavingGroup}
          onClick={onSaveGroupLog}
        >
          {isSavingGroup ? "保存中" : "保存阶段log"}
        </button>
      </div>

      <div className="grid gap-3 border-t border-slate-100 p-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="开始时间" value={formatTime(group.startedAt)} description="该阶段第一条事件的开始时间。" />
        <MetricCard label="阶段耗时" value={formatDuration(group.durationMs)} description="该阶段事件的合计或首尾耗时。" />
        <MetricCard label="阶段状态" value={getStatusLabel(group.status)} description={getStatusDescription(group.status)} />
        <MetricCard
          label="Token 合计"
          value={getGroupTokenUsage(group)?.total_tokens ? formatNumber(getGroupTokenUsage(group)?.total_tokens ?? 0) : "-"}
          description="该阶段内模型事件上报的 token 总量。"
        />
      </div>

      <div className="space-y-4 border-t border-slate-100 p-4">
        {group.steps.map((step, index) => (
          <TraceStepDetail
            key={step.id}
            step={step}
            steps={group.steps}
            index={index}
            isSaving={savingLogTarget === step.id}
            onSaveLog={() => onSaveStepLog(step)}
          />
        ))}
      </div>

      <div className="border-t border-slate-100 p-4">
        <TraceDataPanel
          title={`原始阶段数据：${trace.title} / ${group.title}`}
          value={createGroupLogPayload(trace, group)}
          defaultOpen={false}
        />
      </div>
    </section>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="p-5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">{eyebrow}</div>
      <h3 className="mt-1 text-base font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

type FieldExplanationItem = {
  key: string;
  label: string;
  value: string;
  description: string;
};

function FieldExplanationCard({ item }: { item: FieldExplanationItem }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-700">{item.label}</div>
          <div className="mt-1 break-words text-sm font-medium leading-6 text-slate-950">{item.value}</div>
        </div>
        <code className="max-w-full break-words rounded-md bg-white px-1.5 py-1 text-[11px] leading-5 text-slate-500 ring-1 ring-slate-200">
          {item.key}
        </code>
      </div>
      <div className="mt-2 text-xs leading-5 text-slate-500">{item.description}</div>
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 ring-1 ring-slate-200">
      {children}
    </span>
  );
}

function createTraceLogPayload(trace: AiTrace, groups: TraceStepGroup[]) {
  return compactObject({
    title: trace.title,
    trace: compactObject({
      runId: trace.runId,
      route: trace.route,
      status: trace.status,
      createdAt: trace.createdAt,
      endedAt: trace.endedAt,
      durationMs: trace.durationMs,
      userId: trace.userId,
      sessionId: trace.sessionId,
      messageId: trace.messageId,
      model: trace.model,
      promptVersion: trace.promptVersion,
      toolVersions: compactValue(trace.toolVersions),
      input: compactValue(trace.input),
      finalDecision: compactValue(trace.finalDecision),
      tokenUsage: getTraceTokenUsage(trace),
      metadata: compactValue(trace.metadata),
    }),
    stages: groups.map((group, index) => createStageLogEntry(group, index)),
  });
}

function createGroupLogPayload(trace: AiTrace, group: TraceStepGroup) {
  return createStepsLogPayload({
    title: `${trace.title} - ${group.title}`,
    steps: group.steps,
  });
}

function createStepLogPayload(trace: AiTrace, group: TraceStepGroup, step: AiTraceStep) {
  return createStepsLogPayload({
    title: `${trace.title} - ${group.title} - ${getStepTitle(step)}`,
    steps: [step],
  });
}

// 保存给 Codex 排查用的日志时，只保留链路定位、模型输入输出、候选/校验结果和错误详情。
function createStepsLogPayload(input: { title: string; steps: AiTraceStep[] }) {
  return compactObject({
    title: input.title,
    events: input.steps.map(createStepLogEntry),
  });
}

function createStageLogEntry(group: TraceStepGroup, index: number) {
  return compactObject({
    order: index + 1,
    stage: group.title,
    description: group.description,
    status: group.status,
    startedAt: group.startedAt,
    endedAt: group.endedAt,
    durationMs: group.durationMs,
    tokenUsage: getGroupTokenUsage(group),
    events: group.steps.map(createStepLogEntry),
  });
}

function createStepLogEntry(step: AiTraceStep) {
  const task = getStepTask(step);
  const tokenUsage = getTokenUsage(step);
  const diagnosticMetadata = getDiagnosticMetadata(step.metadata);

  return compactObject({
    step: getStepTitle(step),
    type: step.type,
    typeLabel: getStepTypeLabel(step.type),
    status: step.status,
    startedAt: step.startedAt,
    endedAt: step.endedAt,
    durationMs: step.durationMs,
    task,
    tokenUsage,
    inputTitle: isEmptyValue(step.input) ? undefined : getInputTitle(step),
    input: compactValue(step.input),
    outputTitle: isEmptyValue(step.output) ? undefined : getOutputTitle(step),
    output: compactValue(step.output),
    error: compactValue(step.error),
    metadata: diagnosticMetadata,
  });
}

function getDiagnosticMetadata(metadata: AiTraceStep["metadata"]) {
  if (!metadata || isEmptyValue(metadata)) {
    return undefined;
  }

  return compactObject(
    Object.fromEntries(
      Object.entries(metadata).filter(([key]) => !["task", "tokenUsage"].includes(key)),
    ),
  );
}

function compactObject<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => !isEmptyValue(item)),
  );
}

function compactValue(value: unknown): unknown {
  if (isEmptyValue(value)) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const items: unknown[] = value
      .map((item): unknown => compactValue(item))
      .filter((item) => !isEmptyValue(item));

    return items.length > 0 ? items : undefined;
  }

  if (!isRecord(value)) {
    return value;
  }

  if (isCandidateRecord(value)) {
    return compactCandidateRecord(value);
  }

  if (isExerciseRecord(value)) {
    return compactExerciseRecord(value);
  }

  return compactObject(
    Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, compactValue(item)]),
    ),
  );
}

function compactCandidateRecord(value: Record<string, unknown>): Record<string, unknown> {
  const exercise: unknown = isRecord(value.exercise) ? compactExerciseRecord(value.exercise) : undefined;

  return compactObject({
    exercise,
    score: value.score,
    source: value.source,
    reasons: compactValue(value.reasons),
    candidateSource: value.candidateSource,
    candidateScore: value.candidateScore,
    candidateReasons: compactValue(value.candidateReasons),
  });
}

function compactExerciseRecord(value: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    exerciseId: getExerciseId(value),
    nameZh: value.nameZh,
    categoryZh: value.categoryZh,
    level: value.level,
    equipmentZh: value.equipmentZh,
    primaryMusclesZh: compactValue(value.primaryMusclesZh),
    riskTags: compactValue(value.riskTags),
    goalTags: compactValue(value.goalTags),
    reasons: compactValue(value.reasons),
    candidateSource: value.candidateSource,
    candidateScore: value.candidateScore,
    candidateReasons: compactValue(value.candidateReasons),
  });
}

function getExerciseId(value: Record<string, unknown>) {
  const id = value.exerciseId ?? value.id ?? value.sourceId;

  return typeof id === "string" ? id : undefined;
}

function isCandidateRecord(value: Record<string, unknown>) {
  return isRecord(value.exercise);
}

function isExerciseRecord(value: Record<string, unknown>) {
  return (
    getExerciseId(value) !== undefined &&
    (
      typeof value.nameZh === "string" ||
      typeof value.nameEn === "string" ||
      Array.isArray(value.instructionsZh) ||
      Array.isArray(value.imageUrls)
    )
  );
}

function TraceStepDetail({
  step,
  steps,
  index,
  isSaving,
  onSaveLog,
}: {
  step: AiTraceStep;
  steps: AiTraceStep[];
  index: number;
  isSaving: boolean;
  onSaveLog: () => void;
}) {
  const title = getStepTitle(step);
  const summary = getStepSummary(step);
  const debugMetadata = getDisplayableMetadata(step.metadata);
  const tokenUsage = getVisibleStepTokenUsage(steps, index);

  return (
    <details className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <summary className="flex cursor-pointer items-start justify-between gap-4 bg-slate-50 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">{index + 1}</span>
            <span className="truncate text-sm font-semibold text-slate-800">{title}</span>
            <span className="rounded bg-white px-2 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
              {getStepTypeLabel(step.type)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
            <span>{summary}</span>
            <span>{formatTime(step.startedAt)}</span>
            <span>{formatDuration(step.durationMs)}</span>
            <TokenUsageBadges usage={tokenUsage} labelPrefix="本次" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="rounded-md border border-blue-200 bg-white px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={isSaving}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSaveLog();
            }}
          >
            {isSaving ? "保存中" : "保存log"}
          </button>
          <StatusBadge status={step.status} />
        </div>
      </summary>
      <div className="space-y-4 p-4">
        <StepSummaryCards step={step} tokenUsage={tokenUsage} />
        <StepInterpretation step={step} tokenUsage={tokenUsage} />
        <div className="space-y-4">
          {!isEmptyValue(step.output) ? (
            <TraceDataPanel title={getOutputTitle(step)} value={step.output} />
          ) : null}
          {!isEmptyValue(step.error) ? (
            <TraceDataPanel title="错误详情" value={step.error} defaultOpen />
          ) : null}
          {!isEmptyValue(step.input) ? (
            <TraceDataPanel title={getInputTitle(step)} value={step.input} />
          ) : null}
          {debugMetadata ? (
            <TraceDataPanel title="调试信息" value={debugMetadata} />
          ) : null}
        </div>
      </div>
    </details>
  );
}

function StepInterpretation({
  step,
  tokenUsage,
}: {
  step: AiTraceStep;
  tokenUsage: TokenUsage | null;
}) {
  const items = getStepExplanationItems(step, tokenUsage);
  const interpretation = getStepInterpretation(step);

  if (items.length === 0 && !interpretation) {
    return null;
  }

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-950">结果解释</div>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            这里把该事件的主要字段翻译成调试语义；未覆盖字段仍可在下方原始 JSON 中查看。
          </p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700 ring-1 ring-blue-100">
          {getStepTypeLabel(step.type)}
        </span>
      </div>
      {interpretation ? (
        <div className="mt-3 rounded-lg border border-blue-100 bg-white p-3 text-sm leading-6 text-slate-700">
          {interpretation}
        </div>
      ) : null}
      {items.length > 0 ? (
        <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
          {items.map((item) => (
            <FieldExplanationCard item={item} key={`${step.id}-${item.key}`} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StepSummaryCards({
  step,
  tokenUsage,
}: {
  step: AiTraceStep;
  tokenUsage: TokenUsage | null;
}) {
  const items = getStepSummaryItems(step, tokenUsage);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2" key={item.label}>
          <div className="text-[11px] font-medium text-slate-500">{item.label}</div>
          <div className="mt-1 truncate text-sm font-semibold text-slate-900">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function TokenUsageBadges({
  usage,
  compact = false,
  labelPrefix = "",
}: {
  usage: TokenUsage | null;
  compact?: boolean;
  labelPrefix?: string;
}) {
  if (!usage) {
    return null;
  }

  const labelClassName = compact ? "px-1.5 py-0.5" : "px-2 py-0.5";
  const prefix = labelPrefix ? `${labelPrefix}` : "";

  return (
    <>
      {typeof usage.prompt_tokens === "number" ? (
        <span className={`rounded bg-blue-50 font-medium text-blue-700 ring-1 ring-blue-100 ${labelClassName}`}>
          {prefix}输入 token {formatNumber(usage.prompt_tokens)}
        </span>
      ) : null}
      {typeof usage.completion_tokens === "number" ? (
        <span className={`rounded bg-emerald-50 font-medium text-emerald-700 ring-1 ring-emerald-100 ${labelClassName}`}>
          {prefix}输出 token {formatNumber(usage.completion_tokens)}
        </span>
      ) : null}
      {typeof usage.total_tokens === "number" ? (
        <span className={`rounded bg-slate-100 font-medium text-slate-700 ring-1 ring-slate-200 ${labelClassName}`}>
          {prefix}总 token {formatNumber(usage.total_tokens)}
        </span>
      ) : null}
    </>
  );
}

function getTraceTokenUsage(trace: AiTrace) {
  const totals = trace.steps.reduce<TokenUsage>((sum, step) => {
    const usage = getTokenUsage(step);

    if (!usage) {
      return sum;
    }

    return {
      prompt_tokens: addOptionalNumbers(sum.prompt_tokens, usage.prompt_tokens),
      completion_tokens: addOptionalNumbers(sum.completion_tokens, usage.completion_tokens),
      total_tokens: addOptionalNumbers(sum.total_tokens, usage.total_tokens),
    };
  }, {});

  return hasTokenUsage(totals) ? totals : null;
}

function getGroupTokenUsage(group: TraceStepGroup) {
  const totals = group.steps.reduce<TokenUsage>((sum, step) => {
    const usage = getTokenUsage(step);

    if (!usage) {
      return sum;
    }

    return {
      prompt_tokens: addOptionalNumbers(sum.prompt_tokens, usage.prompt_tokens),
      completion_tokens: addOptionalNumbers(sum.completion_tokens, usage.completion_tokens),
      total_tokens: addOptionalNumbers(sum.total_tokens, usage.total_tokens),
    };
  }, {});

  return hasTokenUsage(totals) ? totals : null;
}

function hasTokenUsage(usage: TokenUsage) {
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

function TraceDataPanel({
  title,
  value,
  defaultOpen = true,
}: {
  title: string;
  value: unknown;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white"
      open={defaultOpen}
    >
      <summary className="cursor-pointer bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50">
        {title}
      </summary>
      <div className="border-t border-slate-100 p-3">
        <ReadableBlock title="" value={value} />
      </div>
    </details>
  );
}

function ReadableBlock({ title, value }: { title: string; value: unknown }) {
  if (isModelPayload(value)) {
    return <ModelPayloadBlock title={title} value={value} />;
  }

  if (isContentPayload(value)) {
    return <ContentPayloadBlock title={title} value={value} />;
  }

  if (typeof value === "string") {
    return <TextBlock title={title} value={value} />;
  }

  return <JsonBlock title={title} value={value} />;
}

function ModelPayloadBlock({ title, value }: { title: string; value: ModelPayload }) {
  const rest = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "messages"),
  );
  const configItems = getModelConfigItems(rest);

  return (
    <div className="min-w-0 space-y-4 lg:col-span-2">
      {title ? <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div> : null}
      {configItems.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-950">调用配置</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            这些字段决定模型、输出格式、是否流式返回和推理开关，是排查模型行为的第一入口。
          </p>
          <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
            {configItems.map((item) => (
              <FieldExplanationCard item={item} key={item.key} />
            ))}
          </div>
          {Object.keys(rest).length > 0 ? (
            <div className="mt-3">
              <TraceDataPanel title="原始调用配置" value={rest} defaultOpen={false} />
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="space-y-3">
        <div>
          <div className="text-sm font-semibold text-slate-950">消息列表</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            按发送给模型的顺序展示。system 通常是规则，user 是用户输入或上下文，assistant 是历史回复。
          </p>
        </div>
        {value.messages.map((message, index) => (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white" key={index}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                  {index + 1}
                </span>
                <span className="text-sm font-semibold text-slate-700">{message.role}</span>
              </div>
              <span className="text-xs text-slate-500">{getMessageRoleDescription(message.role)}</span>
            </div>
            <pre className="max-h-[70dvh] whitespace-pre-wrap break-words overflow-auto p-5 text-sm leading-7 text-slate-800">
              {message.content}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContentPayloadBlock({ title, value }: { title: string; value: ContentPayload }) {
  return (
    <div className="min-w-0 space-y-4 lg:col-span-2">
      {title ? <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div> : null}
      {typeof value.content === "string" ? (
        <TextBlock title="回复内容" value={value.content || "（空）"} />
      ) : null}
      {typeof value.reasoning === "string" && value.reasoning ? (
        <TextBlock title="推理内容" value={value.reasoning} />
      ) : null}
      {Object.entries(value).some(([key]) => key !== "content" && key !== "reasoning") ? (
        <JsonBlock
          title="其他字段"
          value={Object.fromEntries(
            Object.entries(value).filter(([key]) => key !== "content" && key !== "reasoning"),
          )}
        />
      ) : null}
    </div>
  );
}

function TextBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="min-w-0">
      {title ? <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div> : null}
      <pre className="max-h-[70dvh] whitespace-pre-wrap break-words overflow-auto rounded-md border border-slate-200 bg-white p-5 text-sm leading-7 text-slate-800">
        {value}
      </pre>
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="min-w-0">
      {title ? <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div> : null}
      <pre className="max-h-[70dvh] overflow-auto rounded-md bg-slate-950 p-5 text-xs leading-6 text-slate-100">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

type ModelPayload = {
  messages: Array<{
    role: string;
    content: string;
  }>;
} & Record<string, unknown>;

type ContentPayload = {
  content?: unknown;
  reasoning?: unknown;
} & Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isModelPayload(value: unknown): value is ModelPayload {
  if (!isRecord(value) || !Array.isArray(value.messages)) {
    return false;
  }

  return value.messages.every(
    (message) =>
      isRecord(message) &&
      typeof message.role === "string" &&
      typeof message.content === "string",
  );
}

function isContentPayload(value: unknown): value is ContentPayload {
  return isRecord(value) && (typeof value.content === "string" || typeof value.reasoning === "string");
}

export function groupTraceSteps(steps: AiTraceStep[]): TraceStepGroup[] {
  const groupMap = new Map<string, TraceStepGroup>();

  for (const step of steps) {
    const definition = getStepGroupDefinition(step);
    const group = groupMap.get(definition.id);

    if (group) {
      group.steps.push(step);
      group.status = mergeStatus(group.status, step.status);
      group.startedAt = minIsoTime(group.startedAt, step.startedAt);
      group.endedAt = maxIsoTime(group.endedAt, step.endedAt);
      group.durationMs = getGroupDuration(group);
      continue;
    }

    groupMap.set(definition.id, {
      ...definition,
      status: step.status,
      steps: [step],
      startedAt: step.startedAt,
      endedAt: step.endedAt,
      durationMs: step.durationMs,
    });
  }

  return [...groupMap.values()].map((group) => ({
    ...group,
    durationMs: getGroupDuration(group),
  }));
}

function getStepGroupDefinition(step: AiTraceStep) {
  if (step.type === "user_input") {
    return {
      id: "01_user_input",
      title: "用户输入",
      description: "本次请求的消息、开关和接口入参",
      placement: "main_flow" as const,
    };
  }

  if (isConversationMemoryStep(step)) {
    return {
      id: "80_conversation_memory",
      title: "会话记忆更新",
      description: "根据本轮对话更新下一轮可用的上下文摘要",
      placement: "out_of_flow" as const,
    };
  }

  if (step.type === "intent" || getStepTask(step) === "intent_extraction" || step.name.includes("意图")) {
    return {
      id: "02_intent",
      title: "意图理解",
      description: "识别目标、训练类型、限制条件和兜底结果",
      placement: "main_flow" as const,
    };
  }

  if (step.type === "reference_resolution") {
    return {
      id: "03_reference_resolution",
      title: "引用解析",
      description: "将这套、刚才、上一个等自然语言引用收敛到当前用户可访问的 artifact",
      placement: "main_flow" as const,
    };
  }

  if (step.type === "tool_call") {
    return {
      id: "04_tool_call",
      title: "受控工具调用",
      description: "记录 searchArtifacts、getArtifactPayload 等服务端工具的输入摘要、输出摘要和失败原因",
      placement: "main_flow" as const,
    };
  }

  if (step.type === "exercise_lookup" || step.type === "candidate_selection") {
    return {
      id: "05_candidates",
      title: "动作候选",
      description: "读取动作库并按目标、器械、风险过滤候选",
      placement: "main_flow" as const,
    };
  }

  if (step.type === "patch_proposal") {
    return {
      id: "06_patch",
      title: "Patch 提出与应用",
      description: "记录训练卡片局部修改的 scope、operation、目标摘要、diff 和失败原因",
      placement: "main_flow" as const,
    };
  }

  if (step.type === "validation" || step.name.includes("校验")) {
    return {
      id: "07_validation",
      title: "服务端校验",
      description: "校验计划结构、动作 ID、候选范围和训练规则",
      placement: "main_flow" as const,
    };
  }

  if (getStepTask(step) === "draft_generation" || step.name.includes("草稿")) {
    return {
      id: "06_draft",
      title: "计划草稿生成",
      description: "调用模型生成结构化训练计划草稿",
      placement: "main_flow" as const,
    };
  }

  if (step.type === "persistence") {
    return {
      id: "08_persistence",
      title: "持久化",
      description: "记录 artifact revision、训练草稿或上下文保存结果",
      placement: "main_flow" as const,
    };
  }

  if (step.type === "response_write") {
    return {
      id: "09_response_write",
      title: "响应写入",
      description: "记录流式响应、确定性回复、done 事件和上下文总结写入结果",
      placement: "main_flow" as const,
    };
  }

  if (step.type === "final_response") {
    return {
      id: "10_final_response",
      title: "接口返回",
      description: "返回给前端的最终结果",
      placement: "main_flow" as const,
    };
  }

  if (step.type === "model_request" || step.type === "model_response") {
    return {
      id: "06_model_response",
      title: "回复生成",
      description: "生成聊天回复或模型中间输出",
      placement: "main_flow" as const,
    };
  }

  return {
    id: step.type === "error" ? "99_error" : `90_${step.type}`,
    title: step.type === "error" ? "异常处理" : getStepTypeLabel(step.type),
    description: step.type === "error" ? "请求失败、模型失败或流式读取失败" : "其他调试事件",
    placement: "main_flow" as const,
  };
}

function isConversationMemoryStep(step: AiTraceStep) {
  return step.name.includes("聊天上下文总结");
}

function getStepTitle(step: AiTraceStep) {
  const task = getStepTask(step);

  if (task === "intent_extraction") {
    return step.type === "model_request" ? "训练计划意图提取请求" : "训练计划意图提取输出";
  }

  if (task === "draft_generation") {
    return step.type === "model_request" ? "训练计划草稿生成请求" : "训练计划草稿模型输出";
  }

  return step.name
    .replace("第一次大模型回复：", "")
    .replace("大模型调用参数", "模型请求")
    .replace("大模型回答", "模型输出");
}

function getStepSummary(step: AiTraceStep) {
  const task = getStepTask(step);

  if (task) {
    return `task: ${task}`;
  }

  if (step.status === "failed") {
    return "失败事件，展开查看错误详情";
  }

  if (step.type === "user_input") {
    return "请求入口数据";
  }

  return getStepTypeLabel(step.type);
}

function getStepSummaryItems(step: AiTraceStep, tokenUsage: TokenUsage | null) {
  const output = isRecord(step.output) ? step.output : null;
  const input = isRecord(step.input) ? step.input : null;
  const metadata = isRecord(step.metadata) ? step.metadata : null;
  const items: Array<{ label: string; value: string }> = [];

  if (typeof tokenUsage?.prompt_tokens === "number") {
    items.push({ label: "输入 token", value: formatNumber(tokenUsage.prompt_tokens) });
  }

  if (typeof tokenUsage?.completion_tokens === "number") {
    items.push({ label: "输出 token", value: formatNumber(tokenUsage.completion_tokens) });
  }

  if (typeof tokenUsage?.total_tokens === "number") {
    items.push({ label: "总 token", value: formatNumber(tokenUsage.total_tokens) });
  }

  if (metadata?.task && typeof metadata.task === "string") {
    items.push({ label: "任务", value: getTaskLabel(metadata.task) });
  }

  if (typeof metadata?.timeoutMs === "number") {
    items.push({ label: "超时", value: formatDuration(metadata.timeoutMs) });
  }

  if (typeof metadata?.status === "number") {
    items.push({ label: "HTTP 状态", value: String(metadata.status) });
  }

  if (typeof metadata?.status === "string") {
    items.push({ label: "状态", value: metadata.status });
  }

  if (typeof metadata?.toolName === "string") {
    items.push({ label: "工具", value: metadata.toolName });
  }

  if (typeof metadata?.code === "string") {
    items.push({ label: "错误码", value: metadata.code });
  }

  if (typeof metadata?.operation === "string") {
    items.push({ label: "Patch 操作", value: metadata.operation });
  }

  if (typeof metadata?.primaryCandidateCount === "number") {
    items.push({ label: "主候选", value: String(metadata.primaryCandidateCount) });
  }

  if (typeof metadata?.supplementaryCandidateCount === "number") {
    items.push({ label: "补充候选", value: String(metadata.supplementaryCandidateCount) });
  }

  if (typeof metadata?.excludedCount === "number") {
    items.push({ label: "排除动作", value: String(metadata.excludedCount) });
  }

  if (typeof metadata?.exerciseContextCount === "number") {
    items.push({ label: "上下文动作", value: String(metadata.exerciseContextCount) });
  }

  if (output) {
    addRecordItem(items, output, "candidateStatus", "候选状态");
    addRecordItem(items, output, "relevantCandidateCount", "相关候选");
    addRecordItem(items, output, "requiredRelevantCandidateCount", "最低需求");
    addRecordItem(items, output, "isEnoughCandidates", "候选充足");
    addRecordItem(items, output, "ok", "结果");
    addRecordItem(items, output, "code", "错误码");
    addRecordItem(items, output, "artifactId", "Artifact");
    addRecordItem(items, output, "artifactKind", "Artifact 类型");
    addRecordItem(items, output, "toolName", "工具");
    addRecordItem(items, output, "status", "输出状态");
    addRecordItem(items, output, "reason", "原因");
    addRecordItem(items, output, "message", "消息");

    const content = output.content;
    if (typeof content === "string") {
      items.push({ label: "回复长度", value: `${content.length} 字` });
    }

    const reasoning = output.reasoning;
    if (typeof reasoning === "string" && reasoning) {
      items.push({ label: "推理长度", value: `${reasoning.length} 字` });
    }

    const draft = output.draft;
    if (isRecord(draft) && typeof draft.title === "string") {
      items.push({ label: "计划标题", value: draft.title });
    }
  }

  if (isModelPayload(step.input)) {
    items.push({ label: "消息数", value: String(step.input.messages.length) });
  } else if (input && Array.isArray(input.messages)) {
    items.push({ label: "消息数", value: String(input.messages.length) });
  }
  if (input) {
    addRecordItem(items, input, "latestUserMessage", "最新用户消息");
    addRecordItem(items, input, "conversationSummary", "上下文总结");
  }

  return items.slice(0, 8);
}

function getTraceOverviewItems(trace: AiTrace): FieldExplanationItem[] {
  const usage = getTraceTokenUsage(trace);
  const metadata = isRecord(trace.metadata) ? trace.metadata : {};
  const items: FieldExplanationItem[] = [
    {
      key: "route",
      label: "接口路径",
      value: trace.route,
      description: "本次 trace 由哪个服务端入口创建，用来区分聊天、计划生成或动作推荐链路。",
    },
    {
      key: "status",
      label: "请求状态",
      value: getStatusLabel(trace.status),
      description: getStatusDescription(trace.status),
    },
    {
      key: "createdAt",
      label: "创建时间",
      value: formatTime(trace.createdAt),
      description: "服务端开始记录 trace 的时间。",
    },
    {
      key: "durationMs",
      label: "总耗时",
      value: formatDuration(trace.durationMs),
      description: "从 trace 创建到 finish 的时间，长耗时通常需要看模型请求或动作查询阶段。",
    },
    {
      key: "tokenUsage.total_tokens",
      label: "总 token",
      value: usage?.total_tokens ? formatNumber(usage.total_tokens) : "-",
      description: "模型输入和输出 token 合计，用于判断上下文体积和成本。",
    },
  ];

  addKnownMetadataItem(items, metadata, "latestUserMessage", "最新用户消息", "本轮真正驱动 AI 判断的最新用户输入。");
  addKnownMetadataItem(items, trace as unknown as Record<string, unknown>, "userId", "用户", "本次 trace 归属的用户边界，用于检查权限隔离。");
  addKnownMetadataItem(items, trace as unknown as Record<string, unknown>, "sessionId", "会话", "本次 trace 关联的聊天会话或下游请求会话。");
  addKnownMetadataItem(items, trace as unknown as Record<string, unknown>, "messageId", "消息", "本次 trace 关联的助手消息或响应消息。");
  addKnownMetadataItem(items, trace as unknown as Record<string, unknown>, "model", "模型", "本次编排默认使用的模型名称。");
  addKnownMetadataItem(items, trace as unknown as Record<string, unknown>, "promptVersion", "Prompt 版本", "本次编排使用的 prompt 版本，用于解释同输入不同行为。");
  if (isRecord(trace.finalDecision)) {
    addKnownMetadataItem(items, trace.finalDecision, "status", "最终决策", "本次编排最终归类为成功、可恢复失败或硬失败。");
    addKnownMetadataItem(items, trace.finalDecision, "code", "最终错误码", "失败或降级路径的最终诊断 code。");
    addKnownMetadataItem(items, trace.finalDecision, "reason", "最终原因", "最终决策的可读原因。");
  }
  addKnownMetadataItem(items, metadata, "userId", "用户", "本次 trace 归属的用户边界，用于检查权限隔离。");
  addKnownMetadataItem(items, metadata, "sessionId", "会话", "本次 trace 关联的聊天会话或下游请求会话。");
  addKnownMetadataItem(items, metadata, "messageId", "消息", "本次 trace 关联的助手消息或响应消息。");
  addKnownMetadataItem(items, metadata, "promptVersion", "Prompt 版本", "本次编排使用的 prompt 版本，用于解释同输入不同行为。");
  addKnownMetadataItem(items, metadata, "parentTraceId", "父级 trace", "下游接口复用的上游 trace id，用于串起聊天和动作/计划生成。");
  addKnownMetadataItem(items, metadata, "continuedRoutes", "连续路由", "同一 trace 继续记录过的后续服务端入口。");
  addKnownMetadataItem(items, metadata, "thinkingEnabled", "推理开关", "本次聊天是否允许模型返回 reasoning 或开启 thinking 配置。");

  return items;
}

function getStepExplanationItems(step: AiTraceStep, tokenUsage: TokenUsage | null): FieldExplanationItem[] {
  const items: FieldExplanationItem[] = [];
  const input = isRecord(step.input) ? step.input : null;
  const output = isRecord(step.output) ? step.output : null;
  const metadata = isRecord(step.metadata) ? step.metadata : null;
  const intent = getIntentRecord(step);

  if (input && step.type === "user_input") {
    addKnownMetadataItem(items, input, "latestUserMessage", "最新用户消息", "这句话会直接影响意图判断和后续 prompt。");
    addKnownMetadataItem(items, input, "conversationSummary", "上下文总结", "服务端压缩后的历史上下文，避免把完整聊天记录直接塞给模型。");
    addKnownMetadataItem(items, input, "thinkingEnabled", "推理开关", "前端传入的 thinking 设置，决定回复生成阶段的模型 thinking 配置。");
    if (Array.isArray(input.messages)) {
      items.push({
        key: "messages",
        label: "原始消息数",
        value: `${input.messages.length} 条`,
        description: "客户端提交给接口的原始消息数量。",
      });
    }
    if (Array.isArray(input.aiContextMessages)) {
      items.push({
        key: "aiContextMessages",
        label: "模型可见消息数",
        value: `${input.aiContextMessages.length} 条`,
        description: "经过上下文选择后会进入 AI 判断链路的消息数量。",
      });
    }
  }

  if (intent) {
    const workoutIntent = isRecord(intent.workoutIntent) ? intent.workoutIntent : intent;
    addKnownMetadataItem(items, intent, "type", "聊天意图", "模型识别出的顶层聊天意图，决定是否需要动作上下文或后续内部动作。");
    addKnownMetadataItem(items, intent, "needsExerciseContext", "需要动作上下文", "为 true 时服务端会查询动作库并筛选候选动作。");
    addKnownMetadataItem(items, intent, "requestedExerciseName", "点名动作", "用户是否明确提到某个动作名称。");
    addKnownMetadataItem(items, intent, "canTriggerAction", "可触发动作", "模型判断当前信息是否足够推送动作推荐或训练计划。");
    addKnownMetadataItem(items, intent, "missingActionFields", "缺失字段", "仍需要追问的关键信息；为空通常表示可以继续执行内部动作。");
    addKnownMetadataItem(items, intent, "suggestedReplies", "建议回复", "模型建议前端展示给用户的快捷追问或选项。");
    addKnownMetadataItem(items, workoutIntent, "intentType", "训练意图类型", "routine 表示单次训练编排，plan 表示多日计划，exercise_recommendation 表示动作推荐。");
    addKnownMetadataItem(items, workoutIntent, "goal", "训练目标", "用户表达的目标，如增肌、减脂、练腿或提升体能。");
    addKnownMetadataItem(items, workoutIntent, "targetMuscles", "目标肌群", "模型识别出的主要训练部位。");
    addKnownMetadataItem(items, workoutIntent, "equipmentOrLocation", "器械/场地", "用户可用器械或训练地点，会影响动作候选筛选。");
    addKnownMetadataItem(items, workoutIntent, "sessionMinutes", "单次时长", "单次训练希望控制的分钟数。");
    addKnownMetadataItem(items, workoutIntent, "trainingDaysPerWeek", "每周天数", "计划类请求用于安排频率。");
    addKnownMetadataItem(items, workoutIntent, "experienceLevel", "经验水平", "用于控制动作难度和风险。");
    addKnownMetadataItem(items, workoutIntent, "confidence", "置信度", "模型对当前结构化结果的信心，低置信度时更需要看原始输出。");
  }

  if (output && (step.type === "exercise_lookup" || step.type === "candidate_selection")) {
    const candidateOutput = isRecord(output.context) ? output.context : output;
    addKnownMetadataItem(items, candidateOutput, "candidateStatus", "候选状态", "候选动作是否足够支撑后续推荐或生成。");
    addKnownMetadataItem(items, candidateOutput, "relevantCandidateCount", "相关候选数", "符合目标、器械、风险等条件的动作数量。");
    addKnownMetadataItem(items, candidateOutput, "requiredRelevantCandidateCount", "最低需求数", "服务端认为可靠生成所需的最低候选数量。");
    addKnownMetadataItem(items, candidateOutput, "isEnoughCandidates", "候选是否充足", "为 false 时通常会阻止计划草稿生成。");
    addKnownMetadataItem(items, candidateOutput, "warnings", "候选警告", "动作不足、筛选过窄或安全限制等提示。");
    if (metadata) {
      addKnownMetadataItem(items, metadata, "primaryCandidateCount", "主候选总数", "主要候选池的完整数量，不只是页面截断展示的数量。");
      addKnownMetadataItem(items, metadata, "supplementaryCandidateCount", "补充候选总数", "用于补足热身、拉伸或替代动作的候选数量。");
      addKnownMetadataItem(items, metadata, "excludedCount", "排除动作数", "被规则筛掉的动作数量。");
    }
  }

  if (step.type === "reference_resolution") {
    const source = output ?? input ?? {};
    addKnownMetadataItem(items, source, "status", "解析状态", "resolved 表示已安全定位，ambiguous 表示需要用户确认，not_found 表示没有找到可访问对象。");
    addKnownMetadataItem(items, source, "artifactId", "命中 artifact", "服务端解析出的候选 artifact id，仅来自当前用户可访问集合。");
    addKnownMetadataItem(items, source, "artifactKind", "artifact 类型", "引用对象类型，例如 routine、plan 或 exercise_recommendation。");
    addKnownMetadataItem(items, source, "confidence", "置信度", "ReferenceResolver 对当前解析结果的信心。");
    addKnownMetadataItem(items, source, "reason", "决策原因", "解析命中、歧义或未找到的直接原因。");
    addKnownMetadataItem(items, source, "clarificationQuestion", "澄清问题", "歧义时服务端准备给用户的确认问题。");
    if (Array.isArray(source.candidates)) {
      items.push({
        key: "candidates",
        label: "候选数量",
        value: `${source.candidates.length} 个`,
        description: "用于解析引用的候选摘要数量，不包含完整 payload。",
      });
    }
  }

  if (step.type === "tool_call") {
    const source = output ?? input ?? {};
    addKnownMetadataItem(items, metadata ?? {}, "toolName", "工具名", "本次受控工具调用的服务端工具。");
    addKnownMetadataItem(items, input ?? {}, "toolName", "输入工具名", "工具调用输入声明的工具名称。");
    addKnownMetadataItem(items, source, "candidateCount", "候选数", "工具返回的候选摘要数量。");
    addKnownMetadataItem(items, source, "artifactId", "artifact", "工具读取或返回的 artifact id。");
    addKnownMetadataItem(items, source, "kind", "artifact 类型", "工具返回的 artifact 类型。");
    addKnownMetadataItem(items, source, "status", "工具状态", "工具输出或 metadata 中记录的成功/失败状态。");
    addKnownMetadataItem(items, source, "code", "错误码", "工具失败时用于诊断权限拒绝、未找到或 payload 校验失败。");
  }

  if (step.type === "patch_proposal") {
    const source = output ?? input ?? {};
    addKnownMetadataItem(items, source, "scope", "Patch scope", "本次 Patch 允许影响的范围，当前通常只能是 artifact_only。");
    addKnownMetadataItem(items, metadata ?? {}, "operation", "Patch 操作", "replace_exercise、adjust_load 或 remove_exercise。");
    addKnownMetadataItem(items, source, "status", "Patch 状态", "Patch 是否已应用、被阻断、歧义或校验失败。");
    addKnownMetadataItem(items, source, "message", "Patch 说明", "返回给用户或用于诊断的可读结果。");
    addKnownMetadataItem(items, source, "sourceArtifactId", "来源 artifact", "被修改的原始 artifact。");
    addKnownMetadataItem(items, source, "artifactId", "新 artifact", "Patch 应用成功后生成的新 revision artifact。");
    addKnownMetadataItem(items, source, "failureReasons", "失败原因", "Patch 未应用时的可诊断原因集合。");
  }

  if (output && step.type === "validation") {
    addKnownMetadataItem(items, output, "valid", "校验通过", "服务端最终结构校验、动作 id 校验和规则校验是否通过。");
    addKnownMetadataItem(items, output, "ok", "结果状态", "服务端返回对象的成功标记。");
    addKnownMetadataItem(items, output, "code", "错误码", "失败时用于定位是哪类校验或生成问题。");
    addKnownMetadataItem(items, output, "message", "错误信息", "失败时给出的可读说明。");
    addKnownMetadataItem(items, output, "errors", "校验错误", "具体字段或动作规则不符合预期的列表。");
  }

  if (output && step.type === "persistence") {
    addKnownMetadataItem(items, output, "artifactId", "新 artifact", "持久化成功后写入的新 artifact 或记录 id。");
    addKnownMetadataItem(items, output, "sourceArtifactId", "来源 artifact", "持久化 revision 的来源 artifact。");
    addKnownMetadataItem(items, output, "revision", "revision", "持久化后的 revision 序号。");
    addKnownMetadataItem(items, output, "code", "错误码", "持久化失败时的诊断 code。");
    addKnownMetadataItem(items, output, "message", "错误信息", "持久化失败时的可读说明。");
  }

  if (output && step.type === "response_write") {
    addKnownMetadataItem(items, output, "contentLength", "回复长度", "本次写给用户的主要文本长度。");
    addKnownMetadataItem(items, output, "conversationSummarySource", "总结来源", "上下文总结来自模型还是确定性 fallback。");
    addKnownMetadataItem(items, output, "emittedWorkoutPatch", "发送 Patch 事件", "是否向前端发送 workout_patch 结构化事件。");
  }

  if (isModelPayload(step.input)) {
    items.push(...getModelConfigItems(Object.fromEntries(Object.entries(step.input).filter(([key]) => key !== "messages"))));
    items.push({
      key: "messages",
      label: "消息数量",
      value: `${step.input.messages.length} 条`,
      description: "实际传给模型的消息数，排查上下文过长或缺失时优先看这里。",
    });
  }

  if (tokenUsage?.prompt_tokens !== undefined) {
    items.push({
      key: "tokenUsage.prompt_tokens",
      label: "输入 token",
      value: formatNumber(tokenUsage.prompt_tokens),
      description: "本次模型调用的 prompt token，过高通常说明上下文或动作候选过长。",
    });
  }
  if (tokenUsage?.completion_tokens !== undefined) {
    items.push({
      key: "tokenUsage.completion_tokens",
      label: "输出 token",
      value: formatNumber(tokenUsage.completion_tokens),
      description: "模型回复消耗的 token，过高通常需要看回复内容或结构化输出。",
    });
  }

  if (output && isContentPayload(output)) {
    if (typeof output.content === "string") {
      items.push({
        key: "content",
        label: "回复内容长度",
        value: `${output.content.length} 字`,
        description: "模型返回的主要文本长度；结构化 JSON 也可能放在这个字段里。",
      });
    }
    if (typeof output.reasoning === "string" && output.reasoning) {
      items.push({
        key: "reasoning",
        label: "推理内容长度",
        value: `${output.reasoning.length} 字`,
        description: "模型返回的 reasoning 长度，用于排查 thinking 行为和额外 token。",
      });
    }
  }

  return dedupeExplanationItems(items).slice(0, 12);
}

function getStepInterpretation(step: AiTraceStep) {
  const intent = getIntentRecord(step);

  if (intent) {
    const canTriggerAction = intent.canTriggerAction;
    const missingActionFields = Array.isArray(intent.missingActionFields) ? intent.missingActionFields : [];
    const workoutIntent = isRecord(intent.workoutIntent) ? intent.workoutIntent : intent;
    const intentType = typeof workoutIntent.intentType === "string" ? workoutIntent.intentType : undefined;
    const triggerText =
      canTriggerAction === true
        ? "当前信息被判断为足够，可以继续触发内部动作。"
        : canTriggerAction === false
          ? "当前信息暂时不足，通常需要继续追问或只返回普通聊天回复。"
          : "当前结果没有显式 canTriggerAction，需要结合后续内部动作事件判断。";
    const missingText = missingActionFields.length > 0 ? `缺失字段：${missingActionFields.join("、")}。` : "没有记录缺失字段。";

    return `识别到的训练意图类型是 ${intentType ?? "未标注"}。${triggerText}${missingText}`;
  }

  if (step.type === "exercise_lookup" || step.type === "candidate_selection") {
    const output = isRecord(step.output) ? step.output : {};
    const candidateOutput = isRecord(output.context) ? output.context : output;
    const status = stringifyValue(candidateOutput.candidateStatus ?? "未标注");
    const enough = candidateOutput.isEnoughCandidates;

    if (typeof enough === "boolean") {
      return enough
        ? `候选状态为 ${status}，服务端认为候选动作足够继续生成或推荐。`
        : `候选状态为 ${status}，服务端认为候选动作不足，后续可能降级为追问或失败。`;
    }

    return `候选状态为 ${status}，需要结合相关候选数和警告判断是否足够。`;
  }

  if (step.type === "reference_resolution") {
    const output = isRecord(step.output) ? step.output : {};
    const status = stringifyValue(output.status ?? "未标注");
    const reason = typeof output.reason === "string" ? output.reason : "没有记录原因。";

    return `引用解析状态为 ${status}。${reason}`;
  }

  if (step.type === "tool_call") {
    const metadata = isRecord(step.metadata) ? step.metadata : {};
    const input = isRecord(step.input) ? step.input : {};
    const toolName = stringifyValue(metadata.toolName ?? input.toolName ?? "未知工具");
    const state = step.status === "failed" ? "失败" : "成功";

    return `${toolName} 受控工具调用${state}，展开原始 JSON 可检查输入摘要、输出摘要、耗时和错误 code。`;
  }

  if (step.type === "patch_proposal") {
    const output = isRecord(step.output) ? step.output : {};
    const status = stringifyValue(output.status ?? output.resultStatus ?? step.status);
    const code = Array.isArray(output.failureReasons) ? output.failureReasons.join("、") : "";

    return `Patch 阶段状态为 ${status}。${code ? `失败原因：${code}。` : "如果已应用，应继续检查 diff 和持久化 step。"}`;
  }

  if (step.type === "validation") {
    const output = isRecord(step.output) ? step.output : {};
    const valid = output.valid ?? output.ok;

    if (valid === true) {
      return "服务端校验通过，说明结构化输出、动作 id 和训练规则满足当前链路要求。";
    }

    if (valid === false) {
      return "服务端校验失败，需要优先查看错误码、errors 和原始草稿，确认是模型输出结构问题还是动作候选不匹配。";
    }
  }

  if (step.type === "persistence") {
    return step.status === "failed"
      ? "持久化失败。优先查看错误码、来源 artifact 和权限边界。"
      : "持久化成功。检查新记录 id、revision 和来源对象，确认没有越权写入。";
  }

  if (step.type === "response_write") {
    return "响应写入阶段记录最终输出给前端的摘要，以及上下文总结是否来自模型或 fallback。";
  }

  if (step.type === "model_request") {
    return "这是即将发送给模型的完整请求。优先检查 model、response_format、stream、thinking 和 messages 顺序。";
  }

  if (step.type === "model_response") {
    return "这是模型返回结果。优先检查 content 是否为空、是否为合法 JSON，以及 token usage 是否异常。";
  }

  if (step.type === "user_input") {
    return "这是请求入口数据。先确认最新用户消息、上下文总结和模型可见消息是否符合预期。";
  }

  if (step.status === "failed" || step.type === "error") {
    return "这是失败事件。优先查看错误详情和 metadata 中的 HTTP 状态、错误码或异常堆栈。";
  }

  return null;
}

function getModelConfigItems(config: Record<string, unknown>): FieldExplanationItem[] {
  const items: FieldExplanationItem[] = [];

  addConfigItem(items, config, "model", "模型", "实际请求的模型名称，排查模型版本或供应商配置时优先看这里。");
  addConfigItem(items, config, "stream", "流式返回", "为 true 时接口会逐段读取模型输出，并在结束时记录 usage。");
  addConfigItem(items, config, "response_format", "响应格式", "要求模型返回普通文本还是 JSON object 等结构化格式。");
  addConfigItem(items, config, "thinking", "推理配置", "控制模型 thinking/reasoning 行为，可能影响输出内容和 token。");
  addConfigItem(items, config, "stream_options", "流式选项", "例如 include_usage，用于要求流式响应带回 token usage。");
  addConfigItem(items, config, "temperature", "随机性", "值越高输出越发散；未设置时使用模型或 SDK 默认值。");
  addConfigItem(items, config, "max_tokens", "最大输出 token", "限制模型最多可以生成多少 token。");

  return items;
}

function addConfigItem(
  items: FieldExplanationItem[],
  record: Record<string, unknown>,
  key: string,
  label: string,
  description: string,
) {
  if (!(key in record)) {
    return;
  }

  items.push({
    key,
    label,
    value: stringifyValue(record[key]),
    description,
  });
}

function addKnownMetadataItem(
  items: FieldExplanationItem[],
  record: Record<string, unknown>,
  key: string,
  label: string,
  description: string,
) {
  if (!(key in record) || record[key] === undefined || record[key] === null || isEmptyValue(record[key])) {
    return;
  }

  items.push({
    key,
    label,
    value: stringifyValue(record[key]),
    description,
  });
}

function dedupeExplanationItems(items: FieldExplanationItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.key)) {
      return false;
    }

    seen.add(item.key);
    return true;
  });
}

function getIntentRecord(step: AiTraceStep): Record<string, unknown> | null {
  const output = isRecord(step.output) ? step.output : null;

  if (output && looksLikeIntentRecord(output)) {
    return output;
  }

  if (output && isRecord(output.intent) && looksLikeIntentRecord(output.intent)) {
    return output.intent;
  }

  if (output && isRecord(output.modelOutput) && looksLikeIntentRecord(output.modelOutput)) {
    return output.modelOutput;
  }

  if (output && typeof output.content === "string") {
    const parsed = parseJsonRecord(output.content);

    if (parsed && looksLikeIntentRecord(parsed)) {
      return parsed;
    }
  }

  return null;
}

function looksLikeIntentRecord(value: Record<string, unknown>) {
  return (
    "intentType" in value ||
    "workoutIntent" in value ||
    "canTriggerAction" in value ||
    "missingActionFields" in value ||
    "needsExerciseContext" in value ||
    "targetMuscles" in value
  );
}

function parseJsonRecord(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "-";
  }

  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? formatNumber(value) : String(value);
  }

  if (typeof value === "string") {
    return value || "（空）";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "无";
    }

    return value.map((item) => stringifyValue(item)).join("、");
  }

  return JSON.stringify(value);
}

function getMessageRoleDescription(role: string) {
  const descriptions: Record<string, string> = {
    system: "规则、身份和输出约束",
    user: "用户输入或用户侧上下文",
    assistant: "历史助手回复",
    tool: "工具调用结果",
  };

  return descriptions[role] ?? "自定义消息角色";
}

function getStatusLabel(status: AiTrace["status"]) {
  const labels: Record<AiTrace["status"], string> = {
    running: "运行中",
    success: "成功",
    failed: "失败",
  };

  return labels[status];
}

function getStatusDescription(status: AiTrace["status"]) {
  const descriptions: Record<AiTrace["status"], string> = {
    running: "链路还没有结束，可能仍在等待模型或下游接口。",
    success: "链路正常结束，可以继续检查结果是否符合预期。",
    failed: "链路已失败，应优先查看失败阶段的 error、metadata 和原始输出。",
  };

  return descriptions[status];
}

function getInputTitle(step: AiTraceStep) {
  if (step.type === "model_request") {
    return "模型请求参数";
  }

  if (step.type === "candidate_selection" || step.type === "exercise_lookup") {
    return "筛选输入";
  }

  if (step.type === "reference_resolution") {
    return "引用解析输入";
  }

  if (step.type === "tool_call") {
    return "工具调用输入";
  }

  if (step.type === "patch_proposal") {
    return "Patch 输入";
  }

  if (step.type === "validation") {
    return "校验输入";
  }

  if (step.type === "user_input") {
    return "请求入参";
  }

  return "输入";
}

function getOutputTitle(step: AiTraceStep) {
  if (step.type === "model_response") {
    return "模型回复";
  }

  if (step.type === "candidate_selection" || step.type === "exercise_lookup") {
    return "筛选结果";
  }

  if (step.type === "reference_resolution") {
    return "引用解析结果";
  }

  if (step.type === "tool_call") {
    return "工具调用结果";
  }

  if (step.type === "patch_proposal") {
    return "Patch 结果";
  }

  if (step.type === "intent") {
    return "意图结果";
  }

  if (step.type === "validation") {
    return "校验结果";
  }

  if (step.type === "persistence") {
    return "持久化结果";
  }

  if (step.type === "response_write") {
    return "响应写入结果";
  }

  if (step.type === "final_response") {
    return "接口返回";
  }

  if (step.type === "error") {
    return "失败结果";
  }

  return "步骤输出";
}

function getDisplayableMetadata(metadata: AiTraceStep["metadata"]) {
  if (!metadata || isEmptyValue(metadata)) {
    return null;
  }

  const entries = Object.entries(metadata).filter(
    ([key]) => !["task", "status", "tokenUsage"].includes(key),
  );

  if (entries.length === 0) {
    return null;
  }

  return Object.fromEntries(entries);
}

function isEmptyValue(value: unknown) {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim().length === 0;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (isRecord(value)) {
    return Object.keys(value).length === 0;
  }

  return false;
}

function addRecordItem(
  items: Array<{ label: string; value: string }>,
  record: Record<string, unknown>,
  key: string,
  label: string,
) {
  const value = record[key];

  if (value === undefined || value === null) {
    return;
  }

  if (typeof value === "boolean") {
    items.push({ label, value: value ? "是" : "否" });
    return;
  }

  if (typeof value === "string" || typeof value === "number") {
    items.push({ label, value: String(value) });
  }
}

function getVisibleStepTokenUsage(steps: AiTraceStep[], index: number) {
  const step = steps[index];

  if (!step) {
    return null;
  }

  if (step.type === "model_request") {
    return pickPromptTokenUsage(findNextModelResponseTokenUsage(steps, index));
  }

  if (step.type === "model_response" && hasPreviousModelRequest(steps, index)) {
    return pickCompletionTokenUsage(getTokenUsage(step));
  }

  return getTokenUsage(step);
}

function pickPromptTokenUsage(usage: TokenUsage | null) {
  return typeof usage?.prompt_tokens === "number"
    ? { prompt_tokens: usage.prompt_tokens }
    : null;
}

function pickCompletionTokenUsage(usage: TokenUsage | null) {
  return typeof usage?.completion_tokens === "number"
    ? { completion_tokens: usage.completion_tokens }
    : null;
}

function findNextModelResponseTokenUsage(steps: AiTraceStep[], startIndex: number) {
  for (let index = startIndex + 1; index < steps.length; index += 1) {
    const step = steps[index];

    if (step.type === "model_request") {
      return null;
    }

    if (step.type === "model_response") {
      return getTokenUsage(step);
    }
  }

  return null;
}

function hasPreviousModelRequest(steps: AiTraceStep[], startIndex: number) {
  for (let index = startIndex - 1; index >= 0; index -= 1) {
    const step = steps[index];

    if (step.type === "model_response") {
      return false;
    }

    if (step.type === "model_request") {
      return true;
    }
  }

  return false;
}

function getTokenUsage(step: AiTraceStep) {
  const metadata = isRecord(step.metadata) ? step.metadata : null;
  const output = isRecord(step.output) ? step.output : null;
  const fromMetadata = metadata?.tokenUsage;
  const fromOutput = output?.usage;
  const usage = isRecord(fromMetadata) ? fromMetadata : isRecord(fromOutput) ? fromOutput : null;

  if (!usage) {
    return null;
  }

  return {
    prompt_tokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
    completion_tokens:
      typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined,
    total_tokens: typeof usage.total_tokens === "number" ? usage.total_tokens : undefined,
  };
}

function getTaskLabel(task: string) {
  const labels: Record<string, string> = {
    intent_extraction: "意图提取",
    draft_generation: "草稿生成",
  };

  return labels[task] ?? task;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function getStepTask(step: AiTraceStep) {
  const task = step.metadata?.task;
  return typeof task === "string" ? task : null;
}

function getStepTypeLabel(type: AiTraceStep["type"]) {
  const labels: Record<AiTraceStep["type"], string> = {
    user_input: "用户输入",
    model_request: "模型请求",
    model_response: "模型输出",
    intent: "意图",
    reference_resolution: "引用解析",
    tool_call: "工具调用",
    patch_proposal: "Patch",
    exercise_lookup: "动作库",
    candidate_selection: "候选筛选",
    validation: "校验",
    persistence: "持久化",
    response_write: "响应写入",
    final_response: "最终返回",
    error: "错误",
  };

  return labels[type];
}

function mergeStatus(current: AiTrace["status"], next: AiTrace["status"]) {
  if (current === "failed" || next === "failed") {
    return "failed";
  }

  if (current === "running" || next === "running") {
    return "running";
  }

  return "success";
}

function minIsoTime(current: string | undefined, next: string | undefined) {
  if (!current) {
    return next;
  }

  if (!next) {
    return current;
  }

  return new Date(next).getTime() < new Date(current).getTime() ? next : current;
}

function maxIsoTime(current: string | undefined, next: string | undefined) {
  if (!current) {
    return next;
  }

  if (!next) {
    return current;
  }

  return new Date(next).getTime() > new Date(current).getTime() ? next : current;
}

function getGroupDuration(group: TraceStepGroup) {
  if (group.startedAt && group.endedAt) {
    return new Date(group.endedAt).getTime() - new Date(group.startedAt).getTime();
  }

  const totalDuration = group.steps.reduce((sum, step) => sum + (step.durationMs ?? 0), 0);
  return totalDuration > 0 ? totalDuration : group.durationMs;
}

function StatusDot({ status }: { status: AiTrace["status"] }) {
  const className =
    status === "success"
      ? "bg-emerald-500"
      : status === "failed"
        ? "bg-red-500"
        : "bg-amber-500";

  return <span className={`h-2 w-2 shrink-0 rounded-full ${className}`} />;
}

function StatusBadge({ status }: { status: AiTrace["status"] }) {
  const className =
    status === "success"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "failed"
        ? "bg-red-50 text-red-700 border-red-200"
        : "bg-amber-50 text-amber-700 border-amber-200";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${className}`}>
      {status}
    </span>
  );
}

function formatTime(value?: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatDuration(value?: number) {
  if (value === undefined) {
    return "-";
  }

  return `${value}ms`;
}
