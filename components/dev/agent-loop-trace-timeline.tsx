import type { ReactNode } from "react";

import type {
  AgentLoopModelResponseViewModel,
  AgentLoopTraceViewModel,
  AgentLoopTurnViewModel,
} from "@/components/dev/agent-trace-view-model";

// AgentLoopTimelinePanel 负责展示 LLM 输入、输出、工具结果和下一轮可见性的主因果链。
export function AgentLoopTimelinePanel({ agentLoop }: { agentLoop: AgentLoopTraceViewModel }) {
  if (agentLoop.legacyCompatibility.status === "legacy_trace") {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50/70">
        <PanelHeader
          eyebrow="Agent Loop"
          title="未记录 Agent loop linkage"
          description={agentLoop.legacyCompatibility.message}
        />
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <PanelHeader
        eyebrow="Agent Loop"
        title="Agent loop timeline"
        description="按 LLM 输入、LLM 输出解析、tool 执行结果、下一轮 LLM 输入和最终回复的顺序展示。所有关联只使用 loopTurnId、modelCallId、toolCallId、toolResultId 和 resource id。"
      />
      <div className="border-t border-slate-100 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile label="Agent 状态" value={agentLoop.runOverview.finalResultStatus} help="判断本轮最终是生成、修改、澄清、阻断、失败还是普通回答。" />
          <MetricTile label="用户可见回复" value={agentLoop.runOverview.userVisibleReply ? "已记录" : "未记录"} help="用于核对 Response Writer 是否真的输出了最终文本。" />
          <MetricTile label="Loop turns" value={`${agentLoop.loopTurns.length}`} help="用于定位第几轮模型输入、输出或工具执行断链。" />
          <MetricTile label="诊断发现" value={`${agentLoop.diagnostics.length}`} help="集中标记缺失输出、孤立工具结果、解析失败和回复边界不一致。" />
        </div>

        <div className="mt-4 space-y-4">
          {agentLoop.loopTurns.length === 0 ? (
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500">
              这条 Agent trace 没有可串联的 loop turn。请展开下方阶段事件查看 Raw JSON。
            </div>
          ) : (
            agentLoop.loopTurns.map((turn) => <AgentLoopTurnCard key={turn.id} turn={turn} />)
          )}
        </div>

        <AgentFinalizationCard agentLoop={agentLoop} />
      </div>
    </section>
  );
}

