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

const fsMocks = vi.hoisted(() => ({
  appendFile: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));
const authMocks = vi.hoisted(() => ({
  authErrorToApiResponse: vi.fn(() => Response.json({ ok: false, error: "Authentication is required." }, { status: 401 })),
  requireCurrentUser: vi.fn(async () => ({ id: "user-1", displayName: "匿名用户" })),
}));

vi.mock("node:fs/promises", () => fsMocks);
vi.mock("@/lib/server/auth/local-anonymous-auth", () => authMocks);

const devTraceRoute = await import("@/app/api/dev/ai-traces/route");

describe("AI trace store and HTTP request helpers", () => {
  beforeEach(() => {
    clearAiTraces();
    vi.clearAllMocks();
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
      route: "/api/chat",
      title: "继续聊天",
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
        continuedRoutes: ["/api/chat"],
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

  it("uses same-origin cookies and dispatches auth-required only for unauthenticated responses", async () => {
    const dispatchEvent = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { ok: false, code: "unauthenticated", message: "Authentication is required." },
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          { ok: false, code: "unauthenticated", message: "Authentication is required." },
          { status: 403 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          { ok: false, code: "forbidden", message: "权限不足" },
          { status: 403 },
        ),
      );
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal("fetch", fetchMock);

    const response = await clientRequest("/api/private", {
      responseType: "raw",
      throwOnError: false,
    });
    const legacyResponse = await clientRequest("/api/private", {
      responseType: "raw",
      throwOnError: false,
    });
    const forbiddenResponse = await clientRequest("/api/private", {
      responseType: "raw",
      throwOnError: false,
    });

    expect(response.status).toBe(401);
    expect(legacyResponse.status).toBe(403);
    expect(forbiddenResponse.status).toBe(403);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "same-origin" });
    expect((fetchMock.mock.calls[0][1].headers as Headers).get("Authorization")).toBeNull();
    expect(dispatchEvent).toHaveBeenCalledTimes(2);
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "fitmate:auth-required" }));
  });

  it("saves full trace logs with Agent loop payload intact", async () => {
    const response = await devTraceRoute.POST(jsonRequest("/api/dev/ai-traces", {
      logType: "trace",
      payload: {
        title: "完整链路",
        agentDiagnosis: {
          agentLoopTimeline: {
            loopTurns: [{ loopTurnId: "loop-turn-1" }],
            diagnosticFindings: [],
          },
        },
      },
    }));

    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("ai_trace_log.js"),
      expect.stringContaining("agentLoopTimeline"),
      "utf8",
    );
    expect(fsMocks.appendFile).not.toHaveBeenCalled();
  });

  it("normalizes prompt records to narrow user question and answer fields", async () => {
    const response = await devTraceRoute.POST(jsonRequest("/api/dev/ai-traces", {
      logType: "prompt",
      payload: {
        title: "用户问答记录",
        trace: {
          traceId: "trace-1",
          runId: "run-1",
          route: "/api/chat",
          traceTitle: "聊天",
          status: "success",
          createdAt: "2026-06-01T08:00:00.000Z",
          sessionId: "session-1",
          promptVersion: "prompt-v1",
          messages: [{ role: "system", content: "不要保存" }],
        },
        userQuestions: [{ round: 1, question: "帮我练背" }],
        finalAnswer: "可以。",
        prompt: "不要保存完整 prompt",
        toolPayload: { secret: "不要保存" },
        workoutCard: { title: "不要保存卡片" },
      },
    }));

    await expect(response.json()).resolves.toMatchObject({ ok: true });
    const savedContent = String(fsMocks.appendFile.mock.calls[0]?.[1] ?? "");

    expect(savedContent).toContain("帮我练背");
    expect(savedContent).toContain("可以。");
    expect(savedContent).not.toContain("不要保存完整 prompt");
    expect(savedContent).not.toContain("toolPayload");
    expect(savedContent).not.toContain("workoutCard");
    expect(fsMocks.writeFile).not.toHaveBeenCalled();
  });
});

function jsonRequest(url: string, body: unknown) {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
