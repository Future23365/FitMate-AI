"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { runWithAsyncToast } from "@/lib/client/async-feedback";
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
  flowId?: string;
  turnCount?: number;
  error?: string;
};

type AiTraceLogType = "trace" | "prompt" | "blackbox_case";

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
  | "model_request_system_prompt"
  | "model_request_system_message"
  | "model_request_message"
  | "model_request_tool_description"
  | "model_request_tool_schema"
  | "model_request_tool_schema_description"
  | "model_response_text"
  | "trace_step_input"
  | "trace_step_output"
  | "trace_step_metadata"
  | "trace_step_error"
  | "response_summary"
  | "generic_long_text";

type TraceLogDetailKind =
  | "full_trace"
  | "model_call_detail"
  | "langchain_runtime_detail"
  | "tool_execution_detail"
  | "runtime_event_detail";

type ToolExecutionVisibilityField = "modelVisibleSummary" | "userProjection" | "traceSummary";
type ToolExecutionVisibilityKind = "llm_visible" | "user_projection" | "debug_only";

export type ToolExecutionVisibilityMetadata = {
  visibility: ToolExecutionVisibilityKind;
  modelVisible: boolean;
  label: string;
  consumer: string;
  note: string;
};

type ToolExecutionVisibilityExportMap = Record<ToolExecutionVisibilityField, ToolExecutionVisibilityKind>;

export type ToolExecutionVisibilitySection = ToolExecutionVisibilityMetadata & {
  field: ToolExecutionVisibilityField;
  title: string;
  value: unknown;
  diagnosticFields?: string[];
  enteredModelContext?: boolean;
  enteredModelContextMeaning?: string;
};

