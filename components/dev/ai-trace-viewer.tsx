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
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
};

type TokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

// AiTraceViewer 是开发态历史 trace 壳，只展示已记录步骤和原始 JSON，不再依赖旧 Agent runtime 字段。
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
            当前页面只展示已经写入的历史步骤和 Raw JSON，不再要求运行时生产旧智能体事件。
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
        <MetricCard label="流程阶段" value={`${groups.length} 个`} description="按普通步骤类型归并后的主要步骤。" />
        <MetricCard label="总耗时" value={formatDuration(trace.durationMs)} description="trace 从创建到结束的总耗时。" />
        <MetricCard
          label="Token"
          value={tokenUsage?.total_tokens ? formatNumber(tokenUsage.total_tokens) : "-"}
          description="模型输入和输出 token 合计；无模型步骤时为空。"
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
          <div className="rounded-xl border border-slate-200 bg-white" key={group.id}>
            <div className="border-b border-slate-100 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">{group.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{group.description}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <StatusBadge status={group.status} />
                  <span>{formatDuration(group.durationMs)}</span>
                </div>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {group.steps.map((step, index) => (
                <TraceStepCard index={index} key={step.id} step={step} />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
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
  const groupMap = new Map<string, TraceStepGroup>();

  for (const step of steps) {
    const definition = getStepGroupDefinition(step.type);
    const existing = groupMap.get(definition.id);
    const group = existing ?? {
      ...definition,
      status: "success" as const,
      steps: [],
    };

    group.steps.push(step);
    group.status = deriveGroupStatus(group.steps);
    group.startedAt = getMinDate(group.steps.map((item) => item.startedAt));
    group.endedAt = getMaxDate(group.steps.map((item) => item.endedAt).filter(Boolean) as string[]);
    group.durationMs = group.steps.reduce((sum, item) => sum + (item.durationMs ?? 0), 0);
    groupMap.set(group.id, group);
  }

  return Array.from(groupMap.values());
}

function getStepGroupDefinition(type: AiTraceStep["type"]): Omit<TraceStepGroup, "status" | "steps" | "startedAt" | "endedAt" | "durationMs"> {
  switch (type) {
    case "user_input":
      return {
        id: "request_input",
        title: "请求输入",
        description: "用户请求、会话 hydration 和入口参数。",
        placement: "main_flow",
      };
    case "model_request":
    case "model_response":
      return {
        id: "model_io",
        title: "模型请求",
        description: "历史模型请求和响应记录；当前运行时不要求生产这些步骤。",
        placement: "main_flow",
      };
    case "runtime_event":
      return {
        id: "runtime_events",
        title: "Runtime 事件",
        description: "agent-core 文本聊天运行时的安全摘要事件。",
        placement: "main_flow",
      };
    case "reference_resolution":
      return {
        id: "reference_resolution",
        title: "引用解析",
        description: "结构化引用解析和资源定位。",
        placement: "main_flow",
      };
    case "tool_decision":
    case "tool_call":
    case "rag_query":
    case "exercise_lookup":
    case "candidate_selection":
      return {
        id: "domain_lookup",
        title: "领域查询",
        description: "动作库、RAG、候选集合或其他非模型查询步骤。",
        placement: "main_flow",
      };
    case "patch_proposal":
      return {
        id: "patch_proposal",
        title: "Patch 提出与应用",
        description: "训练内容变更草案和应用步骤。",
        placement: "main_flow",
      };
    case "validation":
      return {
        id: "validation",
        title: "服务端校验",
        description: "Schema、权限、训练内容或策略校验。",
        placement: "main_flow",
      };
    case "persistence":
      return {
        id: "persistence",
        title: "持久化",
        description: "数据库写入、读取和保存结果。",
        placement: "main_flow",
      };
    case "response_write":
    case "final_response":
      return {
        id: "response_write",
        title: "响应写入",
        description: "用户可见响应和最终返回。",
        placement: "main_flow",
      };
    case "token_budget":
      return {
        id: "token_budget",
        title: "预算控制",
        description: "历史 token 预算或请求预算记录。",
        placement: "out_of_flow",
      };
    case "error":
      return {
        id: "error",
        title: "异常处理",
        description: "请求失败、校验失败或外部依赖错误。",
        placement: "out_of_flow",
      };
    default:
      return {
        id: "other",
        title: "其他步骤",
        description: "未归类的历史步骤。",
        placement: "out_of_flow",
      };
  }
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
  const usage = trace.steps.reduce<TokenUsage>((sum, step) => {
    const metadataUsage = readTokenUsage(step.metadata?.tokenUsage);
    const outputUsage = isRecord(step.output) ? readTokenUsage(step.output.usage) : null;
    const usage = metadataUsage ?? outputUsage;

    if (!usage) {
      return sum;
    }

    return {
      prompt_tokens: (sum.prompt_tokens ?? 0) + (usage.prompt_tokens ?? 0),
      completion_tokens: (sum.completion_tokens ?? 0) + (usage.completion_tokens ?? 0),
      total_tokens: (sum.total_tokens ?? 0) + (usage.total_tokens ?? 0),
    };
  }, {});

  return usage.prompt_tokens || usage.completion_tokens || usage.total_tokens ? usage : null;
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

export function createTraceLogPayload(trace: AiTrace, groups: TraceStepGroup[]) {
  return {
    title: trace.title,
    savedFrom: "/dev/ai-traces",
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

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
