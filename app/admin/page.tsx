import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";

import { SymbolIcon } from "@/components/app/symbol-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAdminAuthError, requireAdminUserFromCookieHeader } from "@/lib/server/auth/admin-guard";
import {
  getAdminConversationDetail,
  getAdminUsageOverview,
  getAdminUserDetail,
  listAdminUsers,
  type AdminConversationDetailProjection,
  type AdminTokenUsageProjection,
  type AdminUserDetailProjection,
  type AdminUserListItemProjection,
  type AdminUsageOverviewProjection,
} from "@/lib/server/admin/admin-ai-usage-service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "AI 使用后台 | FitMate AI",
};

type AdminPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  try {
    await requireAdminUserFromCookieHeader(await readCookieHeader());
  } catch (error) {
    if (isAdminAuthError(error)) {
      return <AdminAccessDenied status={error.status} message={error.message} />;
    }

    throw error;
  }

  const params = await searchParams;
  const selectedUserId = readFirstParam(params?.userId);
  const selectedConversationId = readFirstParam(params?.conversationId);
  const [overview, users, selectedUser, selectedConversation] = await Promise.all([
    getAdminUsageOverview(),
    listAdminUsers(),
    selectedUserId ? getAdminUserDetail(selectedUserId) : Promise.resolve(null),
    selectedConversationId ? getAdminConversationDetail(selectedConversationId) : Promise.resolve(null),
  ]);

  // 后台页面使用自身滚动容器，避免全局 body overflow hidden 阻断列表和详情上下滚动。
  return (
    <main className="h-dvh overflow-y-auto bg-background px-8 py-6 text-foreground">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 pb-2">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-headline-md font-semibold tracking-normal">AI 使用后台</h1>
            <p className="mt-1 text-body-sm text-muted-foreground">生产 token usage、用户、会话和消息</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin">
              <SymbolIcon className="text-[18px]">monitoring</SymbolIcon>
              Overview
            </Link>
          </Button>
        </header>

        <OverviewPanel overview={overview} />

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
          <UsersPanel users={users.items} />
          <div className="flex flex-col gap-6">
            {selectedUser ? (
              <UserDetailPanel detail={selectedUser} selectedConversationId={selectedConversationId} />
            ) : (
              <EmptySelection title="用户详情" />
            )}
            {selectedConversation ? (
              <ConversationDetailPanel detail={selectedConversation} />
            ) : (
              <EmptySelection title="会话详情" />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function OverviewPanel({ overview }: { overview: AdminUsageOverviewProjection }) {
  return (
    <section className="grid shrink-0 gap-4 md:grid-cols-3 xl:grid-cols-6">
      <MetricCard label="用户" value={overview.userCount.toLocaleString("zh-CN")} icon="group" />
      <MetricCard label="会话" value={overview.conversationCount.toLocaleString("zh-CN")} icon="forum" />
      <MetricCard label="消息" value={overview.messageCount.toLocaleString("zh-CN")} icon="chat" />
      <MetricCard label="输入 token" value={formatTokenValue(overview.tokenUsage, "promptTokens")} icon="login" />
      <MetricCard label="输出 token" value={formatTokenValue(overview.tokenUsage, "completionTokens")} icon="logout" />
      <MetricCard label="总 token" value={formatTokenValue(overview.tokenUsage, "totalTokens")} icon="data_usage" muted={overview.tokenUsage.hasUnknownUsage} />
    </section>
  );
}

function MetricCard({
  label,
  value,
  icon,
  muted = false,
}: {
  label: string;
  value: string;
  icon: string;
  muted?: boolean;
}) {
  return (
    <Card className="gap-3 rounded-lg py-4">
      <CardContent className="flex items-center justify-between gap-3 px-4">
        <div className="min-w-0">
          <div className="text-label-sm text-muted-foreground">{label}</div>
          <div className="mt-1 truncate text-title-lg font-semibold">{value}</div>
        </div>
        <span className={`grid size-10 shrink-0 place-items-center rounded-full ${muted ? "bg-amber-50 text-amber-700" : "bg-primary-soft text-primary"}`}>
          <SymbolIcon className="text-[21px]">{icon}</SymbolIcon>
        </span>
      </CardContent>
    </Card>
  );
}

function UsersPanel({ users }: { users: AdminUserListItemProjection[] }) {
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>用户列表</CardTitle>
        <CardDescription>按创建时间倒序</CardDescription>
      </CardHeader>
      <CardContent className="custom-scrollbar max-h-[min(760px,calc(100dvh-260px))] overflow-auto pb-6">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-body-sm">
          <thead className="text-label-sm text-muted-foreground">
            <tr>
              <TableHead>用户</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead>会话</TableHead>
              <TableHead>消息</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>操作</TableHead>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.userId} className="border-b border-border">
                <TableCell>
                  <div className="font-medium">{user.identityLabel}</div>
                  <div className="max-w-[220px] truncate text-label-sm text-muted-foreground">{user.userId}</div>
                </TableCell>
                <TableCell>{formatDate(user.createdAt)}</TableCell>
                <TableCell>{user.conversationCount}</TableCell>
                <TableCell>{user.messageCount}</TableCell>
                <TableCell><TokenInline usage={user.tokenUsage} /></TableCell>
                <TableCell>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin?userId=${encodeURIComponent(user.userId)}`}>
                      <SymbolIcon className="text-[18px]">person_search</SymbolIcon>
                      查看
                    </Link>
                  </Button>
                </TableCell>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function UserDetailPanel({
  detail,
  selectedConversationId,
}: {
  detail: AdminUserDetailProjection;
  selectedConversationId: string | undefined;
}) {
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>{detail.user.identityLabel}</CardTitle>
        <CardDescription>{detail.user.userId}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pb-6">
        <TokenGrid usage={detail.tokenUsage} />
        <div className="grid grid-cols-2 gap-3 text-body-sm">
          <SummaryPill label="会话" value={detail.conversationCount} />
          <SummaryPill label="消息" value={detail.messageCount} />
        </div>
        <div className="custom-scrollbar -mr-2 flex max-h-[360px] flex-col gap-2 overflow-y-auto pr-2">
          {detail.conversations.length > 0 ? (
            detail.conversations.map((conversation) => {
              const isSelected = conversation.conversationId === selectedConversationId;

              return (
                <Link
                  key={conversation.conversationId}
                  href={`/admin?userId=${encodeURIComponent(detail.user.userId)}&conversationId=${encodeURIComponent(conversation.conversationId)}`}
                  aria-current={isSelected ? "page" : undefined}
                  className={cn(
                    "rounded-lg border px-3 py-2 transition-colors",
                    isSelected
                      ? "border-primary/40 bg-primary-soft/70 text-primary"
                      : "border-border hover:bg-accent",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-medium">{conversation.title ?? "未命名会话"}</span>
                    <span className="text-label-sm text-muted-foreground">{conversation.messageCount} 条</span>
                  </div>
                  <div className="mt-1 text-label-sm text-muted-foreground">
                    {formatDate(conversation.updatedAt)} · <TokenInline usage={conversation.tokenUsage} />
                  </div>
                </Link>
              );
            })
          ) : (
            <EmptyPanelMessage>暂无会话记录</EmptyPanelMessage>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ConversationDetailPanel({ detail }: { detail: AdminConversationDetailProjection }) {
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>{detail.conversation.title ?? "未命名会话"}</CardTitle>
        <CardDescription>{detail.conversation.conversationId}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pb-6">
        <TokenGrid usage={detail.conversation.tokenUsage} />
        <div className="custom-scrollbar -mr-2 flex max-h-[min(720px,calc(100dvh-300px))] flex-col gap-3 overflow-y-auto pr-2">
          {detail.messages.length > 0 ? (
            detail.messages.map((message) => (
              <div key={message.messageId} className="rounded-lg border border-border bg-card px-3 py-3">
                <div className="flex items-center justify-between gap-3 text-label-sm text-muted-foreground">
                  <span>{message.role}</span>
                  <span>{formatDate(message.createdAt)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-body-sm leading-6">{message.content}</p>
                <div className="mt-2 text-label-sm text-muted-foreground">
                  <TokenInline usage={message.tokenUsage} />
                </div>
              </div>
            ))
          ) : (
            <EmptyPanelMessage>暂无消息记录</EmptyPanelMessage>
          )}
        </div>
        {detail.usageSummaries.length > 0 ? (
          <div className="shrink-0 rounded-lg border border-border bg-muted/30 p-3 text-label-sm text-muted-foreground">
            {detail.usageSummaries.length} 条 usage summary
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TokenGrid({ usage }: { usage: AdminTokenUsageProjection }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-body-sm">
      <SummaryPill label="输入" value={formatTokenValue(usage, "promptTokens")} />
      <SummaryPill label="输出" value={formatTokenValue(usage, "completionTokens")} />
      <SummaryPill label="总计" value={formatTokenValue(usage, "totalTokens")} accent={usage.hasUnknownUsage} />
    </div>
  );
}

function TokenInline({ usage }: { usage: AdminTokenUsageProjection }) {
  return (
    <span>
      输入 {formatTokenValue(usage, "promptTokens")} / 输出 {formatTokenValue(usage, "completionTokens")} / 总 {formatTokenValue(usage, "totalTokens")}
      {usage.hasUnknownUsage ? <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">含未知</span> : null}
    </span>
  );
}

function SummaryPill({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${accent ? "border-amber-200 bg-amber-50/70" : "border-border bg-muted/30"}`}>
      <div className="text-label-sm text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-semibold">{typeof value === "number" ? value.toLocaleString("zh-CN") : value}</div>
    </div>
  );
}

