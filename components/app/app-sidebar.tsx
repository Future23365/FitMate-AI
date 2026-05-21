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

export function AppSidebar({ activeLabel }: { activeLabel: string }) {
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

  return (
    <aside className="fixed left-0 top-0 z-30 hidden h-screen w-[260px] flex-col border-r border-outline-variant bg-surface-container-lowest p-md shadow-sm lg:flex">
      <div className="mb-xl flex items-center gap-sm">
        <LogoMark />
        <h1 className="font-headline-md text-headline-md font-bold text-primary">
          FitMate AI
        </h1>
      </div>

      <Link
        className="mb-xl flex w-full items-center justify-center gap-sm rounded-full bg-primary-container px-lg py-md font-label-md text-label-md text-white transition-opacity hover:opacity-90 active:scale-[0.98]"
        href="/"
        onClick={() => window.dispatchEvent(new Event("fitmate:new-chat"))}
      >
        <SymbolIcon>add</SymbolIcon>+ 新建对话
      </Link>

      <nav className="custom-scrollbar flex-1 space-y-xs overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activeLabel === item.label;
          const itemClassName = `flex w-full items-center gap-md rounded-lg px-lg py-sm text-left font-label-md text-label-md transition-colors ${
            isActive
              ? "bg-secondary-container font-bold text-primary"
              : "text-on-surface-variant hover:bg-surface-container"
          }`;

          return (
            <Link className={itemClassName} href={item.href} key={item.label}>
              <SymbolIcon filled={isActive}>{item.icon}</SymbolIcon>
              {item.label}
            </Link>
          );
        })}

        <div className="mt-xl border-t border-outline-variant pt-lg">
          <p className="mb-sm px-lg text-[10px] font-bold uppercase text-outline">
            历史记录
          </p>
          {historyItems.length ? (
            <div className="space-y-xs">
              {historyItems.map((item) => (
                <a
                  className="group/hist flex items-center justify-between gap-xs rounded-lg px-lg py-sm font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary cursor-pointer"
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
                  <span className="shrink-0 text-[10px] text-outline ml-xs font-mono font-medium group-hover/hist:hidden">
                    {formatHistoryTime(item.updatedAt)}
                  </span>
                  <button
                    className="hidden shrink-0 items-center justify-center rounded-md p-[2px] text-on-surface-variant transition-colors hover:bg-error-container hover:text-error group-hover/hist:flex"
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
            <p className="px-lg py-sm font-label-sm text-label-sm text-outline">
              暂无对话
            </p>
          )}
        </div>
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
  );
}
