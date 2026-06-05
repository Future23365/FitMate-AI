"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { clientRequest } from "@/lib/client/http/client-request";
import type { AiTrace, AiTraceStep } from "@/lib/server/dev/ai-trace-store";

type TraceResponse = {
  ok: boolean;
  traces?: AiTrace[];
  error?: string;
};

type SaveLogResponse = {
  ok: boolean;
  path?: string;
  textPath?: string;
  error?: string;
};

type AiTraceLogType = "trace" | "prompt";

export type TraceStepGroup = {
  id: string;
  title: string;
  description: string;
  placement: "main_flow" | "out_of_flow";
  status: AiTrace["status"];
  steps: AiTraceStep[];
  summary: Array<{ label: string; value: string }>;
  skipReason?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
};

export type TraceLoopModule = {
  id: "planner_model" | "runtime_validation" | "policy_resource";
  title: string;
  description: string;
  status: AiTrace["status"];
  steps: AiTraceStep[];
  modelCalls: TraceLoopModelCall[];
  tokenUsage: TokenUsage | null;
  durationMs?: number;
};

export type TraceLoopModelCall = {
  id: string;
  plannerCallIndex?: number;
  runtimeStep: number;
  request?: AiTraceStep;
  response?: AiTraceStep;
  tokenUsage: TokenUsage | null;
  status: AiTrace["status"];
};

export type TraceLoopTurn = {
  id: string;
  loopNumber: number;
  runtimeStep: number;
  title: string;
  toolNames: string[];
  status: AiTrace["status"];
  steps: AiTraceStep[];
  modules: TraceLoopModule[];
  plannerCallIndexes: number[];
  tokenUsage: TokenUsage | null;
  durationMs?: number;
  startedAt?: string;
  endedAt?: string;
};

type TokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type TraceLogLongTextKind =
  | "model_request_message"
  | "model_response_text"
  | "trace_step_input"
  | "trace_step_output"
  | "trace_step_metadata"
  | "trace_step_error"
  | "response_summary"
  | "generic_long_text";

type TraceLogDetailKind =
  | "full_trace"
  | "runtime_event_detail";

export type TraceLogLongTextRef = {
  contentRef: string;
  path: string;
  kind: TraceLogLongTextKind;
  originalLength: number;
  hash: string;
  preview: string;
  textFile: "codex_logs/ai_trace_texts.jsonl";
};

export type TraceLogLongTextEntry = TraceLogLongTextRef & {
  paths: string[];
  content: string;
};

export type TraceLogDetailRef = {
  detailRef: string;
  path: string;
  kind: TraceLogDetailKind;
  hash: string;
  summary: Record<string, unknown>;
  detailFile: "codex_logs/ai_trace_texts.jsonl";
};

export type TraceLogDetailEntry = TraceLogDetailRef & {
  content: unknown;
};

type TraceLogLongTextState = {
  longTexts: TraceLogLongTextEntry[];
  byHash: Map<string, TraceLogLongTextEntry>;
};

type TraceLogDetailState = {
  details: TraceLogDetailEntry[];
};

const traceLogLongTextThreshold = 600;
const traceLogLongTextPreviewEdgeLength = 120;

