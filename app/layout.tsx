import type { Metadata } from "next";
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
      <body>{children}</body>
    </html>
  );
}
