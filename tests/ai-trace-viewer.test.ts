import { describe, expect, it } from "vitest";

import {
  buildAgentLoopTimeline,
  createTraceLogPayload,
  extractTraceLogLongTexts,
  groupTraceSteps,
} from "@/components/dev/ai-trace-viewer";
import type { AiTrace, AiTraceStep } from "@/lib/server/dev/ai-trace-store";

describe("AI trace viewer step grouping", () => {
  it("builds architecture module groups without requiring removed Agent runtime events", () => {
    const groups = groupTraceSteps([
      createStep({ type: "user_input", name: "用户输入" }),
      createStep({ type: "reference_resolution", name: "引用解析" }),
      createStep({ type: "tool_call", name: "动作查询" }),
      createStep({ type: "validation", name: "校验结果" }),
      createStep({ type: "persistence", name: "保存结果" }),
      createStep({ type: "response_write", name: "响应写入" }),
      createStep({ type: "error", name: "失败" }),
    ]);

    expect(groups.map((group) => group.title)).toEqual([
      "入口与上下文",
      "ToolRegistry / Manifest",
      "Planner / ModelAdapter",
      "Runtime / Validator",
      "Policy / Resource",
      "Response Renderer",
      "错误诊断",
      "Raw / 导出",
    ]);
    expect(groups.find((group) => group.id === "runtime_validation")?.steps).toHaveLength(4);
    expect(groups.find((group) => group.id === "planner_model")?.skipReason).toContain("未记录模型调用");
  });

  it("groups agent-core text chat runtime events even when registry is empty", () => {
    const groups = groupTraceSteps([
      createStep({
        type: "user_input",
        name: "文本聊天请求输入",
        output: { registry: { toolCount: 0, toolNames: [] } },
      }),
      createStep({
        type: "runtime_event",
        name: "Registry 快照",
        output: { type: "registry_snapshot", toolCount: 0 },
      }),
      createStep({
        type: "validation",
        name: "Action 校验通过",
        output: { type: "validation_result", ok: true },
      }),
      createStep({
        type: "response_write",
        name: "NDJSON 响应写入",
        output: { eventTypes: ["content", "done"], done: true },
      }),
    ]);

    expect(groups.map((group) => group.title)).toEqual([
      "入口与上下文",
      "ToolRegistry / Manifest",
      "Planner / ModelAdapter",
      "Runtime / Validator",
      "Policy / Resource",
      "Response Renderer",
      "错误诊断",
      "Raw / 导出",
    ]);
    expect(groups.find((group) => group.id === "registry_manifest")).toMatchObject({
      title: "ToolRegistry / Manifest",
      placement: "main_flow",
      steps: [
        expect.objectContaining({
          output: { type: "registry_snapshot", toolCount: 0 },
        }),
      ],
      summary: expect.arrayContaining([
        { label: "tool count", value: "0" },
        { label: "tool names", value: "空 ToolRegistry" },
      ]),
    });
  });

  it("keeps module view, planner calls, token usage, and raw trace payload in full trace log exports", () => {
    const trace: AiTrace = {
      id: "trace-1",
      runId: "run-1",
      route: "/api/chat",
      title: "文本聊天",
      status: "success",
      createdAt: "2026-05-30T08:00:00.000Z",
      steps: [
        createStep({
          type: "model_request",
          name: "模型请求 #1",
          input: { request: { model: "deepseek-chat" } },
          metadata: { plannerCallIndex: 1, runtimeStep: 1 },
        }),
        createStep({
          type: "model_response",
          name: "模型响应 #1",
          output: {
            parseStatus: "parsed",
            actionType: "final_answer",
            tokenUsage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          },
          metadata: { plannerCallIndex: 1, runtimeStep: 1 },
        }),
        createStep({
          type: "runtime_event",
          name: "Registry 快照",
          output: { type: "registry_snapshot", toolCount: 0 },
        }),
        createStep({
          type: "validation",
          name: "Action 校验通过",
          output: { type: "validation_result", step: 1, ok: true },
        }),
        createStep({
          type: "tool_call",
          name: "Tool 执行",
          input: { text: "hello" },
          output: {
            type: "tool_execution",
            step: 1,
            toolName: "readFixture",
            toolResultId: "tr_1",
            ok: true,
            satisfied: true,
            durationMs: 12,
          },
          metadata: {
            eventType: "tool_execution",
            runtimeStep: 1,
            toolName: "readFixture",
            toolResultId: "tr_1",
          },
        }),
      ],
    };
    const groups = groupTraceSteps(trace.steps);

    const payload = createTraceLogPayload(trace, groups);

    expect(payload).toMatchObject({
      title: "文本聊天",
      agentLoops: [
        expect.objectContaining({
          id: "loop-1",
          runtimeStep: 1,
          toolNames: ["readFixture"],
          tokenUsage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          modules: expect.arrayContaining([
            expect.objectContaining({
              id: "planner_model",
              modelCalls: [
                expect.objectContaining({
                  plannerCallIndex: 1,
                  requestStepId: "step-model_request",
                  responseStepId: "step-model_response",
                  tokenUsage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
                }),
              ],
            }),
            expect.objectContaining({
              id: "runtime_validation",
              stepIds: ["step-validation", "step-tool_call"],
            }),
          ]),
        }),
      ],
      moduleGroups: expect.arrayContaining([
        expect.objectContaining({
          id: "registry_manifest",
          summary: expect.arrayContaining([
            { label: "tool names", value: "空 ToolRegistry" },
          ]),
        }),
        expect.objectContaining({
          id: "planner_model",
          summary: expect.arrayContaining([
            { label: "LLM 调用", value: "1 轮" },
            { label: "真实 usage", value: "输入 10 / 输出 5 / 总 15" },
          ]),
        }),
      ]),
      plannerModelCalls: [
        expect.objectContaining({
          plannerCallIndex: 1,
          request: expect.objectContaining({ id: "step-model_request" }),
          response: expect.objectContaining({ id: "step-model_response" }),
        }),
      ],
      tokenUsageSummary: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      runtimeTraceEvents: expect.arrayContaining([
        expect.objectContaining({
          name: "Tool 执行",
          type: "tool_call",
          eventType: "tool_execution",
          output: expect.objectContaining({
            type: "tool_execution",
            toolName: "readFixture",
            toolResultId: "tr_1",
          }),
        }),
      ]),
      traceSummary: {
        id: "trace-1",
        route: "/api/chat",
        stepCount: 5,
        steps: expect.arrayContaining([
          expect.objectContaining({
            id: "step-runtime_event",
            type: "runtime_event",
            eventType: "registry_snapshot",
          }),
        ]),
      },
      groupedSteps: expect.arrayContaining([
        expect.objectContaining({
          id: "registry_manifest",
          title: "ToolRegistry / Manifest",
          stepIds: ["step-runtime_event"],
        }),
      ]),
      longTextStats: {
        count: 0,
        threshold: 600,
        textFile: "codex_logs/ai_trace_texts.jsonl",
      },
    });
    expect(payload).not.toHaveProperty("rawTrace");
    expect(payload).not.toHaveProperty("trace");
  });

  it("extracts long trace text into contentRef mappings for split log export", () => {
    const longSystemPrompt = `系统提示 ${"必须遵守合同。".repeat(90)}`;
    const longRawText = `模型输出 ${"返回 final_answer。".repeat(80)}`;

    const payload = extractTraceLogLongTexts({
      title: "长文本 trace",
      plannerModelCalls: [
        {
          request: {
            messages: [
              {
                role: "system",
                content: longSystemPrompt,
              },
            ],
          },
          response: {
            rawText: longRawText,
          },
        },
      ],
      repeatedPrompt: longSystemPrompt,
      tokenUsageSummary: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
    }) as Record<string, unknown>;
    const plannerModelCalls = payload.plannerModelCalls as Array<Record<string, unknown>>;
    const request = plannerModelCalls[0].request as Record<string, unknown>;
    const response = plannerModelCalls[0].response as Record<string, unknown>;
    const messages = request.messages as Array<Record<string, unknown>>;
    const repeatedPrompt = payload.repeatedPrompt as Record<string, unknown>;
    const longTextRefs = payload.longTextRefs as Array<Record<string, unknown>>;
    const longTexts = payload.longTexts as Array<Record<string, unknown>>;

    expect(messages[0].content).toMatchObject({
      contentRef: "text_0001",
      kind: "model_request_message",
      path: "$.plannerModelCalls[0].request.messages[0].content",
      originalLength: longSystemPrompt.length,
      textFile: "codex_logs/ai_trace_texts.jsonl",
    });
    expect(response.rawText).toMatchObject({
      contentRef: "text_0002",
      kind: "model_response_text",
      path: "$.plannerModelCalls[0].response.rawText",
      originalLength: longRawText.length,
    });
    expect(repeatedPrompt).toMatchObject({
      contentRef: "text_0001",
      path: "$.repeatedPrompt",
    });
    expect(longTextRefs).toHaveLength(2);
    expect(longTexts).toEqual([
      expect.objectContaining({
        contentRef: "text_0001",
        hash: expect.stringMatching(/^fnv1a:/),
        preview: expect.stringContaining("[middle omitted]"),
        paths: [
          "$.plannerModelCalls[0].request.messages[0].content",
          "$.repeatedPrompt",
        ],
        content: longSystemPrompt,
      }),
      expect.objectContaining({
        contentRef: "text_0002",
        content: longRawText,
      }),
    ]);
  });

  it("builds loop-centric timeline with per-loop and per-call token usage", () => {
    const loops = buildAgentLoopTimeline([
      createStep({
        id: "request-1",
        type: "model_request",
        name: "模型请求 #1",
        metadata: { plannerCallIndex: 1, runtimeStep: 1 },
      }),
      createStep({
        id: "response-1",
        type: "model_response",
        name: "模型响应 #1",
        output: {
          parseStatus: "parsed",
          actionType: "tool_call",
          tokenUsage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
        metadata: { plannerCallIndex: 1, runtimeStep: 1 },
      }),
      createStep({
        id: "action-1",
        type: "runtime_event",
        name: "Planner action",
        output: { type: "planner_action", step: 1, actionType: "tool_call", toolName: "readFixture" },
      }),
      createStep({
        id: "validation-1",
        type: "validation",
        name: "Action 校验通过",
        output: { type: "validation_result", step: 1, ok: true },
      }),
      createStep({
        id: "tool-1",
        type: "tool_call",
        name: "Tool 执行",
        input: { text: "hello" },
        output: {
          type: "tool_execution",
          step: 1,
          toolName: "readFixture",
          toolResultId: "tr_1",
          ok: true,
          satisfied: true,
        },
        metadata: { eventType: "tool_execution", runtimeStep: 1 },
      }),
      createStep({
        id: "request-2",
        type: "model_request",
        name: "模型请求 #2",
        metadata: { plannerCallIndex: 2, runtimeStep: 2 },
      }),
      createStep({
        id: "response-2",
        type: "model_response",
        name: "模型响应 #2",
        output: {
          parseStatus: "parsed",
          actionType: "final_answer",
          tokenUsage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
        },
        metadata: { plannerCallIndex: 2, runtimeStep: 2 },
      }),
      createStep({
        id: "validation-2",
        type: "validation",
        name: "Action 校验通过",
        output: { type: "validation_result", step: 2, ok: true },
      }),
    ]);

    expect(loops).toHaveLength(2);
    expect(loops[0]).toMatchObject({
      id: "loop-1",
      runtimeStep: 1,
      toolNames: ["readFixture"],
      plannerCallIndexes: [1],
      tokenUsage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      modules: [
        expect.objectContaining({
          id: "planner_model",
          tokenUsage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          modelCalls: [
            expect.objectContaining({
              plannerCallIndex: 1,
              request: expect.objectContaining({ id: "request-1" }),
              response: expect.objectContaining({ id: "response-1" }),
            }),
          ],
        }),
        expect.objectContaining({
          id: "runtime_validation",
          steps: [
            expect.objectContaining({ id: "action-1" }),
            expect.objectContaining({ id: "validation-1" }),
            expect.objectContaining({ id: "tool-1" }),
          ],
        }),
      ],
    });
    expect(loops[1]).toMatchObject({
      id: "loop-2",
      runtimeStep: 2,
      toolNames: [],
      plannerCallIndexes: [2],
      tokenUsage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
    });
  });

  it("summarizes the full Planner-visible manifest names from registry snapshot output", () => {
    const groups = groupTraceSteps([
      createStep({
        type: "runtime_event",
        name: "Registry 快照",
        output: {
          type: "registry_snapshot",
          toolCount: 2,
          toolNames: ["readRecentExerciseRecommendationFact", "searchExerciseResources"],
          tools: [
            {
              name: "readRecentExerciseRecommendationFact",
              version: "2026-06-04",
              description: "读取最近的动作推荐事实。",
            },
            {
              name: "searchExerciseResources",
              version: "2026-06-04",
              description: "查询动作资源。",
            },
          ],
        },
      }),
    ]);

    expect(groups.find((group) => group.id === "registry_manifest")).toMatchObject({
      summary: expect.arrayContaining([
        { label: "tool count", value: "2" },
        { label: "tool names", value: "readRecentExerciseRecommendationFact, searchExerciseResources" },
      ]),
    });
  });
});

function createStep(overrides: Pick<AiTraceStep, "type" | "name"> & Partial<AiTraceStep>): AiTraceStep {
  return {
    id: overrides.id ?? `step-${overrides.type}`,
    name: overrides.name,
    type: overrides.type,
    status: overrides.type === "error" ? "failed" : "success",
    startedAt: "2026-05-30T08:00:00.000Z",
    endedAt: "2026-05-30T08:00:00.010Z",
    durationMs: 10,
    input: overrides.input,
    output: overrides.output,
    metadata: overrides.metadata,
    error: overrides.error,
  };
}
