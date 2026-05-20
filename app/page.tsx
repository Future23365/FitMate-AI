"use client";

import { FormEvent, useMemo, useState } from "react";

const navItems = [
  { label: "首页", icon: "home" },
  { label: "AI聊天", icon: "chat" },
  { label: "训练计划", icon: "calendar_today" },
  { label: "动作库", icon: "fitness_center" },
  { label: "饮食建议", icon: "restaurant" },
  { label: "进度数据", icon: "insights" },
  { label: "个人设置", icon: "settings" },
];

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

function SymbolIcon({
  children,
  className = "",
  filled = false,
}: {
  children: string;
  className?: string;
  filled?: boolean;
}) {
  return (
    <span
      className={`material-symbols-outlined ${filled ? "material-symbols-filled" : ""} ${className}`}
    >
      {children}
    </span>
  );
}

function LogoMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <div
      className={`${className} flex shrink-0 items-center justify-center rounded-2xl bg-primary-container text-white shadow-sm`}
    >
      <SymbolIcon className="text-[24px]" filled>
        fitness_center
      </SymbolIcon>
    </div>
  );
}

export default function Home() {
  const [activeNav, setActiveNav] = useState("AI聊天");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<string[]>([]);

  const hasMessages = messages.length > 0;

  const completionOffset = useMemo(() => {
    const circumference = 364.4;
    return circumference - circumference * 0;
  }, []);

  function sendMessage(nextText?: string) {
    const text = (nextText ?? input).trim();

    if (!text) {
      return;
    }

    setMessages((current) => [...current, text]);
    setInput("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage();
  }

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-[260px] flex-col border-r border-outline-variant bg-surface-container-lowest p-md shadow-sm lg:flex">
        <div className="mb-xl flex items-center gap-sm">
          <LogoMark />
          <h1 className="font-headline-md text-headline-md font-bold text-primary">
            FitMate AI
          </h1>
        </div>

        <button className="mb-xl flex w-full items-center justify-center gap-sm rounded-full bg-primary-container px-lg py-md font-label-md text-label-md text-white transition-opacity hover:opacity-90 active:scale-[0.98]">
          <SymbolIcon>add</SymbolIcon>+ 新建对话
        </button>

        <nav className="custom-scrollbar flex-1 space-y-xs overflow-y-auto">
          {navItems.map((item) => {
            const isActive = activeNav === item.label;

            return (
              <button
                className={`flex w-full items-center gap-md rounded-lg px-lg py-sm text-left font-label-md text-label-md transition-colors ${
                  isActive
                    ? "bg-secondary-container font-bold text-primary"
                    : "text-on-surface-variant hover:bg-surface-container"
                }`}
                key={item.label}
                onClick={() => setActiveNav(item.label)}
                type="button"
              >
                <SymbolIcon filled={isActive}>{item.icon}</SymbolIcon>
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-outline-variant pt-md">
          <div className="flex items-center gap-md rounded-xl bg-surface-container-low p-sm">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-primary-fixed text-primary">
              <SymbolIcon filled>person</SymbolIcon>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-label-md text-label-md font-bold">健身达人</p>
              <p className="font-label-sm text-label-sm text-on-surface-variant">
                Lv.18 · 连续 23 天
              </p>
            </div>
            <SymbolIcon className="text-primary" filled>
              stars
            </SymbolIcon>
          </div>
        </div>
      </aside>

      <header className="fixed left-0 right-0 top-0 z-20 flex h-[64px] items-center justify-between bg-surface px-lg lg:left-[260px] xl:right-[300px] xl:px-xl">
        <div>
          <h2 className="flex items-center gap-xs font-title-lg text-title-lg">
            你的 <span className="text-primary-container">AI</span> 健身助手
          </h2>
          <p className="font-label-sm text-label-sm text-on-surface-variant">
            告诉我你的目标，我来为你生成训练计划
          </p>
        </div>
        <div className="flex items-center gap-lg text-on-surface-variant">
          <SymbolIcon className="cursor-pointer transition-colors hover:text-primary">
            notifications
          </SymbolIcon>
          <SymbolIcon className="cursor-pointer transition-colors hover:text-primary">
            help_outline
          </SymbolIcon>
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-outline-variant bg-primary-fixed text-primary">
            <SymbolIcon className="text-[20px]" filled>
              person
            </SymbolIcon>
          </div>
        </div>
      </header>

      <main className="fixed inset-0 bottom-0 left-0 top-[64px] flex flex-col bg-background lg:left-[260px] xl:right-[300px]">
        <div className="custom-scrollbar flex-1 space-y-xl overflow-y-auto p-lg xl:p-xl">
          {!hasMessages ? (
            <div className="flex h-full flex-col items-center justify-center space-y-xl px-lg text-center">
              <div className="flex flex-col items-center gap-md">
                <LogoMark className="mb-md h-24 w-24 animate-pulse rounded-[28px]" />
                <h2 className="font-display-lg text-display-lg text-on-surface">
                  你好！我是你的 AI 健身助手
                </h2>
                <p className="max-w-lg font-body-lg text-body-lg text-on-surface-variant">
                  我可以为你制定减脂、增肌或保持健康的专业计划。试着告诉我你的目标吧！
                </p>
              </div>
              <div className="flex max-w-2xl flex-wrap justify-center gap-sm">
                {quickPrompts.map((prompt) => (
                  <button
                    className="whitespace-nowrap rounded-full border border-outline-variant bg-white px-lg py-sm text-label-md shadow-sm transition-colors hover:bg-surface-container"
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
              {messages.map((message, index) => (
                <div className="flex justify-end" key={`${message}-${index}`}>
                  <div className="ai-chat-bubble max-w-[70%] rounded-2xl rounded-tr-none bg-primary-container p-lg text-white">
                    <p className="font-body-md text-body-md">{message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-outline-variant/30 bg-background p-lg xl:p-xl">
          <form className="mx-auto max-w-4xl space-y-md" onSubmit={handleSubmit}>
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
                className="w-full rounded-full border border-outline-variant bg-white py-md pl-[88px] pr-[56px] font-body-md shadow-sm outline-none transition-all placeholder:text-on-surface-variant focus:border-transparent focus:ring-2 focus:ring-primary-container"
                onChange={(event) => setInput(event.target.value)}
                placeholder="向 FitMate AI 提问..."
                type="text"
                value={input}
              />
              <button
                className="absolute right-xs flex h-10 w-10 items-center justify-center rounded-full bg-primary-container text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
                type="submit"
              >
                <SymbolIcon>send</SymbolIcon>
              </button>
            </div>
          </form>
        </div>
      </main>

      <aside className="fixed right-0 top-0 z-30 hidden h-screen w-[300px] flex-col gap-lg border-l border-outline-variant bg-surface-container-lowest p-lg xl:flex">
        <section className="space-y-md">
          <h3 className="font-title-lg text-title-lg">今日训练概览</h3>
          <div className="flex flex-col items-center gap-md rounded-2xl bg-surface-container-low p-lg">
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
              <div className="rounded-xl bg-white p-sm text-center opacity-50 shadow-sm">
                <p className="text-label-sm text-on-surface-variant">用时</p>
                <p className="font-label-md text-label-md font-bold">-- min</p>
              </div>
              <div className="rounded-xl bg-white p-sm text-center opacity-50 shadow-sm">
                <p className="text-label-sm text-on-surface-variant">消耗</p>
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
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-outline-variant p-xl text-center opacity-60">
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
          <div className="relative rounded-2xl border border-tertiary-container/20 bg-tertiary-container/10 p-md">
            <div className="mb-xs flex items-center gap-xs text-tertiary">
              <SymbolIcon className="text-[18px]">lightbulb</SymbolIcon>
              <span className="font-label-sm text-label-sm font-bold">训练小贴士</span>
            </div>
            <p className="font-label-sm text-label-sm leading-relaxed text-on-surface-variant">
              “晚上训练后记得补充高质量蛋白质，并保证 7-8 小时睡眠，这有助于你的肌肉恢复和减脂效果。”
            </p>
            <div className="absolute -right-2 -top-3">
              <span className="rounded-full bg-primary px-sm py-1 text-[10px] font-bold text-white">
                FitMate AI
              </span>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}