// AiTraceViewer 是开发态模块化 trace 壳，按 agent-core 职责边界展示可保存诊断。
export function AiTraceViewer() {
  const [traces, setTraces] = useState<AiTrace[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
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
  const selectedLoops = useMemo(
    () => (selectedTrace ? buildAgentLoopTimeline(selectedTrace.steps) : []),
    [selectedTrace],
  );
  const mainStepGroups = selectedStepGroups.filter((group) => group.placement === "main_flow");
  const boundaryStepGroups = selectedStepGroups.filter((group) => ["request_context", "registry_manifest"].includes(group.id));
  const finalStepGroups = selectedStepGroups.filter((group) => (
    ["response_rendering", "errors_diagnostics", "raw_export"].includes(group.id)
  ));

  const loadTraces = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await clientRequest<TraceResponse>("/api/dev/ai-traces", {
        cache: "no-store",
        errorMessage: "Failed to load AI traces.",
      });

      if (!data.ok) {
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
    await clientRequest("/api/dev/ai-traces", {
      method: "DELETE",
      responseType: "raw",
      errorMessage: "Failed to clear AI traces.",
    });
    setTraces([]);
    setSelectedTraceId(null);
  }

  async function saveTraceLog(input: {
    logType: AiTraceLogType;
    targetId: string;
    target: Record<string, unknown>;
    payload: Record<string, unknown>;
  }) {
    setSavingLogTarget(input.targetId);
    setSaveLogMessage(null);
    setError(null);

    try {
      const data = await clientRequest<SaveLogResponse>("/api/dev/ai-traces", {
        method: "POST",
        body: {
          logType: input.logType,
          target: input.target,
          payload: input.payload,
        },
        errorMessage: "Failed to save AI trace log.",
      });

      if (!data.ok) {
        throw new Error(data.error || "Failed to save AI trace log.");
      }

      setSaveLogMessage(data.textPath ? `已保存到 ${data.path}，长文本映射 ${data.textPath}` : `已保存到 ${data.path}`);
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
              <p className="mt-1 text-xs text-slate-500">历史流程日志查看器</p>
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
            <div className="px-5 py-8 text-sm text-slate-500">还没有 Trace。</div>
          ) : (
            traces.map((trace) => {
              const tokenUsage = getTraceTokenUsage(trace);

              return (
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
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{trace.route}</span>
                    <span>{formatDuration(trace.durationMs)}</span>
                    <TokenUsageBadge usage={tokenUsage} />
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{formatTime(trace.createdAt)}</div>
                </button>
              );
            })
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
          <div className="mx-auto max-w-[1400px] px-8 py-7">
            <TraceHero
              trace={selectedTrace}
              loopCount={selectedLoops.length}
              isSavingPromptLog={savingLogTarget === `${selectedTrace.id}:prompt`}
              isSavingTraceLog={savingLogTarget === `${selectedTrace.id}:trace`}
              onSavePromptLog={() => {
                void saveTraceLog({
                  logType: "prompt",
                  targetId: `${selectedTrace.id}:prompt`,
                  target: {
                    type: "prompt_record",
                    traceId: selectedTrace.id,
                    title: selectedTrace.title,
                  },
                  payload: createPromptLogPayload(selectedTrace),
                });
              }}
              onSaveLog={() => {
                void saveTraceLog({
                  logType: "trace",
                  targetId: `${selectedTrace.id}:trace`,
                  target: {
                    type: "full_trace",
                    traceId: selectedTrace.id,
                    title: selectedTrace.title,
                  },
                  payload: createTraceLogPayload(selectedTrace, selectedStepGroups),
                });
              }}
            />

            <TraceFlowTimeline groups={boundaryStepGroups} />
            <AgentLoopTimeline loops={selectedLoops} />
            <TraceFlowTimeline groups={finalStepGroups} />
            <TraceOverview trace={selectedTrace} />
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
  loopCount,
  isSavingPromptLog,
  isSavingTraceLog,
  onSavePromptLog,
  onSaveLog,
}: {
  trace: AiTrace;
  loopCount: number;
  isSavingPromptLog: boolean;
  isSavingTraceLog: boolean;
  onSavePromptLog: () => void;
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
            当前页面按 Agent loop 组织模型调用、runtime 校验和策略资源诊断，便于按轮次定位问题。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={isSavingPromptLog}
            onClick={onSavePromptLog}
          >
            {isSavingPromptLog ? "保存中" : "保存用户问答记录"}
          </button>
          <button
            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={isSavingTraceLog}
            onClick={onSaveLog}
          >
            {isSavingTraceLog ? "保存中" : "保存全链路 log"}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="接口路径" value={trace.route} description="本次 trace 关联的服务端入口。" />
        <MetricCard label="Agent Loop" value={`${loopCount} 轮`} description="按 runtime step / planner call 归并后的执行轮次。" />
        <MetricCard label="总耗时" value={formatDuration(trace.durationMs)} description="trace 从创建到结束的总耗时。" />
        <MetricCard
          label="Token"
          value={tokenUsage ? formatTokenUsage(tokenUsage) : "-"}
          description="模型供应商返回的真实 usage；预算估算在 Runtime 模块中单独展示。"
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
      <div className="mt-1 break-words text-lg font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>
    </div>
  );
}

function TraceFlowTimeline({ groups }: { groups: TraceStepGroup[] }) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <section className="mt-6 space-y-4">
      {groups.map((group) => (
          <details className="group/module rounded-xl border border-slate-200 bg-white" key={group.id}>
            <summary className="cursor-pointer list-none p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">{group.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{group.description}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <StatusBadge status={group.status} />
                  <span>{formatDuration(group.durationMs)}</span>
                  <span className="text-slate-400 group-open/module:hidden">展开</span>
                  <span className="hidden text-slate-400 group-open/module:inline">收起</span>
                </div>
              </div>
            </summary>
            <div className="border-t border-slate-100 p-4">
              <ModuleSummaryList group={group} />
            </div>
            <div className="divide-y divide-slate-100">
              {group.steps.length > 0 ? (
                group.steps.map((step, index) => (
                  <TraceStepCard
                    index={index}
                    key={step.id}
                    step={step}
                    tokenUsage={getStepModelTokenUsage(step, group.steps)}
                  />
                ))
              ) : (
                <div className="p-4 text-sm text-slate-500">
                  {group.skipReason ?? "这个模块没有记录步骤。"}
                </div>
              )}
            </div>
          </details>
      ))}
    </section>
  );
}

function AgentLoopTimeline({ loops }: { loops: TraceLoopTurn[] }) {
  return (
    <section className="mt-6 space-y-4">
      {loops.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          没有记录 Agent loop。配置错误、入口拒绝或预算前置失败可能不会产生 loop。
        </div>
      ) : (
        loops.map((loop) => (
          <details className="group/loop rounded-xl border border-slate-200 bg-white" key={loop.id}>
            <summary className="cursor-pointer list-none p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-950">{loop.title}</h3>
                    <LoopToolBadge toolNames={loop.toolNames} />
                    <TokenUsageBadge usage={loop.tokenUsage} />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    runtime step {loop.runtimeStep}
                    {loop.plannerCallIndexes.length > 0
                      ? ` · planner call ${loop.plannerCallIndexes.join(", ")}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <StatusBadge status={loop.status} />
                  <span>{formatDuration(loop.durationMs)}</span>
                  <span className="text-slate-400 group-open/loop:hidden">展开</span>
                  <span className="hidden text-slate-400 group-open/loop:inline">收起</span>
                </div>
              </div>
            </summary>
            <div className="space-y-3 border-t border-slate-100 p-4">
              {loop.modules.map((module) => (
                <LoopModuleCard key={`${loop.id}:${module.id}`} module={module} />
              ))}
            </div>
          </details>
        ))
      )}
    </section>
  );
}

function LoopToolBadge({ toolNames }: { toolNames: string[] }) {
  const label = toolNames.length > 0 ? `Tool: ${toolNames.join(", ")}` : "未调用 Tool";

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
      toolNames.length > 0
        ? "bg-indigo-50 text-indigo-700 ring-indigo-100"
        : "bg-slate-50 text-slate-500 ring-slate-200"
    }`}>
      {label}
    </span>
  );
}

function LoopModuleCard({ module }: { module: TraceLoopModule }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-950">{module.title}</h4>
            <TokenUsageBadge usage={module.tokenUsage} />
          </div>
          <p className="mt-1 text-xs text-slate-500">{module.description}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <StatusBadge status={module.status} />
          <span>{formatDuration(module.durationMs)}</span>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {module.id === "planner_model" ? (
          module.modelCalls.map((call) => (
            <ModelCallCard call={call} key={call.id} />
          ))
        ) : module.steps.length > 0 ? (
          module.steps.map((step, index) => (
            <TraceStepCard
              index={index}
              key={step.id}
              step={step}
              tokenUsage={readStepTokenUsage(step)}
            />
          ))
        ) : (
          <div className="p-4 text-sm text-slate-500">这个模块没有记录步骤。</div>
        )}
      </div>
    </div>
  );
}

function ModelCallCard({ call }: { call: TraceLoopModelCall }) {
  const steps = [call.request, call.response].filter((step): step is AiTraceStep => Boolean(step));

  return (
    <details className="group/call bg-white p-4" open>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-950">
              LLM Call {call.plannerCallIndex ? `#${call.plannerCallIndex}` : ""}
            </span>
            <TokenUsageBadge usage={call.tokenUsage} />
            <StatusBadge status={call.status} />
          </div>
          <div className="mt-1 text-xs text-slate-500">runtime step {call.runtimeStep}</div>
        </div>
        <span className="text-xs text-slate-400 group-open/call:hidden">展开</span>
        <span className="hidden text-xs text-slate-400 group-open/call:inline">收起</span>
      </summary>
      <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">
        {steps.map((step, index) => (
          <TraceStepCard
            index={index}
            key={step.id}
            step={step}
            tokenUsage={getModelCallStepTokenUsage(step, call.tokenUsage)}
          />
        ))}
      </div>
    </details>
  );
}

function ModuleSummaryList({ group }: { group: TraceStepGroup }) {
  if (group.summary.length === 0 && !group.skipReason) {
    return null;
  }

  return (
    <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
      {group.summary.map((item) => (
        <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2" key={`${group.id}:${item.label}`}>
          <div className="text-[11px] font-medium text-slate-500">{item.label}</div>
          <div className="mt-1 truncate text-sm font-semibold text-slate-900">{item.value}</div>
        </div>
      ))}
      {group.summary.length === 0 && group.skipReason ? (
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500">
          {group.skipReason}
        </div>
      ) : null}
    </div>
  );
}

function TraceStepCard({
  index,
  step,
  tokenUsage,
}: {
  index: number;
  step: AiTraceStep;
  tokenUsage: TokenUsage | null;
}) {
  return (
    <details className="group p-4" open={index === 0}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {index + 1}
            </span>
            <span className="font-medium text-slate-950">{step.name}</span>
            <span className="rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">
              {getStepTypeLabel(step.type)}
            </span>
            <TokenUsageBadge usage={tokenUsage} />
            <StatusBadge status={step.status} />
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {formatTime(step.startedAt)} · {formatDuration(step.durationMs)}
          </div>
        </div>
        <span className="text-xs text-slate-400 group-open:hidden">展开</span>
        <span className="hidden text-xs text-slate-400 group-open:inline">收起</span>
      </summary>
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <JsonBlock title="Input" value={step.input} />
        <JsonBlock title="Output" value={step.output} />
        <JsonBlock title="Metadata" value={step.metadata} />
        <JsonBlock title="Error" value={step.error} />
      </div>
    </details>
  );
}

function TraceOverview({ trace }: { trace: AiTrace }) {
  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-base font-semibold text-slate-950">请求概览</h3>
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <JsonBlock title="Trace" value={{
          id: trace.id,
          runId: trace.runId,
          route: trace.route,
          title: trace.title,
          status: trace.status,
          createdAt: trace.createdAt,
          endedAt: trace.endedAt,
          durationMs: trace.durationMs,
          sessionId: trace.sessionId,
          messageId: trace.messageId,
          finalDecision: trace.finalDecision,
        }} />
        <JsonBlock title="Input" value={trace.input} />
      </div>
    </section>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="text-xs font-semibold text-slate-500">{title}</div>
      <pre className="mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-white p-3 text-xs leading-5 text-slate-700 ring-1 ring-slate-100">
        {typeof value === "undefined" ? "undefined" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function StatusBadge({ status }: { status: AiTrace["status"] }) {
  const className = status === "success"
    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
    : status === "failed"
      ? "bg-red-50 text-red-700 ring-red-100"
      : "bg-blue-50 text-blue-700 ring-blue-100";

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${className}`}>
      {status}
    </span>
  );
}

function TokenUsageBadge({ usage }: { usage: TokenUsage | null }) {
  if (!usage) {
    return null;
  }

  return (
    <span className="inline-flex overflow-hidden rounded-full text-xs font-medium ring-1 ring-slate-200">
      <TokenUsagePart label="输入" value={usage.prompt_tokens} className="bg-sky-50 text-sky-700" />
      <TokenUsagePart label="输出" value={usage.completion_tokens} className="bg-emerald-50 text-emerald-700" />
      <TokenUsagePart label="总" value={usage.total_tokens} className="bg-violet-50 text-violet-700" />
    </span>
  );
}

function TokenUsagePart({ label, value, className }: { label: string; value?: number; className: string }) {
  return (
    <span className={`px-2 py-0.5 tabular-nums ${className}`}>
      <span className="font-semibold">{label}</span>
      <span className="ml-1">{formatOptionalNumber(value)}</span>
    </span>
  );
}

export function groupTraceSteps(steps: AiTraceStep[]): TraceStepGroup[] {
  const groupMap = new Map<string, TraceStepGroup>(
    moduleDefinitions.map((definition) => [
      definition.id,
      {
        ...definition,
        status: "success" as const,
        steps: [],
        summary: [],
      },
    ]),
  );

  for (const step of steps) {
    const definition = getStepGroupDefinition(step);
    const group = groupMap.get(definition.id);

    if (!group) {
      continue;
    }
    group.steps.push(step);
  }

  return Array.from(groupMap.values()).map((group) => ({
    ...group,
    status: deriveGroupStatus(group.steps),
    startedAt: getMinDate(group.steps.map((item) => item.startedAt)),
    endedAt: getMaxDate(group.steps.map((item) => item.endedAt).filter(Boolean) as string[]),
    durationMs: group.steps.reduce((sum, item) => sum + (item.durationMs ?? 0), 0),
    summary: createModuleSummary(group),
    skipReason: createModuleSkipReason(group),
  }));
}

// buildAgentLoopTimeline 把低层 trace steps 按 runtime step 归并成可阅读的 Agent loop。
export function buildAgentLoopTimeline(steps: AiTraceStep[]): TraceLoopTurn[] {
  const loopMap = new Map<number, AiTraceStep[]>();

  for (const step of steps) {
    const runtimeStep = readStepRuntimeStep(step);

    if (runtimeStep === undefined) {
      continue;
    }

    const current = loopMap.get(runtimeStep) ?? [];
    current.push(step);
    loopMap.set(runtimeStep, current);
  }

  return Array.from(loopMap.entries())
    .sort(([left], [right]) => left - right)
    .map(([runtimeStep, loopSteps], index) => {
      const modules = createLoopModules(runtimeStep, loopSteps);
      const plannerCallIndexes = Array.from(new Set(
        loopSteps.map(readStepPlannerCallIndex).filter((value): value is number => value !== undefined),
      )).sort((left, right) => left - right);

      return {
        id: `loop-${runtimeStep}`,
        loopNumber: index + 1,
        runtimeStep,
        title: `Loop #${index + 1}`,
        toolNames: readLoopToolNames(loopSteps),
        status: deriveGroupStatus(loopSteps),
        steps: loopSteps,
        modules,
        plannerCallIndexes,
        tokenUsage: sumTokenUsageValues(modules.flatMap((module) => module.modelCalls.map((call) => call.tokenUsage))),
        startedAt: getMinDate(loopSteps.map((step) => step.startedAt)),
        endedAt: getMaxDate(loopSteps.map((step) => step.endedAt).filter(Boolean) as string[]),
        durationMs: loopSteps.reduce((sum, step) => sum + (step.durationMs ?? 0), 0),
      };
    });
}

const moduleDefinitions: Array<Omit<TraceStepGroup, "status" | "steps" | "summary" | "skipReason" | "startedAt" | "endedAt" | "durationMs">> = [
  {
    id: "request_context",
    title: "入口与上下文",
    description: "请求输入、会话 hydration、用户身份和入口参数。",
    placement: "main_flow",
  },
  {
    id: "registry_manifest",
    title: "ToolRegistry / Manifest",
    description: "当前 run 暴露给 Planner 的 tool manifest 快照。",
    placement: "main_flow",
  },
  {
    id: "planner_model",
    title: "Planner / ModelAdapter",
    description: "LLM 请求配置、messages 摘要、模型响应、parsed action 和真实 token usage。",
    placement: "main_flow",
  },
  {
    id: "runtime_validation",
    title: "Runtime / Validator",
    description: "planner action、预算事件、结构校验、terminal grounding 和失败收口。",
    placement: "main_flow",
  },
  {
    id: "policy_resource",
    title: "Policy / Resource",
    description: "Policy Guard、confirmation 和 ResourceStore 相关事件。",
    placement: "main_flow",
  },
  {
    id: "response_rendering",
    title: "Response Renderer",
    description: "真实返回前端的 NDJSON 事件摘要。",
    placement: "main_flow",
  },
  {
    id: "errors_diagnostics",
    title: "错误诊断",
    description: "配置、模型、runtime 或响应写入阶段的失败边界。",
    placement: "out_of_flow",
  },
  {
    id: "raw_export",
    title: "Raw / 导出",
    description: "Raw trace、展开详情和保存全链路 log 的入口。",
    placement: "out_of_flow",
  },
];

const moduleDefinitionsById = Object.fromEntries(
  moduleDefinitions.map((definition) => [definition.id, definition]),
) as Record<string, Omit<TraceStepGroup, "status" | "steps" | "summary" | "skipReason" | "startedAt" | "endedAt" | "durationMs">>;

function getStepGroupDefinition(step: AiTraceStep): Omit<TraceStepGroup, "status" | "steps" | "summary" | "skipReason" | "startedAt" | "endedAt" | "durationMs"> {
  const runtimeEventType = readRuntimeEventType(step);

  if (step.status === "failed" && step.type !== "model_response" && step.type !== "tool_call") {
    return moduleDefinitionsById.errors_diagnostics;
  }

  switch (step.type) {
    case "user_input":
      return moduleDefinitionsById.request_context;
    case "model_request":
    case "model_response":
      return moduleDefinitionsById.planner_model;
    case "runtime_event":
      if (runtimeEventType === "registry_snapshot") {
        return moduleDefinitionsById.registry_manifest;
      }

      if (
        runtimeEventType === "policy_decision" ||
        runtimeEventType === "resource_registered" ||
        runtimeEventType === "confirmation_request" ||
        runtimeEventType === "confirmation_resume"
      ) {
        return moduleDefinitionsById.policy_resource;
      }

      return moduleDefinitionsById.runtime_validation;
    case "token_budget":
    case "validation":
    case "final_response":
      return moduleDefinitionsById.runtime_validation;
    case "tool_decision":
    case "tool_call":
    case "rag_query":
    case "exercise_lookup":
    case "candidate_selection":
    case "reference_resolution":
    case "patch_proposal":
    case "persistence":
      return moduleDefinitionsById.runtime_validation;
    case "response_write":
      return moduleDefinitionsById.response_rendering;
    case "error":
      return moduleDefinitionsById.errors_diagnostics;
    case "intent":
      return moduleDefinitionsById.request_context;
    default:
      return moduleDefinitionsById.raw_export;
  }
}

function createLoopModules(runtimeStep: number, steps: AiTraceStep[]): TraceLoopModule[] {
  const plannerSteps = steps.filter((step) => step.type === "model_request" || step.type === "model_response");
  const runtimeSteps = steps.filter((step) => {
    const eventType = readRuntimeEventType(step);

    return (
      step.type === "validation" ||
      step.type === "token_budget" ||
      step.type === "tool_call" ||
      step.type === "final_response" ||
      (
        step.type === "runtime_event" &&
        eventType !== "policy_decision" &&
        eventType !== "resource_registered" &&
        eventType !== "confirmation_request" &&
        eventType !== "confirmation_resume"
      )
    );
  });
  const policyResourceSteps = steps.filter((step) => {
    const eventType = readRuntimeEventType(step);

    return (
      eventType === "policy_decision" ||
      eventType === "resource_registered" ||
      eventType === "confirmation_request" ||
      eventType === "confirmation_resume"
    );
  });
  const plannerModelCalls = buildLoopModelCalls(runtimeStep, plannerSteps);
  const modules: TraceLoopModule[] = [];

  if (plannerSteps.length > 0 || plannerModelCalls.length > 0) {
    modules.push(createLoopModule({
      id: "planner_model",
      title: "Planner / ModelAdapter",
      description: "本轮 LLM call 的请求、响应、解析结果和 token 明细。",
      steps: plannerSteps,
      modelCalls: plannerModelCalls,
      tokenUsage: sumTokenUsageValues(plannerModelCalls.map((call) => call.tokenUsage)),
    }));
  }

  if (runtimeSteps.length > 0) {
    modules.push(createLoopModule({
      id: "runtime_validation",
      title: "Runtime / Validator",
      description: "本轮 planner action、预算事件、校验和 terminal grounding。",
      steps: runtimeSteps,
      modelCalls: [],
      tokenUsage: null,
    }));
  }

  if (policyResourceSteps.length > 0) {
    modules.push(createLoopModule({
      id: "policy_resource",
      title: "Policy / Resource",
      description: "本轮策略、确认和资源登记事件。",
      steps: policyResourceSteps,
      modelCalls: [],
      tokenUsage: null,
    }));
  }

  return modules;
}

function createLoopModule(input: Pick<TraceLoopModule, "id" | "title" | "description" | "steps" | "modelCalls" | "tokenUsage">): TraceLoopModule {
  return {
    ...input,
    status: deriveGroupStatus(input.steps),
    durationMs: input.steps.reduce((sum, step) => sum + (step.durationMs ?? 0), 0),
  };
}

function buildLoopModelCalls(runtimeStep: number, steps: AiTraceStep[]): TraceLoopModelCall[] {
  const callMap = new Map<string, { plannerCallIndex?: number; request?: AiTraceStep; response?: AiTraceStep }>();

  for (const step of steps) {
    const plannerCallIndex = readStepPlannerCallIndex(step);
    const key = plannerCallIndex === undefined ? step.id : String(plannerCallIndex);
    const current = callMap.get(key) ?? { plannerCallIndex };

    if (step.type === "model_request") {
      current.request = step;
    }

    if (step.type === "model_response") {
      current.response = step;
    }

    callMap.set(key, current);
  }

  return Array.from(callMap.values())
    .sort((left, right) => (left.plannerCallIndex ?? 0) - (right.plannerCallIndex ?? 0))
    .map((call, index) => {
      const tokenUsage = call.response ? readStepTokenUsage(call.response) : call.request ? readStepTokenUsage(call.request) : null;

      return {
        id: `loop-${runtimeStep}-llm-${call.plannerCallIndex ?? index + 1}`,
        plannerCallIndex: call.plannerCallIndex,
        runtimeStep,
        request: call.request,
        response: call.response,
        tokenUsage,
        status: deriveGroupStatus([call.request, call.response].filter((step): step is AiTraceStep => Boolean(step))),
      };
    });
}

function createModuleSummary(group: TraceStepGroup): Array<{ label: string; value: string }> {
  switch (group.id) {
    case "request_context": {
      const requestStep = group.steps.find((step) => step.type === "user_input");
      const input = isRecord(requestStep?.input) ? requestStep.input : {};

      return [
        { label: "最新用户输入", value: readString(input.latestUserMessage) || "-" },
        { label: "消息数", value: formatOptionalNumber(readNumber(input.messageCount)) },
        { label: "会话", value: readString(input.conversationId) || "-" },
        { label: "hydration", value: readNestedString(input.hydration, "source") || "-" },
      ];
    }
    case "registry_manifest": {
      const registryStep = group.steps.find((step) => readRuntimeEventType(step) === "registry_snapshot");
      const output = isRecord(registryStep?.output) ? registryStep.output : {};
      const toolCount = readNumber(output.toolCount) ?? readNestedNumber(group.steps[0]?.output, "registry", "toolCount");

      return [
        { label: "tool count", value: formatOptionalNumber(toolCount) },
        { label: "manifestHash", value: readString(output.manifestHash) || "-" },
        { label: "snapshotId", value: readString(output.snapshotId) || "-" },
        { label: "tool names", value: formatToolNames(readManifestToolNames(output)) },
      ];
    }
    case "planner_model": {
      const modelRequests = group.steps.filter((step) => step.type === "model_request");
      const modelResponses = group.steps.filter((step) => step.type === "model_response");
      const usage = sumTokenUsage(modelResponses);
      const latestRequest = modelRequests.at(-1);
      const latestResponse = modelResponses.at(-1);
      const latestRequestOutput = isRecord(latestRequest?.output) ? latestRequest.output : {};
      const latestRequestMetadata = isRecord(latestRequest?.metadata) ? latestRequest.metadata : {};
      const latestOutput = isRecord(latestResponse?.output) ? latestResponse.output : {};
      const estimatedBudget = summarizeEstimatedTokenBudget(group.steps);

      return [
        { label: "LLM 调用", value: `${modelResponses.length} 轮` },
        { label: "thinking", value: formatThinkingSummary(latestRequestOutput.thinking ?? latestRequestMetadata.thinking) },
        { label: "reasoning", value: formatReasoningSummary(latestOutput.reasoning) },
        { label: "真实 usage", value: usage ? formatTokenUsage(usage) : "无真实 usage" },
        { label: "预算估算", value: estimatedBudget },
        { label: "parse status", value: readString(latestOutput.parseStatus) || "未记录" },
        { label: "failure code", value: readString(latestOutput.failureCode) || "-" },
      ];
    }
    case "runtime_validation": {
      const plannerAction = [...group.steps].reverse().find((step) => readRuntimeEventType(step) === "planner_action");
      const validation = [...group.steps].reverse().find((step) => step.type === "validation" || readRuntimeEventType(step) === "validation_result");
      const actionOutput = isRecord(plannerAction?.output) ? plannerAction.output : {};
      const validationOutput = isRecord(validation?.output) ? validation.output : {};
      const budgetEvents = group.steps.filter((step) => step.type === "token_budget" || readRuntimeEventType(step) === "budget_event");

      return [
        { label: "action type", value: readString(actionOutput.actionType) || "-" },
        { label: "toolName", value: readString(actionOutput.toolName) || "-" },
        { label: "validator", value: formatValidatorSummary(validationOutput) },
        { label: "budget events", value: `${budgetEvents.length} 个` },
      ];
    }
    case "policy_resource":
      return [
        { label: "policy", value: `${group.steps.filter((step) => readRuntimeEventType(step) === "policy_decision").length} 个` },
        { label: "resource", value: `${group.steps.filter((step) => readRuntimeEventType(step) === "resource_registered").length} 个` },
        { label: "confirmation", value: `${group.steps.filter((step) => readRuntimeEventType(step)?.startsWith("confirmation_")).length} 个` },
      ];
    case "response_rendering": {
      const responseStep = group.steps.find((step) => step.type === "response_write");
      const output = isRecord(responseStep?.output) ? responseStep.output : {};

      return [
        { label: "event types", value: formatEventTypes(output.eventTypes) || "-" },
        { label: "done", value: output.done === true ? "true" : "false" },
        { label: "suggestions", value: formatOptionalNumber(readNumber(output.suggestionCount)) },
        { label: "error codes", value: formatEventTypes(output.errorCodes) || "-" },
      ];
    }
    case "errors_diagnostics": {
      const failedSteps = group.steps.filter((step) => step.status === "failed");

      return [
        { label: "failed steps", value: `${failedSteps.length} 个` },
        { label: "latest code", value: readLatestErrorCode(group.steps) || "-" },
      ];
    }
    case "raw_export":
      return [
        { label: "Raw JSON", value: "请求概览区域可展开" },
        { label: "保存", value: "顶部按钮导出脱敏 payload" },
      ];
    default:
      return [];
  }
}

function createModuleSkipReason(group: TraceStepGroup) {
  if (group.steps.length > 0) {
    return undefined;
  }

  switch (group.id) {
    case "planner_model":
      return "未记录模型调用。Replay/Fake planner 或配置阶段失败可以没有 model_request/model_response。";
    case "policy_resource":
      return "本次 run 没有 Policy Guard、confirmation 或 ResourceStore 事件。";
    case "errors_diagnostics":
      return "本次 trace 没有单独错误步骤。";
    case "raw_export":
      return "Raw trace 和保存入口在页面顶部按钮及请求概览中提供。";
    default:
      return "这个模块没有记录步骤。";
  }
}

function readRuntimeEventType(step: AiTraceStep) {
  const metadata = isRecord(step.metadata) ? step.metadata : {};
  const output = isRecord(step.output) ? step.output : {};
  const metadataEventType = metadata.eventType;
  const outputType = output.type;

  return typeof metadataEventType === "string"
    ? metadataEventType
    : typeof outputType === "string"
      ? outputType
      : undefined;
}

function readStepRuntimeStep(step: AiTraceStep) {
  const metadata = isRecord(step.metadata) ? step.metadata : {};
  const output = isRecord(step.output) ? step.output : {};
  const runtimeLinkage = isRecord(output.runtimeLinkage)
    ? output.runtimeLinkage
    : isRecord(metadata.runtimeLinkage)
      ? metadata.runtimeLinkage
      : {};

  return readNumber(metadata.runtimeStep)
    ?? readNumber(output.runtimeStep)
    ?? readNumber(runtimeLinkage.runtimeStep)
    ?? readNumber(output.step)
    ?? readNumber(metadata.step);
}

function readStepPlannerCallIndex(step: AiTraceStep) {
  const metadata = isRecord(step.metadata) ? step.metadata : {};
  const output = isRecord(step.output) ? step.output : {};
  const runtimeLinkage = isRecord(output.runtimeLinkage)
    ? output.runtimeLinkage
    : isRecord(metadata.runtimeLinkage)
      ? metadata.runtimeLinkage
      : {};

  return readNumber(metadata.plannerCallIndex)
    ?? readNumber(output.plannerCallIndex)
    ?? readNumber(runtimeLinkage.plannerCallIndex);
}

function readLoopToolNames(steps: AiTraceStep[]) {
  const toolNames = new Set<string>();

  for (const step of steps) {
    for (const toolName of readStepToolNames(step)) {
      toolNames.add(toolName);
    }
  }

  return Array.from(toolNames);
}

function readStepToolNames(step: AiTraceStep) {
  const metadata = isRecord(step.metadata) ? step.metadata : {};
  const input = isRecord(step.input) ? step.input : {};
  const output = isRecord(step.output) ? step.output : {};
  const runtimeEventType = readRuntimeEventType(step);
  const actionType = readString(output.actionType);
  const toolName = readString(output.toolName) || readString(metadata.toolName) || readString(input.toolName);

  if (
    step.type === "tool_call" ||
    runtimeEventType === "tool_execution" ||
    runtimeEventType === "duplicate_tool_call" ||
    (runtimeEventType === "planner_action" && actionType === "tool_call") ||
    (step.type === "model_response" && actionType === "tool_call")
  ) {
    return toolName ? [toolName] : [];
  }

  return [];
}

function readManifestToolNames(output: Record<string, unknown>) {
  const explicitNames = readStringArray(output.toolNames);

  if (explicitNames.length > 0) {
    return explicitNames;
  }

  const tools = Array.isArray(output.tools) ? output.tools : [];

  return tools
    .map((tool) => (isRecord(tool) ? readString(tool.name) : undefined))
    .filter((toolName): toolName is string => Boolean(toolName));
}

function formatToolNames(toolNames: string[]) {
  return toolNames.length > 0 ? toolNames.join(", ") : "空 ToolRegistry";
}

function deriveGroupStatus(steps: AiTraceStep[]): AiTrace["status"] {
  if (steps.some((step) => step.status === "failed")) {
    return "failed";
  }
  if (steps.some((step) => step.status === "running")) {
    return "running";
  }

  return "success";
}

function getTraceTokenUsage(trace: AiTrace): TokenUsage | null {
  const metadataUsage = readTokenUsage(trace.metadata?.tokenUsageSummary);

  if (metadataUsage) {
    return metadataUsage;
  }

  return sumTokenUsage(trace.steps.filter((step) => step.type === "model_response"));
}

function getStepModelTokenUsage(step: AiTraceStep, peerSteps: AiTraceStep[]): TokenUsage | null {
  const directUsage = readStepTokenUsage(step);

  if (directUsage) {
    return directUsage;
  }

  if (step.type !== "model_request") {
    return null;
  }

  const plannerCallIndex = readNumber(step.metadata?.plannerCallIndex);

  if (plannerCallIndex === undefined) {
    return null;
  }

  const matchingResponse = peerSteps.find((candidate) => (
    candidate.type === "model_response" &&
    readNumber(candidate.metadata?.plannerCallIndex) === plannerCallIndex
  ));

  return matchingResponse ? readStepTokenUsage(matchingResponse) : null;
}

function getModelCallStepTokenUsage(step: AiTraceStep, callUsage: TokenUsage | null): TokenUsage | null {
  if (!callUsage) {
    return readStepTokenUsage(step);
  }

  if (step.type === "model_request") {
    return callUsage.prompt_tokens === undefined
      ? null
      : { prompt_tokens: callUsage.prompt_tokens };
  }

  if (step.type === "model_response") {
    return callUsage.completion_tokens === undefined && callUsage.total_tokens === undefined
      ? null
      : {
          completion_tokens: callUsage.completion_tokens,
          total_tokens: callUsage.total_tokens,
        };
  }

  return readStepTokenUsage(step);
}

function readTokenUsage(value: unknown): TokenUsage | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    prompt_tokens: readNumber(value.prompt_tokens),
    completion_tokens: readNumber(value.completion_tokens),
    total_tokens: readNumber(value.total_tokens),
  };
}

