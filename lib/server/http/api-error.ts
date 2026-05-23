import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "bad_request"
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
