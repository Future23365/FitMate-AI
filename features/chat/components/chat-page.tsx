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
  extractSuggestedQuestionTrigger,
  extractWorkoutPlanTrigger,
  extractWorkoutRoutineTrigger,
} from "@/features/chat/lib/workout-plan-trigger";
import { WorkoutPlanDraftCard } from "@/features/workouts/components/workout-plan-draft-card";

const quickPrompts = [
  {
    label: "制定增肌计划",
    prompt: "帮我制定一个每周 4 次、每次 45 分钟的增肌训练计划",
    icon: "fitness_center",
  },
  {
    label: "居家训练",
    prompt: "我今天在家想练 20 分钟核心和臀腿，需要一个无器械训练",
    icon: "home",
  },
  {
    label: "今天练什么",
    prompt: "根据我最近的训练状态，帮我安排今天的训练重点",
    icon: "bolt",
  },
  {
    label: "动作替换",
    prompt: "帮我把高冲击动作替换成更适合新手的低冲击动作",
    icon: "sync_alt",
  },
];

const insightCards = [
  { label: "训练目标", value: "待确认", icon: "flag", tone: "bg-primary-soft text-primary" },
  { label: "本周节奏", value: "3/4 次", icon: "calendar_today", tone: "bg-success-soft text-success-text" },
  { label: "计划状态", value: "可生成", icon: "auto_awesome", tone: "bg-warning-soft text-warning-text" },
];

const coachingModes = [
  {
    title: "生成计划",
    description: "目标、时长、器械明确后，输出可执行训练安排。",
    icon: "edit_calendar",
  },
  {
    title: "推荐动作",
    description: "按部位、器械和经验筛选动作，并支持继续编排。",
    icon: "exercise",
  },
  {
    title: "调整强度",
    description: "根据疲劳、疼痛或时间变化，重排训练内容。",
    icon: "tune",
  },
];

const readinessItems = ["目标", "时长", "器械", "训练经验"];

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

