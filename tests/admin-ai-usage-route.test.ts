import { beforeEach, describe, expect, it, vi } from "vitest";

const adminGuardMocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
}));
const adminServiceMocks = vi.hoisted(() => ({
  getAdminConversationDetail: vi.fn(),
  getAdminUsageOverview: vi.fn(),
  getAdminUserDetail: vi.fn(),
  listAdminUsers: vi.fn(),
  resolveAdminUserListSort: vi.fn((input: { sortBy?: string | null; sortDirection?: string | null } = {}) => ({
    sortBy: ["createdAt", "lastReplyAt", "totalTokens"].includes(String(input.sortBy))
      ? input.sortBy
      : "createdAt",
    sortDirection: ["asc", "desc"].includes(String(input.sortDirection))
      ? input.sortDirection
      : "desc",
  })),
}));

vi.mock("@/lib/server/auth/admin-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/auth/admin-guard")>();

  return {
    ...actual,
    requireAdminUser: adminGuardMocks.requireAdminUser,
  };
});
vi.mock("@/lib/server/admin/admin-ai-usage-service", () => adminServiceMocks);

const adminGuard = await import("@/lib/server/auth/admin-guard");
const route = await import("@/app/api/admin/ai-usage/route");

describe("admin AI usage route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminGuardMocks.requireAdminUser.mockResolvedValue({ id: "admin-1" });
    adminServiceMocks.getAdminUsageOverview.mockResolvedValue({
      userCount: 1,
      conversationCount: 1,
      messageCount: 2,
      tokenUsage: createTokenUsage({ promptTokens: 10, completionTokens: 5, totalTokens: 15 }),
    });
    adminServiceMocks.listAdminUsers.mockResolvedValue({
      limit: 20,
      items: [
        {
          userId: "user-1",
          email: null,
          displayName: "用户一",
          identityLabel: "用户一",
          createdAt: "2026-06-07T06:00:00.000Z",
          lastReplyAt: "2026-06-07T06:04:00.000Z",
          conversationCount: 1,
          messageCount: 2,
          tokenUsage: createTokenUsage({ promptTokens: 10, completionTokens: 5, totalTokens: 15 }),
        },
      ],
      sort: { sortBy: "createdAt", sortDirection: "desc" },
    });
    adminServiceMocks.getAdminUserDetail.mockResolvedValue(null);
    adminServiceMocks.getAdminConversationDetail.mockResolvedValue(null);
  });

  it("rejects unauthenticated users before reading admin data", async () => {
    adminGuardMocks.requireAdminUser.mockRejectedValueOnce(
      new adminGuard.AdminAuthError("unauthenticated", "Authentication is required.", 401),
    );

    const response = await route.GET(new Request("http://localhost/api/admin/ai-usage"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "unauthenticated" });
    expect(adminServiceMocks.getAdminUsageOverview).not.toHaveBeenCalled();
  });

  it("rejects ordinary authenticated users before reading admin data", async () => {
    adminGuardMocks.requireAdminUser.mockRejectedValueOnce(
      new adminGuard.AdminAuthError("forbidden", "Admin access is forbidden.", 403),
    );

    const response = await route.GET(new Request("http://localhost/api/admin/ai-usage"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "forbidden" });
    expect(adminServiceMocks.listAdminUsers).not.toHaveBeenCalled();
  });

  it("returns overview and user list projections for admins", async () => {
    const response = await route.GET(new Request("http://localhost/api/admin/ai-usage?limit=10"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      view: "overview",
      overview: {
        userCount: 1,
        tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      },
      users: {
        items: [
          {
            userId: "user-1",
            identityLabel: "用户一",
            tokenUsage: { totalTokens: 15 },
          },
        ],
      },
    });
    expect(adminServiceMocks.listAdminUsers).toHaveBeenCalledWith({
      limit: 10,
      sortBy: "createdAt",
      sortDirection: "desc",
    });
    expect(JSON.stringify(body)).not.toContain("delete");
    expect(JSON.stringify(body)).not.toContain("ban");
  });

  it("passes supported sorting parameters and falls back invalid sorting query", async () => {
    await route.GET(new Request("http://localhost/api/admin/ai-usage?limit=10&sortBy=lastReplyAt&sortDirection=asc"));

    expect(adminServiceMocks.listAdminUsers).toHaveBeenLastCalledWith({
      limit: 10,
      sortBy: "lastReplyAt",
      sortDirection: "asc",
    });

    await route.GET(new Request("http://localhost/api/admin/ai-usage?sortBy=unknown&sortDirection=sideways"));

    expect(adminServiceMocks.listAdminUsers).toHaveBeenLastCalledWith({
      limit: undefined,
      sortBy: "createdAt",
      sortDirection: "desc",
    });
  });
});

function createTokenUsage(overrides: Record<string, unknown> = {}) {
  return {
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    hasUnknownUsage: false,
    recordedUsageCount: 0,
    ...overrides,
  };
}
