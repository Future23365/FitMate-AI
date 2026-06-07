import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
}));

vi.mock("@/lib/server/auth/local-anonymous-auth", () => authMocks);

const adminConfig = await import("@/lib/server/config/admin-config");
const adminGuard = await import("@/lib/server/auth/admin-guard");

describe("admin guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses admin userId config from a centralized env boundary", () => {
    expect(adminConfig.resolveAdminConfig({
      env: { FITMATE_ADMIN_USER_IDS: "user-1, user-2\nuser-3" },
    })).toMatchObject({
      adminUserIds: ["user-1", "user-2", "user-3"],
      adminEmails: [],
      adminRoles: [],
    });
  });

  it("rejects unauthenticated requests before checking admin configuration", async () => {
    authMocks.requireCurrentUser.mockRejectedValueOnce({ code: "missing_token" });

    await expect(adminGuard.requireAdminUser(new Request("http://localhost/admin"), {
      config: adminConfig.resolveAdminConfig({ env: { FITMATE_ADMIN_USER_IDS: "admin-1" } }),
    })).rejects.toMatchObject({
      code: "unauthenticated",
      status: 401,
      detail: { authFailureCode: "missing_token" },
    });
  });

  it("rejects ordinary users with forbidden status", async () => {
    authMocks.requireCurrentUser.mockResolvedValueOnce({ id: "user-1", displayName: "普通用户" });

    await expect(adminGuard.requireAdminUser(new Request("http://localhost/admin"), {
      config: adminConfig.resolveAdminConfig({ env: { FITMATE_ADMIN_USER_IDS: "admin-1" } }),
    })).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    });
  });

  it("allows configured admin users", async () => {
    authMocks.requireCurrentUser.mockResolvedValueOnce({ id: "admin-1", displayName: "管理员" });

    await expect(adminGuard.requireAdminUser(new Request("http://localhost/admin"), {
      config: adminConfig.resolveAdminConfig({ env: { FITMATE_ADMIN_USER_IDS: "admin-1" } }),
    })).resolves.toEqual({ id: "admin-1", displayName: "管理员" });
  });

  it("rejects everyone when admin access is not configured", () => {
    expect(() => adminGuard.assertAdminUser(
      { id: "admin-1", displayName: "管理员" },
      { config: adminConfig.resolveAdminConfig({ env: {} }) },
    )).toThrowError(expect.objectContaining({
      code: "admin_not_configured",
      status: 403,
    }));
  });

  it("maps admin auth errors to stable API responses", async () => {
    const response = adminGuard.adminAuthErrorToApiResponse(
      new adminGuard.AdminAuthError("forbidden", "Admin access is forbidden.", 403),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "forbidden",
      message: "Admin access is forbidden.",
    });
  });
});
