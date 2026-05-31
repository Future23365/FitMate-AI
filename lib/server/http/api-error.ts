import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "bad_request"
  | "unauthenticated"
  | "validation_failed"
  | "missing_configuration"
  | "internal_error";

export function jsonApiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  detail?: unknown,
) {
  return NextResponse.json(
    {
      ok: false,
      code,
      error: message,
      message,
      detail,
    },
    { status },
  );
}

// 统一鉴权失败响应，供所有私有 Route Handler 保持一致的 401 shape。
export function jsonUnauthenticatedApiError(message = "Authentication is required.") {
  return jsonApiError("unauthenticated", message, 401);
}
