"use client";

export type LocalAuthUser = {
  id: string;
  displayName?: string | null;
};

export type LocalAnonymousSessionResponse = {
  ok: boolean;
  expiresAt?: string;
  user?: LocalAuthUser;
};

// 创建或恢复匿名会话只依赖服务端 HttpOnly cookie，响应体不暴露 token。
export async function requestLocalAnonymousSession(): Promise<LocalAnonymousSessionResponse> {
  const response = await fetch("/api/auth/local-anonymous", {
    method: "POST",
    credentials: "same-origin",
  });

  if (!response.ok) {
    return { ok: false };
  }

  const data = await response.json().catch(() => null);

  if (!data || typeof data !== "object") {
    return { ok: false };
  }

  const record = data as Record<string, unknown>;
  const user = record.user && typeof record.user === "object"
    ? (record.user as Partial<LocalAuthUser>)
    : null;

  if (record.ok !== true || typeof user?.id !== "string") {
    return { ok: false };
  }

  return {
    ok: true,
    expiresAt: typeof record.expiresAt === "string" ? record.expiresAt : undefined,
    user: {
      id: user.id,
      displayName: typeof user.displayName === "string" || user.displayName === null ? user.displayName : undefined,
    },
  };
}

// 重置本地用户会触发服务端软删除旧匿名身份，并清除当前浏览器 cookie。
export async function resetLocalAnonymousSession() {
  const response = await fetch("/api/auth/local-anonymous", {
    method: "DELETE",
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error("Failed to reset local anonymous user.");
  }
}
