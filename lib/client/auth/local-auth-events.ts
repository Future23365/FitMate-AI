"use client";

export const localAuthRequiredEventName = "fitmate:auth-required";

export type LocalAuthRequiredReason =
  | "missing_token"
  | "invalid_token"
  | "expired_token"
  | "user_not_found"
  | "unauthenticated";

export type LocalAuthRequiredDetail = {
  reason: LocalAuthRequiredReason;
  status: number;
};

// auth-required 事件是客户端请求层和 LocalAuthProvider 的唯一协调边界。
export function dispatchLocalAuthRequired(detail: LocalAuthRequiredDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<LocalAuthRequiredDetail>(localAuthRequiredEventName, { detail }));
}

// 只把明确未认证语义的响应当作登录需求，避免真实 forbidden 误弹登录 Dialog。
export function isLocalAuthRequiredResponse(status: number, data: unknown) {
  if (status !== 401 && status !== 403) {
    return false;
  }

  if (!data || typeof data !== "object") {
    return false;
  }

  const record = data as Record<string, unknown>;

  return record.code === "unauthenticated";
}

export function getLocalAuthRequiredReason(data: unknown): LocalAuthRequiredReason {
  if (!data || typeof data !== "object") {
    return "unauthenticated";
  }

  const detail = (data as Record<string, unknown>).detail;

  if (detail && typeof detail === "object") {
    const failureCode = (detail as Record<string, unknown>).authFailureCode;

    if (
      failureCode === "missing_token" ||
      failureCode === "invalid_token" ||
      failureCode === "expired_token" ||
      failureCode === "user_not_found"
    ) {
      return failureCode;
    }
  }

  return "unauthenticated";
}
