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

type TokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

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
  const mainStepGroups = selectedStepGroups.filter((group) => group.placement === "main_flow");
  const outOfFlowGroups = selectedStepGroups.filter((group) => group.placement === "out_of_flow");

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
          <div className="mx-auto max-w-[1400px] px-8 py-7">
            <TraceHero
              trace={selectedTrace}
              groups={mainStepGroups}
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

            <TraceFlowTimeline groups={[...mainStepGroups, ...outOfFlowGroups]} />
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
  groups,
  isSavingPromptLog,
  isSavingTraceLog,
  onSavePromptLog,
  onSaveLog,
}: {
  trace: AiTrace;
  groups: TraceStepGroup[];
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
            当前页面按入口、Registry、Planner/ModelAdapter、Runtime、Policy/Resource、Response Renderer 和 Raw 诊断组织 trace。
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
        <MetricCard label="架构模块" value={`${groups.length} 个`} description="按 agent-core 职责边界归并后的诊断模块。" />
        <MetricCard label="总耗时" value={formatDuration(trace.durationMs)} description="trace 从创建到结束的总耗时。" />
        <MetricCard
          label="Token"
          value={tokenUsage?.total_tokens ? formatNumber(tokenUsage.total_tokens) : "-"}
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
      <div className="mt-1 truncate text-lg font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>
    </div>
  );
}

function TraceFlowTimeline({ groups }: { groups: TraceStepGroup[] }) {
  return (
    <section className="mt-6 space-y-4">
      {groups.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          这条 trace 没有记录步骤。
        </div>
      ) : (
        groups.map((group) => (
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
                  <TraceStepCard index={index} key={step.id} step={step} />
                ))
              ) : (
                <div className="p-4 text-sm text-slate-500">
                  {group.skipReason ?? "这个模块没有记录步骤。"}
                </div>
              )}
            </div>
          </details>
        ))
      )}
    </section>
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

function TraceStepCard({ index, step }: { index: number; step: AiTraceStep }) {
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

  if (step.status === "failed" && step.type !== "model_response") {
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
        { label: "业务 tool", value: toolCount === 0 ? "空 ToolRegistry" : "已注册 tool" },
      ];
    }
    case "planner_model": {
      const modelResponses = group.steps.filter((step) => step.type === "model_response");
      const usage = sumTokenUsage(modelResponses);
      const latestResponse = modelResponses.at(-1);
      const latestOutput = isRecord(latestResponse?.output) ? latestResponse.output : {};
      const estimatedBudget = summarizeEstimatedTokenBudget(group.steps);

      return [
        { label: "LLM 调用", value: `${modelResponses.length} 轮` },
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

function sumTokenUsage(steps: AiTraceStep[]): TokenUsage | null {
  const usage = steps.reduce<TokenUsage>((sum, step) => {
    const output = isRecord(step.output) ? step.output : {};
    const stepUsage = readTokenUsage(output.tokenUsage) ?? readTokenUsage(step.metadata?.tokenUsage);

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
  return `P ${formatOptionalNumber(usage.prompt_tokens)} / C ${formatOptionalNumber(usage.completion_tokens)} / T ${formatOptionalNumber(usage.total_tokens)}`;
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

export function createTraceLogPayload(trace: AiTrace, groups: TraceStepGroup[]) {
  const tokenUsageSummary = getTraceTokenUsage(trace);

  return {
    title: trace.title,
    savedFrom: "/dev/ai-traces",
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
      .filter((step) => ["runtime_event", "validation", "token_budget", "final_response"].includes(step.type))
      .map((step) => ({
        id: step.id,
        name: step.name,
        type: step.type,
        eventType: readRuntimeEventType(step),
        output: step.output,
        metadata: step.metadata,
      })),
    responseSummary: readTraceResponseSummary(trace),
    rawTrace: trace,
    trace,
    groupedSteps: groups.map((group) => ({
      id: group.id,
      title: group.title,
      stepIds: group.steps.map((step) => step.id),
      status: group.status,
      durationMs: group.durationMs,
    })),
  };
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