export type TraceLogLongTextRef = {
  contentRef: string;
  path: string;
  pathCount?: number;
  kind: TraceLogLongTextKind;
  originalLength: number;
  hash: string;
  preview: string;
  visibility?: ToolExecutionVisibilityKind;
  visibilityByPath?: Record<string, ToolExecutionVisibilityKind>;
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
  visibility?: ToolExecutionVisibilityExportMap;
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

type TraceLogDedupeTextKind =
  | "system_prompt"
  | "tool_catalog"
  | "tool_description"
  | "tool_schema"
  | "schema_description"
  | "finalization_schema";

export type TraceLogDedupeTextEntry = {
  recordType: "deduped_text";
  ref: string;
  refKind: TraceLogDedupeTextKind;
  path: string;
  hash: string;
  originalLength: number;
  preview: string;
  content: string;
  textFile: "codex_logs/ai_trace_texts.jsonl";
};

type TraceLogDedupeState = {
  entries: TraceLogDedupeTextEntry[];
  byHash: Map<string, TraceLogDedupeTextEntry>;
  counters: Record<TraceLogDedupeTextKind, number>;
};

export type TraceLogEventRecord = {
  recordType: "event";
  eventRef: string;
  kind: string;
  loopNumber?: number;
  stepId?: string;
  plannerCallIndex?: number;
  runtimeStep?: number;
  toolName?: string;
  status?: string;
  code?: string;
  tokenUsage?: TokenUsage | null;
  modelInputRef?: string;
  inputRef?: string;
  outputRef?: string;
  detailRef?: TraceLogDetailRef;
  summary: Record<string, unknown>;
};

export type TraceLogModelInputRecord = {
  recordType: "model_input";
  modelInputRef: string;
  plannerCallIndex?: number;
  modelCallIndex?: number;
  runtimeStep?: number;
  requestStepId?: string;
  messageCount?: number;
  messageRefs: TraceLogLongTextRef[];
  toolCount?: number;
  toolNames: string[];
  toolCatalogRef?: string;
  systemPromptRef?: string;
  finalizationToolRef?: string;
  schemaRefs: string[];
  budget?: unknown;
  toolAvailability?: unknown;
  audit: Record<string, unknown>;
  evidence: Record<string, unknown>;
};

export type TraceLogExportBundle = {
  report: Record<string, unknown>;
  events: TraceLogEventRecord[];
  modelInputs: TraceLogModelInputRecord[];
  texts: TraceLogDedupeTextEntry[];
  longTexts: TraceLogLongTextEntry[];
  details: TraceLogDetailEntry[];
  manifest: Record<string, unknown>;
};

const traceLogLongTextThreshold = 600;
const traceLogLongTextPreviewEdgeLength = 120;
const traceLogReportSchemaVersion = "ai-trace-log-export.v2";
const traceLogReportLoopBudget = 80;

// toolExecutionVisibilityDefinitions 是 trace 页面和导出共享的消费方边界合同。
const toolExecutionVisibilityDefinitions: Record<ToolExecutionVisibilityField, ToolExecutionVisibilityMetadata> = {
  modelVisibleSummary: {
    visibility: "llm_visible",
    modelVisible: true,
    label: "LLM 可见 / ToolMessage 内容",
    consumer: "LangChain ToolMessage -> LLM",
    note: "此区块会作为 tool result 摘要回填给模型。",
  },
  userProjection: {
    visibility: "user_projection",
    modelVisible: false,
    label: "用户投影 / 前端投影",
    consumer: "前端投影，不回填模型",
    note: "此区块供用户可见投影或前端事件消费，不进入模型上下文。",
  },
  traceSummary: {
    visibility: "debug_only",
    modelVisible: false,
    label: "debug-only / 调试摘要",
    consumer: "trace / log 调试，不回填模型",
    note: "此区块只用于开发排查；候选数量、截断状态等诊断字段不是模型可见事实。",
  },
};

// AiTraceViewer 是开发态模块化 trace 壳，按 LangChain 主链职责展示可保存诊断。
export function AiTraceViewer() {
  const [traces, setTraces] = useState<AiTrace[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isClearingTraces, setIsClearingTraces] = useState(false);
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
    setIsClearingTraces(true);
    setError(null);

    try {
      await runWithAsyncToast(
        {
          id: "ai-trace-clear",
          loading: "正在清空 Trace...",
          success: "Trace 已清空",
          error: "清空 Trace 失败",
        },
        async () => {
          await clientRequest("/api/dev/ai-traces", {
            method: "DELETE",
            responseType: "raw",
            errorMessage: "Failed to clear AI traces.",
          });
          setTraces([]);
          setSelectedTraceId(null);
        },
      );
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Failed to clear AI traces.");
    } finally {
      setIsClearingTraces(false);
    }
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
      const data = await runWithAsyncToast(
        {
          id: `ai-trace-save-log:${input.targetId}`,
          loading: getSaveLogLoadingMessage(input.logType),
          success: (result: SaveLogResponse) => formatSaveLogSuccessMessage(input.logType, result),
          error: "保存 trace log 失败",
        },
        async () => {
          const response = await clientRequest<SaveLogResponse>("/api/dev/ai-traces", {
            method: "POST",
            body: {
              logType: input.logType,
              target: input.target,
              payload: input.payload,
            },
            errorMessage: "Failed to save AI trace log.",
          });

          if (!response.ok) {
            throw new Error(response.error || "Failed to save AI trace log.");
          }

          return response;
        },
      );

      setSaveLogMessage(formatSaveLogSuccessMessage(input.logType, data));
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
            disabled={traces.length === 0 || isClearingTraces}
            onClick={() => void clearTraces()}
          >
            {isClearingTraces ? "清空中" : "清空 Trace"}
          </button>
        </div>
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto">
        {selectedTrace ? (
          <div className="mx-auto max-w-[1400px] px-8 py-7">
            <TraceHero
              trace={selectedTrace}
              loopCount={selectedLoops.length}
              isSavingBlackboxCase={savingLogTarget === `${selectedTrace.id}:blackbox_case`}
              isSavingPromptLog={savingLogTarget === `${selectedTrace.id}:prompt`}
              isSavingTraceLog={savingLogTarget === `${selectedTrace.id}:trace`}
              onSaveBlackboxCase={() => {
                void saveTraceLog({
                  logType: "blackbox_case",
                  targetId: `${selectedTrace.id}:blackbox_case`,
                  target: {
                    type: "basic_chat_blackbox_case",
                    traceId: selectedTrace.id,
                    title: selectedTrace.title,
                  },
                  payload: createPromptLogPayload(selectedTrace),
                });
              }}
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
  isSavingBlackboxCase,
  isSavingPromptLog,
  isSavingTraceLog,
  onSaveBlackboxCase,
  onSavePromptLog,
  onSaveLog,
}: {
  trace: AiTrace;
  loopCount: number;
  isSavingBlackboxCase: boolean;
  isSavingPromptLog: boolean;
  isSavingTraceLog: boolean;
  onSaveBlackboxCase: () => void;
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
            当前页面按 LangChain runtime、provider tool calls、tool wrapper 和响应投影组织诊断，便于定位主链问题。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={isSavingBlackboxCase}
            onClick={onSaveBlackboxCase}
          >
            {isSavingBlackboxCase ? "保存中" : "保存为黑盒用例"}
          </button>
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
        <MetricCard label="Runtime 轮次" value={`${loopCount} 轮`} description="按 LangChain runtime step 归并后的执行轮次。" />
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

function getSaveLogLoadingMessage(logType: AiTraceLogType) {
  if (logType === "blackbox_case") {
    return "正在保存黑盒用例...";
  }

  return logType === "prompt" ? "正在保存用户问答记录..." : "正在保存全链路 log...";
}

function formatSaveLogSuccessMessage(logType: AiTraceLogType, result: SaveLogResponse) {
  if (logType === "blackbox_case") {
    const flowLabel = result.flowId ? ` ${result.flowId}` : "";
    const turnLabel = typeof result.turnCount === "number" ? `，${result.turnCount} 轮` : "";

    return `已追加黑盒用例${flowLabel}${turnLabel}到 ${result.path ?? "-"}`;
  }

  return result.textPath ? `已保存到 ${result.path}，长文本映射 ${result.textPath}` : `已保存到 ${result.path}`;
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
          没有记录 LangChain runtime 轮次。配置错误、入口拒绝或预算前置失败可能不会产生 loop。
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
                      ? ` · model call ${loop.plannerCallIndexes.join(", ")}`
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
              Model Call {call.plannerCallIndex ? `#${call.plannerCallIndex}` : ""}
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
  const toolVisibilityRecords = readStepToolExecutionVisibilityRecords(step);

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
      <ToolExecutionVisibilityPanels records={toolVisibilityRecords} />
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <JsonBlock title="Input" value={step.input} />
        <JsonBlock title="Output" value={step.output} />
        <JsonBlock title="Metadata" value={step.metadata} />
        <JsonBlock title="Error" value={step.error} />
      </div>
    </details>
  );
}

function ToolExecutionVisibilityPanels({
  records,
}: {
  records: Array<{ id: string; execution: Record<string, unknown>; source: string }>;
}) {
  if (records.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 space-y-3">
      {records.map((record, index) => {
        const toolName = readString(record.execution.toolName) ?? `tool execution ${index + 1}`;
        const status = readString(record.execution.status) ?? "-";
        const enteredModelContext = record.execution.enteredModelContext === true;

        return (
          <section className="rounded-lg border border-blue-100 bg-blue-50/40 p-3" key={record.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-blue-800">
                  Tool 输出可见性边界：{toolName}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {record.source} · status={status} · enteredModelContext={String(enteredModelContext)}
                  {"，"}仅表示 `modelVisibleSummary` 已作为 ToolMessage 回填模型，不表示完整 execution record 进入模型。
                </p>
              </div>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-100">
                modelVisibleSummary only
              </span>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              {createToolExecutionVisibilitySections(record.execution).map((section) => (
                <ToolExecutionVisibilitySectionCard key={`${record.id}:${section.field}`} section={section} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ToolExecutionVisibilitySectionCard({ section }: { section: ToolExecutionVisibilitySection }) {
  const hasCandidateDiagnostics = section.field === "traceSummary" && (section.diagnosticFields?.length ?? 0) > 0;

  return (
    <div className="min-w-0 rounded-lg border border-slate-100 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-800">{section.label}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
          section.modelVisible
            ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
            : "bg-slate-50 text-slate-600 ring-slate-200"
        }`}>
          {section.visibility}
        </span>
        <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200">
          modelVisible: {String(section.modelVisible)}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">{section.note}</p>
      {hasCandidateDiagnostics ? (
        <p className="mt-1 text-xs leading-5 text-blue-700">
          候选数量诊断字段 {section.diagnosticFields?.join(", ")} 均为 debug-only / not model-visible。
        </p>
      ) : null}
      {section.enteredModelContextMeaning ? (
        <p className="mt-1 text-xs leading-5 text-emerald-700">{section.enteredModelContextMeaning}</p>
      ) : null}
      <pre className="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-50 p-2 text-[11px] leading-5 text-slate-700 ring-1 ring-slate-100">
        {typeof section.value === "undefined" ? "undefined" : JSON.stringify(section.value, null, 2)}
      </pre>
    </div>
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
    title: "LangChain Tool Catalog",
    description: "当前 run 暴露给 DeepSeek native tool calling 的生产工具集合。",
    placement: "main_flow",
  },
  {
    id: "planner_model",
    title: "LangChain / DeepSeek",
    description: "模型请求配置、messages 摘要、DeepSeek tool_calls 和真实 token usage。",
    placement: "main_flow",
  },
  {
    id: "runtime_validation",
    title: "Runtime / Tool Wrapper / Validator",
    description: "LangChain runtime、tool wrapper 执行、结构化输出校验和失败收口。",
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
    title: "Production Response Adapter",
    description: "真实返回前端的 NDJSON 白名单事件摘要。",
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
  const boundary = readStepBoundary(step);

  if (boundary === "request_context") {
    return moduleDefinitionsById.request_context;
  }

  if (boundary === "langchain_runtime") {
    return moduleDefinitionsById.runtime_validation;
  }

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
      title: "LangChain / DeepSeek",
      description: "本轮模型请求、响应、provider tool_calls 和 token 明细。",
      steps: plannerSteps,
      modelCalls: plannerModelCalls,
      tokenUsage: sumTokenUsageValues(plannerModelCalls.map((call) => call.tokenUsage)),
    }));
  }

  if (runtimeSteps.length > 0) {
    modules.push(createLoopModule({
      id: "runtime_validation",
      title: "Runtime / Tool Wrapper / Validator",
      description: "本轮 LangChain runtime、tool wrapper、结构化校验和终态收口。",
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
      const requestStep = group.steps.find((step) => readStepBoundary(step) === "request_context")
        ?? group.steps.find((step) => step.type === "user_input");
      const input = isRecord(requestStep?.input) ? requestStep.input : {};
      const output = isRecord(requestStep?.output) ? requestStep.output : {};

      return [
        { label: "最新用户输入", value: readString(input.latestUserMessage) || readString(output.latestUserMessage) || "-" },
        { label: "消息数", value: formatOptionalNumber(readNumber(input.messageCount) ?? readNumber(output.messageCount)) },
        { label: "会话", value: readString(input.conversationId) || readString(output.conversationId) || "-" },
        { label: "tool catalog", value: formatToolNames(readStringArray(output.toolNames)) },
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
      const langChainRuntimeStep = [...group.steps].reverse().find((step) => readLangChainRuntimeTraceSummary(step));
      const langChainSummary = langChainRuntimeStep ? readLangChainRuntimeTraceSummary(langChainRuntimeStep) : undefined;
      const langChainOutput = isRecord(langChainRuntimeStep?.output) ? langChainRuntimeStep.output : {};

      if (langChainSummary) {
        return [
          { label: "runtime", value: readString(langChainSummary.runtimeVersion) || "LangChain" },
          { label: "model", value: readString(langChainSummary.model) || "-" },
          { label: "provider tool_calls", value: formatProviderToolCallSummary(langChainSummary.providerToolCalls) },
          { label: "tool wrappers", value: formatLangChainToolExecutionSummary(langChainOutput.toolExecutions) },
          { label: "structured output", value: formatStructuredOutputValidation(langChainOutput.structuredOutputValidation) },
          { label: "旧 core", value: "未使用 AgentAction / PlannerPort / ToolRegistry" },
        ];
      }

      const validation = [...group.steps].reverse().find((step) => step.type === "validation" || readRuntimeEventType(step) === "validation_result");
      const validationOutput = isRecord(validation?.output) ? validation.output : {};
      const budgetEvents = group.steps.filter((step) => step.type === "token_budget" || readRuntimeEventType(step) === "budget_event");
      const toolNames = readLoopToolNames(group.steps);

      return [
        { label: "toolName", value: formatToolNames(toolNames) },
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
      const eventTypes = readStringArray(output.eventTypes);

      return [
        { label: "event types", value: formatEventTypes(output.eventTypes) || "-" },
        { label: "done", value: eventTypes.includes("done") || output.done === true ? "true" : "false" },
        { label: "suggestions", value: formatOptionalNumber(readNumber(output.suggestedQuestionCount) ?? readNumber(output.suggestionCount)) },
        { label: "projection", value: readString(output.projectionType) || "-" },
        { label: "error code", value: readString(output.errorCode) || formatEventTypes(output.errorCodes) || "-" },
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
      return "未记录独立模型请求步骤。LangChain runtime 摘要可能已在 Runtime 模块中记录 provider tool_calls。";
    case "registry_manifest":
      return "本次 trace 未记录独立 tool catalog 快照；LangChain 请求上下文或 runtime 摘要中可查看 toolNames。";
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

function readStepBoundary(step: AiTraceStep) {
  const metadata = isRecord(step.metadata) ? step.metadata : {};
  const boundary = metadata.boundary;

  return typeof boundary === "string" ? boundary : undefined;
}

function readLangChainRuntimeTraceSummary(step: AiTraceStep) {
  const output = isRecord(step.output) ? step.output : {};
  const traceSummary = isRecord(output.traceSummary) ? output.traceSummary : undefined;

  if (!traceSummary || typeof traceSummary.runtimeVersion !== "string") {
    return undefined;
  }

  return traceSummary;
}

function readStepRuntimeStep(step: AiTraceStep) {
  const metadata = isRecord(step.metadata) ? step.metadata : {};
  const output = isRecord(step.output) ? step.output : {};
  const runtimeLinkage = isRecord(output.runtimeLinkage)
    ? output.runtimeLinkage
    : isRecord(metadata.runtimeLinkage)
      ? metadata.runtimeLinkage
      : {};

  const directStep = readNumber(metadata.runtimeStep)
    ?? readNumber(output.runtimeStep)
    ?? readNumber(runtimeLinkage.runtimeStep)
    ?? readNumber(output.step)
    ?? readNumber(metadata.step);

  if (directStep !== undefined) {
    return directStep;
  }

  if (metadata.pipeline === "langchain-agent-text-chat" && readStepBoundary(step) === "langchain_runtime") {
    return 1;
  }

  return undefined;
}

function readStepPlannerCallIndex(step: AiTraceStep) {
  const metadata = isRecord(step.metadata) ? step.metadata : {};
  const output = isRecord(step.output) ? step.output : {};
  const runtimeLinkage = isRecord(output.runtimeLinkage)
    ? output.runtimeLinkage
    : isRecord(metadata.runtimeLinkage)
      ? metadata.runtimeLinkage
      : {};

  return readNumber(metadata.modelCallIndex)
    ?? readNumber(output.modelCallIndex)
    ?? readNumber(runtimeLinkage.modelCallIndex)
    ?? readNumber(metadata.plannerCallIndex)
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
  const langChainSummary = readLangChainRuntimeTraceSummary(step);

  if (langChainSummary) {
    return uniqueStrings([
      ...readProviderToolCallNames(langChainSummary.providerToolCalls),
      ...readToolExecutionNames(output.toolExecutions),
    ]);
  }

  const runtimeEventType = readRuntimeEventType(step);
  const actionType = readString(output.actionType);
  const toolName = readString(output.toolName) || readString(metadata.toolName) || readString(input.toolName);

  if (
    step.type === "tool_call" ||
    runtimeEventType === "tool_execution" ||
    (step.type === "model_response" && actionType === "tool_call")
  ) {
    return uniqueStrings([
      ...(toolName ? [toolName] : []),
      ...readProviderToolCallNames(output.providerToolCalls),
    ]);
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
  return toolNames.length > 0 ? toolNames.join(", ") : "未记录 Tool";
}

function formatProviderToolCallSummary(value: unknown) {
  const names = readProviderToolCallNames(value);

  return names.length > 0 ? `${names.length} 次：${names.join(", ")}` : "0 次";
}

function formatLangChainToolExecutionSummary(value: unknown) {
  const executions = readToolExecutions(value);

  if (executions.length === 0) {
    return "0 次";
  }

  const succeeded = executions.filter((execution) => execution.status === "succeeded").length;
  const failed = executions.filter((execution) => execution.status === "failed").length;
  const duplicateInputs = executions.filter((execution) => execution.status === "duplicate_input").length;
  const names = uniqueStrings(executions.map((execution) => execution.toolName).filter(Boolean));

  return `${executions.length} 次，成功 ${succeeded} / 失败 ${failed} / 重复输入 ${duplicateInputs}${names.length ? `：${names.join(", ")}` : ""}`;
}

function formatStructuredOutputValidation(value: unknown) {
  if (!isRecord(value)) {
    return "未记录";
  }

  const count = readNumber(value.validatedVisibleOutputCount) ?? 0;

  return `validated visible outputs: ${count}`;
}

function readProviderToolCallNames(value: unknown) {
  return Array.isArray(value)
    ? uniqueStrings(value
      .map((item) => (isRecord(item) ? readString(item.name) : undefined))
      .filter((name): name is string => Boolean(name)))
    : [];
}

function readToolExecutionNames(value: unknown) {
  return uniqueStrings(readToolExecutions(value).map((execution) => execution.toolName).filter(Boolean));
}

function readToolExecutions(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const toolName = readString(item.toolName);
    const status = readString(item.status);

    if (!toolName) {
      return [];
    }

    return [{
      toolName,
      status,
      failureCode: readString(item.failureCode),
    }];
  });
}

// readStepToolExecutionVisibilityRecords 找出页面中需要以消费方边界展示的 LangChain tool execution。
function readStepToolExecutionVisibilityRecords(step: AiTraceStep) {
  const output = isRecord(step.output) ? step.output : {};
  const records: Array<{ id: string; execution: Record<string, unknown>; source: string }> = [];
  const runtimeToolExecutions = Array.isArray(output.toolExecutions)
    ? output.toolExecutions.filter((item): item is Record<string, unknown> => isRecord(item))
    : [];

  runtimeToolExecutions.forEach((execution, index) => {
    if (!hasToolExecutionVisibilityBoundary(execution)) {
      return;
    }

    records.push({
      id: `${step.id}:runtime-tool-execution:${index}`,
      execution,
      source: "runtime summary toolExecutions",
    });
  });

  if (hasToolExecutionVisibilityBoundary(output)) {
    records.push({
      id: `${step.id}:step-output`,
      execution: output,
      source: "step output",
    });
  }

  return records;
}

function hasToolExecutionVisibilityBoundary(execution: Record<string, unknown>) {
  return (
    Object.prototype.hasOwnProperty.call(execution, "modelVisibleSummary") ||
    Object.prototype.hasOwnProperty.call(execution, "userProjection") ||
    Object.prototype.hasOwnProperty.call(execution, "traceSummary") ||
    Object.prototype.hasOwnProperty.call(execution, "enteredModelContext")
  );
}

// createToolExecutionVisibilitySections 为页面分区和测试暴露同一套可见性派生语义。
export function createToolExecutionVisibilitySections(execution: Record<string, unknown>): ToolExecutionVisibilitySection[] {
  return (Object.keys(toolExecutionVisibilityDefinitions) as ToolExecutionVisibilityField[]).map((field) => {
    const visibility = toolExecutionVisibilityDefinitions[field];
    const value = execution[field];

    return {
      field,
      title: visibility.label,
      ...visibility,
      value,
      diagnosticFields: field === "traceSummary" ? readCandidateDiagnosticFields(value) : undefined,
      enteredModelContext: field === "modelVisibleSummary" ? execution.enteredModelContext === true : undefined,
      enteredModelContextMeaning: field === "modelVisibleSummary"
        ? formatEnteredModelContextMeaning(execution.enteredModelContext === true)
        : undefined,
    };
  });
}

// createToolExecutionOutputVisibility 是导出报告中的紧凑字段级可见性合同，UI 文案由 viewer 渲染时补齐。
function createToolExecutionOutputVisibility() {
  return {
    modelVisibleSummary: toolExecutionVisibilityDefinitions.modelVisibleSummary.visibility,
    userProjection: toolExecutionVisibilityDefinitions.userProjection.visibility,
    traceSummary: toolExecutionVisibilityDefinitions.traceSummary.visibility,
  };
}

function formatEnteredModelContextMeaning(enteredModelContext: boolean) {
  return enteredModelContext
    ? "enteredModelContext=true 仅表示 modelVisibleSummary 已作为 ToolMessage 进入模型上下文。"
    : "enteredModelContext 未标记为 true；不得据此推断完整 execution record 进入模型。";
}

function readCandidateDiagnosticFields(value: unknown) {
  if (!isRecord(value)) {
    return [];
  }

  return ["totalMatches", "returnedCount", "truncated"].filter((field) => Object.prototype.hasOwnProperty.call(value, field));
}

function uniqueStrings(values: readonly string[]) {
  return Array.from(new Set(values));
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

  const plannerCallIndex = readStepPlannerCallIndex(step);

  if (plannerCallIndex === undefined) {
    return null;
  }

  const matchingResponse = peerSteps.find((candidate) => (
    candidate.type === "model_response" &&
    readStepPlannerCallIndex(candidate) === plannerCallIndex
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
    const plannerCallIndex = readStepPlannerCallIndex(step);
    const key = plannerCallIndex === undefined ? step.id : String(plannerCallIndex);
    const existing = calls.get(key) ?? {
      plannerCallIndex,
      modelCallIndex: readNumber(step.metadata?.modelCallIndex) ?? readNumber((isRecord(step.output) ? step.output : {}).modelCallIndex),
    };

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

function createPlannerModelCallReport(call: Record<string, unknown>) {
  const request = isRecord(call.request) ? call.request : {};
  const response = isRecord(call.response) ? call.response : {};
  const requestInput = isRecord(request.input) ? request.input : {};
  const requestOutput = isRecord(request.output) ? request.output : {};
  const requestMetadata = isRecord(request.metadata) ? request.metadata : {};
  const responseOutput = isRecord(response.output) ? response.output : {};
  const responseMetadata = isRecord(response.metadata) ? response.metadata : {};
  const providerToolCalls = Array.isArray(responseOutput.providerToolCalls) ? responseOutput.providerToolCalls : [];
  const responseBody = isRecord(responseOutput.response) ? responseOutput.response : {};
  const toolNames = readStringArray(requestInput.toolNames);
  const modelVisibleInputSnapshot = isRecord(requestInput.modelVisibleInputSnapshot)
    ? requestInput.modelVisibleInputSnapshot
    : undefined;
  const modelVisibleInputAudit = createPlannerModelVisibleInputAuditReport(modelVisibleInputSnapshot);

  return {
    plannerCallIndex: readNumber(call.plannerCallIndex),
    modelCallIndex: readNumber(call.modelCallIndex)
      ?? readNumber(requestOutput.modelCallIndex)
      ?? readNumber(responseOutput.modelCallIndex)
      ?? readNumber(requestMetadata.modelCallIndex)
      ?? readNumber(responseMetadata.modelCallIndex),
    runtimeStep: readNumber(responseOutput.runtimeStep)
      ?? readNumber(requestOutput.runtimeStep)
      ?? readNumber(responseMetadata.runtimeStep)
      ?? readNumber(requestMetadata.runtimeStep),
    request: Object.keys(request).length > 0
      ? {
          id: readString(request.id),
          messageCount: Array.isArray(requestInput.messages) ? requestInput.messages.length : undefined,
          toolCount: readNumber(requestOutput.toolCount) ?? toolNames.length,
          toolNames,
          modelVisibleInputSnapshot,
          modelVisibleInputAudit,
          budget: requestOutput.budget ?? modelVisibleInputSnapshot?.budget,
          toolAvailability: requestOutput.toolAvailability ?? modelVisibleInputSnapshot?.toolAvailability,
          thinking: requestOutput.thinking ?? requestMetadata.thinking,
        }
      : undefined,
    response: Object.keys(response).length > 0
      ? {
          id: readString(response.id),
          status: readString(response.status),
          parseStatus: readString(responseOutput.parseStatus),
          actionType: readString(responseOutput.actionType),
          toolName: readString(responseOutput.toolName),
          toolCallCount: providerToolCalls.length || undefined,
          providerToolCalls: providerToolCalls.map(createProviderToolCallReport),
          contentPreview: readString(responseBody.contentPreview) ?? readString(responseOutput.contentPreview),
          contentLength: readNumber(responseBody.contentLength) ?? readNumber(responseOutput.contentLength),
          reasoning: responseOutput.reasoning ?? responseMetadata.reasoning,
          failureCode: readString(responseOutput.failureCode),
        }
      : undefined,
    tokenUsage: readTokenUsage(responseOutput.tokenUsage) ?? readTokenUsage(responseMetadata.tokenUsage),
  };
}

// createPlannerModelVisibleInputAuditReport 只给导出报告标注旧 trace 的证据缺口，不补造模型输入内容。
function createPlannerModelVisibleInputAuditReport(snapshot: Record<string, unknown> | undefined) {
  const existingAudit = isRecord(snapshot?.modelVisibleInputAudit)
    ? snapshot.modelVisibleInputAudit
    : undefined;

  if (existingAudit) {
    return existingAudit;
  }

  return {
    sourceKind: "trace_export",
    completeness: "incomplete",
    missingModelVisibleParts: [
      "$.request.systemPrompt",
      "$.request.systemMessage.content",
      "$.request.messages",
      "$.request.tools",
      "$.request.finalizationTool",
      "$.requestSummary.budget",
    ],
    note: "当前 trace 只有 model_request 摘要或旧格式字段，不能证明完整 prompt、messages、tool description、schema description 或 finalization tool 已进入 provider request。请重新采集包含 modelVisibleInputSnapshot 的 trace。",
  };
}

function createProviderToolCallReport(value: unknown) {
  const call = isRecord(value) ? value : {};

  return {
    id: readString(call.id) ?? readString(call.toolCallId),
    name: readString(call.name) ?? readString(call.toolName),
    modelCallIndex: readNumber(call.modelCallIndex),
    runtimeStep: readNumber(call.runtimeStep),
    argsSummary: call.argsSummary,
  };
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
    modelCallIndex: readNumber(metadata.modelCallIndex) ?? readNumber(output.modelCallIndex),
    actionType: readString(output.actionType),
    toolName: readString(output.toolName) ?? readString(metadata.toolName),
    toolResultId: readString(output.toolResultId) ?? readString(metadata.toolResultId),
    failureCode: readString(output.failureCode),
    code: readString(output.code) ?? readString(error.code),
    thinking: step.type === "model_request" ? output.thinking ?? metadata.thinking : undefined,
    reasoning: step.type === "model_response" ? output.reasoning ?? metadata.reasoning : undefined,
    tokenUsage: getStepModelTokenUsage(step, []),
    langChainRuntime: readLangChainRuntimeTraceSummary(step)
      ? {
          runtimeVersion: readString(readLangChainRuntimeTraceSummary(step)?.runtimeVersion),
          model: readString(readLangChainRuntimeTraceSummary(step)?.model),
      providerToolCallCount: Array.isArray(readLangChainRuntimeTraceSummary(step)?.providerToolCalls)
            ? (readLangChainRuntimeTraceSummary(step)?.providerToolCalls as unknown[]).length
            : 0,
          modelCallCount: readNumber(readLangChainRuntimeTraceSummary(step)?.modelCallCount),
        }
      : undefined,
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
  const traceSummary = isRecord(output.traceSummary) ? output.traceSummary : undefined;

  if (traceSummary && typeof traceSummary.runtimeVersion === "string") {
    return {
      type: "langchain_runtime",
      runtimeVersion: readString(traceSummary.runtimeVersion),
      model: readString(traceSummary.model),
      toolNames: readStringArray(traceSummary.toolNames),
      modelCallCount: readNumber(traceSummary.modelCallCount),
      toolCallCount: readNumber(traceSummary.toolCallCount),
      messageCount: readNumber(traceSummary.messageCount),
      durationMs: readNumber(traceSummary.durationMs),
      providerToolCallCount: Array.isArray(traceSummary.providerToolCalls) ? traceSummary.providerToolCalls.length : undefined,
      toolExecutionCount: Array.isArray(output.toolExecutions) ? output.toolExecutions.length : undefined,
      structuredOutputValidation: output.structuredOutputValidation,
    };
  }

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
        status: readString(output.status),
        ok: output.ok === true,
        satisfied: output.satisfied === true,
        factChannel: readString(output.factChannel),
        failureCode: readString(output.failureCode),
        feedbackCode: readString(output.feedbackCode),
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

function readLangChainRuntimeSummaries(trace: AiTrace) {
  return trace.steps.flatMap((step) => {
    const traceSummary = readLangChainRuntimeTraceSummary(step);
    const output = isRecord(step.output) ? step.output : {};

    if (!traceSummary) {
      return [];
    }

    return [{
      stepId: step.id,
      runtimeVersion: readString(traceSummary.runtimeVersion),
      model: readString(traceSummary.model),
      toolNames: readStringArray(traceSummary.toolNames),
      modelRequestSummary: traceSummary.modelRequestSummary,
      modelResponseSummary: traceSummary.modelResponseSummary,
      modelCalls: Array.isArray(traceSummary.modelCalls) ? traceSummary.modelCalls : [],
      providerToolCalls: Array.isArray(traceSummary.providerToolCalls) ? traceSummary.providerToolCalls : [],
      modelCallCount: readNumber(traceSummary.modelCallCount),
      toolCallCount: readNumber(traceSummary.toolCallCount),
      messageCount: readNumber(traceSummary.messageCount),
      durationMs: readNumber(traceSummary.durationMs),
      toolExecutions: Array.isArray(output.toolExecutions) ? output.toolExecutions : [],
      structuredOutputValidation: output.structuredOutputValidation,
    }];
  });
}

function createLangChainRuntimeSummaryReport(summary: Record<string, unknown>) {
  const toolExecutions = Array.isArray(summary.toolExecutions) ? summary.toolExecutions : [];
  const providerToolCalls = Array.isArray(summary.providerToolCalls) ? summary.providerToolCalls : [];

  return {
    stepId: readString(summary.stepId),
    runtimeVersion: readString(summary.runtimeVersion),
    model: readString(summary.model),
    toolNames: readStringArray(summary.toolNames),
    modelCallCount: readNumber(summary.modelCallCount),
    toolCallCount: readNumber(summary.toolCallCount),
    messageCount: readNumber(summary.messageCount),
    durationMs: readNumber(summary.durationMs),
    providerToolCallCount: providerToolCalls.length,
    toolExecutionCount: toolExecutions.length,
    structuredOutputValidation: summary.structuredOutputValidation,
  };
}

function createLangChainToolExecutionReport(execution: Record<string, unknown>) {
  const outputVisibility = createToolExecutionOutputVisibility();
  const diagnosticFields = readCandidateDiagnosticFields(execution.traceSummary);

  return {
    toolCallId: readString(execution.toolCallId),
    toolName: readString(execution.toolName),
    status: readString(execution.status),
    durationMs: readNumber(execution.durationMs),
    inputSummary: execution.inputSummary,
    modelVisibleSummary: execution.modelVisibleSummary,
    userProjection: execution.userProjection,
    traceSummary: execution.traceSummary,
    outputVisibility,
    ...(diagnosticFields.length > 0
      ? {
        candidateDiagnosticsVisibility: {
          fields: diagnosticFields,
          visibility: outputVisibility.traceSummary,
        },
      }
      : {}),
    enteredModelContext: execution.enteredModelContext,
    sequence: readNumber(execution.sequence),
    modelCallIndex: readNumber(execution.modelCallIndex),
    runtimeStep: readNumber(execution.runtimeStep),
    failureCode: readString(execution.failureCode),
    feedbackCode: readString(execution.feedbackCode),
    schemaIssues: execution.schemaIssues,
  };
}

function createProviderToolCallReports(summaries: Record<string, unknown>[]) {
  return summaries.flatMap((summary) => (
    Array.isArray(summary.providerToolCalls)
      ? summary.providerToolCalls.map(createProviderToolCallReport)
      : []
  ));
}

function createLangChainToolExecutionReports(
  summaries: Record<string, unknown>[],
  detailState: TraceLogDetailState,
) {
  return summaries
    .flatMap((summary) => (Array.isArray(summary.toolExecutions) ? summary.toolExecutions : []))
    .filter((execution): execution is Record<string, unknown> => isRecord(execution))
    .map((execution, index) => {
      const outputVisibility = createToolExecutionOutputVisibility();
      const report = createLangChainToolExecutionReport(execution);

      return {
        ...report,
        detailRef: createTraceLogDetailEntry(detailState, {
          path: `$.langChainToolExecutions[${index}]`,
          kind: "tool_execution_detail",
          visibility: outputVisibility,
          summary: {
            toolName: readString(execution.toolName),
            status: readString(execution.status),
            toolCallId: readString(execution.toolCallId),
            runtimeStep: readNumber(execution.runtimeStep),
            modelCallIndex: readNumber(execution.modelCallIndex),
            outputVisibility,
          },
          content: {
            ...execution,
            outputVisibility,
            ...(report.candidateDiagnosticsVisibility
              ? { candidateDiagnosticsVisibility: report.candidateDiagnosticsVisibility }
              : {}),
          },
        }),
      };
    });
}

function createLangChainRuntimeReports(
  summaries: Record<string, unknown>[],
  detailState: TraceLogDetailState,
) {
  return summaries.map((summary, index) => ({
    ...createLangChainRuntimeSummaryReport(summary),
    detailRef: createTraceLogDetailEntry(detailState, {
      path: `$.langChainRuntimeSummaries[${index}]`,
      kind: "langchain_runtime_detail",
      summary: {
        stepId: readString(summary.stepId),
        runtimeVersion: readString(summary.runtimeVersion),
        model: readString(summary.model),
        modelCallCount: readNumber(summary.modelCallCount),
        toolCallCount: readNumber(summary.toolCallCount),
      },
      content: summary,
    }),
  }));
}

function createPlannerModelCallReports(
  calls: Record<string, unknown>[],
  detailState: TraceLogDetailState,
) {
  return calls.map((call, index) => {
    const report = createPlannerModelCallReport(call);

    return {
      ...report,
      detailRef: createTraceLogDetailEntry(detailState, {
        path: `$.plannerModelCalls[${index}]`,
        kind: "model_call_detail",
        summary: {
          plannerCallIndex: report.plannerCallIndex,
          modelCallIndex: report.modelCallIndex,
          runtimeStep: report.runtimeStep,
          actionType: isRecord(report.response) ? readString(report.response.actionType) : undefined,
          toolName: isRecord(report.response) ? readString(report.response.toolName) : undefined,
        },
        content: call,
      }),
    };
  });
}

// createTraceLogPayload 生成 Codex 优先阅读的轻量索引 bundle，主报告只保留因果索引和可追溯 ref。
export function createTraceLogPayload(trace: AiTrace, groups: TraceStepGroup[]): TraceLogExportBundle {
  const tokenUsageSummary = getTraceTokenUsage(trace);
  const agentLoops = buildAgentLoopTimeline(trace.steps);
  const langChainRuntimeSummaries = readLangChainRuntimeSummaries(trace);
  const plannerModelCalls = readPlannerModelCalls(trace);
  const detailState: TraceLogDetailState = { details: [] };
  const dedupeState = createTraceLogDedupeState();
  const modelInputs = createTraceLogModelInputRecords(plannerModelCalls, dedupeState);
  const modelInputRefsByPlannerCall = createModelInputRefLookup(modelInputs);
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
  const runtimeReports = createLangChainRuntimeReports(langChainRuntimeSummaries, detailState);
  const toolExecutionReports = createLangChainToolExecutionReports(langChainRuntimeSummaries, detailState);
  const events = createTraceLogEventRecords(trace, agentLoops, detailState, modelInputRefsByPlannerCall);
  const loopTimeline = createTraceLogLoopTimeline(agentLoops, events, modelInputs);
  const preliminaryReport = {
    traceSummary: {
      ...createTraceReportSummary(trace),
      errorCode: readLatestErrorCode(trace.steps),
      detailRef: traceDetailRef,
      responseSummary: summarizeTraceResponseForIndex(readTraceResponseSummary(trace)),
      moduleGroups: groups.map((group) => ({
        id: group.id,
        title: group.title,
        stepIds: group.steps.map((step) => step.id),
        status: group.status,
        durationMs: group.durationMs,
        summary: group.summary,
        skipReason: group.skipReason,
      })),
      runtimeSummaryRefs: runtimeReports.map((item) => item.detailRef),
      toolExecutionRefs: toolExecutionReports.map((item) => item.detailRef),
      providerToolCalls: createProviderToolCallReports(langChainRuntimeSummaries),
    },
    loopTimeline: compactTraceLogLoopTimeline(loopTimeline),
    failureIndex: createTraceLogFailureIndex(trace, events, modelInputRefsByPlannerCall),
    tokenUsageSummary,
    lookupGuide: createTraceLogLookupGuide(),
    fileManifest: {},
  };
  const externalized = finalizeTraceLogDetailHashes(extractTraceLogLongTexts({
    report: preliminaryReport,
    events,
    modelInputs,
    details: detailState.details,
  }));
  const report = isRecord(externalized.report) ? externalized.report : preliminaryReport;
  const externalizedEvents = Array.isArray(externalized.events)
    ? externalized.events.filter((item): item is TraceLogEventRecord => isRecord(item))
    : events;
  const externalizedModelInputs = Array.isArray(externalized.modelInputs)
    ? externalized.modelInputs
        .filter((item): item is TraceLogModelInputRecord => isRecord(item))
        .map(addModelInputMessageRefs)
    : modelInputs;
  const longTexts = Array.isArray(externalized.longTexts)
    ? externalized.longTexts.filter((item): item is TraceLogLongTextEntry => isRecord(item))
    : [];
  const details = Array.isArray(externalized.details)
    ? externalized.details.filter((item): item is TraceLogDetailEntry => isRecord(item))
    : [];
  const manifest = createTraceLogFileManifest({
    report,
    events: externalizedEvents,
    modelInputs: externalizedModelInputs,
    texts: dedupeState.entries,
    longTexts,
    details,
  });
  const finalReport = {
    ...report,
    fileManifest: manifest,
  };

  return {
    report: finalReport,
    events: externalizedEvents,
    modelInputs: externalizedModelInputs,
    texts: dedupeState.entries,
    longTexts,
    details,
    manifest,
  };
}

function createTraceLogDedupeState(): TraceLogDedupeState {
  return {
    entries: [],
    byHash: new Map(),
    counters: {
      system_prompt: 0,
      tool_catalog: 0,
      tool_description: 0,
      tool_schema: 0,
      schema_description: 0,
      finalization_schema: 0,
    },
  };
}

// createTraceLogModelInputRecords 将每轮 provider request 的审计证据移出主报告，并用 hash/ref 指向重复 prompt 和 schema。
function createTraceLogModelInputRecords(
  calls: Record<string, unknown>[],
  dedupeState: TraceLogDedupeState,
): TraceLogModelInputRecord[] {
  return calls.map((call, index) => {
    const request = isRecord(call.request) ? call.request : {};
    const requestInput = isRecord(request.input) ? request.input : {};
    const requestOutput = isRecord(request.output) ? request.output : {};
    const snapshot = isRecord(requestInput.modelVisibleInputSnapshot)
      ? requestInput.modelVisibleInputSnapshot
      : undefined;
    const audit = createPlannerModelVisibleInputAuditReport(snapshot);
    const snapshotToolNames = readStringArray(snapshot?.toolNames);
    const toolNames = readStringArray(requestInput.toolNames);
    const registeredRefs = snapshot
      ? registerModelVisibleSnapshotDedupeRefs(snapshot, index, dedupeState)
      : { schemaRefs: [] };

    return {
      recordType: "model_input",
      modelInputRef: createModelInputRef(index + 1),
      plannerCallIndex: readNumber(call.plannerCallIndex),
      modelCallIndex: readNumber(call.modelCallIndex)
        ?? readNumber(requestOutput.modelCallIndex)
        ?? readNumber(request.metadata && isRecord(request.metadata) ? request.metadata.modelCallIndex : undefined),
      runtimeStep: readNumber(requestOutput.runtimeStep)
        ?? readNumber(request.metadata && isRecord(request.metadata) ? request.metadata.runtimeStep : undefined),
      requestStepId: readString(request.id),
      messageCount: Array.isArray(requestInput.messages)
        ? requestInput.messages.length
        : readNumber(requestOutput.messageCount) ?? readNumber(snapshot?.messageCount),
      messageRefs: [],
      toolCount: readNumber(requestOutput.toolCount) ?? readNumber(snapshot?.toolCount) ?? toolNames.length,
      toolNames: toolNames.length > 0 ? toolNames : snapshotToolNames,
      ...registeredRefs,
      budget: requestOutput.budget ?? snapshot?.budget,
      toolAvailability: requestOutput.toolAvailability ?? snapshot?.toolAvailability,
      audit,
      evidence: {
        source: snapshot ? "modelVisibleInputSnapshot" : "legacy_model_request_summary",
        messages: requestInput.messages,
        modelVisibleInputSnapshot: snapshot
          ? createModelInputSnapshotEvidence(snapshot)
          : undefined,
      },
    };
  });
}

function registerModelVisibleSnapshotDedupeRefs(
  snapshot: Record<string, unknown>,
  callIndex: number,
  state: TraceLogDedupeState,
) {
  const schemaRefs: string[] = [];
  const systemPrompt = readSnapshotText(snapshot.systemPrompt);
  const finalizationTool = isRecord(snapshot.finalizationTool) ? snapshot.finalizationTool : undefined;
  const tools = Array.isArray(snapshot.tools) ? snapshot.tools.filter((item): item is Record<string, unknown> => isRecord(item)) : [];
  const systemPromptRef = systemPrompt
    ? registerDedupeText(state, {
      kind: "system_prompt",
      path: `$.modelInputs[${callIndex}].systemPrompt`,
      content: systemPrompt,
    }).ref
    : undefined;
  const toolCatalogRef = tools.length > 0
    ? registerDedupeText(state, {
      kind: "tool_catalog",
      path: `$.modelInputs[${callIndex}].tools`,
      content: safeStringifyTraceDetail(tools),
    }).ref
    : undefined;
  const finalizationToolRef = finalizationTool
    ? registerDedupeText(state, {
      kind: "finalization_schema",
      path: `$.modelInputs[${callIndex}].finalizationTool`,
      content: safeStringifyTraceDetail(finalizationTool),
    }).ref
    : undefined;

  for (const [toolIndex, tool] of tools.entries()) {
    const description = readSnapshotText(tool.description);
    const inputSchema = readSnapshotText(tool.inputSchema) ?? safeStringifyTraceDetail(tool.inputSchema);

    if (description) {
      schemaRefs.push(registerDedupeText(state, {
        kind: "tool_description",
        path: `$.modelInputs[${callIndex}].tools[${toolIndex}].description`,
        content: description,
      }).ref);
    }
    if (inputSchema && inputSchema !== "undefined") {
      schemaRefs.push(registerDedupeText(state, {
        kind: "tool_schema",
        path: `$.modelInputs[${callIndex}].tools[${toolIndex}].inputSchema`,
        content: inputSchema,
      }).ref);
    }

    const descriptions = Array.isArray(tool.schemaDescriptions)
      ? tool.schemaDescriptions.filter((item): item is Record<string, unknown> => isRecord(item))
      : [];

    for (const [descriptionIndex, schemaDescription] of descriptions.entries()) {
      const text = readSnapshotText(schemaDescription.text) ?? readString(schemaDescription.text);

      if (!text) {
        continue;
      }
      schemaRefs.push(registerDedupeText(state, {
        kind: "schema_description",
        path: `$.modelInputs[${callIndex}].tools[${toolIndex}].schemaDescriptions[${descriptionIndex}]`,
        content: text,
      }).ref);
    }
  }

  return {
    systemPromptRef,
    toolCatalogRef,
    finalizationToolRef,
    schemaRefs: Array.from(new Set(schemaRefs)),
  };
}

function registerDedupeText(
  state: TraceLogDedupeState,
  input: {
    kind: TraceLogDedupeTextKind;
    path: string;
    content: string;
  },
) {
  const hash = hashLongText(`${input.kind}:${input.content}`);
  const existing = state.byHash.get(hash);

  if (existing) {
    return existing;
  }

  state.counters[input.kind] += 1;

  const entry: TraceLogDedupeTextEntry = {
    recordType: "deduped_text",
    ref: createDedupeRef(input.kind, state.counters[input.kind]),
    refKind: input.kind,
    path: input.path,
    hash,
    originalLength: input.content.length,
    preview: createLongTextPreview(input.content),
    content: input.content,
    textFile: "codex_logs/ai_trace_texts.jsonl",
  };

  state.entries.push(entry);
  state.byHash.set(hash, entry);

  return entry;
}

function createDedupeRef(kind: TraceLogDedupeTextKind, index: number) {
  const suffix = String(index).padStart(4, "0");

  switch (kind) {
    case "tool_catalog":
      return `tool_catalog_${suffix}`;
    case "system_prompt":
      return `system_prompt_${suffix}`;
    case "tool_description":
      return `tool_description_${suffix}`;
    case "tool_schema":
      return `tool_schema_${suffix}`;
    case "schema_description":
      return `schema_description_${suffix}`;
    case "finalization_schema":
      return `finalization_schema_${suffix}`;
  }
}

function addModelInputMessageRefs(record: TraceLogModelInputRecord): TraceLogModelInputRecord {
  return {
    ...record,
    messageRefs: collectTraceLogContentRefs(record.evidence),
  };
}

function collectTraceLogContentRefs(value: unknown): TraceLogLongTextRef[] {
  const refs = new Map<string, TraceLogLongTextRef>();

  visitTraceLogContentRefs(value, (ref) => {
    refs.set(ref.contentRef, ref);
  });

  return Array.from(refs.values());
}

function visitTraceLogContentRefs(value: unknown, onRef: (ref: TraceLogLongTextRef) => void) {
  if (Array.isArray(value)) {
    for (const item of value) {
      visitTraceLogContentRefs(item, onRef);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (typeof value.contentRef === "string") {
    onRef(value as TraceLogLongTextRef);
    return;
  }

  for (const child of Object.values(value)) {
    visitTraceLogContentRefs(child, onRef);
  }
}

function readSnapshotText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const content = value.content;
  const longText = readTraceLongTextEnvelope(content);

  if (longText) {
    return longText.content;
  }

  if (typeof content === "string") {
    return content;
  }

  return undefined;
}

function createModelInputSnapshotEvidence(snapshot: Record<string, unknown>) {
  return {
    sourceKind: readString(snapshot.sourceKind),
    messageCount: readNumber(snapshot.messageCount),
    toolCount: readNumber(snapshot.toolCount),
    toolNames: readStringArray(snapshot.toolNames),
    messages: snapshot.messages,
    systemMessage: snapshot.systemMessage,
    budget: snapshot.budget,
    toolAvailability: snapshot.toolAvailability,
    modelVisibleInputAudit: snapshot.modelVisibleInputAudit,
  };
}

function createModelInputRef(index: number) {
  return `model_input_${String(index).padStart(4, "0")}`;
}

function createModelInputRefLookup(records: TraceLogModelInputRecord[]) {
  const refs = new Map<number, string>();

  for (const record of records) {
    if (record.plannerCallIndex !== undefined) {
      refs.set(record.plannerCallIndex, record.modelInputRef);
    }
  }

  return refs;
}

// createTraceLogEventRecords 将可诊断事件移入 JSONL 映射，主报告只保留 loop/failure 指针。
function createTraceLogEventRecords(
  trace: AiTrace,
  loops: TraceLoopTurn[],
  detailState: TraceLogDetailState,
  modelInputRefsByPlannerCall: Map<number, string>,
): TraceLogEventRecord[] {
  const loopNumberByRuntimeStep = new Map(
    loops.map((loop) => [loop.runtimeStep, loop.loopNumber]),
  );

  return trace.steps
    .filter(shouldExportTraceEvent)
    .map((step, index) => {
      const summary = createTraceStepReportSummary(step);
      const plannerCallIndex = readStepPlannerCallIndex(step);
      const runtimeStep = readStepRuntimeStep(step);
      const detailRef = createTraceLogDetailEntry(detailState, {
        path: `$.events[${index}]`,
        kind: "runtime_event_detail",
        summary,
        content: createTraceStepDetail(step),
      });

      return {
        recordType: "event",
        eventRef: createEventRef(index + 1),
        kind: classifyTraceEventKind(step),
        loopNumber: runtimeStep === undefined ? undefined : loopNumberByRuntimeStep.get(runtimeStep),
        stepId: step.id,
        plannerCallIndex,
        runtimeStep,
        toolName: readString(summary.toolName),
        status: step.status,
        code: readString(summary.code) ?? readString(summary.failureCode),
        tokenUsage: readStepTokenUsage(step),
        modelInputRef: plannerCallIndex === undefined ? undefined : modelInputRefsByPlannerCall.get(plannerCallIndex),
        inputRef: step.type === "model_request" && plannerCallIndex !== undefined
          ? modelInputRefsByPlannerCall.get(plannerCallIndex)
          : undefined,
        outputRef: readString(summary.toolResultId),
        detailRef,
        summary: createRuntimeTraceEventReport(step),
      };
    });
}

function shouldExportTraceEvent(step: AiTraceStep) {
  return [
    "model_request",
    "model_response",
    "runtime_event",
    "validation",
    "token_budget",
    "tool_call",
    "final_response",
    "response_write",
    "error",
  ].includes(step.type);
}

function classifyTraceEventKind(step: AiTraceStep) {
  const metadata = isRecord(step.metadata) ? step.metadata : {};
  const output = isRecord(step.output) ? step.output : {};

  if (step.type === "model_request") {
    return "model_call";
  }
  if (step.type === "model_response") {
    return metadata.boundary === "terminal_failure_finalizer" ? "terminal_failure" : "model_response";
  }
  if (step.type === "tool_call") {
    return "tool_execution";
  }
  if (step.type === "validation" || step.type === "token_budget") {
    return "runtime_validation";
  }
  if (step.type === "final_response" || step.type === "response_write") {
    return "final_response_projection";
  }
  if (step.type === "error" || step.status === "failed" || readString(output.failureCode)) {
    return "terminal_failure";
  }

  return "runtime_event";
}

function createEventRef(index: number) {
  return `event_${String(index).padStart(4, "0")}`;
}

function createTraceLogLoopTimeline(
  loops: TraceLoopTurn[],
  events: TraceLogEventRecord[],
  modelInputs: TraceLogModelInputRecord[],
) {
  return loops.map((loop) => {
    const loopEvents = events.filter((event) => event.loopNumber === loop.loopNumber);
    const loopModelInputRefs = new Set(
      modelInputs
        .filter((record) => record.runtimeStep === loop.runtimeStep || (
          record.plannerCallIndex !== undefined && loop.plannerCallIndexes.includes(record.plannerCallIndex)
        ))
        .map((record) => record.modelInputRef),
    );

    return {
      loopNumber: loop.loopNumber,
      runtimeStep: loop.runtimeStep,
      status: loop.status,
      toolNames: loop.toolNames,
      plannerCallIndexes: loop.plannerCallIndexes,
      stepIds: loop.steps.map((step) => step.id),
      eventRefs: loopEvents.map((event) => event.eventRef),
      modelInputRefs: Array.from(loopModelInputRefs),
      tokenUsage: loop.tokenUsage,
      durationMs: loop.durationMs,
    };
  });
}

function compactTraceLogLoopTimeline(timeline: Array<Record<string, unknown>>) {
  if (timeline.length <= traceLogReportLoopBudget) {
    return timeline;
  }

  const edgeSize = Math.floor(traceLogReportLoopBudget / 2);

  return {
    totalCount: timeline.length,
    budget: traceLogReportLoopBudget,
    omittedCount: timeline.length - traceLogReportLoopBudget,
    head: timeline.slice(0, edgeSize),
    tail: timeline.slice(-edgeSize),
  };
}

function createTraceLogFailureIndex(
  trace: AiTrace,
  events: TraceLogEventRecord[],
  modelInputRefsByPlannerCall: Map<number, string>,
) {
  const failedEvent = [...events].reverse().find((event) => (
    event.status === "failed" ||
    event.kind === "terminal_failure" ||
    typeof event.code === "string"
  ));
  const finalDecision = trace.finalDecision;
  const finalDecisionCode = finalDecision?.code;

  if (!failedEvent && !finalDecisionCode) {
    return {
      status: "none",
      finalDecision,
    };
  }

  const plannerCallIndex = failedEvent?.plannerCallIndex;

  return {
    status: "failed_or_recoverable",
    finalDecision,
    loopNumber: failedEvent?.loopNumber,
    runtimeStep: failedEvent?.runtimeStep,
    plannerCallIndex,
    stepId: failedEvent?.stepId,
    toolName: failedEvent?.toolName,
    errorCode: failedEvent?.code ?? finalDecisionCode,
    eventRef: failedEvent?.eventRef,
    modelInputRef: failedEvent?.modelInputRef
      ?? (plannerCallIndex === undefined ? undefined : modelInputRefsByPlannerCall.get(plannerCallIndex)),
    detailRef: failedEvent?.detailRef,
    toolResultRef: failedEvent?.outputRef,
  };
}

function summarizeTraceResponseForIndex(value: unknown) {
  const record = isRecord(value) ? value : {};

  if (Object.keys(record).length === 0) {
    return null;
  }

  return {
    eventTypes: record.eventTypes,
    done: record.done,
    projectionType: record.projectionType,
    visibleOutputCount: readNumber(record.visibleOutputCount),
    suggestedQuestionCount: readNumber(record.suggestedQuestionCount),
    contentLength: typeof record.content === "string" ? record.content.length : undefined,
  };
}

function createTraceLogLookupGuide() {
  return {
    defaultEntry: "先读 codex_logs/ai_trace_log.js 的 traceSummary、loopTimeline、failureIndex。",
    byEventRef: "rg '\"eventRef\":\"event_0001\"' codex_logs/ai_trace_events.jsonl",
    byLoopNumber: "rg '\"loopNumber\":1' codex_logs/ai_trace_events.jsonl",
    byStepId: "rg '\"stepId\":\"step-id\"' codex_logs/ai_trace_events.jsonl",
    byToolName: "rg '\"toolName\":\"searchExerciseResources\"' codex_logs/ai_trace_events.jsonl",
    byModelInputRef: "rg '\"modelInputRef\":\"model_input_0001\"' codex_logs/ai_trace_model_inputs.jsonl",
    byContentRef: "rg '\"contentRef\":\"text_0001\"' codex_logs/ai_trace_texts.jsonl",
    byDetailRef: "rg '\"detailRef\":\"detail_0001\"' codex_logs/ai_trace_texts.jsonl",
    bySchemaRef: "rg '\"ref\":\"tool_schema_0001\"' codex_logs/ai_trace_texts.jsonl",
    byParentRef: "rg '\"parentRef\":\"text_0001\"' codex_logs/ai_trace_texts.jsonl",
  };
}

function createTraceLogFileManifest(input: {
  report: Record<string, unknown>;
  events: TraceLogEventRecord[];
  modelInputs: TraceLogModelInputRecord[];
  texts: TraceLogDedupeTextEntry[];
  longTexts: TraceLogLongTextEntry[];
  details: TraceLogDetailEntry[];
}) {
  return {
    schemaVersion: traceLogReportSchemaVersion,
    files: {
      report: "codex_logs/ai_trace_log.js",
      events: "codex_logs/ai_trace_events.jsonl",
      modelInputs: "codex_logs/ai_trace_model_inputs.jsonl",
      texts: "codex_logs/ai_trace_texts.jsonl",
    },
    counts: {
      events: input.events.length,
      modelInputs: input.modelInputs.length,
      dedupedTexts: input.texts.length,
      longTexts: input.longTexts.length,
      details: input.details.length,
    },
    dedupe: {
      uniqueHashCount: new Set(input.texts.map((item) => item.hash)).size,
      refs: input.texts.map((item) => ({
        ref: item.ref,
        refKind: item.refKind,
        hash: item.hash,
        path: item.path,
      })),
    },
    budgets: {
      longTextThreshold: traceLogLongTextThreshold,
      reportLoopBudget: traceLogReportLoopBudget,
      reportApproxBytes: safeStringifyTraceDetail(input.report).length,
    },
  };
}

function createTraceLogDetailEntry(
  state: TraceLogDetailState,
  input: {
    path: string;
    kind: TraceLogDetailKind;
    summary: Record<string, unknown>;
    visibility?: ToolExecutionVisibilityExportMap;
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
    ...(input.visibility ? { visibility: input.visibility } : {}),
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
  const longTextRefs = longTexts.map(({ content: _content, paths, ...ref }) => ({
    ...ref,
    pathCount: paths.length,
  }));

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
      kind: traceLongText.contentType,
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
    kind?: TraceLogLongTextKind;
    hash?: string;
    originalLength?: number;
    preview?: string;
  } = {},
) {
  const originalLength = options.originalLength ?? value.length;
  const visibility = inferToolExecutionPathVisibility(path);

  if (!options.force && value.length <= traceLogLongTextThreshold && originalLength <= traceLogLongTextThreshold) {
    return value;
  }

  const hash = options.hash ?? hashLongText(value);
  const existing = state.byHash.get(hash);

  if (existing) {
    if (!existing.paths.includes(path)) {
      existing.paths.push(path);
    }
    if (visibility) {
      existing.visibilityByPath = {
        ...(existing.visibilityByPath ?? {}),
        [path]: visibility,
      };
    }

    return {
      contentRef: existing.contentRef,
      path,
      kind: options.kind ?? inferLongTextKind(path),
      originalLength: existing.originalLength,
      hash: existing.hash,
      preview: existing.preview,
      ...(visibility ? { visibility } : {}),
      textFile: existing.textFile,
    };
  }

  const contentRef = createLongTextRef(state.longTexts.length + 1);
  const ref: TraceLogLongTextRef = {
    contentRef,
    path,
    kind: options.kind ?? inferLongTextKind(path),
    originalLength,
    hash,
    preview: options.preview ?? createLongTextPreview(value),
    ...(visibility ? { visibility, visibilityByPath: { [path]: visibility } } : {}),
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

function inferToolExecutionPathVisibility(path: string) {
  const visibilityField = readToolExecutionVisibilityFieldFromPath(path);

  return visibilityField ? toolExecutionVisibilityDefinitions[visibilityField].visibility : undefined;
}

function readToolExecutionVisibilityFieldFromPath(path: string): ToolExecutionVisibilityField | undefined {
  if (
    !path.includes("langChainToolExecutions") &&
    !path.includes("toolExecutions") &&
    !path.includes("tool_execution_detail") &&
    !path.includes("$.details")
  ) {
    return undefined;
  }

  if (path.includes(".modelVisibleSummary")) {
    return "modelVisibleSummary";
  }

  if (path.includes(".userProjection")) {
    return "userProjection";
  }

  if (path.includes(".traceSummary")) {
    return "traceSummary";
  }

  return undefined;
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
    contentType: readString(value.contentType) as TraceLogLongTextKind | undefined,
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
  if (/systemPrompt\.content$/.test(path)) {
    return "model_request_system_prompt";
  }

  if (/systemMessage\.content\.content$/.test(path)) {
    return "model_request_system_message";
  }

  if (/\.messages\[\d+\]\.content$/.test(path)) {
    return "model_request_message";
  }

  if (/\.messages\[\d+\]\.content\.content$/.test(path)) {
    return "model_request_message";
  }

  if (/\.tools\[\d+\]\.description\.content$/.test(path) || /\.finalizationTool\.description\.content$/.test(path)) {
    return "model_request_tool_description";
  }

  if (/\.tools\[\d+\]\.inputSchema\.content$/.test(path) || /\.finalizationTool\.inputSchema\.content$/.test(path)) {
    return "model_request_tool_schema";
  }

  if (/\.schemaDescriptions\[\d+\]\.text\.content$/.test(path)) {
    return "model_request_tool_schema_description";
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
