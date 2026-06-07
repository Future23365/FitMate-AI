import "server-only";

import { requireCurrentUser } from "@/lib/server/auth/local-anonymous-auth";
import { getAdminConfig, isAdminAccessConfigured, isAdminIdentity, type AdminConfig } from "@/lib/server/config";
import { jsonApiError } from "@/lib/server/http/api-error";
import type { CurrentUser } from "@/lib/server/users/current-user";

export type AdminAuthFailureCode =
  | "unauthenticated"
  | "admin_not_configured"
  | "forbidden";

export class AdminAuthError extends Error {
  code: AdminAuthFailureCode;
  status: number;
  detail?: unknown;

  constructor(code: AdminAuthFailureCode, message: string, status: number, detail?: unknown) {
    super(message);
    this.name = "AdminAuthError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

/** requireAdminUser 是所有后台入口的统一服务端 guard，避免页面或 route 复制环境变量和权限判断。 */
export async function requireAdminUser(request: Request, input: { config?: AdminConfig } = {}) {
  const currentUser = await requireCurrentUserForAdmin(request);

  return assertAdminUser(currentUser, input);
}

/** requireAdminUserFromCookieHeader 供 Server Component 后台页面复用同一 guard，不绕过匿名认证 cookie 校验。 */
export async function requireAdminUserFromCookieHeader(cookieHeader: string, input: { config?: AdminConfig } = {}) {
  return requireAdminUser(new Request("http://localhost/admin", {
    headers: { cookie: cookieHeader },
  }), input);
}

/** assertAdminUser 校验已认证用户是否拥有后台访问权，当前仅通过集中配置的 userId 放行。 */
export function assertAdminUser(currentUser: CurrentUser, input: { config?: AdminConfig } = {}) {
  const config = input.config ?? getAdminConfig();

  if (!isAdminAccessConfigured(config)) {
    throw new AdminAuthError("admin_not_configured", "Admin access is not configured.", 403);
  }

  if (!isAdminIdentity(currentUser, config)) {
    throw new AdminAuthError("forbidden", "Admin access is forbidden.", 403);
  }

  return currentUser;
}

export function adminAuthErrorToApiResponse(error: unknown) {
  if (!(error instanceof AdminAuthError)) {
    throw error;
  }

  if (error.status === 401) {
    return jsonApiError("unauthenticated", error.message, 401, error.detail);
  }

  return jsonApiError("forbidden", error.message, 403, error.detail);
}

export function isAdminAuthError(error: unknown): error is AdminAuthError {
  return error instanceof AdminAuthError;
}

async function requireCurrentUserForAdmin(request: Request) {
  try {
    return await requireCurrentUser(request);
  } catch (error) {
    throw new AdminAuthError(
      "unauthenticated",
      "Authentication is required.",
      401,
      readAuthFailureDetail(error),
    );
  }
}

function readAuthFailureDetail(error: unknown) {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const record = error as { code?: unknown };
  return typeof record.code === "string" ? { authFailureCode: record.code } : undefined;
}
