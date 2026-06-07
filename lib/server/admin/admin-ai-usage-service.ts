import "server-only";

import { Prisma, type ChatMessageRole, type PrismaClient } from "@prisma/client";

import { getAdminConfig, type AdminConfig } from "@/lib/server/config";
import { getPrismaClient } from "@/lib/server/db/prisma";
import { toUtcISOString } from "@/lib/shared/time/utc-date-time";

export type AdminTokenUsageProjection = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  hasUnknownUsage: boolean;
  recordedUsageCount: number;
};

export type AdminUsageOverviewProjection = {
  userCount: number;
  conversationCount: number;
  messageCount: number;
  tokenUsage: AdminTokenUsageProjection;
};

export type AdminUserListItemProjection = {
  userId: string;
  email: string | null;
  displayName: string | null;
  identityLabel: string;
  createdAt: string;
  conversationCount: number;
  messageCount: number;
  tokenUsage: AdminTokenUsageProjection;
};

export type AdminUserDetailProjection = {
  user: Pick<AdminUserListItemProjection, "userId" | "email" | "displayName" | "identityLabel" | "createdAt">;
  conversationCount: number;
  messageCount: number;
  tokenUsage: AdminTokenUsageProjection;
  conversations: AdminConversationListItemProjection[];
};

export type AdminConversationListItemProjection = {
  conversationId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  tokenUsage: AdminTokenUsageProjection;
};

export type AdminConversationDetailProjection = {
  conversation: AdminConversationListItemProjection & {
    userId: string;
    userIdentityLabel: string;
  };
  messages: AdminConversationMessageProjection[];
  usageSummaries: AdminMessageUsageProjection[];
};

export type AdminConversationMessageProjection = {
  messageId: string;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
  tokenUsage: AdminTokenUsageProjection;
};

export type AdminMessageUsageProjection = {
  messageId: string;
  createdAt: string;
  updatedAt: string;
  tokenUsage: AdminTokenUsageProjection;
};

export type AdminListUsersResult = {
  items: AdminUserListItemProjection[];
  limit: number;
};

type AdminUserRow = {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: Date;
};

type AdminSessionRow = {
  id: string;
  userId: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
};

type AdminMessageRow = {
  id: string;
  role: ChatMessageRole;
  content: string;
  createdAt: Date;
};

type AdminUsageSummaryRow = {
  userId: string;
  conversationId: string;
  messageId: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  hasUnknownUsage: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type AdminUsageAggregateRow = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  recordedUsageCount: number;
  unknownUsageCount: number;
};

type AdminUsageSummaryFilter = {
  userIds?: string[];
  conversationIds?: string[];
  messageIds?: string[];
};

type AdminAiUsageReader = {
  countUsers: () => Promise<number>;
  countConversations: () => Promise<number>;
  countMessages: () => Promise<number>;
  aggregateUsage: (filter?: AdminUsageSummaryFilter) => Promise<AdminUsageAggregateRow>;
  listUsers: (input: { limit: number }) => Promise<AdminUserRow[]>;
  findUser: (userId: string) => Promise<AdminUserRow | null>;
  listSessionsForUserIds: (userIds: string[]) => Promise<AdminSessionRow[]>;
  listSessionsForUser: (input: { userId: string; limit: number }) => Promise<AdminSessionRow[]>;
  findSession: (conversationId: string) => Promise<(AdminSessionRow & { user: AdminUserRow }) | null>;
  listMessagesForConversation: (conversationId: string) => Promise<AdminMessageRow[]>;
  listUsageSummaries: (filter: AdminUsageSummaryFilter) => Promise<AdminUsageSummaryRow[]>;
};

type AdminServiceOptions = {
  reader?: AdminAiUsageReader;
  config?: AdminConfig;
};

/** getAdminUsageOverview 输出后台全站概览投影，页面不直接读取 Prisma aggregate shape。 */
export async function getAdminUsageOverview(options: AdminServiceOptions = {}): Promise<AdminUsageOverviewProjection> {
  const reader = options.reader ?? createPrismaAdminAiUsageReader();
  const [userCount, conversationCount, messageCount, tokenUsage] = await Promise.all([
    reader.countUsers(),
    reader.countConversations(),
    reader.countMessages(),
    reader.aggregateUsage().then(toTokenUsageProjection),
  ]);

  return {
    userCount,
    conversationCount,
    messageCount,
    tokenUsage,
  };
}