function readStepTokenUsage(step: AiTraceStep): TokenUsage | null {
  const output = isRecord(step.output) ? step.output : {};

  return readTokenUsage(output.tokenUsage) ?? readTokenUsage(step.metadata?.tokenUsage);
}

function sumTokenUsage(steps: AiTraceStep[]): TokenUsage | null {
  const usage = steps.reduce<TokenUsage>((sum, step) => {
    const stepUsage = readStepTokenUsage(step);

    if (!stepUsage) {
      return sum;
    }

    return {
      prompt_tokens: (sum.prompt_tokens ?? 0) + (stepUsage.prompt_tokens ?? 0),
      completion_tokens: (sum.completion_tokens ?? 0) + (stepUsage.completion_tokens ?? 0),
      total_tokens: (sum.total_tokens ?? 0) + (stepUsage.total_tokens ?? 0),
    };
  }, {});

  return usage.prompt_tokens || usage.completion_tokens || usage.total_tokens ? usage : null;
}

function sumTokenUsageValues(values: Array<TokenUsage | null>): TokenUsage | null {
  const usage = values.reduce<TokenUsage>((sum, item) => {
    if (!item) {
      return sum;
    }

    return {
      prompt_tokens: (sum.prompt_tokens ?? 0) + (item.prompt_tokens ?? 0),
      completion_tokens: (sum.completion_tokens ?? 0) + (item.completion_tokens ?? 0),
      total_tokens: (sum.total_tokens ?? 0) + (item.total_tokens ?? 0),
    };
  }, {});

  return usage.prompt_tokens || usage.completion_tokens || usage.total_tokens ? usage : null;
}

