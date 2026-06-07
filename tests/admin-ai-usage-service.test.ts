import { describe, expect, it, vi } from "vitest";

import {
  getAdminConversationDetail,
  getAdminUsageOverview,
  getAdminUserDetail,
  listAdminUsers,
} from "@/lib/server/admin/admin-ai-usage-service";
import type { AdminConfig } from "@/lib/server/config";

const adminConfig: AdminConfig = {
  adminUserIds: ["admin-1"],
  adminEmails: [],
  adminRoles: [],
  pagination: {
    defaultLimit: 2,
    maxLimit: 5,
  },
};

describe("admin AI usage service", () => {
  it("projects overview counts and token aggregate without exposing Prisma aggregate shape", async () => {
    const reader = createReader({
      countUsers: vi.fn(async () => 2),
      countConversations: vi.fn(async () => 3),
      countMessages: vi.fn(async () => 5),
      aggregateUsage: vi.fn(async () => ({
        promptTokens: 10,
        completionTokens: 4,
        totalTokens: 14,
        recordedUsageCount: 2,
        unknownUsageCount: 1,
      })),
    });

    await expect(getAdminUsageOverview({ reader })).resolves.toEqual({
      userCount: 2,
      conversationCount: 3,
      messageCount: 5,
      tokenUsage: {
        promptTokens: 10,
        completionTokens: 4,
        totalTokens: 14,
        recordedUsageCount: 2,
        hasUnknownUsage: true,
      },
    });
  });

  it("projects paginated users with session, message and usage summaries", async () => {
    const reader = createReader({
      listUsers: vi.fn(async ({ limit }) => {
        expect(limit).toBe(2);
        return [
          createUser({ id: "user-1", displayName: "用户一" }),
          createUser({ id: "user-2", email: "u2@example.com", displayName: null }),
        ];
      }),
      listSessionsForUserIds: vi.fn(async () => [
        createSession({ id: "conversation-1", userId: "user-1", messageCount: 2 }),
        createSession({ id: "conversation-2", userId: "user-1", messageCount: 1 }),
        createSession({ id: "conversation-3", userId: "user-2", messageCount: 1 }),
      ]),
      listUsageSummaries: vi.fn(async () => [
        createUsage({ userId: "user-1", conversationId: "conversation-1", messageId: "assistant-1", promptTokens: 5, completionTokens: 2, totalTokens: 7 }),
        createUsage({ userId: "user-2", conversationId: "conversation-3", messageId: "assistant-2", promptTokens: null, completionTokens: null, totalTokens: null, hasUnknownUsage: true }),
      ]),
    });

    await expect(listAdminUsers({}, { reader, config: adminConfig })).resolves.toMatchObject({
      limit: 2,
      items: [
        {
          userId: "user-1",
          identityLabel: "用户一",
          conversationCount: 2,
          messageCount: 3,
          tokenUsage: { promptTokens: 5, completionTokens: 2, totalTokens: 7, hasUnknownUsage: false },
        },
        {
          userId: "user-2",
          identityLabel: "u2@example.com",
          conversationCount: 1,
          messageCount: 1,
          tokenUsage: { promptTokens: null, completionTokens: null, totalTokens: null, hasUnknownUsage: true },
        },
      ],
    });
  });

  it("projects user detail with conversation token summaries", async () => {
    const reader = createReader({
      findUser: vi.fn(async () => createUser({ id: "user-1", displayName: "用户一" })),
      listSessionsForUser: vi.fn(async () => [
        createSession({ id: "conversation-1", userId: "user-1", messageCount: 2 }),
        createSession({ id: "conversation-2", userId: "user-1", messageCount: 1 }),
      ]),
      aggregateUsage: vi.fn(async () => ({
        promptTokens: 8,
        completionTokens: 3,
        totalTokens: 11,
        recordedUsageCount: 2,
        unknownUsageCount: 0,
      })),
      listUsageSummaries: vi.fn(async () => [
        createUsage({ userId: "user-1", conversationId: "conversation-1", messageId: "assistant-1", promptTokens: 5, completionTokens: 2, totalTokens: 7 }),
        createUsage({ userId: "user-1", conversationId: "conversation-2", messageId: "assistant-2", promptTokens: 3, completionTokens: 1, totalTokens: 4 }),
      ]),
    });

    await expect(getAdminUserDetail("user-1", {}, { reader, config: adminConfig })).resolves.toMatchObject({
      user: { userId: "user-1", identityLabel: "用户一" },
      conversationCount: 2,
      messageCount: 3,
      tokenUsage: { promptTokens: 8, completionTokens: 3, totalTokens: 11 },
      conversations: [
        { conversationId: "conversation-1", messageCount: 2, tokenUsage: { totalTokens: 7 } },
        { conversationId: "conversation-2", messageCount: 1, tokenUsage: { totalTokens: 4 } },
      ],
    });
  });

  it("projects conversation detail with message/request-level usage and unknown markers", async () => {
    const reader = createReader({
      findSession: vi.fn(async () => ({
        ...createSession({ id: "conversation-1", userId: "user-1", messageCount: 2 }),
        user: createUser({ id: "user-1", displayName: "用户一" }),
      })),
      listMessagesForConversation: vi.fn(async () => [
        createMessage({ id: "user-message-1", role: "user", content: "今天练胸" }),
        createMessage({ id: "assistant-1", role: "assistant", content: "可以。" }),
      ]),
      listUsageSummaries: vi.fn(async () => [
        createUsage({ userId: "user-1", conversationId: "conversation-1", messageId: "assistant-1", promptTokens: 5, completionTokens: 2, totalTokens: 7 }),
        createUsage({ userId: "user-1", conversationId: "conversation-1", messageId: "assistant-missing", promptTokens: 3, completionTokens: null, totalTokens: null, hasUnknownUsage: true }),
      ]),
    });

    await expect(getAdminConversationDetail("conversation-1", { reader })).resolves.toMatchObject({
      conversation: {
        conversationId: "conversation-1",
        userId: "user-1",
        userIdentityLabel: "用户一",
        tokenUsage: {
          promptTokens: 8,
          completionTokens: 2,
          totalTokens: 7,
          hasUnknownUsage: true,
          recordedUsageCount: 2,
        },
      },
      messages: [
        { messageId: "user-message-1", tokenUsage: { recordedUsageCount: 0, totalTokens: null } },
        { messageId: "assistant-1", tokenUsage: { recordedUsageCount: 1, totalTokens: 7 } },
      ],
      usageSummaries: [
        { messageId: "assistant-1", tokenUsage: { totalTokens: 7, hasUnknownUsage: false } },
        { messageId: "assistant-missing", tokenUsage: { totalTokens: null, hasUnknownUsage: true } },
      ],
    });
  });
});

