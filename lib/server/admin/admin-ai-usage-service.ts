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

export const adminUserListSortFields = ["createdAt", "lastReplyAt", "conversationCount", "messageCount", "totalTokens"] as const;
export const adminSortDirections = ["asc", "desc"] as const;

export type AdminUserListSortField = typeof adminUserListSortFields[number];
export type AdminSortDirection = typeof adminSortDirections[number];

export type AdminUserListSortInput = {
  sortBy?: string | null;
  sortDirection?: string | null;
};

export type AdminUserListSortState = {
  sortBy: AdminUserListSortField;
  sortDirection: AdminSortDirection;
};

export const defaultAdminUserListSort: AdminUserListSortState = {
  sortBy: "createdAt",
  sortDirection: "desc",
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
  lastReplyAt: string | null;
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
  sort: AdminUserListSortState;
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
  listUsers: (input: { limit: number; sort: AdminUserListSortState }) => Promise<AdminUserRow[]>;
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
  input: { limit?: number } & AdminUserListSortInput = {},
  options: AdminServiceOptions = {},
): Promise<AdminListUsersResult> {
  const config = options.config ?? getAdminConfig();
  const reader = options.reader ?? createPrismaAdminAiUsageReader();
  const limit = clampLimit(input.limit, config);
  const sort = resolveAdminUserListSort(input);
  const users = await reader.listUsers({ limit, sort });
  const userIds = users.map((user) => user.id);
  const [sessions, usageRows] = await Promise.all([
    reader.listSessionsForUserIds(userIds),
    reader.listUsageSummaries({ userIds }),
  ]);
  const sessionStats = buildSessionStatsByUser(sessions);
  const usageByUser = aggregateUsageRowsBy(usageRows, (row) => row.userId);

  return {
    limit,
    sort,
    items: sortAdminUserListItems(
      users.map((user) => {
        const stats = sessionStats.get(user.id);

        return {
          ...toAdminUserIdentityProjection(user),
          lastReplyAt: stats?.lastReplyAt ? toUtcISOString(stats.lastReplyAt) : null,
          conversationCount: stats?.conversationCount ?? 0,
          messageCount: stats?.messageCount ?? 0,
          tokenUsage: toTokenUsageProjection(usageByUser.get(user.id) ?? emptyUsageAggregate()),
        };
      }),
      sort,
    ),
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
    listUsers: (input) => listPrismaAdminUsers(prisma, input),
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

async function listPrismaAdminUsers(
  prisma: PrismaClient,
  input: { limit: number; sort: AdminUserListSortState },
) {
  switch (input.sort.sortBy) {
    case "createdAt":
      return prisma.user.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: input.sort.sortDirection },
        take: input.limit,
        select: userSelect,
      });
    case "lastReplyAt":
      return listPrismaUsersByLastReplyAt(prisma, input);
    case "conversationCount":
      return listPrismaUsersByConversationCount(prisma, input);
    case "messageCount":
      return listPrismaUsersByMessageCount(prisma, input);
    case "totalTokens":
      return listPrismaUsersByTotalTokens(prisma, input);
  }
}

async function listPrismaUsersByLastReplyAt(
  prisma: PrismaClient,
  input: { limit: number; sort: AdminUserListSortState },
) {
  const groups = await prisma.chatSession.groupBy({
    by: ["userId"],
    where: {
      user: { deletedAt: null },
    },
    _max: {
      updatedAt: true,
    },
    orderBy: {
      _max: {
        updatedAt: input.sort.sortDirection,
      },
    },
    take: input.limit,
  });
  const users = await listUsersByIdsInOrder(prisma, groups.map((group) => group.userId));

  return appendRemainingUsers(prisma, users, input.limit);
}

async function listPrismaUsersByConversationCount(
  prisma: PrismaClient,
  input: { limit: number; sort: AdminUserListSortState },
) {
  // 会话数排序由持久化 adapter 聚合，UI 和 Route 只消费稳定 sort field。
  const orderDirection = resolveSqlSortDirection(input.sort.sortDirection);
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT u."id"
    FROM "User" u
    LEFT JOIN "ChatSession" s ON s."userId" = u."id"
    WHERE u."deletedAt" IS NULL
    GROUP BY u."id", u."createdAt"
    ORDER BY COUNT(s."id") ${orderDirection}, u."createdAt" DESC
    LIMIT ${input.limit}
  `);

  return listUsersByIdsInOrder(prisma, rows.map((row) => row.id));
}

async function listPrismaUsersByMessageCount(
  prisma: PrismaClient,
  input: { limit: number; sort: AdminUserListSortState },
) {
  // 消息数跨 ChatSession / ChatMessage 聚合，集中在 Prisma adapter，避免页面复刻 DB shape。
  const orderDirection = resolveSqlSortDirection(input.sort.sortDirection);
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT u."id"
    FROM "User" u
    LEFT JOIN "ChatSession" s ON s."userId" = u."id"
    LEFT JOIN "ChatMessage" m ON m."chatSessionId" = s."id"
    WHERE u."deletedAt" IS NULL
    GROUP BY u."id", u."createdAt"
    ORDER BY COUNT(m."id") ${orderDirection}, u."createdAt" DESC
    LIMIT ${input.limit}
  `);

  return listUsersByIdsInOrder(prisma, rows.map((row) => row.id));
}