function summarizeEstimatedTokenBudget(steps: AiTraceStep[]) {
  const events = steps
    .map((step) => isRecord(step.output) ? step.output : {})
    .filter((output) => output.budget === "estimated_tokens");
  const latest = events.at(-1);

  if (!latest) {
    return "无预算估算事件";
  }

  return `${readString(latest.status) || "-"} ${formatOptionalNumber(readNumber(latest.used))}/${formatOptionalNumber(readNumber(latest.limit))}`;
}

function formatTokenUsage(usage: TokenUsage) {
  return `输入 ${formatOptionalNumber(usage.prompt_tokens)} / 输出 ${formatOptionalNumber(usage.completion_tokens)} / 总 ${formatOptionalNumber(usage.total_tokens)}`;
}

function formatThinkingSummary(value: unknown) {
  if (!isRecord(value)) {
    return "未记录";
  }

  const type = readString(value.type) || "-";
  const effort = readString(value.reasoning_effort);

  return effort ? `${type} / reasoning_effort=${effort}` : type;
}

function formatReasoningSummary(value: unknown) {
  if (!isRecord(value)) {
    return "未记录";
  }

  const received = value.received === true ? "received" : "not_received";
  const contentLength = readNumber(value.contentLength) ?? 0;
  const unexpected = value.unexpectedWhenThinkingDisabled === true ? " / unexpected_when_disabled" : "";

  return `${received} / length=${contentLength}${unexpected}`;
}