/** listAdminUsers 输出后台用户列表投影，并用集中配置限制默认分页规模。 */
export async function listAdminUsers(
  input: { limit?: number } = {},
  options: AdminServiceOptions = {},
): Promise<AdminListUsersResult> {
  const config = options.config ?? getAdminConfig();
  const reader = options.reader ?? createPrismaAdminAiUsageReader();
  const limit = clampLimit(input.limit, config);
  const users = await reader.listUsers({ limit });
  const userIds = users.map((user) => user.id);
  const [sessions, usageRows] = await Promise.all([
    reader.listSessionsForUserIds(userIds),
    reader.listUsageSummaries({ userIds }),
  ]);
  const sessionStats = buildSessionStatsByUser(sessions);
  const usageByUser = aggregateUsageRowsBy(usageRows, (row) => row.userId);

  return {
    limit,
    items: users.map((user) => ({
      ...toAdminUserIdentityProjection(user),
      conversationCount: sessionStats.get(user.id)?.conversationCount ?? 0,
      messageCount: sessionStats.get(user.id)?.messageCount ?? 0,
      tokenUsage: toTokenUsageProjection(usageByUser.get(user.id) ?? emptyUsageAggregate()),
    })),
  };
}

/** getAdminUserDetail 输出单个用户、会话列表和用户级 token 汇总的稳定投影。 */
export async function getAdminUserDetail(
  userId: string,
  input: { limit?: number } = {},
  options: AdminServiceOptions = {},
): Promise<AdminUserDetailProjection | null> {
  const config = options.config ?? getAdminConfig();
  const reader = options.reader ?? createPrismaAdminAiUsageReader();
  const limit = clampLimit(input.limit, config);
  const user = await reader.findUser(userId);

  if (!user) {
    return null;
  }

  const [sessions, userUsage] = await Promise.all([
    reader.listSessionsForUser({ userId, limit }),
    reader.aggregateUsage({ userIds: [userId] }).then(toTokenUsageProjection),
  ]);
  const usageRows = await reader.listUsageSummaries({
    userIds: [userId],
    conversationIds: sessions.map((session) => session.id),
  });
  const usageByConversation = aggregateUsageRowsBy(usageRows, (row) => row.conversationId);
  const messageCount = sessions.reduce((sum, session) => sum + session.messageCount, 0);

  return {
    user: toAdminUserIdentityProjection(user),
    conversationCount: sessions.length,
    messageCount,
    tokenUsage: userUsage,
    conversations: sessions.map((session) => toConversationListItem(
      session,
      toTokenUsageProjection(usageByConversation.get(session.id) ?? emptyUsageAggregate()),
    )),
  };
}

/** getAdminConversationDetail 输出会话消息和消息 / 请求级 token 投影，不暴露 Agent loop 或 Trace shape。 */
export async function getAdminConversationDetail(
  conversationId: string,
  options: AdminServiceOptions = {},
): Promise<AdminConversationDetailProjection | null> {
  const reader = options.reader ?? createPrismaAdminAiUsageReader();
  const session = await reader.findSession(conversationId);

  if (!session) {
    return null;
  }

  const [messages, usageRows] = await Promise.all([
    reader.listMessagesForConversation(conversationId),
    reader.listUsageSummaries({
      userIds: [session.userId],
      conversationIds: [conversationId],
    }),
  ]);
  const usageByMessage = aggregateUsageRowsBy(usageRows, (row) => row.messageId);
  const conversationUsage = aggregateUsageRows(usageRows);

  return {
    conversation: {
      ...toConversationListItem(session, toTokenUsageProjection(conversationUsage)),
      userId: session.userId,
      userIdentityLabel: getUserIdentityLabel(session.user),
    },
    messages: messages.map((message) => ({
      messageId: message.id,
      role: message.role,
      content: message.content,
      createdAt: toUtcISOString(message.createdAt),
      tokenUsage: toTokenUsageProjection(usageByMessage.get(message.id) ?? emptyUsageAggregate()),
    })),
    usageSummaries: usageRows.map((row) => ({
      messageId: row.messageId,
      createdAt: toUtcISOString(row.createdAt),
      updatedAt: toUtcISOString(row.updatedAt),
      tokenUsage: toTokenUsageProjection(usageRowToAggregate(row)),
    })),
  };
}

