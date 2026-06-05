import type { Metadata } from "next";
import { LocalAuthProvider } from "@/components/auth/local-auth-provider";
import { Toaster } from "@/components/ui/sonner";
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
        <LocalAuthProvider>
          {children}
        </LocalAuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
