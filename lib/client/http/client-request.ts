"use client";

import {
  dispatchLocalAuthRequired,
  getLocalAuthRequiredReason,
  isLocalAuthRequiredResponse,
} from "@/lib/client/auth/local-auth-events";

type ClientResponseType = "json" | "raw" | "text";

type ClientRequestOptions = Omit<RequestInit, "body"> & {
  /** 请求体。普通对象会自动序列化为 JSON。 */
  body?: BodyInit | Record<string, unknown> | unknown[];
  /** 响应解析方式。默认解析为 JSON。 */
  responseType?: ClientResponseType;
  /** 请求失败时的默认错误信息。 */
  errorMessage?: string;
  /** 是否在非 2xx 响应时抛错。默认抛错。 */
  throwOnError?: boolean;
};

export class ClientRequestError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ClientRequestError";
    this.status = status;
    this.data = data;
  }
}

function isJsonBody(body: ClientRequestOptions["body"]) {
  if (!body || typeof body !== "object") {
    return false;
  }

  return !(body instanceof FormData) && !(body instanceof Blob) && !(body instanceof URLSearchParams);
}

async function parseErrorBody(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }

  return response.text().catch(() => "");
}

function getErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;

    return (
      (typeof record.error === "string" && record.error) ||
      (typeof record.message === "string" && record.message) ||
      (typeof record.detail === "string" && record.detail) ||
      fallback
    );
  }

  return typeof data === "string" && data ? data : fallback;
}

async function handleUnauthenticatedResponse(response: Response) {
  if (typeof window === "undefined" || (response.status !== 401 && response.status !== 403)) {
    return;
  }

  const data = await parseErrorBody(response.clone());

  if (isLocalAuthRequiredResponse(response.status, data)) {
    dispatchLocalAuthRequired({
      reason: getLocalAuthRequiredReason(data),
      status: response.status,
    });
  }
}

export async function clientRequest<T = unknown>(
  input: RequestInfo | URL,
  options: ClientRequestOptions & { responseType: "raw" },
): Promise<Response>;
export async function clientRequest<T = string>(
  input: RequestInfo | URL,
  options: ClientRequestOptions & { responseType: "text" },
): Promise<T>;
export async function clientRequest<T = unknown>(
  input: RequestInfo | URL,
  options?: ClientRequestOptions,
): Promise<T>;
export async function clientRequest<T = unknown>(
  input: RequestInfo | URL,
  options: ClientRequestOptions = {},
): Promise<T | Response> {
  const {
    body,
    errorMessage = "请求失败，请稍后重试。",
    responseType = "json",
    throwOnError = true,
    ...init
  } = options;
  const headers = new Headers(init.headers);
  const shouldStringifyBody = isJsonBody(body);

  if (shouldStringifyBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, {
    ...init,
    credentials: init.credentials ?? "same-origin",
    headers,
    body: shouldStringifyBody ? JSON.stringify(body) : (body as BodyInit | null | undefined),
  });

  await handleUnauthenticatedResponse(response);

  if (!response.ok && throwOnError) {
    const data = await parseErrorBody(response);
    throw new ClientRequestError(getErrorMessage(data, errorMessage), response.status, data);
  }

  if (responseType === "raw") {
    return response;
  }

  if (responseType === "text") {
    return (await response.text()) as T;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
