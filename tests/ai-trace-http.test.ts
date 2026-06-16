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
  readFile: vi.fn(),
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
    const longModelText = `模型可见长文本 ${"请严格遵守 AgentAction 合同。".repeat(5000)}`;
    const longDetailText = `完整 runtime 详情 ${"保留 input output metadata 方便复盘。".repeat(3000)}`;
    const longToolSummary = `ToolMessage 摘要 ${"候选动作事实进入模型。".repeat(800)}`;
    const diagnosticPayloadText = `保留可排查 payload ${"exercise ".repeat(120)}`;
    const toolOutputVisibility = {
      modelVisibleSummary: "llm_visible",
      userProjection: "user_projection",
      traceSummary: "debug_only",
    };
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
            originalLength: diagnosticPayloadText.length,
            hash: "fnv1a:22222222",
            preview: "保留可排查 payload",
            textFile: "codex_logs/ai_trace_texts.jsonl",
          },
          {
            contentRef: "text_0003",
            path: "$.langChainToolExecutions[0].modelVisibleSummary",
            kind: "generic_long_text",
            originalLength: longToolSummary.length,
            hash: "fnv1a:44444444",
            preview: "ToolMessage 摘要",
            visibility: toolOutputVisibility.modelVisibleSummary,
            visibilityByPath: {
              "$.langChainToolExecutions[0].modelVisibleSummary": toolOutputVisibility.modelVisibleSummary,
            },
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
            originalLength: diagnosticPayloadText.length,
            hash: "fnv1a:22222222",
            preview: "保留可排查 payload",
            content: diagnosticPayloadText,
          },
          {
            contentRef: "text_0003",
            path: "$.langChainToolExecutions[0].modelVisibleSummary",
            kind: "generic_long_text",
            originalLength: longToolSummary.length,
            hash: "fnv1a:44444444",
            preview: "ToolMessage 摘要",
            visibility: toolOutputVisibility.modelVisibleSummary,
            visibilityByPath: {
              "$.langChainToolExecutions[0].modelVisibleSummary": toolOutputVisibility.modelVisibleSummary,
            },
            content: longToolSummary,
          },
        ],
        plannerModelCalls: [
          {
            plannerCallIndex: 1,
            request: {
              model: "deepseek-v4-flash",
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
        langChainToolExecutions: [
          {
            toolCallId: "call_search_1",
            toolName: "searchExerciseResources",
            status: "succeeded",
            modelVisibleSummary: {
              contentRef: "text_0003",
              path: "$.langChainToolExecutions[0].modelVisibleSummary",
              kind: "generic_long_text",
              originalLength: longToolSummary.length,
              hash: "fnv1a:44444444",
              preview: "ToolMessage 摘要",
              visibility: toolOutputVisibility.modelVisibleSummary,
              textFile: "codex_logs/ai_trace_texts.jsonl",
            },
            userProjection: { resourceType: "exercise_search_results" },
            traceSummary: { totalMatches: 12, returnedCount: 3, truncated: true },
            outputVisibility: toolOutputVisibility,
            candidateDiagnosticsVisibility: {
              fields: ["totalMatches", "returnedCount", "truncated"],
              visibility: "debug_only",
            },
            enteredModelContext: true,
          },
        ],
        detailRefs: [
          {
            detailRef: "detail_0001",
            path: "$.langChainToolExecutions[0]",
            kind: "tool_execution_detail",
            hash: "fnv1a:33333333",
            summary: {
              type: "tool_call",
              toolName: "searchExerciseResources",
              toolResultId: "tr_1",
              outputVisibility: toolOutputVisibility,
            },
            visibility: toolOutputVisibility,
            detailFile: "codex_logs/ai_trace_texts.jsonl",
          },
        ],
        details: [
          {
            detailRef: "detail_0001",
            path: "$.langChainToolExecutions[0]",
            kind: "tool_execution_detail",
            hash: "fnv1a:33333333",
            summary: {
              type: "tool_call",
              toolName: "searchExerciseResources",
              toolResultId: "tr_1",
              outputVisibility: toolOutputVisibility,
            },
            visibility: toolOutputVisibility,
            content: {
              id: "step-tool",
              type: "tool_call",
              input: { text: "hello" },
              output: {
                type: "tool_execution",
                toolName: "searchExerciseResources",
                toolResultId: "tr_1",
                modelVisibleSummary: longToolSummary,
                traceSummary: { totalMatches: 12, returnedCount: 3, truncated: true },
                outputVisibility: toolOutputVisibility,
                payload: {
                  exerciseId: "Pushups",
                  authorization: "Bearer secret-token",
                },
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
              output: { payload: "保留可排查 payload" },
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
    expect(savedContent).toContain("保留可排查 payload");
    expect(savedContent).not.toContain(longModelText);
    expect(savedContent).not.toContain(longDetailText);
    expect(savedContent).toContain("plannerModelCalls");
    expect(savedContent).toContain("langChainToolExecutions");
    expect(savedContent).toContain("tokenUsageSummary");
    expect(savedContent).toContain("detailRefs");
    expect(savedContent).toContain("\"detailRef\": \"detail_0001\"");
    expect(savedContent).toContain("\"visibility\": \"llm_visible\"");
    expect(savedContent).toContain("\"visibility\": \"debug_only\"");
    expect(savedContent).toContain("\"traceSummary\": \"debug_only\"");
    expect(savedContent).not.toContain("\"modelVisible\": false");
    expect(savedContent).not.toContain("trace / log 调试，不回填模型");
    expect(savedContent).toContain("\"totalMatches\": 12");
    expect(savedContent).toContain("\"prompt_tokens\": 10");
    expect(savedContent).not.toContain("rawTrace");
    expect(savedContent).not.toContain("\"trace\":");
    expect(savedContent).not.toContain("\"details\":");
    expect(savedContent).toContain("ai_trace_texts.jsonl");
    expect(savedContent).toContain("\"contentRef\": \"text_0001\"");
    expect(longTextContent).toContain("AI trace mapping saved from /dev/ai-traces.");
    expect(longTextContent).toContain("rg '\"contentRef\":\"text_0001\"' codex_logs/ai_trace_texts.jsonl");
    expect(longTextContent).toContain("rg '\"detailRef\":\"detail_0001\"' codex_logs/ai_trace_texts.jsonl");
    expect(longTextContent).toContain("rg '\"parentRef\":\"text_0001\"' codex_logs/ai_trace_texts.jsonl");
    expect(longTextContent).toContain("\"contentRef\":\"text_0001\"");
    expect(longTextContent).toContain("\"paths\":[");
    expect(longTextContent).toContain("\"recordType\":\"text\"");
    expect(longTextContent).toContain("\"recordType\":\"text_chunk\"");
    expect(longTextContent).toContain("\"recordType\":\"detail\"");
    expect(longTextContent).toContain("\"recordType\":\"detail_chunk\"");
    expect(longTextContent).toContain("\"visibility\":\"llm_visible\"");
    expect(longTextContent).toContain("\"visibility\":{\"modelVisibleSummary\":\"llm_visible\"");
    expect(longTextContent).not.toContain("debug-only / 调试摘要");
    expect(longTextContent).not.toContain("trace / log 调试，不回填模型");
    expect(longTextContent).toContain(diagnosticPayloadText.slice(0, 80));
    expect(longTextContent).not.toContain("Bearer secret-token");
    expect(longTextContent).not.toContain("...[truncated]");
    const mappingRecords = parseJsonlRecords(longTextContent);
    const textChunks = mappingRecords.filter((record) => record.recordType === "text_chunk" && record.parentRef === "text_0001");
    const detailChunks = mappingRecords.filter((record) => record.recordType === "detail_chunk" && record.parentRef === "detail_0001");
    const contentRefRecords = mappingRecords.filter((record) => record.contentRef === "text_0001");
    const detailRefRecords = mappingRecords.filter((record) => record.detailRef === "detail_0001");
    const toolSummaryRefRecords = mappingRecords.filter((record) => record.contentRef === "text_0003");

    expect(textChunks.length).toBeGreaterThan(1);
    expect(textChunks.map((record) => record.content).join("")).toBe(longModelText);
    expect(detailChunks.length).toBeGreaterThan(1);
    const detailContent = detailChunks.map((record) => record.content).join("");
    expect(detailContent).toContain(longDetailText);
    expect(detailContent).toContain("\"authorization\": \"[redacted]\"");
    expect(contentRefRecords).toHaveLength(1);
    expect(detailRefRecords).toHaveLength(1);
    expect(toolSummaryRefRecords).toHaveLength(1);
    expect(toolSummaryRefRecords[0]).toMatchObject({
      visibility: "llm_visible",
      visibilityByPath: {
        "$.langChainToolExecutions[0].modelVisibleSummary": "llm_visible",
      },
    });
    expect(detailRefRecords[0]).toMatchObject({
      visibility: expect.objectContaining({
        traceSummary: "debug_only",
      }),
    });
    expect(textChunks.every((record) => record.contentRef === undefined)).toBe(true);
    expect(detailChunks.every((record) => record.detailRef === undefined)).toBe(true);
    expect(Math.max(...longTextContent.split("\n").map((line) => line.length))).toBeLessThan(2600);
    expect(fsMocks.appendFile).not.toHaveBeenCalled();
  });

  it("saves optimized trace bundles into separate report, event, model input, and text files", async () => {
    const repeatedSchema = `工具 schema ${"字段说明需要外置。".repeat(120)}`;
    const response = await devTraceRoute.POST(jsonRequest("/api/dev/ai-traces", {
      logType: "trace",
      payload: {
        report: {
          traceSummary: {
            id: "trace-v2",
            route: "/api/chat",
            status: "failed",
            title: "v2 导出",
          },
          loopTimeline: [
            {
              loopNumber: 1,
              runtimeStep: 1,
              eventRefs: ["event_0001"],
              modelInputRefs: ["model_input_0001"],
            },
          ],
          failureIndex: {
            status: "failed_or_recoverable",
            eventRef: "event_0001",
            modelInputRef: "model_input_0001",
            errorCode: "tool_failed",
          },
          tokenUsageSummary: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
          lookupGuide: {
            byEventRef: "rg '\"eventRef\":\"event_0001\"' codex_logs/ai_trace_events.jsonl",
          },
          fileManifest: {
            schemaVersion: "ai-trace-log-export.v2",
          },
        },
        events: [
          {
            recordType: "event",
            eventRef: "event_0001",
            kind: "tool_execution",
            loopNumber: 1,
            runtimeStep: 1,
            plannerCallIndex: 1,
            stepId: "tool-1",
            toolName: "searchExerciseResources",
            status: "failed",
            code: "tool_failed",
            modelInputRef: "model_input_0001",
          },
        ],
        modelInputs: [
          {
            recordType: "model_input",
            modelInputRef: "model_input_0001",
            plannerCallIndex: 1,
            runtimeStep: 1,
            messageCount: 2,
            toolCount: 1,
            toolNames: ["searchExerciseResources"],
            toolCatalogRef: "tool_catalog_0001",
            schemaRefs: ["tool_schema_0001"],
            audit: { completeness: "complete" },
          },
        ],
        texts: [
          {
            recordType: "deduped_text",
            ref: "tool_catalog_0001",
            refKind: "tool_catalog",
            path: "$.modelInputs[0].tools",
            hash: "fnv1a:catalog",
            originalLength: repeatedSchema.length,
            preview: "工具 schema",
            content: repeatedSchema,
          },
          {
            recordType: "deduped_text",
            ref: "tool_schema_0001",
            refKind: "tool_schema",
            path: "$.modelInputs[0].tools[0].inputSchema",
            hash: "fnv1a:schema",
            originalLength: repeatedSchema.length,
            preview: "工具 schema",
            content: repeatedSchema,
          },
        ],
        longTexts: [],
        details: [],
      },
    }));

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      path: expect.stringContaining("ai_trace_log.js"),
      eventPath: expect.stringContaining("ai_trace_events.jsonl"),
      modelInputPath: expect.stringContaining("ai_trace_model_inputs.jsonl"),
      textPath: expect.stringContaining("ai_trace_texts.jsonl"),
    });

    const reportCall = fsMocks.writeFile.mock.calls.find((call) => String(call[0]).includes("ai_trace_log.js"));
    const eventCall = fsMocks.writeFile.mock.calls.find((call) => String(call[0]).includes("ai_trace_events.jsonl"));
    const modelInputCall = fsMocks.writeFile.mock.calls.find((call) => String(call[0]).includes("ai_trace_model_inputs.jsonl"));
    const textCall = fsMocks.writeFile.mock.calls.find((call) => String(call[0]).includes("ai_trace_texts.jsonl"));
    const savedReport = String(reportCall?.[1] ?? "");
    const savedEvents = String(eventCall?.[1] ?? "");
    const savedModelInputs = String(modelInputCall?.[1] ?? "");
    const savedTexts = String(textCall?.[1] ?? "");

    expect(fsMocks.writeFile).toHaveBeenCalledTimes(4);
    expect(savedReport).toContain("ai_trace_events.jsonl");
    expect(savedReport).toContain("ai_trace_model_inputs.jsonl");
    expect(savedReport).toContain("\"eventRef\": \"event_0001\"");
    expect(savedReport).not.toContain(repeatedSchema);
    expect(savedEvents).toContain("\"eventRef\":\"event_0001\"");
    expect(savedEvents).toContain("\"toolName\":\"searchExerciseResources\"");
    expect(savedModelInputs).toContain("\"modelInputRef\":\"model_input_0001\"");
    expect(savedModelInputs).toContain("\"toolCatalogRef\":\"tool_catalog_0001\"");
    expect(savedTexts).toContain("\"ref\":\"tool_catalog_0001\"");
    expect(savedTexts).toContain("\"ref\":\"tool_schema_0001\"");
    expect(savedTexts).toContain("\"recordType\":\"deduped_text_chunk\"");
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

  it("appends current trace questions to the basic blackbox fixture", async () => {
    fsMocks.readFile.mockResolvedValueOnce(JSON.stringify({
      version: 1,
      flows: [
        {
          id: "F01",
          goal: "已有流程",
          turns: [
            {
              userInput: "今天我想练胸",
              expectedOutput: "有返回内容。",
            },
          ],
        },
      ],
    }));

    const response = await devTraceRoute.POST(jsonRequest("/api/dev/ai-traces", {
      logType: "blackbox_case",
      payload: {
        title: "胸部训练 trace",
        trace: {
          traceId: "trace-2",
          route: "/api/chat",
        },
        userQuestions: [
          { round: 1, question: "推荐几个练胸动作" },
          { round: 2, question: "换一批" },
        ],
        finalAnswer: "不要写入 fixture",
      },
    }));

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      path: expect.stringContaining("manual-tests/llm/fixtures/basic-chat-blackbox-cases.json"),
      flowId: "F02",
      turnCount: 2,
    });

    const savedFixture = JSON.parse(String(fsMocks.writeFile.mock.calls[0]?.[1] ?? ""));

    expect(fsMocks.appendFile).not.toHaveBeenCalled();
    expect(savedFixture).toMatchObject({
      version: 1,
      flows: [
        {
          id: "F01",
          goal: "已有流程",
          turns: [
            {
              userInput: "今天我想练胸",
              expectedOutput: "有返回内容。",
            },
          ],
        },
        {
          id: "F02",
          goal: "从 /dev/ai-traces 保存：胸部训练 trace",
          turns: [
            {
              userInput: "推荐几个练胸动作",
              expectedOutput: "只验证本轮有用户可见返回内容。",
            },
            {
              userInput: "换一批",
              expectedOutput: "只验证本轮有用户可见返回内容。",
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(savedFixture)).not.toContain("不要写入 fixture");
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
