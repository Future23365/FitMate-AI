import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { getPrismaClient } from "@/lib/server/db/prisma";
import { jsonApiError } from "@/lib/server/http/api-error";
import type { CurrentUser } from "@/lib/server/users/current-user";

export const localAnonymousAuthCookieName = "fitmate_local_anonymous";
export const localAnonymousTokenVersion = 1;
export const localAnonymousTokenTtlSeconds = 180 * 24 * 60 * 60;

const developmentSecret = "fitmate-local-anonymous-auth-development-secret";
let hasWarnedDevelopmentSecret = false;

export type LocalAnonymousTokenPayload = {
  sub: string;
  iat: number;
  exp: number;
  ver: typeof localAnonymousTokenVersion;
  nonce: string;
};

export type LocalAnonymousSession = {
  token: string;
  user: CurrentUser;
  expiresAt: string;
};

type LocalAuthFailureCode =
  | "missing_token"
  | "invalid_token"
  | "expired_token"
  | "unsupported_token_version"
  | "user_not_found"
  | "missing_configuration";

export class LocalAnonymousAuthError extends Error {
  code: LocalAuthFailureCode;
  status: number;

  constructor(code: LocalAuthFailureCode, message: string, status = 401) {
    super(message);
    this.name = "LocalAnonymousAuthError";
    this.code = code;
    this.status = status;
  }
}

type SecretResolutionInput = {
  env?: Partial<Pick<NodeJS.ProcessEnv, "FITMATE_LOCAL_AUTH_SECRET" | "NODE_ENV">>;
  nodeEnv?: string;
};

export type LocalAnonymousAuthCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  maxAge: number;
  expires?: Date;
};

// 匿名 token secret 在非生产本地可使用固定开发值，避免重启后浏览器身份随机失效。
export function resolveLocalAnonymousAuthSecret(input: SecretResolutionInput = {}) {
  const env = input.env ?? process.env;
  const configuredSecret = env.FITMATE_LOCAL_AUTH_SECRET?.trim();

  if (configuredSecret) {
    return configuredSecret;
  }

  const nodeEnv = input.nodeEnv ?? env.NODE_ENV;

  if (nodeEnv !== "production") {
    if (!hasWarnedDevelopmentSecret) {
      console.warn("FITMATE_LOCAL_AUTH_SECRET is not set; using fixed local development anonymous auth secret.");
      hasWarnedDevelopmentSecret = true;
    }

    return developmentSecret;
  }

  throw new LocalAnonymousAuthError(
    "missing_configuration",
    "FITMATE_LOCAL_AUTH_SECRET is required for local anonymous auth.",
    500,
  );
}

// 匿名 token 只承载 providerAccountId，不暴露或信任数据库内部 userId。
export function signLocalAnonymousToken(
  providerAccountId: string,
  input: { now?: Date; secret?: string; nonce?: string } = {},
) {
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const payload: LocalAnonymousTokenPayload = {
    sub: providerAccountId,
    iat: nowSeconds,
    exp: nowSeconds + localAnonymousTokenTtlSeconds,
    ver: localAnonymousTokenVersion,
    nonce: input.nonce ?? randomUUID(),
  };
  const payloadSegment = encodeBase64Url(JSON.stringify(payload));
  const signatureSegment = createSignature(payloadSegment, input.secret ?? resolveLocalAnonymousAuthSecret());

  return {
    token: `${payloadSegment}.${signatureSegment}`,
    payload,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

// 匿名 auth cookie 统一定义浏览器会话边界，前端只能依赖浏览器同源自动携带。
export function getLocalAnonymousAuthCookieOptions(
  input: { env?: Partial<Pick<NodeJS.ProcessEnv, "NODE_ENV">>; nodeEnv?: string } = {},
): LocalAnonymousAuthCookieOptions {
  const env = input.env ?? process.env;
  const nodeEnv = input.nodeEnv ?? env.NODE_ENV;

  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: nodeEnv === "production",
    maxAge: localAnonymousTokenTtlSeconds,
  };
}

// 清除 cookie 使用和写入相同的 path / secure 边界，保证浏览器能覆盖旧值。
export function getClearLocalAnonymousAuthCookieOptions(
  input: { env?: Partial<Pick<NodeJS.ProcessEnv, "NODE_ENV">>; nodeEnv?: string } = {},
): LocalAnonymousAuthCookieOptions {
  return {
    ...getLocalAnonymousAuthCookieOptions(input),
    maxAge: 0,
    expires: new Date(0),
  };
}

// 校验 token 的签名、版本和时效，返回可用于 UserIdentity 查询的匿名主体 id。
export function verifyLocalAnonymousToken(
  token: string,
  input: { now?: Date; secret?: string } = {},
): LocalAnonymousTokenPayload {
  const [payloadSegment, signatureSegment] = token.split(".");

  if (!payloadSegment || !signatureSegment || token.split(".").length !== 2) {
    throw new LocalAnonymousAuthError("invalid_token", "Anonymous credential is invalid.");
  }

  const expectedSignature = createSignature(payloadSegment, input.secret ?? resolveLocalAnonymousAuthSecret());

  if (!safeEqual(signatureSegment, expectedSignature)) {
    throw new LocalAnonymousAuthError("invalid_token", "Anonymous credential signature is invalid.");
  }

  const payload = parsePayload(payloadSegment);

  if (payload.ver !== localAnonymousTokenVersion) {
    throw new LocalAnonymousAuthError("unsupported_token_version", "Anonymous credential version is not supported.");
  }

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);

  if (payload.exp <= nowSeconds) {
    throw new LocalAnonymousAuthError("expired_token", "Anonymous credential has expired.");
  }

  return payload;
}

