"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AppSidebar } from "@/components/app/app-sidebar";
import { LogoMark } from "@/components/app/logo-mark";
import { SymbolIcon } from "@/components/app/symbol-icon";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoningContent?: string;
};

type ApiChatMessage = Pick<ChatMessage, "role" | "content">;

type StreamEvent = {
  type: "reasoning" | "content" | "done" | "error";
  delta?: string;
};

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

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
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

  function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
    return {
      id: crypto.randomUUID(),
      role,
      content,
    };
  }

  function updateAssistantMessage(
    assistantId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) {
    setMessages((current) =>
      current.map((message) => (message.id === assistantId ? updater(message) : message)),
    );
  }

  async function sendMessage(nextText?: string) {
    const text = (nextText ?? input).trim();

    if (!text || isLoading) {
      return;
    }

    const userMessage = createMessage("user", text);
    const assistantMessage = createMessage("assistant", "");
    const requestMessages: ApiChatMessage[] = [...messages, userMessage]
      .filter((message) => message.content.trim().length > 0)
      .map(({ role, content }) => ({ role, content }));

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput("");
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: requestMessages,
          thinkingEnabled,
        }),
      });

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
          detail?: string;
        } | null;

        throw new Error(data?.error || "聊天请求失败，请稍后重试。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          const streamEvent = JSON.parse(line) as StreamEvent;

          if (streamEvent.type === "done") {
            continue;
          }

          if (streamEvent.type === "error") {
            throw new Error(streamEvent.delta || "聊天请求失败，请稍后重试。");
          }

          if (streamEvent.type === "reasoning") {
            updateAssistantMessage(assistantMessage.id, (message) => ({
              ...message,
              reasoningContent: `${message.reasoningContent ?? ""}${streamEvent.delta ?? ""}`,
            }));
          }

          if (streamEvent.type === "content") {
            updateAssistantMessage(assistantMessage.id, (message) => ({
              ...message,
              content: `${message.content}${streamEvent.delta ?? ""}`,
            }));
          }
        }
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "聊天请求失败，请稍后重试。",
      );
      updateAssistantMessage(assistantMessage.id, (message) => ({
        ...message,
        content: message.content || "请求失败，请检查网络或服务端配置后重试。",
      }));
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage();
  }

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <AppSidebar activeLabel="AI聊天" />

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
        <div
          className="custom-scrollbar flex-1 space-y-xl overflow-y-auto p-lg xl:p-xl"
          ref={chatScrollRef}
        >
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
                    className="whitespace-nowrap rounded-full border border-outline-variant bg-white px-lg py-sm text-label-md shadow-sm transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-60"
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
                    className={`ai-chat-bubble max-w-[78%] rounded-2xl p-lg ${
                      message.role === "user"
                        ? "rounded-tr-none bg-primary-container text-white"
                        : "rounded-tl-none bg-white text-on-surface"
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
                    {message.role === "assistant" ? (
                      message.content ? (
                        <div className="markdown-answer">
                          <MarkdownContent content={message.content} />
                        </div>
                      ) : (
                        <p className="font-body-md text-body-md">正在思考...</p>
                      )
                    ) : (
                      <p className="whitespace-pre-wrap font-body-md text-body-md">
                        {message.content}
                      </p>
                    )}
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

        <div className="border-t border-outline-variant/30 bg-background p-lg xl:p-xl">
          <form className="mx-auto max-w-4xl space-y-md" onSubmit={handleSubmit}>
            <div className="flex items-center justify-end">
              <label className="flex items-center gap-sm rounded-full bg-white px-md py-sm text-label-md text-on-surface-variant shadow-sm">
                <span>思考模式</span>
                <span className="min-w-8 text-primary">
                  {thinkingEnabled ? "开" : "关"}
                </span>
                <button
                  aria-pressed={thinkingEnabled}
                  aria-label={thinkingEnabled ? "关闭思考模式" : "开启思考模式"}
                  className={`relative h-6 w-11 rounded-full border transition-colors ${
                    thinkingEnabled
                      ? "border-primary-container bg-primary-container"
                      : "border-outline-variant bg-surface-container-high"
                  }`}
                  disabled={isLoading}
                  onClick={() => setThinkingEnabled((enabled) => !enabled)}
                  type="button"
                >
                  <span
                    className={`absolute left-1 top-1 h-4 w-4 rounded-full shadow-sm transition-transform ${
                      thinkingEnabled
                        ? "translate-x-5 bg-white"
                        : "translate-x-0 bg-on-surface-variant"
                    }`}
                  />
                </button>
              </label>
            </div>
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
                disabled={isLoading}
                onChange={(event) => setInput(event.target.value)}
                placeholder="向 FitMate AI 提问..."
                type="text"
                value={input}
              />
              <button
                className="absolute right-xs flex h-10 w-10 items-center justify-center rounded-full bg-primary-container text-white shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isLoading}
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
