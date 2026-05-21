"use client";

import { useEffect, useMemo, useState } from "react";

import type { AiTrace } from "@/lib/server/dev/ai-trace-store";

type TraceResponse = {
  ok: boolean;
  traces?: AiTrace[];
  error?: string;
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

            <div className="space-y-4">
              {selectedTrace.steps.map((step, index) => (
                <details
                  className="overflow-hidden rounded-lg border border-slate-200 bg-white"
                  key={step.id}
                  open={index < 4 || step.status === "failed"}
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                          {index + 1}
                        </span>
                        <span className="truncate text-sm font-semibold">{step.name}</span>
                        <span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                          {step.type}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        {formatTime(step.startedAt)} · {formatDuration(step.durationMs)}
                      </div>
                    </div>
                    <StatusBadge status={step.status} />
                  </summary>
                  <div className="grid gap-4 border-t border-slate-100 p-5 lg:grid-cols-2">
                    {step.metadata ? <JsonBlock title="Metadata" value={step.metadata} /> : null}
                    {step.input !== undefined ? <JsonBlock title="Input" value={step.input} /> : null}
                    {step.output !== undefined ? <JsonBlock title="Output" value={step.output} /> : null}
                    {step.error !== undefined ? <JsonBlock title="Error" value={step.error} /> : null}
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

function TracePanel({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="mb-5 rounded-lg border border-slate-200 bg-white p-5">
      <JsonBlock title={title} value={value} />
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
