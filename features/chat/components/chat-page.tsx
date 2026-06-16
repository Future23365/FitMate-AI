"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { LogoMark } from "@/components/app/logo-mark";
import { ResponsiveRightSidebar } from "@/components/app/responsive-right-sidebar";
import { SymbolIcon } from "@/components/app/symbol-icon";
import { useAutoHideScrollbar } from "@/components/app/use-auto-hide-scrollbar";
import { ChatTranscript } from "@/features/chat/components/chat-transcript";
import { useChatController } from "@/features/chat/hooks/use-chat-controller";
import { sendSuggestedQuestionMessage } from "@/features/chat/lib/suggested-questions";
import { listWorkoutSchedules } from "@/features/workouts/api/workout-data-client";
import type { WorkoutSchedule } from "@/lib/shared/workouts/composition";

// 首页示例面向居家新手，优先暴露徒手、短时和低冲击这类真实高频训练条件。
const quickPrompts = [
  {
    title: "闲聊",
    prompt: "给我讲一个关于健身的笑话",
  },
  {
    title: "推荐动作",
    prompt: "今天我要减肥，想多练练核心，有没有推荐的动作",
  },
  {
    title: "动作指导",
    prompt: "卷腹要怎么做才能做标准呢？有没有技巧指导一下",
  },
  {
    title: "安排方案",
    prompt: "我想做一套 20 分钟徒手训练，要包含俯卧撑、深蹲、平板支撑、卷腹，顺便把热身拉伸动作一起加上",
  },
];

type MiniCalendarCell = {
  date: Date;
  dateKey: string;
  isCurrentMonth: boolean;
};

const miniCalendarWeekdays = ["一", "二", "三", "四", "五", "六", "日"];

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function formatMonthLabel(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function getMiniCalendarCells(monthDate: Date): MiniCalendarCell[] {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    return {
      date,
      dateKey: toDateKey(date),
      isCurrentMonth: date.getMonth() === monthDate.getMonth(),
    };
  });
}


