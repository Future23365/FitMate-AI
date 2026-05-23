import type { Metadata } from "next";
import { AppSidebar } from "@/components/app/app-sidebar";
import { RouteTransition } from "@/components/app/route-transition";
import "./globals.css";

export const metadata: Metadata = {
  title: "FitMate AI",
  description: "AI 健身聊天助手",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <div id="app-content-wrapper">
          <AppSidebar />
          <RouteTransition>{children}</RouteTransition>
        </div>
      </body>
    </html>
  );
}
