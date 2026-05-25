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
      metadata: { tokenUsage: { input: BigInt(10) } },
    });
    expect(trace?.id).toBeTruthy();

    addAiTraceStep(trace?.id, {
      name: "模型请求",
      type: "model_request",
      input: { prompt: "x" },
      error: new Error("boom"),
    });
    const continued = createAiTrace({
      route: "/api/ai/workout-plan",
      title: "生成计划",
      existingTraceId: trace?.id,
      metadata: { parentTraceId: trace?.id },
    });
    finishAiTrace(trace?.id, "success");

    expect(continued?.id).toBe(trace?.id);
    expect(listAiTraces()[0]).toMatchObject({
      id: trace?.id,
      status: "success",
      metadata: {
        tokenUsage: { input: "10" },
        parentTraceId: trace?.id,
        continuedRoutes: ["/api/ai/workout-plan"],
      },
      steps: [expect.objectContaining({ name: "模型请求", error: expect.objectContaining({ message: "boom" }) })],
    });
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
});