function formatValidatorSummary(output: Record<string, unknown>) {
  if (Object.keys(output).length === 0) {
    return "-";
  }

  return `${output.ok === true ? "ok" : "failed"}${typeof output.code === "string" ? `:${output.code}` : ""}`;
}

function formatEventTypes(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").join(", ")
    : "";
}

function readLatestErrorCode(steps: AiTraceStep[]) {
  for (const step of [...steps].reverse()) {
    const output = isRecord(step.output) ? step.output : {};
    const error = isRecord(step.error) ? step.error : {};
    const code = readString(output.code) ?? readString(output.failureCode) ?? readString(error.code);

    if (code) {
      return code;
    }
  }

  return "";
}

function readPlannerModelCalls(trace: AiTrace) {
  const calls = new Map<string, Record<string, unknown>>();

  for (const step of trace.steps.filter((item) => item.type === "model_request" || item.type === "model_response")) {
    const plannerCallIndex = readNumber(step.metadata?.plannerCallIndex);
    const key = plannerCallIndex === undefined ? step.id : String(plannerCallIndex);
    const existing = calls.get(key) ?? { plannerCallIndex };

    if (step.type === "model_request") {
      existing.request = {
        id: step.id,
        input: step.input,
        output: step.output,
        metadata: step.metadata,
      };
    } else {
      existing.response = {
        id: step.id,
        status: step.status,
        output: step.output,
        metadata: step.metadata,
      };
    }

    calls.set(key, existing);
  }

  return Array.from(calls.values());
}