// 首次匿名登录创建 User 和 anonymous identity，后续请求通过 providerAccountId 恢复同一用户。
export async function createLocalAnonymousSession(): Promise<LocalAnonymousSession> {
  const prisma = getPrismaClient();
  const providerAccountId = randomUUID();
  const signedToken = signLocalAnonymousToken(providerAccountId);
  const user = await prisma.user.create({
    data: {
      displayName: "匿名用户",
      identities: {
        create: {
          provider: "anonymous",
          providerAccountId,
        },
      },
    },
    select: { id: true, displayName: true },
  });

  return {
    token: signedToken.token,
    user,
    expiresAt: signedToken.expiresAt,
  };
}

// 恢复流程必须同时校验 token 和 UserIdentity，不能从客户端 userId 推断身份。
export async function restoreLocalAnonymousSession(token: string): Promise<LocalAnonymousSession> {
  const payload = verifyLocalAnonymousToken(token);
  const user = await findAnonymousUserBySubject(payload.sub);

  if (!user) {
    throw new LocalAnonymousAuthError("user_not_found", "Anonymous user does not exist.");
  }

  return {
    token,
    user,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

// Route Handler 的统一入口：从请求 HttpOnly cookie 解析当前用户，失败时由调用方映射为 API 响应。
export async function requireCurrentUser(request: Request): Promise<CurrentUser> {
  const token = readAnonymousTokenFromRequest(request);

  if (!token) {
    throw new LocalAnonymousAuthError("missing_token", "Authentication is required.");
  }

  const payload = verifyLocalAnonymousToken(token);
  const user = await findAnonymousUserBySubject(payload.sub);

  if (!user) {
    throw new LocalAnonymousAuthError("user_not_found", "Anonymous user does not exist.");
  }

  return user;
}

export function readAnonymousTokenFromRequest(request: Request) {
  return readCookieValue(request.headers.get("cookie") ?? "", localAnonymousAuthCookieName);
}

export function readCookieValue(cookieHeader: string, name: string) {
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = part.trim().split("=");

    if (rawName !== name) {
      continue;
    }

    const value = rawValueParts.join("=");

    try {
      return decodeURIComponent(value).trim() || null;
    } catch {
      return value.trim() || null;
    }
  }

  return null;
}

export function authErrorToApiResponse(error: unknown) {
  if (!(error instanceof LocalAnonymousAuthError)) {
    throw error;
  }

  if (error.status === 401) {
    return jsonApiError("unauthenticated", error.message, 401, { authFailureCode: error.code });
  }

  return jsonApiError("missing_configuration", error.message, error.status);
}

async function findAnonymousUserBySubject(providerAccountId: string): Promise<CurrentUser | null> {
  const prisma = getPrismaClient();
  const identity = await prisma.userIdentity.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "anonymous",
        providerAccountId,
      },
    },
    select: {
      user: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
  });

  return identity?.user ?? null;
}

function createSignature(payloadSegment: string, secret: string) {
  return createHmac("sha256", secret).update(payloadSegment).digest("base64url");
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function parsePayload(payloadSegment: string): LocalAnonymousTokenPayload {
  try {
    const payload = JSON.parse(decodeBase64Url(payloadSegment)) as Partial<LocalAnonymousTokenPayload>;

    if (
      typeof payload.sub !== "string" ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      typeof payload.ver !== "number" ||
      typeof payload.nonce !== "string"
    ) {
      throw new Error("Malformed anonymous token payload.");
    }

    return payload as LocalAnonymousTokenPayload;
  } catch {
    throw new LocalAnonymousAuthError("invalid_token", "Anonymous credential payload is invalid.");
  }
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