function AgentLoopTurnCard({ turn }: { turn: AgentLoopTurnViewModel }) {
  const tokenUsage = turn.modelResponse?.tokenUsage ?? null;

  return (
    <details className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 bg-white p-4 hover:bg-slate-50">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-950">{turn.title}</span>
            <SmallPill>{turn.aiStage ?? "未记录 aiStage"}</SmallPill>
            {turn.loopTurnId ? <SmallPill>{turn.loopTurnId}</SmallPill> : null}
            {tokenUsage ? (
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-100/50">
                Token: 输入 {tokenUsage.prompt_tokens?.toLocaleString() ?? "-"} · 输出 {tokenUsage.completion_tokens?.toLocaleString() ?? "-"} (共 {tokenUsage.total_tokens?.toLocaleString() ?? "-"})
              </span>
            ) : (
              <SmallPill>无 Token 记录</SmallPill>
            )}
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            modelCallId: {turn.modelCallId ?? "未记录"}；Raw JSON 入口：{turn.rawLinks.map((link) => `${link.index + 1}.${link.stepName}`).join(" / ") || "未记录"}
          </p>
        </div>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-100">
          点击展开
        </span>
      </summary>

      <div className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <InfoBlock title="LLM 输入" help="用于确认模型本轮实际看到的 system prompt、user payload、ContextPackage、toolResults 和剩余步骤。">
          {turn.modelRequest ? (
            <div className="space-y-3">
              {tokenUsage?.prompt_tokens ? (
                <div className="rounded-lg bg-indigo-50/30 border border-indigo-100/50 px-3 py-2 flex items-center justify-between text-xs text-slate-600 shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
                  <span className="font-medium text-slate-700 flex items-center gap-1.5">
                    <span>📥</span> Prompt Token (大模型输入)
                  </span>
                  <span className="font-bold text-indigo-700">{tokenUsage.prompt_tokens.toLocaleString()} tokens</span>
                </div>
              ) : null}
              <KeyValue label="model" value={turn.modelRequest.model ?? "未记录"} />
              <KeyValue label="promptModules" value={turn.modelRequest.promptModules.join(", ") || "未记录"} />
              <KeyValue label="visibleToolResultIds" value={turn.modelRequest.visibleToolResultIds.join(", ") || "无"} />
              <KeyValue label="remainingSteps" value={String(turn.modelRequest.remainingSteps ?? "未记录")} />
              <JsonDetails title="ContextPackage / tools / dependencyGraph 摘要" value={{
                contextPackage: turn.modelRequest.contextSummary,
                registeredTools: turn.modelRequest.registeredToolsSummary,
                dependencyGraph: turn.modelRequest.dependencyGraphSummary,
              }} />
              <div className="space-y-2">
                {turn.modelRequest.messages.map((message, index) => (
                  <details className="rounded-lg border border-slate-200 bg-white" key={`${message.role}:${index}`}>
                    <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700">
                      message {index + 1}: {message.role}
                    </summary>
                    <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words border-t border-slate-100 p-3 text-xs leading-5 text-slate-700">
                      {message.content}
                    </pre>
                  </details>
                ))}
              </div>
            </div>
          ) : (
            <MissingText>未记录 model_request。</MissingText>
          )}
        </InfoBlock>

        <InfoBlock title="LLM 输出解析" help="用于同时核对原始输出、JSON 解析结果、action / toolName / final result 和解析失败。">
          {turn.modelResponse ? (
            <div className="space-y-3">
              {tokenUsage ? (
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 flex items-center justify-between gap-3 text-xs text-slate-600 shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
                  <div className="flex-1 flex flex-col gap-1 items-center bg-white rounded-lg py-2 px-1 border border-slate-100">
                    <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">📤 输出 (Completion)</span>
                    <span className="font-bold text-blue-600 text-sm">{tokenUsage.completion_tokens?.toLocaleString() ?? "-"}</span>
                  </div>
                  <div className="flex-1 flex flex-col gap-1 items-center bg-white rounded-lg py-2 px-1 border border-slate-100">
                    <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">📥 输入 (Prompt)</span>
                    <span className="font-bold text-indigo-600 text-sm">{tokenUsage.prompt_tokens?.toLocaleString() ?? "-"}</span>
                  </div>
                  <div className="flex-1 flex flex-col gap-1 items-center bg-white rounded-lg py-2 px-1 border border-slate-100">
                    <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">⚖️ 总消耗 (Total)</span>
                    <span className="font-bold text-slate-800 text-sm">{tokenUsage.total_tokens?.toLocaleString() ?? "-"}</span>
                  </div>
                </div>
              ) : null}
              <KeyValue label="status" value={turn.modelResponse.status} />
              <KeyValue label="tokenUsage" value={formatTokenUsage(turn.modelResponse?.tokenUsage)} />
              {turn.modelResponse.parsingFailure ? (
                <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs leading-5 text-red-700">
                  {turn.modelResponse.parsingFailure.code ?? "parsing_failure"}：{turn.modelResponse.parsingFailure.message ?? "模型输出解析失败"}
                </div>
              ) : null}
              <JsonDetails title="parsed decision" value={turn.parsedDecision ?? {}} defaultOpen />
              <details className="rounded-lg border border-slate-200 bg-white">
                <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700">原始 content / rawResponse</summary>
                <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words border-t border-slate-100 p-3 text-xs leading-5 text-slate-700">
                  {turn.modelResponse.rawContent || turn.modelResponse.rawResponse || "未记录原始输出。"}
                </pre>
              </details>
            </div>
          ) : (
            <MissingText>未记录 model_response。</MissingText>
          )}
        </InfoBlock>
      </div>

      <div className="grid gap-3 border-t border-slate-200 p-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <InfoBlock title="Tool 执行结果" help="用于确认 LLM 决策触发了哪个工具，工具返回了什么 id、状态、耗时和失败 code。">
          {turn.toolResults.length > 0 ? (
            <div className="space-y-3">
              {turn.toolResults.map((result) => (
                <div className="rounded-lg border border-slate-200 bg-white p-3" key={result.step.stepId}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{result.toolName}</span>
                    <SmallPill>{result.status}</SmallPill>
                    {result.failureCode ? <SmallPill>{result.failureCode}</SmallPill> : null}
                  </div>
                  <div className="mt-2 grid gap-2 text-xs leading-5 text-slate-600 md:grid-cols-2">
                    <KeyValue label="toolCallId" value={result.toolCallId ?? "未记录"} />
                    <KeyValue label="toolResultId" value={result.toolResultId ?? "未记录"} />
                    <KeyValue label="durationMs" value={String(result.durationMs ?? "未记录")} />
                    <KeyValue label="consumedBy" value={result.consumedBy.join(" / ") || "未记录下游消费"} />
                  </div>
                  <JsonDetails title="resource ids" value={result.resourceIds} />
                  <p className="mt-2 text-xs leading-5 text-slate-600">输入：{result.inputSummary}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">输出：{result.outputSummary}</p>
                </div>
              ))}
            </div>
          ) : (
            <MissingText>本轮没有记录 tool result。</MissingText>
          )}
        </InfoBlock>

        <InfoBlock title="下一轮输入可见性" help="用于判断上一轮工具结果是否进入下一轮 prompt，避免只看最终回复猜测模型是否看到了结果。">
          <div className="space-y-2">
            <KeyValue label="nextLoopTurnId" value={turn.nextPromptLinkage.nextLoopTurnId ?? "没有下一轮"} />
            <KeyValue label="producedToolResultIds" value={turn.nextPromptLinkage.producedToolResultIds.join(", ") || "无"} />
            <KeyValue label="visibleInNextPromptIds" value={turn.nextPromptLinkage.visibleInNextPromptIds.join(", ") || "无"} />
            <KeyValue label="missingFromNextPromptIds" value={turn.nextPromptLinkage.missingFromNextPromptIds.join(", ") || "无"} />
            <p className="text-xs leading-5 text-slate-500">{turn.nextPromptLinkage.explanation}</p>
            <div className="grid gap-2">
              {turn.metrics.map((metric) => (
                <div className="rounded-lg border border-slate-200 bg-white p-3" key={metric.key}>
                  <div className="text-xs font-semibold text-slate-700">{metric.label}: {metric.value}</div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{metric.explanation}</p>
                </div>
              ))}
            </div>
          </div>
        </InfoBlock>
      </div>
    </details>
  );
}