function readTraceResponseSummary(trace: AiTrace) {
  const responseStep = [...trace.steps].reverse().find((step) => step.type === "response_write");

  return responseStep?.output ?? null;
}

function createTraceReportSummary(trace: AiTrace) {
  return {
    id: trace.id,
    runId: trace.runId,
    route: trace.route,
    title: trace.title,
    status: trace.status,
    createdAt: trace.createdAt,
    endedAt: trace.endedAt,
    durationMs: trace.durationMs,
    userId: trace.userId,
    sessionId: trace.sessionId,
    messageId: trace.messageId,
    model: trace.model,
    promptVersion: trace.promptVersion,
    finalDecision: trace.finalDecision,
    metadata: trace.metadata,
    stepCount: trace.steps.length,
    steps: trace.steps.map(createTraceStepReportSummary),
  };
}

function createTraceStepReportSummary(step: AiTraceStep) {
  const output = isRecord(step.output) ? step.output : {};
  const metadata = isRecord(step.metadata) ? step.metadata : {};
  const error = isRecord(step.error) ? step.error : {};

  return {
    id: step.id,
    name: step.name,
    type: step.type,
    status: step.status,
    startedAt: step.startedAt,
    endedAt: step.endedAt,
    durationMs: step.durationMs,
    eventType: readRuntimeEventType(step),
    runtimeStep: readStepRuntimeStep(step),
    plannerCallIndex: readStepPlannerCallIndex(step),
    actionType: readString(output.actionType),
    toolName: readString(output.toolName) ?? readString(metadata.toolName),
    toolResultId: readString(output.toolResultId) ?? readString(metadata.toolResultId),
    failureCode: readString(output.failureCode),
    code: readString(output.code) ?? readString(error.code),
    thinking: step.type === "model_request" ? output.thinking ?? metadata.thinking : undefined,
    reasoning: step.type === "model_response" ? output.reasoning ?? metadata.reasoning : undefined,
    tokenUsage: getStepModelTokenUsage(step, []),
  };
}

function createRuntimeTraceEventReport(step: AiTraceStep) {
  const output = isRecord(step.output) ? step.output : {};

  return {
    ...createTraceStepReportSummary(step),
    output: summarizeRuntimeEventOutput(output),
  };
}

