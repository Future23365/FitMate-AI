"use client";

import { useEffect, useMemo, useState } from "react";

import type { AiTrace, AiTraceStep } from "@/lib/server/dev/ai-trace-store";

type TraceResponse = {
  ok: boolean;
  traces?: AiTrace[];
  error?: string;
};

type TraceStepGroup = {
  id: string;
  title: string;
  description: string;
  status: AiTrace["status"];
  steps: AiTraceStep[];
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
};

export function AiTraceViewer() {
  const [traces, setTraces] = useState<AiTrace[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const selectedTrace = useMemo(
    () => traces.find((trace) => trace.id === selectedTraceId) ?? traces[0] ?? null,
    [selectedTraceId, traces],
  );
  const selectedStepGroups = useMemo(
    () => (selectedTrace ? groupTraceSteps(selectedTrace.steps) : []),
    [selectedTrace],
  );

  async function loadTraces() {
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
  }

  async function clearTraces() {
    await fetch("/api/dev/ai-traces", {
      method: "DELETE",
    });
    setTraces([]);
    setSelectedTraceId(null);
  }

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void loadTraces();
    }, 0);

    const timer = window.setInterval(() => {
      void loadTraces();
    }, 2500);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

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
          <div className="mx-auto max-w-6xl px-8 py-8">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-3">
                  <h2 className="text-2xl font-semibold">{selectedTrace.title}</h2>
                  <StatusBadge status={selectedTrace.status} />
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-slate-500">
                  <span>{selectedTrace.route}</span>
                  <span>{formatTime(selectedTrace.createdAt)}</span>
                  <span>{formatDuration(selectedTrace.durationMs)}</span>
                </div>
              </div>
            </div>

            {selectedTrace.metadata ? (
              <TracePanel title="Trace Metadata" value={selectedTrace.metadata} />
            ) : null}

            <TraceTimeline groups={selectedStepGroups} />

            <div className="space-y-4">
              {selectedStepGroups.map((group, index) => (
                <details
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                  key={group.id}
                  open={index < 3 || group.status === "failed"}
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                          {index + 1}
                        </span>
                        <span className="truncate text-sm font-semibold">{group.title}</span>
                        <span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                          {group.steps.length} 条事件
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>{group.description}</span>
                        <span>{formatTime(group.startedAt)}</span>
                        <span>{formatDuration(group.durationMs)}</span>
                      </div>
                    </div>
                    <StatusBadge status={group.status} />
                  </summary>
                  <div className="space-y-4 border-t border-slate-100 p-5">
                    {group.steps.map((step, stepIndex) => (
                      <TraceStepDetail key={step.id} step={step} index={stepIndex} />
                    ))}
                  </div>
                </details>
              ))}
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

function TraceTimeline({ groups }: { groups: TraceStepGroup[] }) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">流程概览</div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group, index) => (
          <div className="flex min-w-0 gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3" key={group.id}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
              {index + 1}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="truncate text-sm font-semibold text-slate-900">{group.title}</div>
                <StatusDot status={group.status} />
              </div>
              <div className="mt-1 truncate text-xs text-slate-500">{group.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TraceStepDetail({ step, index }: { step: AiTraceStep; index: number }) {
  const title = getStepTitle(step);
  const summary = getStepSummary(step);

  return (
    <details className="overflow-hidden rounded-lg border border-slate-200 bg-white" open={step.status === "failed"}>
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
          </div>
        </div>
        <StatusBadge status={step.status} />
      </summary>
      <div className="grid gap-4 p-4 lg:grid-cols-2">
        {step.metadata ? <ReadableBlock title="Metadata" value={step.metadata} /> : null}
        {step.input !== undefined ? <ReadableBlock title="请求参数" value={step.input} /> : null}
        {step.output !== undefined ? <ReadableBlock title="模型回复 / 输出" value={step.output} /> : null}
        {step.error !== undefined ? <ReadableBlock title="错误" value={step.error} /> : null}
      </div>
    </details>
  );
}

function TracePanel({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="mb-5 rounded-lg border border-slate-200 bg-white p-5">
      <ReadableBlock title={title} value={value} />
    </div>
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

  return (
    <div className="min-w-0 space-y-4 lg:col-span-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      {Object.keys(rest).length > 0 ? <JsonBlock title="调用配置" value={rest} /> : null}
      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Messages</div>
        {value.messages.map((message, index) => (
          <div className="overflow-hidden rounded-md border border-slate-200 bg-white" key={index}>
            <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              {index + 1}. {message.role}
            </div>
            <pre className="max-h-[420px] whitespace-pre-wrap break-words overflow-auto p-3 text-xs leading-relaxed text-slate-800">
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
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      {typeof value.content === "string" ? (
        <TextBlock title="Content" value={value.content || "（空）"} />
      ) : null}
      {typeof value.reasoning === "string" && value.reasoning ? (
        <TextBlock title="Reasoning" value={value.reasoning} />
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
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <pre className="max-h-[560px] whitespace-pre-wrap break-words overflow-auto rounded-md border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-800">
        {value}
      </pre>
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <pre className="max-h-[520px] overflow-auto rounded-md bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
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

function groupTraceSteps(steps: AiTraceStep[]): TraceStepGroup[] {
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
    };
  }

  if (step.type === "intent" || getStepTask(step) === "intent_extraction" || step.name.includes("意图")) {
    return {
      id: "02_intent",
      title: "意图理解",
      description: "识别目标、训练类型、限制条件和兜底结果",
    };
  }

  if (step.type === "exercise_lookup" || step.type === "candidate_selection") {
    return {
      id: "03_candidates",
      title: "动作候选",
      description: "读取动作库并按目标、器械、风险过滤候选",
    };
  }

  if (step.type === "validation" || step.name.includes("校验")) {
    return {
      id: "05_validation",
      title: "服务端校验",
      description: "校验计划结构、动作 ID、候选范围和训练规则",
    };
  }

  if (getStepTask(step) === "draft_generation" || step.name.includes("草稿")) {
    return {
      id: "04_draft",
      title: "计划草稿生成",
      description: "调用模型生成结构化训练计划草稿",
    };
  }

  if (step.type === "final_response") {
    return {
      id: "06_final_response",
      title: "接口返回",
      description: "返回给前端的最终结果",
    };
  }

  if (step.type === "model_request" || step.type === "model_response") {
    return {
      id: "04_model_response",
      title: "回复生成",
      description: "生成聊天回复或模型中间输出",
    };
  }

  return {
    id: step.type === "error" ? "99_error" : `90_${step.type}`,
    title: step.type === "error" ? "异常处理" : getStepTypeLabel(step.type),
    description: step.type === "error" ? "请求失败、模型失败或流式读取失败" : "其他调试事件",
  };
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
    exercise_lookup: "动作库",
    candidate_selection: "候选筛选",
    validation: "校验",
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
