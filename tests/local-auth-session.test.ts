import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  requestLocalAnonymousSession,
  resetLocalAnonymousSession,
} from "@/lib/client/auth/local-auth-session";

describe("local auth client session requests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates anonymous sessions through the server without exposing tokens to client state", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        ok: true,
        token: "unexpected-token",
        expiresAt: "2026-12-01T00:00:00.000Z",
        user: { id: "user-1", displayName: "匿名用户" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const session = await requestLocalAnonymousSession();

    expect(session).toMatchObject({
      ok: true,
      user: { id: "user-1" },
    });
    expect("token" in session).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/local-anonymous", {
      method: "POST",
      credentials: "same-origin",
    });
  });

  it("resets local user through the server cookie clearing endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await resetLocalAnonymousSession();

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/local-anonymous", {
      method: "DELETE",
      credentials: "same-origin",
    });
  });
});