export function ChatPage() {
  const {
    autoRecommendationGenerating,
    autoPlanGenerating,
    bubbleExerciseRecommendations,
    bubblePlanErrors,
    bubblePlans,
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
      <header className="fixed left-0 right-0 top-0 z-20 flex h-16 items-center justify-between border-b border-line/70 bg-white/68 px-lg shadow-nav backdrop-blur-2xl lg:left-[260px] xl:right-[300px] xl:px-xl">
          <div>
            <h2 className="flex items-center gap-xs text-xl font-extrabold tracking-tight text-ink">
              你的 <span className="text-primary">AI</span> 健身助手
            </h2>
            <p className="text-xs font-semibold text-muted">
              告诉我你的目标，我来为你生成训练计划
            </p>
          </div>
          <div className="flex items-center gap-3 text-muted">
            <button
              aria-label="通知"
              className="relative grid h-10 w-10 place-items-center rounded-xl border border-line bg-white/80 text-muted shadow-card transition-colors hover:text-primary"
              type="button"
            >
              <SymbolIcon>notifications</SymbolIcon>
              <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-danger" />
            </button>
            <button
              aria-label="帮助"
              className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white/80 text-muted shadow-card transition-colors hover:text-primary"
              type="button"
            >
              <SymbolIcon>help_outline</SymbolIcon>
            </button>
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-line bg-primary-soft text-primary shadow-card">
              <SymbolIcon className="text-[20px]" filled>
                person
              </SymbolIcon>
            </div>
          </div>
        </header>

      <main className="fixed inset-0 bottom-0 left-0 top-[64px] flex flex-col bg-transparent lg:left-[260px] xl:right-[300px]">
        <div
          className="custom-scrollbar flex-1 space-y-xl overflow-y-auto p-lg xl:p-xl"
          ref={chatScrollRef}
        >
          {!hasMessages ? (
            <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col justify-center gap-xl py-xl">
              <section className="grid items-stretch gap-lg lg:grid-cols-[minmax(0,1.1fr)_380px]">
                <div className="flex min-h-[420px] flex-col justify-between rounded-[20px] border border-line bg-white p-lg shadow-card md:p-xl">
                  <div>
                    <div className="mb-lg flex items-center gap-sm">
                      <LogoMark className="h-12 w-12" />
                      <div>
                        <p className="text-label-sm font-extrabold uppercase text-primary">
                          FitMate AI Coach
                        </p>
                        <p className="text-label-sm text-muted">训练计划 · 动作推荐 · 强度调整</p>
                      </div>
                    </div>

                    <h2 className="max-w-2xl text-[34px] font-extrabold leading-[1.12] text-ink md:text-[44px]">
                      把今天的状态说清楚，我来整理成可执行训练。
                    </h2>
                    <p className="mt-md max-w-2xl text-body-lg text-muted">
                      先告诉我目标、可用时间和器械条件。FitMate 会先补齐关键信息，再生成训练计划或推荐动作。
                    </p>
                  </div>

                  <div className="mt-xl grid gap-sm sm:grid-cols-3">
                    {insightCards.map((item) => (
                      <div
                        className="rounded-xl border border-line bg-panel-soft/70 p-md"
                        key={item.label}
                      >
                        <div
                          className={`mb-sm flex h-9 w-9 items-center justify-center rounded-xl ${item.tone}`}
                        >
                          <SymbolIcon className="text-[20px]">{item.icon}</SymbolIcon>
                        </div>
                        <p className="text-label-sm font-bold text-muted">{item.label}</p>
                        <p className="mt-xs text-title-lg font-extrabold text-ink">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-md rounded-[20px] border border-line bg-white p-lg shadow-card">
                  <div className="rounded-xl bg-primary-soft p-md">
                    <div className="mb-sm flex items-center justify-between">
                      <span className="text-label-sm font-extrabold text-primary">计划生成准备度</span>
                      <span className="rounded-full bg-white px-sm py-xs text-[12px] font-bold text-primary shadow-sm">
                        0/4
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-sm">
                      {readinessItems.map((item) => (
                        <div
                          className="flex items-center gap-xs rounded-lg border border-primary/10 bg-white/75 px-sm py-xs text-label-sm font-bold text-muted"
                          key={item}
                        >
                          <span className="h-2 w-2 rounded-full bg-outline-variant" />
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-sm">
                    {coachingModes.map((mode) => (
                      <div
                        className="flex gap-sm rounded-xl border border-line bg-white p-md transition-colors hover:border-primary/30 hover:bg-panel-soft"
                        key={mode.title}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-panel-soft text-primary">
                          <SymbolIcon>{mode.icon}</SymbolIcon>
                        </div>
                        <div>
                          <h3 className="text-label-md font-extrabold text-ink">{mode.title}</h3>
                          <p className="mt-xs text-label-sm leading-relaxed text-muted">
                            {mode.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="rounded-[20px] border border-line bg-white/80 p-md shadow-card backdrop-blur">
                <div className="mb-md flex flex-col gap-xs sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-title-lg font-extrabold text-ink">快速开始</h3>
                    <p className="text-label-md text-muted">选择一个入口，FitMate 会直接发送给对话。</p>
                  </div>
                  <span className="hidden rounded-full bg-panel-soft px-sm py-xs text-label-sm font-bold text-muted sm:inline-flex">
                    支持继续追问和改计划
                  </span>
                </div>
                <div className="grid gap-sm md:grid-cols-2 xl:grid-cols-4">
                  {quickPrompts.map((item) => (
                    <button
                      className="group flex min-h-[104px] cursor-pointer flex-col items-start justify-between rounded-xl border border-line bg-white p-md text-left shadow-card transition-all hover:border-primary/30 hover:bg-primary-soft/50 hover:shadow-lift active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isLoading}
                      key={item.label}
                      onClick={() => sendMessage(item.prompt)}
                      type="button"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-panel-soft text-primary transition-colors group-hover:bg-white">
                        <SymbolIcon className="text-[20px]">{item.icon}</SymbolIcon>
                      </span>
                      <span className="mt-md text-label-md font-extrabold text-ink">{item.label}</span>
                      <span className="mt-xs line-clamp-2 text-label-sm leading-relaxed text-muted">
                        {item.prompt}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
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
                    {message.reasoningContent ? (
                      <details className="mb-md rounded-md bg-surface-container-low p-md text-on-surface-variant" open>
                        <summary className="cursor-pointer font-label-md text-label-md font-bold text-primary">
                          思考过程
                        </summary>
                        <p className="mt-sm whitespace-pre-wrap font-label-sm text-label-sm leading-relaxed">
                          {message.reasoningContent}
                        </p>
                      </details>
                    ) : null}
                    {(() => {
                      const trigger = extractWorkoutPlanTrigger(message.content);
                      const routineTrigger = extractWorkoutRoutineTrigger(message.content);
                      const recommendationTrigger = extractExerciseRecommendationTrigger(
                        trigger || routineTrigger ? "" : message.content,
                      );
                      const suggestedQuestionTrigger = extractSuggestedQuestionTrigger(message.content);
                      let cleanContent = message.content;
                      for (const rawBlock of [
                        trigger?.rawBlock,
                        routineTrigger?.rawBlock,
                        recommendationTrigger?.rawBlock,
                        suggestedQuestionTrigger?.rawBlock,
                      ]) {
                        if (rawBlock) {
                          cleanContent = cleanContent.replace(rawBlock, "");
                        }
                      }
                      cleanContent = cleanContent.trim();
                      const suggestedQuestions =
                        message.suggestedQuestions ?? suggestedQuestionTrigger?.suggestedQuestions ?? [];

                      if (message.role === "assistant") {
                        return (
                          <>
                            {cleanContent ? (
                              <div className="markdown-answer">
                                <MarkdownContent content={cleanContent} />
                              </div>
                            ) : (
                              <p className="font-body-md text-body-md">正在思考...</p>
                            )}

                            {suggestedQuestions.length > 0 && (
                              <div className="mt-md flex flex-wrap gap-sm">
                                {suggestedQuestions.map((question) => (
                                  <button
                                    className="max-w-full break-words rounded-xl border border-primary/20 bg-primary-soft px-md py-sm text-left font-label-sm text-label-sm font-bold text-primary transition-colors hover:border-primary/40 hover:bg-[#dbe5ff] disabled:cursor-not-allowed disabled:opacity-60"
                                    disabled={isLoading}
                                    key={question}
                                    onClick={() => sendMessage(question)}
                                    type="button"
                                  >
                                    {question}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* 1. 安全生成 Loading 动效 */}
                            {autoPlanGenerating === message.id && (
                              <div className="mt-md flex animate-pulse items-center gap-xs rounded-xl border border-primary/20 bg-primary/5 p-md font-label-sm text-label-sm text-primary shadow-sm">
                                <SymbolIcon className="animate-spin text-[16px]">autorenew</SymbolIcon>
                                <span>FitMate 安全引擎正在校验并生成专属计划...</span>
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
                                <WorkoutPlanDraftCard draft={bubblePlans[message.id]} />
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

        <div className="border-t border-line/60 bg-white/35 p-lg backdrop-blur-xl xl:p-xl">
          <form className="mx-auto max-w-4xl" onSubmit={handleSubmit}>
            <div className="relative flex items-center">
              <div className="absolute left-md flex items-center gap-sm">
                <SymbolIcon className="cursor-pointer text-on-surface-variant hover:text-primary">
                  attach_file
                </SymbolIcon>
                <SymbolIcon className="cursor-pointer text-on-surface-variant hover:text-primary">
                  mic
                </SymbolIcon>
              </div>
              <input
                className="w-full rounded-xl border border-line bg-white py-md pl-[88px] pr-[150px] font-body-md shadow-card outline-none transition-all placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-primary/10 sm:pr-[210px]"
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
      <aside className="fixed right-0 top-0 z-30 hidden h-screen w-[300px] flex-col gap-lg border-l border-line/70 bg-white/68 p-lg shadow-nav backdrop-blur-2xl xl:flex">
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