function summarizeRuntimeEventOutput(output: Record<string, unknown>) {
  const eventType = readString(output.type);

  switch (eventType) {
    case "registry_snapshot":
      return {
        type: eventType,
        snapshotId: readString(output.snapshotId),
        manifestHash: readString(output.manifestHash),
        toolCount: readNumber(output.toolCount),
        toolNames: Array.isArray(output.toolNames) ? output.toolNames.filter((item): item is string => typeof item === "string") : undefined,
      };
    case "budget_event":
      return {
        type: eventType,
        budget: readString(output.budget),
        status: readString(output.status),
        used: readNumber(output.used),
        limit: readNumber(output.limit),
        step: readNumber(output.step),
        reason: readString(output.reason),
      };
    case "planner_action":
      return {
        type: eventType,
        step: readNumber(output.step),
        actionType: readString(output.actionType),
        toolName: readString(output.toolName),
      };
    case "validation_result":
      return {
        type: eventType,
        step: readNumber(output.step),
        ok: output.ok === true,
        code: readString(output.code),
        actionType: readString(output.actionType),
        toolName: readString(output.toolName),
      };
    case "tool_execution":
      return {
        type: eventType,
        step: readNumber(output.step),
        toolName: readString(output.toolName),
        toolVersion: readString(output.toolVersion),
        toolCallId: readString(output.toolCallId),
        toolResultId: readString(output.toolResultId),
        ok: output.ok === true,
        satisfied: output.satisfied === true,
        factChannel: readString(output.factChannel),
        failureCode: readString(output.failureCode),
        producedResources: output.producedResources,
        consumedResources: output.consumedResources,
        durationMs: readNumber(output.durationMs),
      };
    case "resource_registered":
      return {
        type: eventType,
        toolResultId: readString(output.toolResultId),
        resource: output.resource,
      };
    case "terminal_grounding":
      return {
        type: eventType,
        actionType: readString(output.actionType),
        usedResourceRefs: output.usedResourceRefs,
      };
    default:
      return {
        type: eventType,
        ok: output.ok,
        status: readString(output.status),
        code: readString(output.code),
        failureCode: readString(output.failureCode),
        actionType: readString(output.actionType),
        toolName: readString(output.toolName),
        toolResultId: readString(output.toolResultId),
      };
  }
}

export function createTraceLogPayload(trace: AiTrace, groups: TraceStepGroup[]) {
  const tokenUsageSummary = getTraceTokenUsage(trace);
  const agentLoops = buildAgentLoopTimeline(trace.steps);
  const detailState: TraceLogDetailState = { details: [] };
  const traceDetailRef = createTraceLogDetailEntry(detailState, {
    path: "$.trace",
    kind: "full_trace",
    summary: {
      id: trace.id,
      runId: trace.runId,
      route: trace.route,
      status: trace.status,
      stepCount: trace.steps.length,
    },
    content: trace,
  });

  const payload = {
    title: trace.title,
    savedFrom: "/dev/ai-traces",
    exportFiles: {
      report: "codex_logs/ai_trace_log.js",
      longTexts: "codex_logs/ai_trace_texts.jsonl",
    },
    lookupGuide: [
      "默认先读 codex_logs/ai_trace_log.js 的结构化报告。",
      "遇到 contentRef/detailRef 时，用 rg 查 header 定位类型、路径、hash 和 chunkCount。",
      "需要完整内容时，再用 rg '\"parentRef\":\"text_0001\"' codex_logs/ai_trace_texts.jsonl 查 chunks，并按 chunkIndex 拼接。",
    ],
    agentLoops: agentLoops.map((loop) => ({
      id: loop.id,
      loopNumber: loop.loopNumber,
      runtimeStep: loop.runtimeStep,
      toolNames: loop.toolNames,
      plannerCallIndexes: loop.plannerCallIndexes,
      stepIds: loop.steps.map((step) => step.id),
      status: loop.status,
      durationMs: loop.durationMs,
      tokenUsage: loop.tokenUsage,
      modules: loop.modules.map((module) => ({
        id: module.id,
        title: module.title,
        stepIds: module.steps.map((step) => step.id),
        tokenUsage: module.tokenUsage,
        modelCalls: module.modelCalls.map((call) => ({
          id: call.id,
          plannerCallIndex: call.plannerCallIndex,
          runtimeStep: call.runtimeStep,
          requestStepId: call.request?.id,
          responseStepId: call.response?.id,
          tokenUsage: call.tokenUsage,
          status: call.status,
        })),
      })),
    })),
    moduleGroups: groups.map((group) => ({
      id: group.id,
      title: group.title,
      description: group.description,
      stepIds: group.steps.map((step) => step.id),
      status: group.status,
      durationMs: group.durationMs,
      summary: group.summary,
      skipReason: group.skipReason,
    })),
    plannerModelCalls: readPlannerModelCalls(trace),
    tokenUsageSummary,
    runtimeTraceEvents: trace.steps
      .filter((step) => ["runtime_event", "validation", "token_budget", "tool_call", "final_response"].includes(step.type))
      .map((step, index) => ({
        ...createRuntimeTraceEventReport(step),
        detailRef: createTraceLogDetailEntry(detailState, {
          path: `$.runtimeTraceEvents[${index}]`,
          kind: "runtime_event_detail",
          summary: createTraceStepReportSummary(step),
          content: createTraceStepDetail(step),
        }),
      })),
    responseSummary: readTraceResponseSummary(trace),
    traceSummary: {
      ...createTraceReportSummary(trace),
      detailRef: traceDetailRef,
    },
    groupedSteps: groups.map((group) => ({
      id: group.id,
      title: group.title,
      stepIds: group.steps.map((step) => step.id),
      status: group.status,
      durationMs: group.durationMs,
    })),
    detailRefs: detailState.details.map(({ content: _content, ...ref }) => ref),
    details: detailState.details,
  };

  return finalizeTraceLogDetailHashes(extractTraceLogLongTexts(payload));
}

function createTraceLogDetailEntry(
  state: TraceLogDetailState,
  input: {
    path: string;
    kind: TraceLogDetailKind;
    summary: Record<string, unknown>;
    content: unknown;
  },
): TraceLogDetailRef {
  const serialized = safeStringifyTraceDetail(input.content);
  const ref: TraceLogDetailRef = {
    detailRef: createDetailRef(state.details.length + 1),
    path: input.path,
    kind: input.kind,
    hash: hashLongText(serialized),
    summary: input.summary,
    detailFile: "codex_logs/ai_trace_texts.jsonl",
  };

  state.details.push({
    ...ref,
    content: input.content,
  });

  return ref;
}

function createTraceStepDetail(step: AiTraceStep) {
  return {
    id: step.id,
    name: step.name,
    type: step.type,
    status: step.status,
    startedAt: step.startedAt,
    endedAt: step.endedAt,
    durationMs: step.durationMs,
    input: step.input,
    output: step.output,
    metadata: step.metadata,
    error: step.error,
  };
}

function createDetailRef(index: number) {
  return `detail_${String(index).padStart(4, "0")}`;
}

function safeStringifyTraceDetail(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function finalizeTraceLogDetailHashes(payload: Record<string, unknown>) {
  const details = Array.isArray(payload.details)
    ? payload.details.filter((detail): detail is Record<string, unknown> => isRecord(detail))
    : [];
  const hashesByRef = new Map<string, string>();

  for (const detail of details) {
    const detailRef = readString(detail.detailRef);

    if (!detailRef) {
      continue;
    }

    const hash = hashLongText(safeStringifyTraceDetail(detail.content));
    detail.hash = hash;
    hashesByRef.set(detailRef, hash);
  }

  return replaceTraceLogDetailHashes(payload, hashesByRef) as Record<string, unknown>;
}

function replaceTraceLogDetailHashes(value: unknown, hashesByRef: Map<string, string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => replaceTraceLogDetailHashes(item, hashesByRef));
  }

  if (!isRecord(value)) {
    return value;
  }

  const replaced = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      replaceTraceLogDetailHashes(child, hashesByRef),
    ]),
  );
  const detailRef = readString(replaced.detailRef);
  const hash = detailRef ? hashesByRef.get(detailRef) : undefined;

  return hash ? { ...replaced, hash } : replaced;
}

