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
  });

  it("creates and restores anonymous sessions through the API route", async () => {
    prismaMock.user.create.mockResolvedValue({ id: "user-1", displayName: "匿名用户" });
    prismaMock.userIdentity.findUnique.mockResolvedValue({ user: { id: "user-1", displayName: "匿名用户" } });

    const created = await authRoute.POST(new Request("http://localhost/api/auth/local-anonymous", { method: "POST" }));
    const createdBody = await created.json();

    expect(created.status).toBe(200);
    expect(createdBody).toMatchObject({ ok: true, user: { id: "user-1" } });
    expect(prismaMock.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        displayName: "匿名用户",
        identities: expect.objectContaining({
          create: expect.objectContaining({ provider: "anonymous" }),
        }),
      }),
    }));

    const restored = await authRoute.POST(new Request("http://localhost/api/auth/local-anonymous", {
      method: "POST",
      headers: { Authorization: `Bearer ${createdBody.token}` },
    }));

    expect(restored.status).toBe(200);
    await expect(restored.json()).resolves.toMatchObject({ ok: true, user: { id: "user-1" } });
    expect(prismaMock.userIdentity.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        provider_providerAccountId: expect.objectContaining({
          provider: "anonymous",
        }),
      },
    }));
  });

  it("returns unauthenticated for invalid restore tokens without local-demo-user fallback", async () => {
    const response = await authRoute.POST(new Request("http://localhost/api/auth/local-anonymous", {
      method: "POST",
      headers: { Authorization: "Bearer invalid-token" },
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "unauthenticated" });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });
});

function signPayload(payload: object, secret: string) {
  const payloadSegment = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signatureSegment = createHmac("sha256", secret).update(payloadSegment).digest("base64url");

  return `${payloadSegment}.${signatureSegment}`;
}