function createPrismaAdminAiUsageReader(prisma: PrismaClient = getPrismaClient()): AdminAiUsageReader {
  return {
    countUsers: () => prisma.user.count({ where: { deletedAt: null } }),
    countConversations: () => prisma.chatSession.count(),
    countMessages: () => prisma.chatMessage.count(),
    aggregateUsage: (filter) => aggregatePrismaUsage(prisma, filter),
    listUsers: async ({ limit }) => prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: userSelect,
    }),
    findUser: async (userId) => prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: userSelect,
    }),
    listSessionsForUserIds: async (userIds) => {
      if (userIds.length === 0) {
        return [];
      }

      return (await prisma.chatSession.findMany({
        where: { userId: { in: userIds } },
        orderBy: { updatedAt: "desc" },
        select: sessionSelect,
      })).map(toAdminSessionRow);
    },
    listSessionsForUser: async ({ userId, limit }) => (
      await prisma.chatSession.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: limit,
        select: sessionSelect,
      })
    ).map(toAdminSessionRow),
    findSession: async (conversationId) => {
      const session = await prisma.chatSession.findUnique({
        where: { id: conversationId },
        select: {
          ...sessionSelect,
          user: {
            select: userSelect,
          },
        },
      });

      return session ? { ...toAdminSessionRow(session), user: session.user } : null;
    },
    listMessagesForConversation: async (conversationId) => prisma.chatMessage.findMany({
      where: { chatSessionId: conversationId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    }),
    listUsageSummaries: async (filter) => prisma.aiTokenUsageSummary.findMany({
      where: buildUsageWhere(filter),
      orderBy: { createdAt: "asc" },
      select: usageSummarySelect,
    }),
  };
}

async function aggregatePrismaUsage(
  prisma: PrismaClient,
  filter?: AdminUsageSummaryFilter,
): Promise<AdminUsageAggregateRow> {
  const where = buildUsageWhere(filter);
  const [aggregate, unknownUsageCount] = await Promise.all([
    prisma.aiTokenUsageSummary.aggregate({
      where,
      _sum: {
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
      },
      _count: {
        _all: true,
      },
    }),
    prisma.aiTokenUsageSummary.count({
      where: {
        ...where,
        OR: unknownUsageConditions,
      },
    }),
  ]);

  return {
    promptTokens: aggregate._sum.promptTokens,
    completionTokens: aggregate._sum.completionTokens,
    totalTokens: aggregate._sum.totalTokens,
    recordedUsageCount: aggregate._count._all,
    unknownUsageCount,
  };
}

const userSelect = {
  id: true,
  email: true,
  displayName: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const sessionSelect = {
  id: true,
  userId: true,
  title: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      messages: true,
    },
  },
} satisfies Prisma.ChatSessionSelect;

const usageSummarySelect = {
  userId: true,
  conversationId: true,
  messageId: true,
  promptTokens: true,
  completionTokens: true,
  totalTokens: true,
  hasUnknownUsage: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AiTokenUsageSummarySelect;

const unknownUsageConditions = [
  { hasUnknownUsage: true },
  { promptTokens: null },
  { completionTokens: null },
  { totalTokens: null },
] satisfies Prisma.AiTokenUsageSummaryWhereInput[];

function buildUsageWhere(filter: AdminUsageSummaryFilter | undefined): Prisma.AiTokenUsageSummaryWhereInput {
  return {
    ...(filter?.userIds?.length ? { userId: { in: filter.userIds } } : {}),
    ...(filter?.conversationIds?.length ? { conversationId: { in: filter.conversationIds } } : {}),
    ...(filter?.messageIds?.length ? { messageId: { in: filter.messageIds } } : {}),
  };
}

function toAdminSessionRow(row: Prisma.ChatSessionGetPayload<{ select: typeof sessionSelect }>): AdminSessionRow {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    messageCount: row._count.messages,
  };
}