// extractTraceLogLongTexts 将保存报告中的长字符串外置，降低默认 log 的阅读和 token 成本。
export function extractTraceLogLongTexts(payload: Record<string, unknown>) {
  const longTextState: TraceLogLongTextState = {
    longTexts: [],
    byHash: new Map(),
  };
  const report = replaceLongTextStrings(payload, "$", longTextState);
  const longTexts = longTextState.longTexts;
  const longTextRefs = longTexts.map(({ content: _content, ...ref }) => ref);

  return {
    ...(isRecord(report) ? report : { value: report }),
    longTextRefs,
    longTextStats: {
      count: longTexts.length,
      threshold: traceLogLongTextThreshold,
      textFile: "codex_logs/ai_trace_texts.jsonl",
    },
    longTexts,
  };
}

function replaceLongTextStrings(
  value: unknown,
  path: string,
  state: TraceLogLongTextState,
): unknown {
  const traceLongText = readTraceLongTextEnvelope(value);

  if (traceLongText) {
    return createLongTextMappingRef(traceLongText.content, path, state, {
      force: true,
      hash: traceLongText.hash,
      originalLength: traceLongText.originalLength,
      preview: traceLongText.preview,
    });
  }

  if (typeof value === "string") {
    if (value.length <= traceLogLongTextThreshold) {
      return value;
    }

    return createLongTextMappingRef(value, path, state);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => replaceLongTextStrings(item, `${path}[${index}]`, state));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        replaceLongTextStrings(child, `${path}.${key}`, state),
      ]),
    );
  }

  return value;
}

function createLongTextMappingRef(
  value: string,
  path: string,
  state: TraceLogLongTextState,
  options: {
    force?: boolean;
    hash?: string;
    originalLength?: number;
    preview?: string;
  } = {},
) {
  const originalLength = options.originalLength ?? value.length;

  if (!options.force && value.length <= traceLogLongTextThreshold && originalLength <= traceLogLongTextThreshold) {
    return value;
  }

  const hash = options.hash ?? hashLongText(value);
  const existing = state.byHash.get(hash);

  if (existing) {
    if (!existing.paths.includes(path)) {
      existing.paths.push(path);
    }

    return {
      contentRef: existing.contentRef,
      path,
      kind: inferLongTextKind(path),
      originalLength: existing.originalLength,
      hash: existing.hash,
      preview: existing.preview,
      textFile: existing.textFile,
    };
  }

  const contentRef = createLongTextRef(state.longTexts.length + 1);
  const ref: TraceLogLongTextRef = {
    contentRef,
    path,
    kind: inferLongTextKind(path),
    originalLength,
    hash,
    preview: options.preview ?? createLongTextPreview(value),
    textFile: "codex_logs/ai_trace_texts.jsonl",
  };

  const entry: TraceLogLongTextEntry = {
    ...ref,
    paths: [path],
    content: value,
  };

  state.longTexts.push(entry);
  state.byHash.set(hash, entry);

  return ref;
}

function readTraceLongTextEnvelope(value: unknown) {
  if (!isRecord(value) || value.kind !== "trace_long_text" || !Array.isArray(value.chunks)) {
    return null;
  }

  const chunks = value.chunks
    .filter((chunk): chunk is Record<string, unknown> => isRecord(chunk))
    .map((chunk, fallbackIndex) => ({
      index: readNumber(chunk.index) ?? fallbackIndex,
      text: readString(chunk.text) ?? "",
    }))
    .sort((left, right) => left.index - right.index);
  const content = chunks.map((chunk) => chunk.text).join("");

  return {
    content,
    originalLength: readNumber(value.originalLength) ?? content.length,
    hash: readString(value.hash) ?? hashLongText(content),
    preview: readString(value.preview) ?? createLongTextPreview(content),
  };
}

function createLongTextRef(index: number) {
  return `text_${String(index).padStart(4, "0")}`;
}

function createLongTextPreview(value: string) {
  const edgeLength = traceLogLongTextPreviewEdgeLength;

  if (value.length <= edgeLength * 2) {
    return value;
  }

  return `${value.slice(0, edgeLength)}\n...[middle omitted]...\n${value.slice(-edgeLength)}`;
}

function hashLongText(value: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function inferLongTextKind(path: string): TraceLogLongTextKind {
  if (/\.messages\[\d+\]\.content$/.test(path)) {
    return "model_request_message";
  }

  if (/(\.rawText|\.rawResponse|\.model_response|modelResponse)/i.test(path)) {
    return "model_response_text";
  }

  if (/responseSummary\.content$/.test(path)) {
    return "response_summary";
  }

  if (/\.steps\[\d+\]\.input/.test(path) || /\.details\[\d+\]\.content\.input/.test(path)) {
    return "trace_step_input";
  }

  if (/\.steps\[\d+\]\.output/.test(path) || /\.details\[\d+\]\.content\.output/.test(path)) {
    return "trace_step_output";
  }

  if (/\.steps\[\d+\]\.metadata/.test(path) || /\.details\[\d+\]\.content\.metadata/.test(path)) {
    return "trace_step_metadata";
  }

  if (/\.steps\[\d+\]\.error/.test(path) || /\.details\[\d+\]\.content\.error/.test(path)) {
    return "trace_step_error";
  }

  return "generic_long_text";
}

export function createPromptLogPayload(trace: AiTrace) {
  const userQuestions = trace.steps
    .filter((step) => step.type === "user_input")
    .map((step, index) => ({
      round: index + 1,
      question: readLatestUserQuestion(step.input),
    }))
    .filter((item) => item.question.length > 0);
  const finalAnswer = [...trace.steps]
    .reverse()
    .map((step) => readFinalAnswer(step.output))
    .find((answer) => answer.length > 0) ?? "";

  return {
    title: trace.title,
    savedFrom: "/dev/ai-traces",
    trace: {
      traceId: trace.id,
      runId: trace.runId,
      route: trace.route,
      traceTitle: trace.title,
      status: trace.status,
      createdAt: trace.createdAt,
      endedAt: trace.endedAt,
      durationMs: trace.durationMs,
      sessionId: trace.sessionId,
      messageId: trace.messageId,
      promptVersion: trace.promptVersion,
    },
    userQuestions,
    finalAnswer,
  };
}

function readLatestUserQuestion(value: unknown) {
  const record = isRecord(value) ? value : {};
  const latestUserMessage = record.latestUserMessage;

  if (typeof latestUserMessage === "string") {
    return latestUserMessage;
  }

  const messages = Array.isArray(record.messages) ? record.messages : [];
  const latest = [...messages].reverse().find((message) => (
    isRecord(message) &&
    message.role === "user" &&
    typeof message.content === "string"
  ));

  return isRecord(latest) && typeof latest.content === "string" ? latest.content : "";
}

function readFinalAnswer(value: unknown) {
  const record = isRecord(value) ? value : {};
  const content = record.content ?? record.reply ?? record.finalAnswer;

  return typeof content === "string" ? content : "";
}

function getStepTypeLabel(type: AiTraceStep["type"]) {
  return type.replaceAll("_", " ");
}

function getMinDate(values: string[]) {
  return values.length > 0 ? values.sort()[0] : undefined;
}

function getMaxDate(values: string[]) {
  return values.length > 0 ? values.sort().at(-1) : undefined;
}

function formatDuration(durationMs: number | undefined) {
  if (typeof durationMs !== "number") {
    return "-";
  }

  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatTime(value: string | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatOptionalNumber(value: number | undefined) {
  return typeof value === "number" ? formatNumber(value) : "-";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readNestedString(value: unknown, key: string) {
  return isRecord(value) ? readString(value[key]) : undefined;
}

function readNestedNumber(value: unknown, parentKey: string, childKey: string) {
  if (!isRecord(value) || !isRecord(value[parentKey])) {
    return undefined;
  }

  return readNumber(value[parentKey][childKey]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
