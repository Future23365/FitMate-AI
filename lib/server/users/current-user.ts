import "server-only";

export type CurrentUser = {
  id: string;
  displayName?: string | null;
};

// CurrentUser 是 HTTP 鉴权边界解析后的请求级用户上下文，业务层不能自行兜底固定用户。
export async function getCurrentUser(currentUser?: CurrentUser): Promise<CurrentUser> {
  if (!currentUser) {
    throw new Error("Current user context is required.");
  }

  return currentUser;
}