function toAdminUserIdentityProjection(user: AdminUserRow) {
  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    identityLabel: getUserIdentityLabel(user),
    createdAt: toUtcISOString(user.createdAt),
  };
}

function toConversationListItem(
  session: AdminSessionRow,
  tokenUsage: AdminTokenUsageProjection,
): AdminConversationListItemProjection {
  return {
    conversationId: session.id,
    title: session.title,
    createdAt: toUtcISOString(session.createdAt),
    updatedAt: toUtcISOString(session.updatedAt),
    messageCount: session.messageCount,
    tokenUsage,
  };
}

function getUserIdentityLabel(user: Pick<AdminUserRow, "email" | "displayName" | "id">) {
  return user.displayName ?? user.email ?? `匿名用户 ${user.id.slice(0, 8)}`;
}

function buildSessionStatsByUser(sessions: AdminSessionRow[]) {
  const statsByUser = new Map<string, { conversationCount: number; messageCount: number }>();

  for (const session of sessions) {
    const current = statsByUser.get(session.userId) ?? { conversationCount: 0, messageCount: 0 };
    current.conversationCount += 1;
    current.messageCount += session.messageCount;
    statsByUser.set(session.userId, current);
  }

  return statsByUser;
}

function aggregateUsageRowsBy(rows: AdminUsageSummaryRow[], getKey: (row: AdminUsageSummaryRow) => string) {
  const aggregates = new Map<string, AdminUsageAggregateRow>();

  for (const row of rows) {
    const key = getKey(row);
    aggregates.set(key, mergeUsageAggregate(aggregates.get(key) ?? emptyUsageAggregate(), usageRowToAggregate(row)));
  }

  return aggregates;
}

function aggregateUsageRows(rows: AdminUsageSummaryRow[]) {
  return rows.reduce(
    (aggregate, row) => mergeUsageAggregate(aggregate, usageRowToAggregate(row)),
    emptyUsageAggregate(),
  );
}

function usageRowToAggregate(row: Pick<AdminUsageSummaryRow, "promptTokens" | "completionTokens" | "totalTokens" | "hasUnknownUsage">) {
  return {
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    totalTokens: row.totalTokens,
    recordedUsageCount: 1,
    unknownUsageCount: row.hasUnknownUsage || row.promptTokens === null || row.completionTokens === null || row.totalTokens === null ? 1 : 0,
  };
}

function mergeUsageAggregate(left: AdminUsageAggregateRow, right: AdminUsageAggregateRow): AdminUsageAggregateRow {
  return {
    promptTokens: addNullable(left.promptTokens, right.promptTokens),
    completionTokens: addNullable(left.completionTokens, right.completionTokens),
    totalTokens: addNullable(left.totalTokens, right.totalTokens),
    recordedUsageCount: left.recordedUsageCount + right.recordedUsageCount,
    unknownUsageCount: left.unknownUsageCount + right.unknownUsageCount,
  };
}

function emptyUsageAggregate(): AdminUsageAggregateRow {
  return {
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    recordedUsageCount: 0,
    unknownUsageCount: 0,
  };
}

function toTokenUsageProjection(aggregate: AdminUsageAggregateRow): AdminTokenUsageProjection {
  return {
    promptTokens: aggregate.recordedUsageCount > 0 ? aggregate.promptTokens : null,
    completionTokens: aggregate.recordedUsageCount > 0 ? aggregate.completionTokens : null,
    totalTokens: aggregate.recordedUsageCount > 0 ? aggregate.totalTokens : null,
    hasUnknownUsage: aggregate.unknownUsageCount > 0,
    recordedUsageCount: aggregate.recordedUsageCount,
  };
}

function addNullable(left: number | null, right: number | null) {
  if (left === null && right === null) {
    return null;
  }

  return (left ?? 0) + (right ?? 0);
}

function clampLimit(limit: number | undefined, config: AdminConfig) {
  if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit <= 0) {
    return config.pagination.defaultLimit;
  }

  return Math.min(limit, config.pagination.maxLimit);
}
