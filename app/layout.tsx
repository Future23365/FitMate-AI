import type { Metadata } from "next";
import { AppSidebar } from "@/components/app/app-sidebar";
import { RouteTransition } from "@/components/app/route-transition";
import { LocalAuthProvider } from "@/components/auth/local-auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "FitMate AI",
  description: "AI 健身聊天助手",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <LocalAuthProvider>
          <div id="app-content-wrapper">
            <AppSidebar />
            <RouteTransition>{children}</RouteTransition>
          </div>
        </LocalAuthProvider>
      </body>
    </html>
  );
}