function createReader(overrides: Record<string, unknown> = {}) {
  return {
    countUsers: vi.fn(async () => 0),
    countConversations: vi.fn(async () => 0),
    countMessages: vi.fn(async () => 0),
    aggregateUsage: vi.fn(async () => ({
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      recordedUsageCount: 0,
      unknownUsageCount: 0,
    })),
    listUsers: vi.fn(async () => []),
    findUser: vi.fn(async () => null),
    listSessionsForUserIds: vi.fn(async () => []),
    listSessionsForUser: vi.fn(async () => []),
    findSession: vi.fn(async () => null),
    listMessagesForConversation: vi.fn(async () => []),
    listUsageSummaries: vi.fn(async () => []),
    ...overrides,
  } as any;
}

function createUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: null,
    displayName: "用户",
    createdAt: new Date("2026-06-07T06:00:00.000Z"),
    ...overrides,
  };
}

function createSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "conversation-1",
    userId: "user-1",
    title: "训练对话",
    createdAt: new Date("2026-06-07T06:01:00.000Z"),
    updatedAt: new Date("2026-06-07T06:02:00.000Z"),
    messageCount: 1,
    ...overrides,
  };
}

function createMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "assistant-1",
    role: "assistant",
    content: "可以。",
    createdAt: new Date("2026-06-07T06:03:00.000Z"),
    ...overrides,
  };
}

function createUsage(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    conversationId: "conversation-1",
    messageId: "assistant-1",
    promptTokens: 1,
    completionTokens: 1,
    totalTokens: 2,
    hasUnknownUsage: false,
    createdAt: new Date("2026-06-07T06:04:00.000Z"),
    updatedAt: new Date("2026-06-07T06:04:00.000Z"),
    ...overrides,
  };
}
