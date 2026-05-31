import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addAiTraceStep,
  clearAiTraces,
  createAiTrace,
  finishAiTrace,
  listAiTraces,
} from "@/lib/server/dev/ai-trace-store";
import { ServerRequestError, serverRequest } from "@/lib/server/http/server-request";
import { ClientRequestError, clientRequest } from "@/lib/client/http/client-request";

describe("AI trace store and HTTP request helpers", () => {
  beforeEach(() => {
    clearAiTraces();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tracks trace lifecycle, continued routes, and sanitized metadata", () => {
    const trace = createAiTrace({
      route: "/api/chat",
      title: "胸肌训练",
      userId: "user-1",
      sessionId: "chat-1",
      messageId: "assistant-1",
      model: "deepseek-v4-flash",
      promptVersion: "prompt-v1",
      toolVersions: { ReferenceResolver: "resolver-v1" },
      input: {
        latestUserMessage: "帮我把刚才那套改简单点",
        authorization: "Bearer secret",
      },
      metadata: { tokenUsage: { input: BigInt(10) } },
    });
    expect(trace?.id).toBeTruthy();

    addAiTraceStep(trace?.id, {
      name: "模型请求",
      type: "model_request",
      input: { prompt: "x", apiKey: "secret-key" },
      error: new Error("boom"),
    });
    addAiTraceStep(trace?.id, {
      name: "ReferenceResolver 解析结果",
      type: "reference_resolution",
      output: { status: "resolved", artifactId: "artifact-1" },
    });
    const continued = createAiTrace({
      route: "/api/ai/workout-plan",
      title: "生成计划",
      existingTraceId: trace?.id,
      metadata: { parentTraceId: trace?.id },
    });
    finishAiTrace(trace?.id, "success", {
      status: "success",
      reason: "done",
    });

    expect(continued?.id).toBe(trace?.id);
    expect(listAiTraces()[0]).toMatchObject({
      id: trace?.id,
      runId: trace?.id,
      status: "success",
      userId: "user-1",
      sessionId: "chat-1",
      messageId: "assistant-1",
      model: "deepseek-v4-flash",
      promptVersion: "prompt-v1",
      toolVersions: { ReferenceResolver: "resolver-v1" },
      input: {
        latestUserMessage: "帮我把刚才那套改简单点",
        authorization: "[REDACTED]",
      },
      finalDecision: {
        status: "success",
        reason: "done",
      },
      metadata: {
        tokenUsage: { input: "10" },
        parentTraceId: trace?.id,
        continuedRoutes: ["/api/ai/workout-plan"],
      },
      steps: [
        expect.objectContaining({
          name: "模型请求",
          input: { prompt: "x", apiKey: "[REDACTED]" },
          error: expect.objectContaining({ message: "boom" }),
        }),
        expect.objectContaining({
          type: "reference_resolution",
          output: { status: "resolved", artifactId: "artifact-1" },
        }),
      ],
    });
  });

  it("truncates oversized trace fields without dropping diagnostic ids", () => {
    const trace = createAiTrace({
      route: "/api/chat",
      title: "长 payload",
      input: {
        artifactId: "artifact-1",
        payload: "x".repeat(10_000),
      },
    });

    expect(listAiTraces()[0]).toMatchObject({
      input: {
        artifactId: "artifact-1",
        payload: {
          truncated: true,
          originalLength: 10_000,
          maxLength: 8_000,
        },
      },
    });
    expect(trace?.id).toBeTruthy();
  });

  it("serializes JSON requests and maps server-side error bodies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "上游失败" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      serverRequest("https://example.test/api", {
        method: "POST",
        body: { ok: true },
        errorMessage: "fallback",
      }),
    ).rejects.toMatchObject(new ServerRequestError("上游失败", 502, { message: "上游失败" }));
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: "{\"ok\":true}",
    });
    expect((fetchMock.mock.calls[0][1].headers as Headers).get("Content-Type")).toBe("application/json");
  });

  it("supports client text responses and client-side error mapping", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("ok", { status: 200 }))
        .mockResolvedValueOnce(new Response("权限不足", { status: 403 })),
    );

    await expect(clientRequest("/api/text", { responseType: "text" })).resolves.toBe("ok");
    await expect(clientRequest("/api/error", { errorMessage: "fallback" })).rejects.toMatchObject(
      new ClientRequestError("权限不足", 403, "权限不足"),
    );
  });

  it("injects local anonymous credentials and resets auth on raw unauthenticated responses", async () => {
    const storage = createLocalStorageMock();
    const dispatchEvent = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        { ok: false, code: "unauthenticated", message: "Authentication is required." },
        { status: 401 },
      ),
    );
    storage.setItem("fitmate.localAuth.v1", JSON.stringify({
      version: 1,
      token: "token-1",
    }));
    vi.stubGlobal("window", { dispatchEvent, localStorage: storage });
    vi.stubGlobal("fetch", fetchMock);

    const response = await clientRequest("/api/private", {
      responseType: "raw",
      throwOnError: false,
    });

    expect(response.status).toBe(401);
    expect((fetchMock.mock.calls[0][1].headers as Headers).get("Authorization")).toBe("Bearer token-1");
    expect(storage.getItem("fitmate.localAuth.v1")).toBeNull();
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "fitmate:auth-required" }));
  });
});

function createLocalStorageMock() {
  const store = new Map<string, string>();

  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
    removeItem: vi.fn((key: string) => store.delete(key)),
  };
}
