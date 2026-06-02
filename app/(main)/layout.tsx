import type { ReactNode } from "react";

import { AppSidebar } from "@/components/app/app-sidebar";
import { RouteTransition } from "@/components/app/route-transition";

// MainAppLayout 只服务常规应用页面，独立训练执行页和开发诊断页不挂载侧栏副作用。
export default function MainAppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div id="app-content-wrapper">
      <AppSidebar />
      <RouteTransition>{children}</RouteTransition>
    </div>
  );
}
