import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    create: vi.fn(),
  },
  userIdentity: {
    findUnique: vi.fn(),
  },
}));
const dbMocks = vi.hoisted(() => ({
  getPrismaClient: vi.fn(() => prismaMock),
}));

vi.mock("@/lib/server/db/prisma", () => dbMocks);

const auth = await import("@/lib/server/auth/local-anonymous-auth");
const authRoute = await import("@/app/api/auth/local-anonymous/route");

describe("local anonymous auth", () => {
  beforeEach(() => {
    vi.stubEnv("FITMATE_LOCAL_AUTH_SECRET", "test-secret");
    vi.stubEnv("NODE_ENV", "test");
    prismaMock.user.create.mockReset();
    prismaMock.userIdentity.findUnique.mockReset();
  });

  it("signs and verifies anonymous tokens", () => {
    const signed = auth.signLocalAnonymousToken("anon-1", {
      now: new Date("2026-05-31T00:00:00.000Z"),
      secret: "test-secret",
      nonce: "nonce-1",
    });

    expect(auth.verifyLocalAnonymousToken(signed.token, {
      now: new Date("2026-05-31T00:00:01.000Z"),
      secret: "test-secret",
    })).toMatchObject({
      sub: "anon-1",
      ver: auth.localAnonymousTokenVersion,
      nonce: "nonce-1",
    });
  });

  it("rejects tampered, expired, unsupported, and missing-secret tokens", () => {
    const signed = auth.signLocalAnonymousToken("anon-1", {
      now: new Date("2026-05-31T00:00:00.000Z"),
      secret: "test-secret",
    });
    const [payloadSegment] = signed.token.split(".");
    const unsupportedToken = signPayload({
      sub: "anon-1",
      iat: 1,
      exp: 2_000_000_000,
      ver: 999,
      nonce: "nonce-1",
    }, "test-secret");

    expect(() => auth.verifyLocalAnonymousToken(`${payloadSegment}.broken`, { secret: "test-secret" })).toThrow(
      "Anonymous credential signature is invalid.",
    );
    expect(() => auth.verifyLocalAnonymousToken(signed.token, {
      now: new Date("2027-01-01T00:00:00.000Z"),
      secret: "test-secret",
    })).toThrow("Anonymous credential has expired.");
    expect(() => auth.verifyLocalAnonymousToken(unsupportedToken, { secret: "test-secret" })).toThrow(
      "Anonymous credential version is not supported.",
    );
    expect(() => auth.resolveLocalAnonymousAuthSecret({ env: { NODE_ENV: "production" } })).toThrow(
      "FITMATE_LOCAL_AUTH_SECRET is required for local anonymous auth.",
    );
    expect(auth.resolveLocalAnonymousAuthSecret({ env: { NODE_ENV: "development" } })).toBe(
      "fitmate-local-anonymous-auth-development-secret",
    );
    expect(auth.getLocalAnonymousAuthCookieOptions({ nodeEnv: "development" })).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
      maxAge: auth.localAnonymousTokenTtlSeconds,
    });
    expect(auth.getLocalAnonymousAuthCookieOptions({ nodeEnv: "production" })).toMatchObject({
      secure: true,
    });
  });

  it("creates and restores anonymous sessions through HttpOnly cookie route", async () => {
    prismaMock.user.create.mockResolvedValue({ id: "user-1", displayName: "匿名用户" });
    prismaMock.userIdentity.findUnique.mockResolvedValue({ user: { id: "user-1", displayName: "匿名用户" } });

    const created = await authRoute.POST(new Request("http://localhost/api/auth/local-anonymous", { method: "POST" }));
    const createdBody = await created.json();

    expect(created.status).toBe(200);
    expect(createdBody).toMatchObject({ ok: true, user: { id: "user-1" } });
    expect(createdBody.token).toBeUndefined();
    expect(created.headers.get("set-cookie")).toEqual(expect.stringContaining(`${auth.localAnonymousAuthCookieName}=`));
    expect(created.headers.get("set-cookie")).toEqual(expect.stringContaining("HttpOnly"));
    expect(created.headers.get("set-cookie")).toMatch(/SameSite=Lax/i);
    expect(created.headers.get("set-cookie")).toEqual(expect.stringContaining("Path=/"));
    expect(prismaMock.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        displayName: "匿名用户",
        identities: expect.objectContaining({
          create: expect.objectContaining({ provider: "anonymous" }),
        }),
      }),
    }));

    const cookieHeader = extractCookiePair(created.headers.get("set-cookie"));
    const restored = await authRoute.POST(new Request("http://localhost/api/auth/local-anonymous", {
      method: "POST",
      headers: { Cookie: cookieHeader },
    }));

    expect(restored.status).toBe(200);
    const restoredBody = await restored.json();
    expect(restoredBody).toMatchObject({ ok: true, user: { id: "user-1" } });
    expect(restoredBody.token).toBeUndefined();
    expect(prismaMock.userIdentity.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        provider_providerAccountId: expect.objectContaining({
          provider: "anonymous",
        }),
      },
    }));

    await expect(auth.requireCurrentUser(new Request("http://localhost/api/private", {
      headers: { Cookie: cookieHeader },
    }))).resolves.toMatchObject({ id: "user-1" });
  });

  it("clears anonymous cookie on reset without deleting server users", async () => {
    const response = await authRoute.DELETE();

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toEqual(expect.stringContaining(`${auth.localAnonymousAuthCookieName}=`));
    expect(response.headers.get("set-cookie")).toEqual(expect.stringContaining("Max-Age=0"));
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.userIdentity.findUnique).not.toHaveBeenCalled();
  });

  it("returns unauthenticated for invalid cookie tokens without local-demo-user fallback", async () => {
    const response = await authRoute.POST(new Request("http://localhost/api/auth/local-anonymous", {
      method: "POST",
      headers: { Cookie: `${auth.localAnonymousAuthCookieName}=invalid-token` },
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "unauthenticated",
      detail: { authFailureCode: "invalid_token" },
    });
    expect(response.headers.get("set-cookie")).toEqual(expect.stringContaining("Max-Age=0"));
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });
});

function extractCookiePair(setCookieHeader: string | null) {
  if (!setCookieHeader) {
    throw new Error("Missing Set-Cookie header.");
  }

  return setCookieHeader.split(";")[0];
}

function signPayload(payload: object, secret: string) {
  const payloadSegment = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signatureSegment = createHmac("sha256", secret).update(payloadSegment).digest("base64url");

  return `${payloadSegment}.${signatureSegment}`;
}
