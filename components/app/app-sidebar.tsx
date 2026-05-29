"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { deleteChatConversation, readChatHistory } from "@/features/chat/lib/chat-history";
import { LogoMark } from "./logo-mark";
import { SymbolIcon } from "./symbol-icon";

const navItems = [
  { label: "首页", icon: "chat", href: "/" },
  { label: "训练计划", icon: "calendar_today", href: "/plans" },
  { label: "动作编排", icon: "reorder", href: "/composer" },
  { label: "动作库", icon: "fitness_center", href: "/exercises" },
];

const currentUser = {
  name: "FitMate 用户",
  initials: "FM",
};

const sidebarPreferenceKey = "fitmate.appSidebar.collapsed";

type SidebarHistoryItem = {
  id: string;
  title: string;
  updatedAt?: string;
};

type SidebarPanelProps = {
  historyItems: SidebarHistoryItem[];
  isCollapsed: boolean;
  isSettingsActive: boolean;
  pathname: string;
  onDeleteConversation: (id: string) => void;
  onHistorySelect: (id: string) => void;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
  titleId?: string;
};

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

function SidebarPanel({
  historyItems,
  isCollapsed,
  isSettingsActive,
  pathname,
  onDeleteConversation,
  onHistorySelect,
  onToggleCollapsed,
  onNavigate,
  titleId,
}: SidebarPanelProps) {
  return (
    <>
      <div
        className={`mb-7 flex shrink-0 ${
          isCollapsed ? "flex-col items-center gap-sm" : "items-center gap-3 px-3"
        }`}
      >
        <div className={`flex min-w-0 items-center ${isCollapsed ? "justify-center" : "flex-1 gap-3"}`}>
          <LogoMark />
          {!isCollapsed ? (
            <div className="min-w-0">
              <h1 className="truncate text-xl font-extrabold tracking-tight text-primary" id={titleId}>
                FitMate AI
              </h1>
              <p className="truncate text-xs font-bold uppercase tracking-[0.16em] text-muted">
                AI Fitness Coach
              </p>
            </div>
          ) : null}
        </div>
        {onToggleCollapsed ? (
          <button
            aria-label={isCollapsed ? "展开侧边栏" : "收缩侧边栏"}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-white/82 text-muted shadow-card transition-colors hover:bg-panel-soft hover:text-primary"
            onClick={onToggleCollapsed}
            title={isCollapsed ? "展开侧边栏" : "收缩侧边栏"}
            type="button"
          >
            <SymbolIcon className="text-[20px]">
              {isCollapsed ? "keyboard_double_arrow_right" : "keyboard_double_arrow_left"}
            </SymbolIcon>
          </button>
        ) : null}
      </div>

      <Link
        className={`mb-7 flex shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white shadow-card transition-all hover:bg-primary-deep hover:shadow-lift active:scale-[0.98] ${
          isCollapsed ? "h-11 w-11 px-0" : "w-full gap-2 px-5 py-3"
        }`}
        href="/"
        onClick={() => {
          window.dispatchEvent(new Event("fitmate:new-chat"));
          onNavigate?.();
        }}
        title="新建对话"
      >
        <SymbolIcon className="text-[20px]">add_comment</SymbolIcon>
        {!isCollapsed ? <span>新建对话</span> : null}
      </Link>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <nav className="shrink-0 space-y-1.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const itemClassName = `flex w-full items-center rounded-xl py-3 text-left text-sm font-semibold transition-colors ${
              isActive
                ? "bg-primary-soft font-extrabold text-primary ring-1 ring-primary/10"
                : "text-muted hover:bg-panel-soft hover:text-primary"
            } ${isCollapsed ? "justify-center px-0" : "gap-3 px-3"}`;

            return (
              <Link
                className={itemClassName}
                href={item.href}
                key={item.label}
                onClick={onNavigate}
                title={isCollapsed ? item.label : undefined}
              >
                <SymbolIcon filled={isActive}>{item.icon}</SymbolIcon>
                {!isCollapsed ? item.label : null}
              </Link>
            );
          })}
        </nav>

        {!isCollapsed ? (
          <section className="mt-7 flex min-h-0 flex-1 flex-col border-t border-line pt-5">
            <p className="mb-2 px-3 text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
              历史记录
            </p>
            {historyItems.length ? (
              <div className="custom-scrollbar min-h-0 flex-1 space-y-xs overflow-y-auto pr-1">
                {historyItems.map((item) => (
                  <a
                    className="group/hist flex cursor-pointer items-center justify-between gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-panel-soft hover:text-primary"
                    href={`/#${item.id}`}
                    key={item.id}
                    title={item.title}
                    onClick={(e) => {
                      e.preventDefault();
                      onHistorySelect(item.id);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink transition-colors group-hover/hist:text-primary">
                      {item.title}
                    </span>
                    {/* 默认显示时间，hover 时切换为删除按钮 */}
                    <span className="ml-2 shrink-0 font-mono text-[9px] font-medium text-gray-400/70 group-hover/hist:hidden">
                      {formatHistoryTime(item.updatedAt)}
                    </span>
                    <button
                      className="hidden shrink-0 items-center justify-center rounded-md p-[2px] text-muted transition-colors hover:bg-error-container hover:text-error group-hover/hist:flex"
                      title="删除对话"
                      onClick={(e) => {
                        // 阻止事件冒泡到外层 <a>，避免触发加载对话
                        e.preventDefault();
                        e.stopPropagation();
                        onDeleteConversation(item.id);
                      }}
                    >
                      <SymbolIcon className="text-[16px]">close</SymbolIcon>
                    </button>
                  </a>
                ))}
              </div>
            ) : (
              <p className="px-3 py-2 text-xs font-semibold text-muted">
                暂无对话
              </p>
            )}
          </section>
        ) : null}
      </div>

      <div className="mt-4 shrink-0 border-t border-line pt-4">
        <div
          className={`flex rounded-xl border border-line/80 bg-white/72 p-2.5 shadow-card backdrop-blur-xl ${
            isCollapsed ? "flex-col items-center gap-sm" : "items-center gap-3"
          }`}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-extrabold text-primary ring-1 ring-primary/10">
            {currentUser.initials}
          </div>
          {!isCollapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-ink">{currentUser.name}</p>
              <p className="text-xs font-semibold text-muted">个人账户</p>
            </div>
          ) : null}
          <Link
            aria-label="进入设置"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
              isSettingsActive
                ? "bg-primary-soft text-primary"
                : "text-muted hover:bg-panel-soft hover:text-primary"
            }`}
            href="/settings"
            title="设置"
            onClick={onNavigate}
          >
            <SymbolIcon className="text-[20px]" filled={isSettingsActive}>
              settings
            </SymbolIcon>
          </Link>
        </div>
      </div>
    </>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [historyItems, setHistoryItems] = useState<SidebarHistoryItem[]>([]);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(sidebarPreferenceKey) === "true";
  });
  const isSettingsActive = pathname.startsWith("/settings");

  useEffect(() => {
    // 全局 CSS 变量是 sidebar 与页面内容宽度联动的唯一来源，避免各页面写死左侧留白。
    document.documentElement.dataset.appSidebar = isSidebarCollapsed ? "collapsed" : "expanded";
    window.localStorage.setItem(sidebarPreferenceKey, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    async function syncHistory() {
      try {
        const conversations = await readChatHistory();
        const sortedHistory = [...conversations].sort(
          (a, b) => getTimeSafe(b.updatedAt) - getTimeSafe(a.updatedAt),
        );
        setHistoryItems(
          sortedHistory.length
            ? sortedHistory.map((item) => ({
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

    void syncHistory();
    window.addEventListener("fitmate:chat-history-updated", syncHistory);

    return () => {
      window.removeEventListener("fitmate:chat-history-updated", syncHistory);
    };
  }, []);

  /** 删除指定对话，并同步侧边栏与聊天页状态 */
  function deleteConversation(id: string) {
    void deleteChatConversation(id).then(() => {
      window.dispatchEvent(new Event("fitmate:chat-history-updated"));

      const currentHash = window.location.hash.replace(/^#/, "");
      if (currentHash === id) {
        window.dispatchEvent(new Event("fitmate:new-chat"));
      }
    });
  }

  function handleHistorySelect(id: string) {
    if (pathname === "/") {
      // 已在聊天页，直接通过事件加载对话，避免不必要的路由重渲染
      window.history.pushState(null, "", `#${id}`);
      window.dispatchEvent(new CustomEvent("fitmate:load-chat", { detail: id }));
    } else {
      // 不在聊天页，先跳转到首页，page.tsx 会根据 hash 自动加载对话
      router.push(`/#${id}`);
    }
    setIsMobileNavOpen(false);
  }

  useEffect(() => {
    if (!isMobileNavOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMobileNavOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileNavOpen]);

  // 开发调试页与训练执行页使用独立布局，不显示主应用侧边栏。
  if (pathname.startsWith("/dev") || pathname.startsWith("/training")) {
    return null;
  }

  return (
    <>
      <button
        aria-expanded={isMobileNavOpen}
        aria-label="打开导航"
        aria-controls="mobile-app-navigation"
        className="fixed right-4 top-4 z-40 flex h-11 w-11 items-center justify-center rounded-xl border border-line/80 bg-white/82 text-ink shadow-nav backdrop-blur-2xl transition-colors hover:bg-panel-soft md:hidden"
        onClick={() => setIsMobileNavOpen(true)}
        type="button"
      >
        <SymbolIcon>menu</SymbolIcon>
      </button>

      <aside
        className={`app-shell-glass fixed left-0 top-0 z-30 hidden h-screen w-[var(--app-sidebar-width)] flex-col overflow-hidden border-r border-line/70 shadow-nav transition-[width,padding] duration-300 md:flex ${
          isSidebarCollapsed ? "px-3 py-5" : "px-4 py-6"
        }`}
      >
        <SidebarPanel
          historyItems={historyItems}
          isCollapsed={isSidebarCollapsed}
          isSettingsActive={isSettingsActive}
          pathname={pathname}
          onDeleteConversation={deleteConversation}
          onHistorySelect={handleHistorySelect}
          onToggleCollapsed={() => setIsSidebarCollapsed((current) => !current)}
        />
      </aside>

      {isMobileNavOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            aria-label="关闭导航"
            className="absolute inset-0 h-full w-full bg-ink/28 backdrop-blur-sm"
            onClick={() => setIsMobileNavOpen(false)}
            type="button"
          />
          <aside
            aria-labelledby="mobile-app-navigation-title"
            aria-modal="true"
            className="relative flex h-dvh w-[min(320px,calc(100vw-32px))] flex-col overflow-hidden border-r border-line/70 bg-white px-4 py-6 shadow-nav"
            id="mobile-app-navigation"
            role="dialog"
          >
            <button
              aria-label="关闭导航"
              className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-panel-soft hover:text-primary"
              onClick={() => setIsMobileNavOpen(false)}
              type="button"
            >
              <SymbolIcon className="text-[20px]">close</SymbolIcon>
            </button>
            <SidebarPanel
              historyItems={historyItems}
              isCollapsed={false}
              isSettingsActive={isSettingsActive}
              pathname={pathname}
              titleId="mobile-app-navigation-title"
              onDeleteConversation={deleteConversation}
              onHistorySelect={handleHistorySelect}
              onNavigate={() => setIsMobileNavOpen(false)}
            />
          </aside>
        </div>
      ) : null}
    </>
  );
}
