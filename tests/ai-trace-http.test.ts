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

  it("returns only traces owned by the current user", async () => {
    createAiTrace({
      route: "/api/chat",
      title: "当前用户 trace",
      userId: "user-1",
      input: { latestUserMessage: "帮我练背" },
    });
    createAiTrace({
      route: "/api/chat",
      title: "其他用户 trace",
      userId: "user-2",
      input: { latestUserMessage: "其他用户问题" },
    });

    const response = await devTraceRoute.GET(new Request("http://localhost/api/dev/ai-traces"));
    const body = await response.json();

    expect(body).toMatchObject({ ok: true });
    expect(body.traces).toHaveLength(1);
    expect(body.traces[0]).toMatchObject({
      title: "当前用户 trace",
      userId: "user-1",
    });
    expect(JSON.stringify(body)).not.toContain("其他用户问题");
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

  it("saves full trace logs as a lightweight report plus long text mapping", async () => {
    const longModelText = `模型可见长文本 ${"请严格遵守 AgentAction 合同。".repeat(260)}`;
    const longDetailText = `完整 runtime 详情 ${"保留 input output metadata 方便复盘。".repeat(180)}`;
    const sensitivePayloadText = `不要保存完整 payload ${"secret ".repeat(120)}`;
    const response = await devTraceRoute.POST(jsonRequest("/api/dev/ai-traces", {
      logType: "trace",
      payload: {
        title: "完整链路",
        apiKey: "sk-secret-value",
        longTextRefs: [
          {
            contentRef: "text_0001",
            path: "$.plannerModelCalls[0].request.messages[0].content",
            kind: "model_request_message",
            originalLength: longModelText.length,
            hash: "fnv1a:11111111",
            preview: "模型可见长文本",
            textFile: "codex_logs/ai_trace_texts.jsonl",
          },
          {
            contentRef: "text_0002",
            path: "$.trace.steps[0].output.payload",
            kind: "trace_step_output",
            originalLength: sensitivePayloadText.length,
            hash: "fnv1a:22222222",
            preview: "不要保存完整 payload",
            textFile: "codex_logs/ai_trace_texts.jsonl",
          },
        ],
        longTexts: [
          {
            contentRef: "text_0001",
            path: "$.plannerModelCalls[0].request.messages[0].content",
            kind: "model_request_message",
            originalLength: longModelText.length,
            hash: "fnv1a:11111111",
            preview: "模型可见长文本",
            content: longModelText,
          },
          {
            contentRef: "text_0002",
            path: "$.trace.steps[0].output.payload",
            kind: "trace_step_output",
            originalLength: sensitivePayloadText.length,
            hash: "fnv1a:22222222",
            preview: "不要保存完整 payload",
            content: sensitivePayloadText,
          },
        ],
        plannerModelCalls: [
          {
            plannerCallIndex: 1,
            request: {
              model: "deepseek-chat",
              messages: [
                {
                  role: "system",
                  content: {
                    contentRef: "text_0001",
                    path: "$.plannerModelCalls[0].request.messages[0].content",
                    kind: "model_request_message",
                    originalLength: longModelText.length,
                    hash: "fnv1a:11111111",
                    preview: "模型可见长文本",
                    textFile: "codex_logs/ai_trace_texts.jsonl",
                  },
                },
              ],
            },
            response: { tokenUsage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 } },
          },
        ],
        detailRefs: [
          {
            detailRef: "detail_0001",
            path: "$.runtimeTraceEvents[0]",
            kind: "runtime_event_detail",
            hash: "fnv1a:33333333",
            summary: { type: "tool_call", toolName: "readFixture", toolResultId: "tr_1" },
            detailFile: "codex_logs/ai_trace_texts.jsonl",
          },
        ],
        details: [
          {
            detailRef: "detail_0001",
            path: "$.runtimeTraceEvents[0]",
            kind: "runtime_event_detail",
            hash: "fnv1a:33333333",
            summary: { type: "tool_call", toolName: "readFixture", toolResultId: "tr_1" },
            content: {
              id: "step-tool",
              type: "tool_call",
              input: { text: "hello" },
              output: {
                type: "tool_execution",
                toolName: "readFixture",
                toolResultId: "tr_1",
                diagnostic: longDetailText,
              },
              metadata: { authorization: "Bearer secret-token" },
            },
          },
        ],
        tokenUsageSummary: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
        trace: {
          route: "/api/chat",
          steps: [
            {
              type: "runtime_event",
              output: { payload: "不要保存完整 payload" },
              metadata: { authorization: "Bearer secret-token" },
            },
          ],
        },
        groupedSteps: [{ id: "request_input", stepIds: ["step-1"] }],
        rawTrace: { id: "trace-1", route: "/api/chat" },
      },
    }));

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      path: expect.stringContaining("ai_trace_log.js"),
      textPath: expect.stringContaining("ai_trace_texts.jsonl"),
    });
    const reportCall = fsMocks.writeFile.mock.calls.find((call) => String(call[0]).includes("ai_trace_log.js"));
    const longTextCall = fsMocks.writeFile.mock.calls.find((call) => String(call[0]).includes("ai_trace_texts.jsonl"));
    const savedContent = String(reportCall?.[1] ?? "");
    const longTextContent = String(longTextCall?.[1] ?? "");

    expect(savedContent).not.toContain("sk-secret-value");
    expect(savedContent).not.toContain("Bearer secret-token");
    expect(savedContent).not.toContain("不要保存完整 payload");
    expect(savedContent).not.toContain(longModelText);
    expect(savedContent).not.toContain(longDetailText);
    expect(savedContent).toContain("plannerModelCalls");
    expect(savedContent).toContain("tokenUsageSummary");
    expect(savedContent).toContain("detailRefs");
    expect(savedContent).toContain("\"detailRef\": \"detail_0001\"");
    expect(savedContent).toContain("\"prompt_tokens\": 10");
    expect(savedContent).not.toContain("rawTrace");
    expect(savedContent).not.toContain("\"trace\":");
    expect(savedContent).not.toContain("\"details\":");
    expect(savedContent).toContain("ai_trace_texts.jsonl");
    expect(savedContent).toContain("\"contentRef\": \"text_0001\"");
    expect(longTextContent).toContain("AI trace mapping saved from /dev/ai-traces.");
    expect(longTextContent).toContain("rg '\"contentRef\":\"text_0001\"' codex_logs/ai_trace_texts.jsonl");
    expect(longTextContent).toContain("rg '\"detailRef\":\"detail_0001\"' codex_logs/ai_trace_texts.jsonl");
    expect(longTextContent).toContain("\"contentRef\":\"text_0001\"");
    expect(longTextContent).toContain("\"paths\":[");
    expect(longTextContent).toContain("\"recordType\":\"text\"");
    expect(longTextContent).toContain("\"recordType\":\"text_chunk\"");
    expect(longTextContent).toContain("\"recordType\":\"detail\"");
    expect(longTextContent).toContain("\"recordType\":\"detail_chunk\"");
    expect(longTextContent).toContain("\"content\":\"[redacted]\"");
    expect(longTextContent).not.toContain(sensitivePayloadText);
    expect(longTextContent).not.toContain("Bearer secret-token");
    const mappingRecords = parseJsonlRecords(longTextContent);
    const textChunks = mappingRecords.filter((record) => record.recordType === "text_chunk" && record.contentRef === "text_0001");
    const detailChunks = mappingRecords.filter((record) => record.recordType === "detail_chunk" && record.detailRef === "detail_0001");

    expect(textChunks.length).toBeGreaterThan(1);
    expect(textChunks.map((record) => record.content).join("")).toBe(longModelText);
    expect(detailChunks.length).toBeGreaterThan(1);
    expect(detailChunks.map((record) => record.content).join("")).toContain(longDetailText);
    expect(Math.max(...longTextContent.split("\n").map((line) => line.length))).toBeLessThan(2600);
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

function parseJsonlRecords(content: string) {
  return content
    .split("\n")
    .filter((line) => line.trim().length > 0 && !line.startsWith("//"))
    .map((line) => JSON.parse(line) as Record<string, string>);
}