function AgentFinalizationCard({ agentLoop }: { agentLoop: AgentLoopTraceViewModel }) {
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-950">最终收口</div>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        关联 AgentExecutionResult、Response Writer 输入摘要、用户可见回复和 artifact / revision / operation 资源。
      </p>
      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <JsonDetails title="AgentExecutionResult" value={agentLoop.finalization.finalResult ?? {}} defaultOpen />
        <JsonDetails title="Response Writer" value={agentLoop.finalization.responseWriter ?? {}} defaultOpen />
      </div>
      {agentLoop.finalization.artifactEvents.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {agentLoop.finalization.artifactEvents.map((link) => (
            <SmallPill key={`${link.kind}:${link.id}`}>{link.kind}: {link.id}</SmallPill>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PanelHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="p-5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">{eyebrow}</div>
      <h3 className="mt-1 text-base font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function InfoBlock({ title, help, children }: { title: string; help: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold text-slate-950">{title}</div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{help}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function MetricTile({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 break-words text-lg font-semibold text-slate-950">{value}</div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{help}</p>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-semibold text-slate-700">{label}: </span>
      <span className="break-words text-slate-600">{value}</span>
    </div>
  );
}

function JsonDetails({ title, value, defaultOpen = false }: { title: string; value: unknown; defaultOpen?: boolean }) {
  return (
    <details className="rounded-lg border border-slate-200 bg-white" open={defaultOpen}>
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700">{title}</summary>
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words border-t border-slate-100 p-3 text-xs leading-5 text-slate-700">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function SmallPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
      {children}
    </span>
  );
}

function MissingText({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-700">{children}</div>;
}

function formatTokenUsage(usage: AgentLoopModelResponseViewModel["tokenUsage"]) {
  if (!usage) {
    return "未记录";
  }

  return `prompt=${usage.prompt_tokens ?? "-"} completion=${usage.completion_tokens ?? "-"} total=${usage.total_tokens ?? "-"}`;
}
