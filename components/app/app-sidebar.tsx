import Link from "next/link";

import { LogoMark } from "./logo-mark";
import { SymbolIcon } from "./symbol-icon";

const navItems = [
  { label: "首页", icon: "home", href: "/" },
  { label: "AI聊天", icon: "chat", href: "/" },
  { label: "训练计划", icon: "calendar_today", href: "#" },
  { label: "动作库", icon: "fitness_center", href: "/exercises" },
  { label: "饮食建议", icon: "restaurant", href: "#" },
  { label: "进度数据", icon: "insights", href: "#" },
  { label: "个人设置", icon: "settings", href: "#" },
];

export function AppSidebar({ activeLabel }: { activeLabel: string }) {
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
