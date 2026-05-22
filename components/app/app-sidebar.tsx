"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LogoMark } from "./logo-mark";
import { SymbolIcon } from "./symbol-icon";

const navItems = [
  { label: "首页", icon: "chat", href: "/" },
  { label: "训练计划", icon: "calendar_today", href: "/plans" },
  { label: "动作编排", icon: "reorder", href: "/composer" },
  { label: "动作库", icon: "fitness_center", href: "/exercises" },
];

type SidebarHistoryItem = {
  id: string;
  title: string;
  updatedAt?: string;
};

const chatHistoryStorageKey = "fitmate.chatHistory";

function getTimeSafe(isoString: string | undefined | null): number {
  if (!isoString) {
    return 0;
  }
  try {
    const time = new Date(isoString).getTime();
    return isNaN(time) ? 0 : time;
  } catch {
    return 0;
  }
}

function formatHistoryTime(isoString: string | undefined | null): string {
  if (!isoString) {
    return "";
  }
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";

    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");

    if (isToday) {
      return `${hours}:${minutes}`;
    }

    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${month}-${day} ${hours}:${minutes}`;
  } catch {
    return "";
  }
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [historyItems, setHistoryItems] = useState<SidebarHistoryItem[]>([]);

  useEffect(() => {
    function syncHistory() {
      const rawHistory = window.localStorage.getItem(chatHistoryStorageKey);

      if (!rawHistory) {
        setHistoryItems([]);
        return;
      }

      try {
        const parsedHistory = JSON.parse(rawHistory) as SidebarHistoryItem[];
        const sortedHistory = [...parsedHistory].sort(
          (a, b) => getTimeSafe(b.updatedAt) - getTimeSafe(a.updatedAt),
        );
        setHistoryItems(
          sortedHistory.length
            ? sortedHistory.slice(0, 6).map((item) => ({
                id: item.id,
                title: item.title,
                updatedAt: item.updatedAt,
              }))
            : [],
        );
      } catch {
        setHistoryItems([]);
      }
    }

    syncHistory();
    window.addEventListener("storage", syncHistory);
    window.addEventListener("fitmate:chat-history-updated", syncHistory);

    return () => {
      window.removeEventListener("storage", syncHistory);
      window.removeEventListener("fitmate:chat-history-updated", syncHistory);
    };
  }, []);

  /** 删除指定对话，并同步侧边栏与聊天页状态 */
  function deleteConversation(id: string) {
    try {
      const raw = window.localStorage.getItem(chatHistoryStorageKey);
      const conversations = raw ? (JSON.parse(raw) as SidebarHistoryItem[]) : [];
      const next = conversations.filter((c) => c.id !== id);
      window.localStorage.setItem(chatHistoryStorageKey, JSON.stringify(next));
    } catch {
      // localStorage 操作失败时静默忽略
    }

    // 同步侧边栏列表
    window.dispatchEvent(new Event("fitmate:chat-history-updated"));

    // 如果删除的是当前正在查看的对话，重置为新对话
    const currentHash = window.location.hash.replace(/^#/, "");
    if (currentHash === id) {
      window.dispatchEvent(new Event("fitmate:new-chat"));
    }
  }

  // 开发调试页使用独立布局，不显示主应用侧边栏。
  if (pathname.startsWith("/dev")) {
    return null;
  }

  return (
    <aside className="app-sidebar-surface fixed left-0 top-0 z-30 hidden h-screen w-[260px] flex-col border-r px-4 py-6 lg:flex">
      <div className="mb-8 flex items-center gap-3 px-3">
        <LogoMark />
        <div>
          <h1 className="text-xl font-extrabold text-primary">FitMate AI</h1>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            AI Fitness Coach
          </p>
        </div>
      </div>

      <Link
        className="app-button-primary mb-7 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold"
        href="/"
        onClick={() => window.dispatchEvent(new Event("fitmate:new-chat"))}
      >
        <SymbolIcon>add</SymbolIcon>+ 新建对话
      </Link>

      <nav className="custom-scrollbar flex-1 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const itemClassName = `flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition-all active:scale-[0.99] ${
            isActive
              ? "bg-primary-soft font-extrabold text-primary ring-1 ring-primary/10"
              : "text-muted hover:bg-panel-soft hover:text-primary hover:ring-1 hover:ring-line/70"
          }`;

          return (
            <Link className={itemClassName} href={item.href} key={item.label}>
              <SymbolIcon filled={isActive}>{item.icon}</SymbolIcon>
              {item.label}
            </Link>
          );
        })}

        <div className="mt-7 border-t border-line pt-5">
          <p className="mb-2 px-3 text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
            历史记录
          </p>
          {historyItems.length ? (
            <div className="space-y-xs">
              {historyItems.map((item) => (
                <a
                  className="group/hist flex cursor-pointer items-center justify-between gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-muted transition-all hover:bg-panel-soft hover:text-primary hover:ring-1 hover:ring-line/70 active:scale-[0.99]"
                  href={`/#${item.id}`}
                  key={item.id}
                  title={item.title}
                  onClick={(e) => {
                    e.preventDefault();
                    if (pathname === "/") {
                      // 已在聊天页，直接通过事件加载对话，避免不必要的路由重渲染
                      window.history.pushState(null, "", `#${item.id}`);
                      window.dispatchEvent(new CustomEvent("fitmate:load-chat", { detail: item.id }));
                    } else {
                      // 不在聊天页，先跳转到首页，page.tsx 会根据 hash 自动加载对话
                      router.push(`/#${item.id}`);
                    }
                  }}
                >
                  <span className="truncate flex-1">{item.title}</span>
                  {/* 默认显示时间，hover 时切换为删除按钮 */}
                  <span className="ml-1 shrink-0 font-mono text-[10px] font-medium text-muted group-hover/hist:hidden">
                    {formatHistoryTime(item.updatedAt)}
                  </span>
                  <button
                    className="hidden shrink-0 items-center justify-center rounded-md p-[2px] text-muted transition-colors hover:bg-error-container hover:text-error group-focus-within/hist:flex group-hover/hist:flex"
                    title="删除对话"
                    onClick={(e) => {
                      // 阻止事件冒泡到外层 <a>，避免触发加载对话
                      e.preventDefault();
                      e.stopPropagation();
                      deleteConversation(item.id);
                    }}
                  >
                    <SymbolIcon className="text-[16px]">close</SymbolIcon>
                  </button>
                </a>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-line/80 bg-panel/70 px-3 py-3 text-xs font-semibold text-muted">
              暂无对话
            </p>
          )}
        </div>
      </nav>
    </aside>
  );
}