function EmptySelection({ title }: { title: string }) {
  return (
    <Card className="rounded-lg border-dashed">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>未选择</CardDescription>
      </CardHeader>
    </Card>
  );
}

function EmptyPanelMessage({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-body-sm text-muted-foreground">
      {children}
    </div>
  );
}

function AdminAccessDenied({ status, message }: { status: number; message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <Card className="w-full max-w-md rounded-lg">
        <CardHeader>
          <CardTitle>后台不可访问</CardTitle>
          <CardDescription>{status} · {message}</CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}

function TableHead({ children }: { children: ReactNode }) {
  return <th className="border-b border-border px-3 py-2 font-medium">{children}</th>;
}

function TableCell({ children }: { children: ReactNode }) {
  return <td className="border-b border-border px-3 py-3 align-top">{children}</td>;
}

function formatTokenValue(
  usage: AdminTokenUsageProjection,
  key: "promptTokens" | "completionTokens" | "totalTokens",
) {
  if (usage.recordedUsageCount === 0) {
    return "无记录";
  }

  const value = usage[key];

  return value === null ? "未知" : value.toLocaleString("zh-CN");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
    hour12: false,
  }).format(new Date(value));
}

async function readCookieHeader() {
  const cookieStore = await cookies();

  return cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`)
    .join("; ");
}

function readFirstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
