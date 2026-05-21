import "server-only";

type ServerResponseType = "json" | "raw" | "text";

type ServerRequestOptions = Omit<RequestInit, "body"> & {
  /** 请求体。普通对象会自动序列化为 JSON。 */
  body?: BodyInit | Record<string, unknown> | unknown[];
  /** 响应解析方式。默认解析为 JSON。 */
  responseType?: ServerResponseType;
  /** 请求失败时的默认错误信息。 */
  errorMessage?: string;
  /** 是否在非 2xx 响应时抛错。默认抛错。 */
  throwOnError?: boolean;
};

export class ServerRequestError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ServerRequestError";
    this.status = status;
    this.data = data;
  }
}

function isJsonBody(body: ServerRequestOptions["body"]) {
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

export async function serverRequest<T = unknown>(
  input: RequestInfo | URL,
  options: ServerRequestOptions & { responseType: "raw" },
): Promise<Response>;
export async function serverRequest<T = string>(
  input: RequestInfo | URL,
  options: ServerRequestOptions & { responseType: "text" },
): Promise<T>;
export async function serverRequest<T = unknown>(
  input: RequestInfo | URL,
  options?: ServerRequestOptions,
): Promise<T>;
export async function serverRequest<T = unknown>(
  input: RequestInfo | URL,
  options: ServerRequestOptions = {},
): Promise<T | Response> {
  const {
    body,
    errorMessage = "服务器请求失败。",
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
    headers,
    body: shouldStringifyBody ? JSON.stringify(body) : (body as BodyInit | null | undefined),
  });

  if (!response.ok && throwOnError) {
    const data = await parseErrorBody(response);
    throw new ServerRequestError(getErrorMessage(data, errorMessage), response.status, data);
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
