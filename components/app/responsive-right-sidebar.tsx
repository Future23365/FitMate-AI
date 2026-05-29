import type { CSSProperties, ReactNode } from "react";

type ResponsiveRightSidebarProps = {
  children: ReactNode;
  className?: string;
  label?: string;
  width?: number;
};

// getResponsiveRightSidebarStyle 提供页面级宽度变量，保证主内容避让和右侧栏本体使用同一事实。
export function getResponsiveRightSidebarStyle(width = 300) {
  return {
    "--responsive-right-sidebar-width": `${width}px`,
  } as CSSProperties;
}

// ResponsiveRightSidebar 统一右侧栏的占位与浮层行为，页面只需复用同一宽度变量。
export function ResponsiveRightSidebar({
  children,
  className = "",
  label,
  width = 300,
}: ResponsiveRightSidebarProps) {
  const style = getResponsiveRightSidebarStyle(width);

  return (
    <aside
      aria-label={label}
      className={`responsive-right-sidebar app-shell-glass fixed right-0 top-0 z-30 flex h-screen flex-col border-l border-line/70 shadow-nav ${className}`}
      style={style}
    >
      {children}
    </aside>
  );
}
