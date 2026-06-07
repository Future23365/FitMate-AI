"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useLocalAuth } from "@/components/auth/local-auth-provider";
import { deleteChatConversation, readChatHistory } from "@/features/chat/lib/chat-history";
import { runWithAsyncToast } from "@/lib/client/async-feedback";
import { LogoMark } from "./logo-mark";
import { SymbolIcon } from "./symbol-icon";

const navItems = [
  { label: "首页", icon: "chat", href: "/" },
  { label: "动作编排", icon: "reorder", href: "/composer" },
  { label: "训练计划", icon: "calendar_today", href: "/plans" },
  { label: "动作库", icon: "fitness_center", href: "/exercises" },
];

const sidebarRailMediaQuery = "(max-width: 1530px)";

type SidebarHistoryItem = {
  id: string;
  title: string;
  updatedAt?: string;
};

type SidebarPanelProps = {
  historyItems: SidebarHistoryItem[];
  isSettingsActive: boolean;
  pathname: string;
  userName: string;
  onDeleteConversation: (id: string) => void;
  onHistorySelect: (id: string) => void;
  onNavigate?: () => void;
  deletingConversationId?: string | null;
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
  deletingConversationId,
  historyItems,
  isSettingsActive,
  pathname,
  userName,
  onDeleteConversation,
  onHistorySelect,
  onNavigate,
  titleId,
}: SidebarPanelProps) {
  return (
    <>
      <div className="app-sidebar-brand mb-8 flex shrink-0 items-center gap-3 px-3">
        <span className="app-sidebar-brand-icon">
          <LogoMark />
        </span>
        <div className="app-sidebar-copy">
          <h1 className="text-xl font-extrabold tracking-tight text-primary" id={titleId}>
            FitMate AI
          </h1>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">
            AI Fitness Coach
          </p>
        </div>
      </div>

      <Link
        aria-label="新建对话"
        className="app-sidebar-primary-action mb-7 flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-card transition-all hover:bg-primary-deep hover:shadow-lift active:scale-[0.98]"
        href="/"
        onClick={() => {
          window.dispatchEvent(new Event("fitmate:new-chat"));
          onNavigate?.();
        }}
      >
        <span className="app-sidebar-icon">
          <SymbolIcon className="text-[20px]">add_comment</SymbolIcon>
        </span>
        <span className="app-sidebar-label">新建对话</span>
      </Link>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <nav className="shrink-0 space-y-1.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const itemClassName = `flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition-colors ${
              isActive
                ? "bg-primary-soft font-extrabold text-primary ring-1 ring-primary/10"
                : "text-muted hover:bg-panel-soft hover:text-primary"
            }`;

            return (
              <Link
                aria-label={item.label}
                className={`app-sidebar-nav-link ${itemClassName}`}
                href={item.href}
                key={item.label}
                onClick={onNavigate}
                title={item.label}
              >
                <span className="app-sidebar-icon">
                  <SymbolIcon filled={isActive}>{item.icon}</SymbolIcon>
                </span>
                <span className="app-sidebar-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <section className="app-sidebar-history-section mt-7 flex min-h-0 flex-1 flex-col border-t border-line pt-5">
          <p className="app-sidebar-copy mb-2 px-3 text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
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
                    disabled={deletingConversationId === item.id}
                    title="删除对话"
                    type="button"
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
            <p className="app-sidebar-copy px-3 py-2 text-xs font-semibold text-muted">
              暂无对话
            </p>
          )}
        </section>
      </div>

      <div className="mt-4 shrink-0 border-t border-line pt-4">
        <div className="app-sidebar-user-card flex items-center gap-3 rounded-xl border border-line/80 bg-white/72 p-2.5 shadow-card backdrop-blur-xl">
          <div className="app-sidebar-user-avatar flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-extrabold text-primary ring-1 ring-primary/10">
            <SymbolIcon className="text-[22px]" filled>
              person
            </SymbolIcon>
          </div>
          <div className="app-sidebar-copy min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-ink">{userName}</p>
            <p className="text-xs font-semibold text-muted">本地匿名账户</p>
          </div>
          <Link
            aria-label="进入设置"
            className={`app-sidebar-settings-link flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
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
  const { user } = useLocalAuth();
  const [historyItems, setHistoryItems] = useState<SidebarHistoryItem[]>([]);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSidebarCollapseLocked, setIsSidebarCollapseLocked] = useState(false);
  const [isDesktopSidebarExpanded, setIsDesktopSidebarExpanded] = useState(false);
  const [isSidebarRailMode, setIsSidebarRailMode] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const isSettingsActive = pathname.startsWith("/settings");
  const userName = user?.displayName || "匿名用户";

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
    setDeletingConversationId(id);

    void runWithAsyncToast(
      {
        id: "chat-history-delete",
        loading: "正在删除对话...",
        success: "对话已删除",
        error: "删除对话失败",
      },
      async () => {
        await deleteChatConversation(id);
        window.dispatchEvent(new Event("fitmate:chat-history-updated"));

        const currentHash = window.location.hash.replace(/^#/, "");
        if (currentHash === id) {
          window.dispatchEvent(new Event("fitmate:new-chat"));
        }
      },
    ).finally(() => {
      setDeletingConversationId((current) => (current === id ? null : current));
    });
  }

  /** 桌面 rail 点击导航后短暂锁定收缩态，避免路由切换后 hover/focus 继续撑开侧栏。 */
  function lockDesktopSidebarCollapse() {
    setIsSidebarCollapseLocked(true);
    setIsDesktopSidebarExpanded(false);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  function handleHistorySelect(id: string) {
    lockDesktopSidebarCollapse();
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

  useEffect(() => {
    // 与 app/globals.css 的侧边栏收缩断点保持一致，驱动主体缩放联动。
    const railMediaQuery = window.matchMedia(sidebarRailMediaQuery);

    function syncSidebarRailMode(event: MediaQueryListEvent | MediaQueryList) {
      setIsSidebarRailMode(event.matches);
    }

    syncSidebarRailMode(railMediaQuery);
    railMediaQuery.addEventListener("change", syncSidebarRailMode);

    return () => {
      railMediaQuery.removeEventListener("change", syncSidebarRailMode);
    };
  }, []);

  useEffect(() => {
    const shouldScalePage = isSidebarRailMode && isDesktopSidebarExpanded && !isSidebarCollapseLocked;
    document.body.classList.toggle("sidebar-rail-open", shouldScalePage);

    return () => {
      document.body.classList.remove("sidebar-rail-open");
    };
  }, [isDesktopSidebarExpanded, isSidebarCollapseLocked, isSidebarRailMode]);

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
        className={`app-sidebar app-sidebar-surface fixed left-0 top-0 z-30 hidden h-screen flex-col overflow-hidden border-r border-line/70 px-4 py-6 shadow-nav md:flex ${
          isSidebarCollapseLocked ? "app-sidebar-collapse-locked" : ""
        }`}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setIsDesktopSidebarExpanded(false);
          }
        }}
        onFocus={() => {
          if (!isSidebarCollapseLocked) {
            setIsDesktopSidebarExpanded(true);
          }
        }}
        onMouseEnter={() => {
          if (!isSidebarCollapseLocked) {
            setIsDesktopSidebarExpanded(true);
          }
        }}
        onMouseLeave={() => {
          setIsSidebarCollapseLocked(false);
          setIsDesktopSidebarExpanded(false);
        }}
      >
        <SidebarPanel
          deletingConversationId={deletingConversationId}
          historyItems={historyItems}
          isSettingsActive={isSettingsActive}
          pathname={pathname}
          userName={userName}
          onDeleteConversation={deleteConversation}
          onHistorySelect={handleHistorySelect}
          onNavigate={lockDesktopSidebarCollapse}
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
              deletingConversationId={deletingConversationId}
              historyItems={historyItems}
              isSettingsActive={isSettingsActive}
              pathname={pathname}
              userName={userName}
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
