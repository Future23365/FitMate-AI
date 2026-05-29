"use client";

import { FormEvent, useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { LogoMark } from "@/components/app/logo-mark";
import { SymbolIcon } from "@/components/app/symbol-icon";
import { ExerciseRecommendationCard } from "@/features/exercises/components/exercise-recommendation-card";
import { useChatController } from "@/features/chat/hooks/use-chat-controller";
import {
  extractExerciseRecommendationTrigger,
  extractSuggestedReplyTrigger,
  extractWorkoutPlanTrigger,
  extractWorkoutRoutineTrigger,
} from "@/features/chat/lib/workout-plan-trigger";
import { WorkoutPlanDraftCard } from "@/features/workouts/components/workout-plan-draft-card";
import { WorkoutRoutineDraftCard } from "@/features/workouts/components/workout-routine-draft-card";

const quickPrompts = ["帮我制定增肌计划", "推荐居家训练", "今天练什么", "制定减脂食谱"];

const weekDays = [
  { label: "一", done: true },
  { label: "二", done: true },
  { label: "三", done: false },
  { label: "四", done: true },
  { label: "五", done: false },
  { label: "六", current: true },
  { label: "日", done: false },
];

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="mb-sm last:mb-0 font-body-md text-body-md">{children}</p>
        ),
        strong: ({ children }) => <strong className="font-bold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => (
          <ul className="mb-sm list-disc space-y-xs pl-lg last:mb-0">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-sm list-decimal space-y-xs pl-lg last:mb-0">{children}</ol>
        ),
        li: ({ children }) => <li className="pl-xs font-body-md text-body-md">{children}</li>,
        h1: ({ children }) => (
          <h1 className="mb-sm font-headline-md text-headline-md font-bold">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-sm font-title-lg text-title-lg font-bold">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-xs font-label-md text-label-md font-bold">{children}</h3>
        ),
        blockquote: ({ children }) => (
          <blockquote className="mb-sm border-l-4 border-primary-container pl-md text-on-surface-variant last:mb-0">
            {children}
          </blockquote>
        ),
        code: ({ children }) => (
          <code className="rounded-md bg-surface-container px-xs py-[2px] font-mono text-[0.9em]">
            {children}
          </code>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function ChatThinkingIndicator() {
  return (
    <div className="flex items-center gap-sm rounded-xl border border-primary/15 bg-primary-soft/70 px-md py-sm text-primary">
      <SymbolIcon className="animate-pulse text-[18px]">psychology</SymbolIcon>
      <span className="font-body-md text-body-md">正在思考</span>
      <span className="flex items-center gap-[3px]" aria-hidden="true">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.2s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.1s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
      </span>
    </div>
  );
}

export function ChatPage() {
  const {
    autoRecommendationGenerating,
    autoPlanGenerating,
    bubbleExerciseRecommendations,
    bubblePlanExercises,
    bubblePlanErrors,
    bubblePlans,
    bubbleRoutines,
    composeExerciseRecommendations,
    dislikeExerciseRecommendation,
    error,
    input,
    isLoading,
    messages,
    refreshExerciseRecommendations,
    sendMessage,
    setInput,
    setThinkingEnabled,
    thinkingEnabled,
  } = useChatController();
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const hasMessages = messages.length > 0;
  const latestMessageState = messages
    .map((message) => `${message.id}:${message.content.length}:${message.reasoningContent?.length ?? 0}`)
    .join("|");

  const completionOffset = useMemo(() => {
    const circumference = 364.4;
    return circumference - circumference * 0;
  }, []);

  useEffect(() => {
    const chatScroll = chatScrollRef.current;

    if (!chatScroll) {
      return;
    }

    chatScroll.scrollTo({
      top: chatScroll.scrollHeight,
      behavior: "smooth",
    });
  }, [latestMessageState, error, isLoading]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage();
  }

  return (
    <div className="app-mesh-bg min-h-screen text-ink">
      <header className="app-shell-glass fixed left-[var(--app-sidebar-width)] right-0 top-0 z-20 flex h-16 items-center justify-between border-b border-line/70 px-lg shadow-nav transition-[left] duration-300 xl:right-[300px] xl:px-xl">
          <div>
            <h2 className="flex items-center gap-xs text-xl font-extrabold tracking-tight text-ink">
              你的 <span className="text-primary">AI</span> 健身助手
            </h2>
            <p className="text-xs font-semibold text-muted">
              告诉我你的目标，我来为你生成训练计划
            </p>
          </div>
        </header>

      <main className="fixed bottom-0 left-[var(--app-sidebar-width)] right-0 top-[64px] flex flex-col bg-transparent transition-[left] duration-300 xl:right-[300px]">
        <div
          className="custom-scrollbar flex-1 space-y-xl overflow-y-auto p-lg xl:p-xl"
          ref={chatScrollRef}
        >
          {!hasMessages ? (
            <div className="flex h-full flex-col items-center justify-center space-y-xl px-lg text-center">
              <div className="flex flex-col items-center gap-md">
                <LogoMark className="mb-lg h-24 w-24 animate-pulse rounded-[20px] shadow-blue-500/20 drop-shadow-[0_18px_28px_rgba(36,89,230,0.18)]" />
                <h2 className="mt-xs font-display-lg text-display-lg font-extrabold tracking-[-0.03em] text-ink">
                  你好！我是你的 AI 健身助手
                </h2>
                <p className="max-w-lg font-body-lg text-body-lg text-muted">
                  我可以为你制定减脂、增肌或保持健康的专业计划。试着告诉我你的目标吧！
                </p>
              </div>
              <div className="flex max-w-2xl flex-wrap justify-center gap-sm">
                {quickPrompts.map((prompt) => (
                  <button
                    className="whitespace-nowrap rounded-xl bg-white px-lg py-sm text-label-md font-bold shadow-[0_8px_22px_rgba(16,24,40,0.08)] transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_14px_32px_rgba(16,24,40,0.12)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                    disabled={isLoading}
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    type="button"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-4xl flex-col gap-md">
              {messages.map((message) => (
                <div
                  className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
                  key={message.id}
                >
                  <div
                    className={`ai-chat-bubble max-w-[78%] rounded-xl p-lg ${
                      message.role === "user"
                        ? "rounded-tr-none bg-primary text-white"
                        : "rounded-tl-none border border-line bg-white text-ink"
                    }`}
                  >
                    {(() => {
                      const trigger = extractWorkoutPlanTrigger(message.content);
                      const routineTrigger = extractWorkoutRoutineTrigger(message.content);
                      const recommendationTrigger = extractExerciseRecommendationTrigger(
                        trigger || routineTrigger ? "" : message.content,
                      );
                      const suggestedReplyTrigger = extractSuggestedReplyTrigger(message.content);
                      let cleanContent = message.content;
                      for (const rawBlock of [
                        trigger?.rawBlock,
                        routineTrigger?.rawBlock,
                        recommendationTrigger?.rawBlock,
                        suggestedReplyTrigger?.rawBlock,
                      ]) {
                        if (rawBlock) {
                          cleanContent = cleanContent.replace(rawBlock, "");
                        }
                      }
                      cleanContent = cleanContent.trim();
                      const suggestedReplies =
                        message.suggestedReplies ??
                        message.suggestedQuestions ??
                        suggestedReplyTrigger?.suggestedReplies ??
                        [];

                      if (message.role === "assistant") {
                        return (
                          <>
                            {cleanContent ? (
                              <div className="markdown-answer">
                                <MarkdownContent content={cleanContent} />
                              </div>
                            ) : (
                              <ChatThinkingIndicator />
                            )}

                            {suggestedReplies.length > 0 && (
                              <div className="mt-md flex flex-wrap gap-sm">
                                {suggestedReplies.map((reply) => (
                                  <button
                                    className="max-w-full break-words rounded-xl border border-primary/20 bg-primary-soft px-md py-sm text-left font-label-sm text-label-sm font-bold text-primary transition-colors hover:border-primary/40 hover:bg-[#dbe5ff] disabled:cursor-not-allowed disabled:opacity-60"
                                    disabled={isLoading}
                                    key={reply}
                                    onClick={() => sendMessage(reply)}
                                    type="button"
                                  >
                                    {reply}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* 1. 安全生成 Loading 动效 */}
                            {autoPlanGenerating === message.id && (
                              <div className="mt-md flex animate-pulse items-center gap-xs rounded-xl border border-primary/20 bg-primary/5 p-md font-label-sm text-label-sm text-primary shadow-sm">
                                <SymbolIcon className="animate-spin text-[16px]">autorenew</SymbolIcon>
                                <span>正在整理训练内容</span>
                              </div>
                            )}

                            {autoRecommendationGenerating === message.id && (
                              <div className="mt-md flex items-center gap-xs rounded-xl border border-primary-container/20 bg-primary-container/5 p-md font-label-sm text-label-sm text-primary animate-pulse shadow-sm">
                                <SymbolIcon className="animate-spin text-[16px]">autorenew</SymbolIcon>
                                <span>FitMate 正在筛选合适动作...</span>
                              </div>
                            )}

                            {/* 2. 安全拦截或生成失败错误 */}
                            {bubblePlanErrors[message.id] && (
                              <div className="mt-md flex items-start gap-xs rounded-xl border border-error-container bg-error-container/20 p-md text-on-error-container shadow-sm">
                                <SymbolIcon className="mt-[2px] shrink-0 text-[18px] text-error">warning</SymbolIcon>
                                <div>
                                  <p className="font-label-sm text-label-sm font-bold">FitMate 安全引擎已拦截</p>
                                  <p className="mt-xs font-body-xs text-body-xs text-on-surface-variant">
                                    {bubblePlanErrors[message.id]}
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* 3. 完美的计划预览卡片 */}
                            {bubblePlans[message.id] && (
                              <div className="mt-md">
                                <WorkoutPlanDraftCard
                                  draft={bubblePlans[message.id]}
                                  initialExercises={bubblePlanExercises[message.id]}
                                />
                              </div>
                            )}

                            {bubbleRoutines[message.id] && (
                              <div className="mt-md">
                                <WorkoutRoutineDraftCard
                                  draft={bubbleRoutines[message.id]}
                                  initialExercises={bubblePlanExercises[message.id]}
                                />
                              </div>
                            )}

                            {bubbleExerciseRecommendations[message.id] && (
                              <div className="mt-md">
                                <ExerciseRecommendationCard
                                  card={bubbleExerciseRecommendations[message.id]}
                                  isRefreshing={autoRecommendationGenerating === message.id}
                                  onCompose={() => composeExerciseRecommendations(message.id)}
                                  onDislike={(exerciseId) =>
                                    dislikeExerciseRecommendation(message.id, exerciseId)
                                  }
                                  onRefresh={() =>
                                    refreshExerciseRecommendations(message.id, recommendationTrigger?.intent)
                                  }
                                />
                              </div>
                            )}
                          </>
                        );
                      }

                      return (
                        <p className="whitespace-pre-wrap font-body-md text-body-md">
                          {message.content}
                        </p>
                      );
                    })()}
                  </div>
                </div>
              ))}
              {error ? (
                <div className="rounded-xl border border-error-container bg-error-container/40 p-md text-label-md text-on-error-container">
                  {error}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="app-shell-glass-soft border-t border-line/60 p-lg xl:p-xl">
          <form className="mx-auto max-w-[850px]" onSubmit={handleSubmit}>
            <div className="relative flex items-center">
              <input
                className="w-full rounded-xl border border-line bg-white py-md pl-md pr-[150px] font-body-md shadow-card outline-none transition-all placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-primary/10 sm:pr-[210px]"
                disabled={isLoading}
                onChange={(event) => setInput(event.target.value)}
                placeholder="向 FitMate AI 提问..."
                type="text"
                value={input}
              />
              <button
                aria-pressed={thinkingEnabled}
                aria-label={thinkingEnabled ? "关闭思考模式" : "开启思考模式"}
                className={`absolute right-[52px] flex h-9 items-center gap-xs rounded-full border px-sm font-label-sm text-label-sm shadow-sm transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${
                  thinkingEnabled
                    ? "border-primary/30 bg-primary-soft text-primary"
                    : "border-line bg-white/90 text-muted hover:border-primary/30 hover:bg-panel-soft"
                }`}
                disabled={isLoading}
                onClick={() => setThinkingEnabled((enabled) => !enabled)}
                type="button"
              >
                <SymbolIcon className="text-[18px]">
                  {thinkingEnabled ? "psychology" : "psychology_alt"}
                </SymbolIcon>
                <span className="hidden sm:inline">思考</span>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    thinkingEnabled ? "bg-primary" : "bg-outline-variant"
                  }`}
                />
              </button>
              <button
                className="absolute right-xs flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-card transition-all hover:bg-primary-deep hover:shadow-lift active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isLoading}
                type="submit"
              >
                <SymbolIcon>send</SymbolIcon>
              </button>
            </div>
          </form>
        </div>
      </main>
      <aside className="app-shell-glass fixed right-0 top-0 z-30 hidden h-screen w-[300px] flex-col gap-lg border-l border-line/70 p-lg shadow-nav xl:flex">
        <section className="space-y-md">
          <h3 className="font-title-lg text-title-lg">今日训练概览</h3>
          <div className="flex flex-col items-center gap-md rounded-[20px] border border-line bg-white p-lg shadow-card">
            <div className="relative flex h-32 w-32 items-center justify-center">
              <svg className="h-full w-full -rotate-90">
                <circle
                  className="text-outline-variant"
                  cx="64"
                  cy="64"
                  fill="transparent"
                  r="58"
                  stroke="currentColor"
                  strokeWidth="8"
                />
                <circle
                  className="text-primary-container"
                  cx="64"
                  cy="64"
                  fill="transparent"
                  r="58"
                  stroke="currentColor"
                  strokeDasharray="364.4"
                  strokeDashoffset={completionOffset}
                  strokeWidth="8"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-headline-md text-headline-md font-bold text-outline-variant">
                  0%
                </span>
              </div>
            </div>

            <div className="grid w-full grid-cols-2 gap-sm">
              <div className="rounded-xl bg-panel-soft p-sm text-center opacity-70">
                <p className="text-label-sm text-muted">用时</p>
                <p className="font-label-md text-label-md font-bold">-- min</p>
              </div>
              <div className="rounded-xl bg-panel-soft p-sm text-center opacity-70">
                <p className="text-label-sm text-muted">消耗</p>
                <p className="font-label-md text-label-md font-bold">-- kcal</p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-label-md text-label-md font-bold">本周计划</h3>
            <span className="text-label-sm text-primary">3/4 次完成</span>
          </div>
          <div className="flex justify-between gap-xs px-xs">
            {weekDays.map((day) => (
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-label-sm ${
                  day.done
                    ? "bg-primary-container text-white"
                    : day.current
                      ? "border-2 border-primary-container bg-surface-container-high font-bold text-primary-container"
                      : "bg-surface-container-high text-on-surface-variant"
                }`}
                key={day.label}
              >
                {day.done ? (
                  <SymbolIcon className="text-[16px]">check</SymbolIcon>
                ) : (
                  day.label
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="flex-1 space-y-sm">
          <h3 className="font-label-md text-label-md font-bold">动作推荐</h3>
          <div className="space-y-sm">
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-white p-xl text-center opacity-70">
              <SymbolIcon className="mb-sm text-4xl">model_training</SymbolIcon>
              <p className="text-label-sm">
                开始对话以获取
                <br />
                个性化动作推荐
              </p>
            </div>
          </div>
        </section>

        <section className="mt-auto">
          <div className="relative rounded-[20px] border border-primary/10 bg-primary-soft p-md text-ink shadow-card">
            <div className="mb-xs flex items-center gap-xs text-primary">
              <SymbolIcon className="text-[18px]">lightbulb</SymbolIcon>
              <span className="font-label-sm text-label-sm font-bold">训练小贴士</span>
            </div>
            <p className="font-label-sm text-label-sm leading-relaxed text-muted">
              “晚上训练后记得补充高质量蛋白质，并保证 7-8 小时睡眠，这有助于你的肌肉恢复和减脂效果。”
            </p>
            <div className="absolute -right-2 -top-3">
              <span className="rounded-full bg-white px-sm py-1 text-[10px] font-bold text-primary shadow-card">
                FitMate AI
              </span>
            </div>
          </div>
        </section>
      </aside>
    </div>
);
}