// 首页训练日历只呈现已完成训练，避免把计划建议和 AI 编排逻辑塞进聊天侧栏。
function MonthlyTrainingCalendar() {
  const today = useMemo(() => new Date(), []);
  const todayKey = toDateKey(today);
  const monthDate = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today]);
  const [schedule, setSchedule] = useState<WorkoutSchedule[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    async function syncSchedule() {
      try {
        setLoadState("loading");
        setSchedule(await listWorkoutSchedules());
        setLoadState("ready");
      } catch {
        setLoadState("error");
      }
    }

    void syncSchedule();
    window.addEventListener("fitmate:training-schedule-updated", syncSchedule);

    return () => {
      window.removeEventListener("fitmate:training-schedule-updated", syncSchedule);
    };
  }, []);

  const monthPrefix = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
  const cells = useMemo(() => getMiniCalendarCells(monthDate), [monthDate]);
  const completedByDate = useMemo(() => {
    const grouped = new Map<string, number>();

    for (const item of schedule) {
      if (item.status !== "completed" || !item.date.startsWith(monthPrefix)) {
        continue;
      }

      grouped.set(item.date, (grouped.get(item.date) ?? 0) + 1);
    }

    return grouped;
  }, [monthPrefix, schedule]);
  const completedCount = Array.from(completedByDate.values()).reduce((total, count) => total + count, 0);
  const completedDayCount = completedByDate.size;
  const hasCompletedToday = completedByDate.has(todayKey);

  return (
    <section className="space-y-md">
      <div className="flex items-start justify-between gap-md">
        <div>
          <h3 className="font-title-lg text-title-lg">本月训练</h3>
          <p className="mt-1 font-label-sm text-label-sm text-muted">
            {formatMonthLabel(monthDate)} · 已完成 {completedCount} 次
          </p>
        </div>
        <div className="rounded-full border border-primary/15 bg-primary-soft px-sm py-xs text-primary">
          <span className="font-label-sm text-label-sm font-bold">{completedDayCount} 天</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-[20px] border border-line bg-white shadow-card">
        <div className="border-b border-line/70 bg-gradient-to-br from-primary-soft via-white to-surface-container-low px-md py-md">
          <div className="flex items-center justify-between gap-md">
            <div className="flex items-center gap-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-primary shadow-[0_10px_24px_rgba(36,89,230,0.14)]">
                <SymbolIcon className="text-[22px]">calendar_month</SymbolIcon>
              </div>
              <div>
                <p className="font-label-md text-label-md font-bold text-ink">坚持记录</p>
                <p className="font-label-sm text-label-sm text-muted">
                  {loadState === "error"
                    ? "训练记录暂时不可用"
                    : hasCompletedToday
                      ? "今天已完成训练"
                      : "完成训练后会自动点亮日期"}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-headline-sm text-headline-sm font-extrabold text-primary">
                {completedCount}
              </p>
              <p className="font-label-sm text-label-sm text-muted">次</p>
            </div>
          </div>
        </div>

        <div className="p-md">
          <div className="mb-xs grid grid-cols-7 gap-xs">
            {miniCalendarWeekdays.map((weekday) => (
              <div
                className="flex h-7 items-center justify-center font-label-sm text-label-sm font-bold text-muted"
                key={weekday}
              >
                {weekday}
              </div>
            ))}
          </div>

          <div aria-busy={loadState === "loading"} className="grid grid-cols-7 gap-xs">
            {cells.map((cell) => {
              const completedTimes = completedByDate.get(cell.dateKey) ?? 0;
              const isToday = cell.dateKey === todayKey;
              const isCompleted = completedTimes > 0;

              return (
                <div
                  aria-label={
                    cell.isCurrentMonth
                      ? `${cell.date.getDate()}日${isCompleted ? `，已完成 ${completedTimes} 次训练` : ""}${
                          isToday ? "，今天" : ""
                        }`
                      : undefined
                  }
                  className={`relative flex aspect-square items-center justify-center rounded-xl font-label-sm text-label-sm transition-colors ${
                    !cell.isCurrentMonth
                      ? "text-transparent"
                      : isCompleted
                        ? "bg-primary text-white shadow-[0_8px_18px_rgba(36,89,230,0.18)]"
                        : isToday
                          ? "border border-primary/45 bg-primary-soft text-primary"
                          : "bg-surface-container-low text-on-surface-variant"
                  } ${loadState === "loading" ? "animate-pulse" : ""}`}
                  key={cell.dateKey}
                >
                  {cell.isCurrentMonth ? cell.date.getDate() : null}
                  {isCompleted && completedTimes > 1 ? (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-ink px-[3px] text-[9px] font-bold leading-none text-white">
                      {completedTimes}
                    </span>
                  ) : null}
                  {isToday && !isCompleted ? (
                    <span className="absolute bottom-1 h-1 w-1 rounded-full bg-primary" />
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-md flex items-center justify-between rounded-2xl bg-panel-soft px-md py-sm">
            <div className="flex items-center gap-xs text-muted">
              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
              <span className="font-label-sm text-label-sm">有训练记录</span>
            </div>
            <div className="flex items-center gap-xs text-muted">
              <span className="h-2.5 w-2.5 rounded-full border border-primary/45 bg-primary-soft" />
              <span className="font-label-sm text-label-sm">今天</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomeRightSidebar() {
  return (
    <ResponsiveRightSidebar
      className="gap-lg p-lg"
      label="首页训练侧边栏"
    >
      <MonthlyTrainingCalendar />

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
    </ResponsiveRightSidebar>
  );
}

export function ChatPage() {
  const {
    activeAgentActivityMessageId,
    agentActivity,
    error,
    input,
    isLoading,
    messages,
    sendMessage,
    setInput,
    thinkingEnabled,
  } = useChatController();
  const chatScrollRef = useAutoHideScrollbar<HTMLDivElement>();
  const chatInputRef = useRef<HTMLInputElement>(null);

  const hasMessages = messages.length > 0;
  const canSubmitMessage = input.trim().length > 0 && !isLoading;
  const latestMessageState = messages
    .map((message) => `${message.id}:${message.content.length}:${message.reasoningContent?.length ?? 0}`)
    .join("|");

  useEffect(() => {
    chatInputRef.current?.focus();
  }, [isLoading]);

  useEffect(() => {
    const chatScroll = chatScrollRef.current;

    if (!chatScroll) {
      return;
    }

    const scrollFrame = window.requestAnimationFrame(() => {
      chatScroll.scrollTo({
        top: chatScroll.scrollHeight,
        behavior: "smooth",
      });
    });

    return () => window.cancelAnimationFrame(scrollFrame);
  }, [latestMessageState, error, isLoading, chatScrollRef]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage();
    window.requestAnimationFrame(() => chatInputRef.current?.focus());
  }

  return (
    <div
      className="responsive-right-sidebar-scope app-mesh-bg min-h-screen text-ink"
    >
      <header className="app-shell-glass fixed left-[var(--app-sidebar-offset)] right-[var(--responsive-right-sidebar-offset)] top-0 z-20 flex h-16 items-center justify-between border-b border-line/70 px-xl shadow-nav">
        <div>
          <h2 className="flex items-center gap-xs text-xl font-extrabold tracking-tight text-ink">
            你的 <span className="text-primary">AI</span> 健身助手
          </h2>
          <p className="text-xs font-semibold text-muted">
            告诉我你的目标，我来为你生成训练计划
          </p>
        </div>
      </header>

      <main className="fixed bottom-0 left-[var(--app-sidebar-offset)] right-[var(--responsive-right-sidebar-offset)] top-[64px] flex flex-col bg-transparent">
        <div
          className="custom-scrollbar right-sidebar-main-scroll flex-1 space-y-xl overflow-y-auto p-lg xl:p-xl"
          ref={chatScrollRef}
        >
          {!hasMessages ? (
            <div className="flex min-h-full flex-col items-center justify-center px-lg py-xl text-center">
              <div className="flex max-w-3xl flex-col items-center gap-md">
                <LogoMark
                  animated
                  className="h-20 w-20 drop-shadow-[0_16px_24px_rgba(36,89,230,0.18)]"
                />
                <div className="space-y-sm">
                  <h2 className="font-headline-lg text-headline-lg font-extrabold text-ink">
                    你的 AI 健身计划助手
                  </h2>
                  <p className="mx-auto max-w-2xl font-body-lg text-body-lg text-muted">
                    告诉我你的目标、时间、器械，我会帮你推荐动作或安排今天的训练。
                  </p>
                </div>
              </div>

              <section className="mt-xl w-full max-w-4xl text-left" aria-label="可以提问的示例">
                <div className="mb-md flex items-end justify-between gap-md">
                  <div>
                    <h3 className="font-title-lg text-title-lg font-extrabold text-ink">
                      可以这样提问
                    </h3>
                    <p className="mt-1 font-body-md text-body-md text-muted">
                      信息越具体，生成结果越贴合你的训练条件。
                    </p>
                  </div>
                </div>

                <div className="grid gap-md lg:grid-cols-2">
                  {quickPrompts.map((item) => (
                    <button
                      className="group flex min-h-[118px] w-full flex-col items-start rounded-2xl border border-line border-l-primary/35 bg-white px-lg py-md text-left shadow-[0_8px_24px_rgba(16,24,40,0.06)] transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_14px_32px_rgba(16,24,40,0.1)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                      disabled={isLoading}
                      key={item.prompt}
                      onClick={() => sendMessage(item.prompt)}
                      type="button"
                    >
                      <span className="flex w-full items-center justify-between gap-md">
                        <span className="font-label-md text-label-md font-bold text-primary">{item.title}</span>
                        <span className="font-label-sm text-label-sm text-muted opacity-0 transition-opacity group-hover:opacity-100">
                          点击提问
                        </span>
                      </span>
                      <span className="mt-sm block font-body-md text-body-md leading-relaxed text-ink">
                        {item.prompt}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <ChatTranscript
              activeAgentActivityMessageId={activeAgentActivityMessageId}
              agentActivity={agentActivity}
              error={error}
              isLoading={isLoading}
              messages={messages}
              onSuggestedQuestion={(suggestedQuestion) => {
                sendSuggestedQuestionMessage(sendMessage, suggestedQuestion);
              }}
              thinkingEnabled={thinkingEnabled}
            />
          )}
        </div>

        <div className="app-shell-glass-soft border-t border-line/60 px-lg pb-sm pt-md xl:px-xl">
          <div className="mx-auto max-w-[850px]">
            <form onSubmit={handleSubmit}>
              <div className="relative flex items-center">
                <input
                  className="w-full rounded-xl border border-line bg-white py-md pl-md pr-[64px] font-body-md shadow-card outline-none transition-all placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-primary/10"
                  ref={chatInputRef}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="向 FitMate AI 提问..."
                  type="text"
                  value={input}
                />
                <button
                  className="absolute right-xs flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-card transition-all hover:bg-primary-deep hover:shadow-lift active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canSubmitMessage}
                  type="submit"
                >
                  <SymbolIcon>send</SymbolIcon>
                </button>
              </div>
              <p className="mt-sm text-center font-label-xs text-label-xs font-medium text-muted/75">
                FitMate AI 不作为专业健身指导，也可能犯错，请结合自身情况甄别训练建议。
              </p>
            </form>
          </div>
        </div>
      </main>
      <HomeRightSidebar />
    </div>
  );
}