async function listPrismaUsersByTotalTokens(
  prisma: PrismaClient,
  input: { limit: number; sort: AdminUserListSortState },
) {
  const groups = await prisma.aiTokenUsageSummary.groupBy({
    by: ["userId"],
    where: {
      totalTokens: { not: null },
      user: { deletedAt: null },
    },
    _sum: {
      totalTokens: true,
    },
    orderBy: {
      _sum: {
        totalTokens: input.sort.sortDirection,
      },
    },
    take: input.limit,
  });
  const users = await listUsersByIdsInOrder(prisma, groups.map((group) => group.userId));

  return appendRemainingUsers(prisma, users, input.limit);
}

async function listUsersByIdsInOrder(prisma: PrismaClient, userIds: string[]) {
  if (userIds.length === 0) {
    return [];
  }

  const users = await prisma.user.findMany({
    where: {
      id: { in: userIds },
      deletedAt: null,
    },
    select: userSelect,
  });
  const usersById = new Map(users.map((user) => [user.id, user]));

  return userIds.flatMap((userId) => {
    const user = usersById.get(userId);

    return user ? [user] : [];
  });
}

async function appendRemainingUsers(
  prisma: PrismaClient,
  users: AdminUserRow[],
  limit: number,
) {
  if (users.length >= limit) {
    return users;
  }

  const remainingUsers = await prisma.user.findMany({
    where: {
      deletedAt: null,
      id: { notIn: users.map((user) => user.id) },
    },
    orderBy: { createdAt: "desc" },
    take: limit - users.length,
    select: userSelect,
  });

  return [...users, ...remainingUsers];
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

/** resolveAdminUserListSort 收敛后台用户列表排序输入，避免 UI 和 Route 复制默认规则。 */
export function resolveAdminUserListSort(input: AdminUserListSortInput = {}): AdminUserListSortState {
  const sortBy = input.sortBy && isAdminUserListSortField(input.sortBy)
    ? input.sortBy
    : defaultAdminUserListSort.sortBy;
  const sortDirection = input.sortDirection && isAdminSortDirection(input.sortDirection)
    ? input.sortDirection
    : defaultAdminUserListSort.sortDirection;

  return { sortBy, sortDirection };
}

function isAdminUserListSortField(value: string): value is AdminUserListSortField {
  return adminUserListSortFields.includes(value as AdminUserListSortField);
}

function isAdminSortDirection(value: string): value is AdminSortDirection {
  return adminSortDirections.includes(value as AdminSortDirection);
}

function buildSessionStatsByUser(sessions: AdminSessionRow[]) {
  const statsByUser = new Map<string, { conversationCount: number; messageCount: number; lastReplyAt: Date | null }>();

  for (const session of sessions) {
    const current = statsByUser.get(session.userId) ?? { conversationCount: 0, messageCount: 0, lastReplyAt: null };
    current.conversationCount += 1;
    current.messageCount += session.messageCount;
    current.lastReplyAt = maxDate(current.lastReplyAt, session.updatedAt);
    statsByUser.set(session.userId, current);
  }

  return statsByUser;
}

function sortAdminUserListItems(
  items: AdminUserListItemProjection[],
  sort: AdminUserListSortState,
) {
  return [...items].sort((left, right) => compareAdminUserListItems(left, right, sort));
}

function compareAdminUserListItems(
  left: AdminUserListItemProjection,
  right: AdminUserListItemProjection,
  sort: AdminUserListSortState,
) {
  switch (sort.sortBy) {
    case "createdAt":
      return compareNullableNumbers(Date.parse(left.createdAt), Date.parse(right.createdAt), sort.sortDirection);
    case "lastReplyAt":
      return compareNullableNumbers(
        left.lastReplyAt ? Date.parse(left.lastReplyAt) : null,
        right.lastReplyAt ? Date.parse(right.lastReplyAt) : null,
        sort.sortDirection,
      );
    case "conversationCount":
      return compareNullableNumbers(left.conversationCount, right.conversationCount, sort.sortDirection);
    case "messageCount":
      return compareNullableNumbers(left.messageCount, right.messageCount, sort.sortDirection);
    case "totalTokens":
      return compareNullableNumbers(left.tokenUsage.totalTokens, right.tokenUsage.totalTokens, sort.sortDirection);
  }
}

function compareNullableNumbers(left: number | null, right: number | null, direction: AdminSortDirection) {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return direction === "asc" ? left - right : right - left;
}

function maxDate(left: Date | null, right: Date) {
  return !left || right.getTime() > left.getTime() ? right : left;
}

function resolveSqlSortDirection(direction: AdminSortDirection) {
  return direction === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
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
