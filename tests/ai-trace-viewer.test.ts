import { describe, expect, it } from "vitest";

import {
  buildAgentLoopTimeline,
  createTraceLogPayload,
  createToolExecutionVisibilitySections,
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
      "LangChain Tool Catalog",
      "LangChain / DeepSeek",
      "Runtime / Tool Wrapper / Validator",
      "Policy / Resource",
      "Production Response Adapter",
      "错误诊断",
      "Raw / 导出",
    ]);
    expect(groups.find((group) => group.id === "runtime_validation")?.steps).toHaveLength(4);
    expect(groups.find((group) => group.id === "planner_model")?.skipReason).toContain("未记录独立模型请求步骤");
  });

  it("groups LangChain text chat runtime events even when the catalog has no tools", () => {
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
      "LangChain Tool Catalog",
      "LangChain / DeepSeek",
      "Runtime / Tool Wrapper / Validator",
      "Policy / Resource",
      "Production Response Adapter",
      "错误诊断",
      "Raw / 导出",
    ]);
    expect(groups.find((group) => group.id === "registry_manifest")).toMatchObject({
      title: "LangChain Tool Catalog",
      placement: "main_flow",
      steps: [
        expect.objectContaining({
          output: { type: "registry_snapshot", toolCount: 0 },
        }),
      ],
      summary: expect.arrayContaining([
        { label: "tool count", value: "0" },
        { label: "tool names", value: "未记录 Tool" },
      ]),
    });
  });

  it("surfaces LangChain runtime, DeepSeek tool calls, wrapper results, and response projection", () => {
    const trace: AiTrace = {
      id: "trace-langchain",
      runId: "run-langchain",
      route: "/api/chat",
      title: "LangChain trace",
      status: "success",
      createdAt: "2026-06-11T05:00:00.000Z",
      steps: [
        createStep({
          id: "request-context",
          type: "runtime_event",
          name: "LangChain Agent 请求上下文",
          output: {
            runtime: "langchain-agent-runtime-v1",
            messageCount: 2,
            conversationId: "conversation-1",
            toolNames: ["searchExerciseResources", "submitVisibleTrainingProposal"],
          },
          metadata: {
            pipeline: "langchain-agent-text-chat",
            boundary: "request_context",
          },
        }),
        createStep({
          id: "runtime-summary",
          type: "runtime_event",
          name: "LangChain Agent Runtime 摘要",
          output: {
            finalTextLength: 12,
            traceSummary: {
              runtimeVersion: "langchain-agent-runtime-v1",
              model: "deepseek-v4-flash",
              toolNames: ["searchExerciseResources", "submitVisibleTrainingProposal"],
              modelRequestSummary: {
                inputMessageCount: 2,
                inputMessagePreviews: [{ role: "user", contentPreview: "给我练胸动作" }],
                toolCount: 2,
              },
              modelResponseSummary: {
                generatedMessageCount: 3,
                assistantMessageCount: 2,
                toolMessageCount: 1,
                finalTextPreview: "已生成动作卡片。",
              },
              providerToolCalls: [
                { id: "call_search_1", name: "searchExerciseResources", argsSummary: { query: "胸部" } },
                { id: "call_submit_1", name: "submitVisibleTrainingProposal", argsSummary: { outputType: "visibleTrainingProposal" } },
              ],
              modelCallCount: 2,
              toolCallCount: 2,
              messageCount: 5,
              durationMs: 150,
            },
            toolExecutions: [
              { toolCallId: "call_search_1", toolName: "searchExerciseResources", status: "succeeded", enteredModelContext: true },
              { toolCallId: "call_submit_1", toolName: "submitVisibleTrainingProposal", status: "succeeded", enteredModelContext: true },
            ],
            structuredOutputValidation: {
              validatedVisibleOutputCount: 1,
            },
          },
          metadata: {
            pipeline: "langchain-agent-text-chat",
            boundary: "langchain_runtime",
          },
        }),
        createStep({
          id: "response-write",
          type: "response_write",
          name: "NDJSON 响应写入",
          output: {
            eventTypes: ["content", "visible_output", "done"],
            visibleOutputCount: 1,
            suggestedQuestionCount: 0,
            projectionType: "content_with_visible_output",
          },
          metadata: {
            pipeline: "langchain-agent-text-chat",
            projectionType: "content_with_visible_output",
          },
        }),
      ],
    };
    const groups = groupTraceSteps(trace.steps);
    const requestGroup = groups.find((group) => group.id === "request_context");
    const runtimeGroup = groups.find((group) => group.id === "runtime_validation");
    const responseGroup = groups.find((group) => group.id === "response_rendering");
    const loops = buildAgentLoopTimeline(trace.steps);
    const payload = createTraceLogPayload(trace, groups);

    expect(requestGroup).toMatchObject({
      title: "入口与上下文",
      summary: expect.arrayContaining([
        { label: "tool catalog", value: "searchExerciseResources, submitVisibleTrainingProposal" },
      ]),
    });
    expect(runtimeGroup).toMatchObject({
      title: "Runtime / Tool Wrapper / Validator",
      summary: expect.arrayContaining([
        { label: "runtime", value: "langchain-agent-runtime-v1" },
        { label: "model", value: "deepseek-v4-flash" },
        { label: "provider tool_calls", value: "2 次：searchExerciseResources, submitVisibleTrainingProposal" },
        { label: "tool wrappers", value: "2 次，成功 2 / 失败 0 / 重复输入 0：searchExerciseResources, submitVisibleTrainingProposal" },
        { label: "structured output", value: "validated visible outputs: 1" },
        { label: "旧 core", value: "未使用 AgentAction / PlannerPort / ToolRegistry" },
      ]),
    });
    expect(responseGroup).toMatchObject({
      title: "Production Response Adapter",
      summary: expect.arrayContaining([
        { label: "done", value: "true" },
        { label: "projection", value: "content_with_visible_output" },
      ]),
    });
    expect(loops).toHaveLength(1);
    expect(loops[0]).toMatchObject({
      runtimeStep: 1,
      toolNames: ["searchExerciseResources", "submitVisibleTrainingProposal"],
    });
    expect(payload.report).toMatchObject({
      traceSummary: expect.objectContaining({
        runtimeSummaryRefs: [
          expect.objectContaining({
            kind: "langchain_runtime_detail",
            path: "$.langChainRuntimeSummaries[0]",
          }),
        ],
        providerToolCalls: [
          expect.objectContaining({ id: "call_search_1", name: "searchExerciseResources" }),
          expect.objectContaining({ id: "call_submit_1", name: "submitVisibleTrainingProposal" }),
        ],
        toolExecutionRefs: [
          expect.objectContaining({ kind: "tool_execution_detail" }),
          expect.objectContaining({ kind: "tool_execution_detail" }),
        ],
      }),
      loopTimeline: [
        expect.objectContaining({
          runtimeStep: 1,
          eventRefs: expect.arrayContaining(["event_0002"]),
        }),
      ],
    });
    expect(payload.details).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "langchain_runtime_detail",
        path: "$.langChainRuntimeSummaries[0]",
      }),
      expect.objectContaining({
        kind: "tool_execution_detail",
        path: "$.langChainToolExecutions[0]",
      }),
    ]));
    expect(payload.report).not.toHaveProperty("langChainRuntimeSummaries");
    expect(payload.report).not.toHaveProperty("langChainToolExecutions");
    expect(JSON.stringify(payload)).not.toContain("planner_action");
    expect(JSON.stringify(payload)).not.toContain("duplicate_tool_call");
  });

  it("builds LangChain loops from model calls, provider tool calls, wrapper executions, and token usage", () => {
    const traceSummary = {
      runtimeVersion: "langchain-agent-runtime-v1",
      model: "deepseek-v4-flash",
      toolNames: ["searchExerciseResources", "submitVisibleTrainingProposal"],
      modelRequestSummary: {
        inputMessageCount: 2,
        inputMessagePreviews: [{ role: "user", contentPreview: "给我练胸动作" }],
        toolCount: 2,
      },
      modelResponseSummary: {
        generatedMessageCount: 4,
        assistantMessageCount: 2,
        toolMessageCount: 1,
        finalTextPreview: "已生成动作卡片。",
      },
      modelCalls: [
        {
          modelCallIndex: 1,
          runtimeStep: 1,
          status: "success",
          requestSummary: {
            messageCount: 2,
            messagePreviews: [{ role: "human", contentPreview: "给我练胸动作" }],
            toolCount: 2,
            toolNames: ["searchExerciseResources", "submitVisibleTrainingProposal"],
          },
          responseSummary: { contentPreview: "", contentLength: 0 },
          providerToolCalls: [
            {
              id: "call_search_1",
              name: "searchExerciseResources",
              argsSummary: { query: "胸部" },
              modelCallIndex: 1,
              runtimeStep: 1,
            },
          ],
          tokenUsage: { prompt_tokens: 14, completion_tokens: 3, total_tokens: 17 },
        },
        {
          modelCallIndex: 2,
          runtimeStep: 2,
          status: "success",
          requestSummary: {
            messageCount: 4,
            messagePreviews: [{ role: "tool", contentPreview: "动作查询结果" }],
            toolCount: 2,
            toolNames: ["searchExerciseResources", "submitVisibleTrainingProposal"],
          },
          responseSummary: { contentPreview: "已生成动作卡片。", contentLength: 8 },
          providerToolCalls: [],
          tokenUsage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
        },
      ],
      providerToolCalls: [
        {
          id: "call_search_1",
          name: "searchExerciseResources",
          argsSummary: { query: "胸部" },
          modelCallIndex: 1,
          runtimeStep: 1,
        },
      ],
      modelCallCount: 2,
      toolCallCount: 1,
      messageCount: 5,
      durationMs: 150,
    };
    const trace: AiTrace = {
      id: "trace-langchain-detail",
      runId: "run-langchain-detail",
      route: "/api/chat",
      title: "LangChain detailed trace",
      status: "success",
      createdAt: "2026-06-11T05:00:00.000Z",
      steps: [
        createStep({
          id: "lc-request-1",
          type: "model_request",
          name: "LangChain 模型请求 #1",
          output: {
            provider: "langchain",
            model: "deepseek-v4-flash",
            modelCallIndex: 1,
            runtimeStep: 1,
            toolNames: ["searchExerciseResources", "submitVisibleTrainingProposal"],
          },
          metadata: {
            pipeline: "langchain-agent-text-chat",
            boundary: "planner_model",
            modelCallIndex: 1,
            runtimeStep: 1,
          },
        }),
        createStep({
          id: "lc-response-1",
          type: "model_response",
          name: "LangChain 模型响应 #1",
          output: {
            provider: "langchain",
            model: "deepseek-v4-flash",
            modelCallIndex: 1,
            runtimeStep: 1,
            parseStatus: "parsed",
            actionType: "tool_call",
            providerToolCalls: traceSummary.providerToolCalls,
            tokenUsage: { prompt_tokens: 14, completion_tokens: 3, total_tokens: 17 },
          },
          metadata: {
            pipeline: "langchain-agent-text-chat",
            boundary: "planner_model",
            modelCallIndex: 1,
            runtimeStep: 1,
            tokenUsage: { prompt_tokens: 14, completion_tokens: 3, total_tokens: 17 },
          },
        }),
        createStep({
          id: "lc-tool-1",
          type: "tool_call",
          name: "LangChain Tool Wrapper 执行: searchExerciseResources",
          output: {
            type: "tool_execution",
            runtime: "langchain-agent-runtime-v1",
            sequence: 1,
            runtimeStep: 1,
            modelCallIndex: 1,
            toolCallId: "call_search_1",
            toolName: "searchExerciseResources",
            ok: true,
            status: "succeeded",
            enteredModelContext: true,
          },
          metadata: {
            pipeline: "langchain-agent-text-chat",
            boundary: "langchain_runtime",
            eventType: "tool_execution",
            sequence: 1,
            modelCallIndex: 1,
            runtimeStep: 1,
            toolCallId: "call_search_1",
            toolName: "searchExerciseResources",
          },
        }),
        createStep({
          id: "lc-request-2",
          type: "model_request",
          name: "LangChain 模型请求 #2",
          output: {
            provider: "langchain",
            model: "deepseek-v4-flash",
            modelCallIndex: 2,
            runtimeStep: 2,
          },
          metadata: {
            pipeline: "langchain-agent-text-chat",
            boundary: "planner_model",
            modelCallIndex: 2,
            runtimeStep: 2,
          },
        }),
        createStep({
          id: "lc-response-2",
          type: "model_response",
          name: "LangChain 模型响应 #2",
          output: {
            provider: "langchain",
            model: "deepseek-v4-flash",
            modelCallIndex: 2,
            runtimeStep: 2,
            parseStatus: "parsed",
            actionType: "final_answer",
            response: { contentPreview: "已生成动作卡片。", contentLength: 8 },
            tokenUsage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
          },
          metadata: {
            pipeline: "langchain-agent-text-chat",
            boundary: "planner_model",
            modelCallIndex: 2,
            runtimeStep: 2,
            tokenUsage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
          },
        }),
        createStep({
          id: "lc-runtime-summary",
          type: "runtime_event",
          name: "LangChain Agent Runtime 摘要",
          output: {
            finalTextLength: 8,
            traceSummary,
            toolExecutions: [
              {
                sequence: 1,
                modelCallIndex: 1,
                runtimeStep: 1,
                toolCallId: "call_search_1",
                toolName: "searchExerciseResources",
                status: "succeeded",
                enteredModelContext: true,
              },
            ],
            structuredOutputValidation: {
              validatedVisibleOutputCount: 1,
            },
          },
          metadata: {
            pipeline: "langchain-agent-text-chat",
            boundary: "langchain_runtime_summary",
          },
        }),
        createStep({
          id: "lc-response-write",
          type: "response_write",
          name: "NDJSON 响应写入",
          output: {
            eventTypes: ["content", "visible_output", "done"],
            visibleOutputCount: 1,
            projectionType: "content_with_visible_output",
          },
          metadata: {
            pipeline: "langchain-agent-text-chat",
            projectionType: "content_with_visible_output",
          },
        }),
      ],
    };
    const loops = buildAgentLoopTimeline(trace.steps);
    const payload = createTraceLogPayload(trace, groupTraceSteps(trace.steps));

    expect(loops).toHaveLength(2);
    expect(loops[0]).toMatchObject({
      runtimeStep: 1,
      toolNames: ["searchExerciseResources"],
      plannerCallIndexes: [1],
      tokenUsage: { prompt_tokens: 14, completion_tokens: 3, total_tokens: 17 },
    });
    expect(loops[1]).toMatchObject({
      runtimeStep: 2,
      toolNames: [],
      plannerCallIndexes: [2],
      tokenUsage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
    });
    expect(payload.report).toMatchObject({
      tokenUsageSummary: { prompt_tokens: 34, completion_tokens: 8, total_tokens: 42 },
      traceSummary: expect.objectContaining({
        providerToolCalls: [
          expect.objectContaining({
            id: "call_search_1",
            name: "searchExerciseResources",
            modelCallIndex: 1,
            runtimeStep: 1,
          }),
        ],
        runtimeSummaryRefs: [
          expect.objectContaining({
            kind: "langchain_runtime_detail",
            path: "$.langChainRuntimeSummaries[0]",
          }),
        ],
        toolExecutionRefs: [
          expect.objectContaining({
            kind: "tool_execution_detail",
            summary: expect.objectContaining({
              toolCallId: "call_search_1",
              toolName: "searchExerciseResources",
              modelCallIndex: 1,
              runtimeStep: 1,
            }),
          }),
        ],
      }),
      loopTimeline: [
        expect.objectContaining({
          runtimeStep: 1,
          modelInputRefs: ["model_input_0001"],
          eventRefs: expect.arrayContaining(["event_0001", "event_0002", "event_0003"]),
        }),
        expect.objectContaining({
          runtimeStep: 2,
          modelInputRefs: ["model_input_0002"],
          eventRefs: expect.arrayContaining(["event_0004", "event_0005"]),
        }),
      ],
    });
    expect(payload.modelInputs).toHaveLength(2);
    expect(payload.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventRef: "event_0003",
        kind: "tool_execution",
        toolName: "searchExerciseResources",
      }),
    ]));
  });

  it("keeps module view, planner calls, token usage, and detail refs in full trace log exports", () => {
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
          input: { request: { model: "deepseek-v4-flash" } },
          output: {
            model: "deepseek-v4-flash",
            thinking: {
              type: "enabled",
              enabled: true,
              reasoning_effort: "high",
            },
          },
          metadata: {
            plannerCallIndex: 1,
            runtimeStep: 1,
            thinking: {
              type: "enabled",
              enabled: true,
              reasoning_effort: "high",
            },
          },
        }),
        createStep({
          type: "model_response",
          name: "模型响应 #1",
          output: {
            parseStatus: "parsed",
            actionType: "final_answer",
            reasoning: {
              received: true,
              contentLength: 12,
              rawText: "受控 reasoning 摘要",
              source: "choices[0].message.reasoning_content",
            },
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

    expect(payload.report).toMatchObject({
      traceSummary: {
        id: "trace-1",
        route: "/api/chat",
        title: "文本聊天",
        stepCount: 5,
        detailRef: expect.objectContaining({
          detailRef: "detail_0001",
          kind: "full_trace",
        }),
        moduleGroups: expect.arrayContaining([
          expect.objectContaining({
            id: "registry_manifest",
            title: "LangChain Tool Catalog",
            stepIds: ["step-runtime_event"],
          }),
          expect.objectContaining({
            id: "planner_model",
            summary: expect.arrayContaining([
              { label: "LLM 调用", value: "1 轮" },
              { label: "thinking", value: "enabled / reasoning_effort=high" },
              { label: "reasoning", value: "received / length=12" },
              { label: "真实 usage", value: "输入 10 / 输出 5 / 总 15" },
            ]),
          }),
        ]),
      },
      loopTimeline: [
        expect.objectContaining({
          runtimeStep: 1,
          toolNames: ["readFixture"],
          tokenUsage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          modelInputRefs: ["model_input_0001"],
          eventRefs: expect.arrayContaining(["event_0001", "event_0002", "event_0005"]),
        }),
      ],
      tokenUsageSummary: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    expect(payload.modelInputs[0]).toMatchObject({
      modelInputRef: "model_input_0001",
      requestStepId: "step-model_request",
      plannerCallIndex: 1,
      audit: expect.objectContaining({
        completeness: "incomplete",
      }),
    });
    expect(payload.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventRef: "event_0005",
        kind: "tool_execution",
        toolName: "readFixture",
        detailRef: expect.objectContaining({
          detailRef: expect.stringMatching(/^detail_/),
          kind: "runtime_event_detail",
        }),
      }),
    ]));
    expect(payload.details).toEqual(expect.arrayContaining([
      expect.objectContaining({
        detailRef: "detail_0001",
        kind: "full_trace",
        content: expect.objectContaining({
          id: "trace-1",
          steps: expect.arrayContaining([
            expect.objectContaining({ id: "step-tool_call" }),
          ]),
        }),
      }),
    ]));
    expect(payload.report).not.toHaveProperty("plannerModelCalls");
    expect(payload.report).not.toHaveProperty("runtimeTraceEvents");
    expect(payload.report).not.toHaveProperty("details");
    expect(payload.report).not.toHaveProperty("longTextRefs");
  });

  it("moves omitted runtime event details to detail mappings while long strings stay addressable", () => {
    const longRuntimeOutput = `完整 runtime 详情 ${"包含执行 input output metadata。".repeat(80)}`;
    const trace: AiTrace = {
      id: "trace-detail",
      runId: "run-detail",
      route: "/api/chat",
      title: "详情外置",
      status: "success",
      createdAt: "2026-06-04T02:30:00.000Z",
      steps: [
        createStep({
          id: "tool-detail",
          type: "tool_call",
          name: "Tool 执行",
          input: { query: "练背" },
          output: {
            type: "tool_execution",
            step: 1,
            toolName: "searchExerciseResources",
            toolResultId: "tr_detail",
            ok: true,
            diagnostic: longRuntimeOutput,
          },
          metadata: { runtimeStep: 1, toolName: "searchExerciseResources" },
        }),
      ],
    };

    const payload = createTraceLogPayload(trace, groupTraceSteps(trace.steps));
    const event = payload.events[0] as Record<string, unknown>;
    const eventSummary = event.summary as Record<string, unknown>;
    const outputSummary = eventSummary.output as Record<string, unknown>;
    const detailRef = event.detailRef as Record<string, unknown>;
    const runtimeDetail = payload.details.find((detail) => detail.detailRef === detailRef.detailRef) as Record<string, unknown>;
    const detailContent = runtimeDetail.content as Record<string, unknown>;
    const detailOutput = detailContent.output as Record<string, unknown>;
    const longTexts = payload.longTexts as Array<Record<string, unknown>>;

    expect(outputSummary).not.toHaveProperty("diagnostic");
    expect(detailRef).toMatchObject({
      kind: "runtime_event_detail",
      path: "$.events[0]",
    });
    expect(detailOutput.diagnostic).toMatchObject({
      contentRef: "text_0001",
      kind: "trace_step_output",
      originalLength: longRuntimeOutput.length,
    });
    expect(longTexts).toEqual([
      expect.objectContaining({
        contentRef: "text_0001",
        content: longRuntimeOutput,
      }),
    ]);
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
    expect(longTextRefs[0]).toMatchObject({
      contentRef: "text_0001",
      pathCount: 2,
    });
    expect(longTextRefs[0]).not.toHaveProperty("paths");
  });

  it("merges chunked model request trace envelopes into one long text mapping", () => {
    const modelVisibleContent = `完整模型输入 ${"历史消息和合同内容需要保留。".repeat(80)}`;
    const firstChunk = modelVisibleContent.slice(0, 420);
    const secondChunk = modelVisibleContent.slice(420);

    const payload = extractTraceLogLongTexts({
      plannerModelCalls: [
        {
          request: {
            input: {
              messages: [
                {
                  role: "user",
                  content: {
                    kind: "trace_long_text",
                    contentType: "model_request_message",
                    originalLength: modelVisibleContent.length,
                    storedLength: modelVisibleContent.length,
                    chunkSize: 420,
                    hash: "fnv1a:testtrace",
                    preview: "完整模型输入\n...[middle omitted]...\n需要保留。",
                    redacted: false,
                    chunks: [
                      { index: 1, start: 420, end: modelVisibleContent.length, text: secondChunk },
                      { index: 0, start: 0, end: 420, text: firstChunk },
                    ],
                  },
                },
              ],
            },
          },
        },
      ],
    }) as Record<string, unknown>;
    const plannerModelCalls = payload.plannerModelCalls as Array<Record<string, unknown>>;
    const request = plannerModelCalls[0].request as Record<string, unknown>;
    const input = request.input as Record<string, unknown>;
    const messages = input.messages as Array<Record<string, unknown>>;
    const messageContent = messages[0].content as Record<string, unknown>;
    const longTexts = payload.longTexts as Array<Record<string, unknown>>;

    expect(messageContent).toMatchObject({
      contentRef: "text_0001",
      path: "$.plannerModelCalls[0].request.input.messages[0].content",
      kind: "model_request_message",
      originalLength: modelVisibleContent.length,
      hash: "fnv1a:testtrace",
    });
    expect(messageContent).not.toHaveProperty("chunks");
    expect(longTexts).toEqual([
      expect.objectContaining({
        contentRef: "text_0001",
        paths: ["$.plannerModelCalls[0].request.input.messages[0].content"],
        content: modelVisibleContent,
      }),
    ]);
  });

  it("externalizes model-visible request snapshot fields with precise long text kinds", () => {
    const systemPrompt = `系统提示 ${"保持 tool calling 合同。".repeat(80)}`;
    const toolDescription = `工具说明 ${"查询可训练动作事实。".repeat(80)}`;
    const schemaDescription = `字段说明 ${"用户明确表达的训练目标。".repeat(80)}`;
    const schemaJson = JSON.stringify({
      type: "object",
      properties: {
        goal: { type: "string", description: schemaDescription },
      },
    });

    const payload = extractTraceLogLongTexts({
      plannerModelCalls: [
        {
          request: {
            modelVisibleInputSnapshot: {
              systemPrompt: {
                content: createTraceLongTextEnvelope("model_request_system_prompt", systemPrompt),
              },
              tools: [
                {
                  name: "searchExerciseResources",
                  description: {
                    content: createTraceLongTextEnvelope("model_request_tool_description", toolDescription),
                  },
                  inputSchema: {
                    content: createTraceLongTextEnvelope("model_request_tool_schema", schemaJson),
                  },
                  schemaDescriptions: [
                    {
                      path: "$.properties.goal.description",
                      text: {
                        content: createTraceLongTextEnvelope("model_request_tool_schema_description", schemaDescription),
                      },
                    },
                  ],
                },
              ],
              modelVisibleInputAudit: {
                sourceKind: "runtime_model_request",
                completeness: "complete",
                missingModelVisibleParts: [],
              },
            },
          },
        },
      ],
    }) as Record<string, unknown>;
    const longTexts = payload.longTexts as Array<Record<string, unknown>>;

    expect(longTexts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "model_request_system_prompt",
          content: systemPrompt,
        }),
        expect.objectContaining({
          kind: "model_request_tool_description",
          content: toolDescription,
        }),
        expect.objectContaining({
          kind: "model_request_tool_schema",
          content: schemaJson,
        }),
        expect.objectContaining({
          kind: "model_request_tool_schema_description",
          content: schemaDescription,
        }),
      ]),
    );
  });

  it("marks legacy model request summaries as incomplete instead of complete model-visible input evidence", () => {
    const trace: AiTrace = {
      id: "trace-legacy-model-request",
      runId: "run-legacy-model-request",
      route: "/api/chat",
      title: "旧格式模型请求",
      status: "success",
      createdAt: "2026-06-16T05:00:00.000Z",
      steps: [
        createStep({
          id: "model-request-legacy",
          type: "model_request",
          name: "LangChain 模型请求 #1",
          input: {
            messages: [{ role: "user", contentPreview: "帮我练胸" }],
            toolNames: ["searchExerciseResources"],
          },
          output: {
            modelCallIndex: 1,
            runtimeStep: 1,
            messageCount: 1,
            toolCount: 1,
            toolNames: ["searchExerciseResources"],
          },
          metadata: {
            modelCallIndex: 1,
            runtimeStep: 1,
          },
        }),
      ],
    };
    const payload = createTraceLogPayload(trace, groupTraceSteps(trace.steps));
    const request = payload.modelInputs[0];

    expect(request.audit).toMatchObject({
      sourceKind: "trace_export",
      completeness: "incomplete",
      missingModelVisibleParts: expect.arrayContaining([
        "$.request.systemPrompt",
        "$.request.tools",
        "$.request.finalizationTool",
      ]),
    });
    expect(JSON.stringify(request.audit)).toContain("请重新采集包含 modelVisibleInputSnapshot 的 trace");
  });

  it("keeps the default trace report compact while refs resolve to mapping records", () => {
    const systemPrompt = `系统提示 ${"保持稳定合同。".repeat(80)}`;
    const toolDescription = `工具说明 ${"只查询数据库动作事实。".repeat(80)}`;
    const schemaDescription = `字段说明 ${"用户明确表达的训练目标。".repeat(80)}`;
    const toolSchema = JSON.stringify({
      type: "object",
      properties: {
        query: { type: "string", description: schemaDescription },
      },
    });
    const modelVisibleInputSnapshot = {
      messageCount: 2,
      toolCount: 1,
      toolNames: ["searchExerciseResources"],
      systemPrompt: { content: createTraceLongTextEnvelope("model_request_system_prompt", systemPrompt) },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "推荐练胸动作" },
      ],
      tools: [
        {
          name: "searchExerciseResources",
          description: { content: createTraceLongTextEnvelope("model_request_tool_description", toolDescription) },
          inputSchema: { content: createTraceLongTextEnvelope("model_request_tool_schema", toolSchema) },
          schemaDescriptions: [
            {
              path: "$.properties.query.description",
              text: { content: createTraceLongTextEnvelope("model_request_tool_schema_description", schemaDescription) },
            },
          ],
        },
      ],
      finalizationTool: {
        name: "fitmate_final_response",
        inputSchema: { type: "object", properties: { content: { type: "string" } } },
      },
      modelVisibleInputAudit: {
        sourceKind: "runtime_model_request",
        completeness: "complete",
        missingModelVisibleParts: [],
      },
    };
    const trace: AiTrace = {
      id: "trace-compact-export",
      runId: "run-compact-export",
      route: "/api/chat",
      title: "紧凑导出",
      status: "failed",
      createdAt: "2026-06-16T05:00:00.000Z",
      finalDecision: {
        status: "recoverable_failure",
        code: "tool_execution_failed",
      },
      steps: [
        createStep({
          id: "request-1",
          type: "model_request",
          name: "LangChain 模型请求 #1",
          input: {
            messages: [{ role: "user", content: "推荐练胸动作" }],
            modelVisibleInputSnapshot,
            toolNames: ["searchExerciseResources"],
          },
          output: {
            modelCallIndex: 1,
            runtimeStep: 1,
            toolCount: 1,
            toolNames: ["searchExerciseResources"],
          },
          metadata: { plannerCallIndex: 1, runtimeStep: 1 },
        }),
        createStep({
          id: "request-2",
          type: "model_request",
          name: "LangChain 模型请求 #2",
          input: {
            messages: [{ role: "user", content: "再来一次" }],
            modelVisibleInputSnapshot,
            toolNames: ["searchExerciseResources"],
          },
          output: {
            modelCallIndex: 2,
            runtimeStep: 2,
            toolCount: 1,
            toolNames: ["searchExerciseResources"],
          },
          metadata: { plannerCallIndex: 2, runtimeStep: 2 },
        }),
        createStep({
          id: "tool-failed",
          type: "tool_call",
          name: "Tool 执行失败",
          output: {
            type: "tool_execution",
            step: 2,
            toolName: "searchExerciseResources",
            toolResultId: "tr_failed",
            failureCode: "repository_unavailable",
          },
          metadata: {
            runtimeStep: 2,
            plannerCallIndex: 2,
            toolName: "searchExerciseResources",
            toolResultId: "tr_failed",
          },
          status: "failed",
        }),
      ],
    };

    const payload = createTraceLogPayload(trace, groupTraceSteps(trace.steps));
    const reportText = JSON.stringify(payload.report);

    expect(Object.keys(payload.report).sort()).toEqual([
      "failureIndex",
      "fileManifest",
      "lookupGuide",
      "loopTimeline",
      "tokenUsageSummary",
      "traceSummary",
    ]);
    expect(reportText).not.toContain("modelVisibleInputSnapshot");
    expect(reportText).not.toContain(toolDescription);
    expect(reportText).not.toContain(schemaDescription);
    expect(reportText).not.toContain("fitmate_final_response");
    expect(payload.modelInputs).toHaveLength(2);
    expect(payload.modelInputs[0].toolCatalogRef).toBe(payload.modelInputs[1].toolCatalogRef);
    expect(payload.modelInputs[0].schemaRefs).toEqual(payload.modelInputs[1].schemaRefs);
    expect(payload.texts.filter((item) => item.refKind === "tool_catalog")).toHaveLength(1);
    expect(payload.texts.filter((item) => item.refKind === "tool_description")).toHaveLength(1);
    expect(payload.texts.filter((item) => item.refKind === "tool_schema")).toHaveLength(1);
    expect(payload.texts.filter((item) => item.refKind === "schema_description")).toHaveLength(1);
    expect(payload.texts.filter((item) => item.refKind === "finalization_schema")).toHaveLength(1);
    expect(payload.report.fileManifest).toMatchObject({
      files: {
        report: "codex_logs/ai_trace_log.js",
        events: "codex_logs/ai_trace_events.jsonl",
        modelInputs: "codex_logs/ai_trace_model_inputs.jsonl",
        texts: "codex_logs/ai_trace_texts.jsonl",
      },
      counts: {
        events: payload.events.length,
        modelInputs: 2,
        dedupedTexts: payload.texts.length,
      },
    });
    expect(resolveBundleRefs(payload)).toEqual([]);
    expect(payload.report.failureIndex).toMatchObject({
      loopNumber: 2,
      runtimeStep: 2,
      plannerCallIndex: 2,
      toolName: "searchExerciseResources",
      errorCode: "repository_unavailable",
      eventRef: "event_0003",
      modelInputRef: "model_input_0002",
      toolResultRef: "tr_failed",
    });
  });

  it("derives explicit visibility sections for LangChain tool execution outputs", () => {
    const sections = createToolExecutionVisibilitySections({
      toolName: "searchExerciseResources",
      modelVisibleSummary: "{\"candidateGroups\":[{\"exercises\":[\"俯卧撑\"]}]}",
      userProjection: { resourceType: "exercise_search_results" },
      traceSummary: { totalMatches: 8, returnedCount: 3, truncated: true },
      enteredModelContext: true,
    });

    expect(sections).toMatchObject([
      {
        field: "modelVisibleSummary",
        visibility: "llm_visible",
        modelVisible: true,
        label: "LLM 可见 / ToolMessage 内容",
        enteredModelContext: true,
        enteredModelContextMeaning: expect.stringContaining("仅表示 modelVisibleSummary"),
      },
      {
        field: "userProjection",
        visibility: "user_projection",
        modelVisible: false,
        label: "用户投影 / 前端投影",
      },
      {
        field: "traceSummary",
        visibility: "debug_only",
        modelVisible: false,
        label: "debug-only / 调试摘要",
        diagnosticFields: ["totalMatches", "returnedCount", "truncated"],
      },
    ]);
  });

  it("exports tool execution visibility metadata without moving debug diagnostics into model-visible summaries", () => {
    const modelVisibleSummary = JSON.stringify({
      candidateGroups: [
        { exercises: [{ exerciseId: "push-up", name: "俯卧撑" }] },
      ],
    });
    const trace: AiTrace = {
      id: "trace-tool-visibility",
      runId: "run-tool-visibility",
      route: "/api/chat",
      title: "Tool visibility trace",
      status: "success",
      createdAt: "2026-06-12T05:00:00.000Z",
      steps: [
        createStep({
          id: "runtime-summary",
          type: "runtime_event",
          name: "LangChain Agent Runtime 摘要",
          output: {
            traceSummary: {
              runtimeVersion: "langchain-agent-runtime-v1",
              model: "deepseek-v4-flash",
              toolNames: ["searchExerciseResources"],
              providerToolCalls: [
                { id: "call_search_1", name: "searchExerciseResources", argsSummary: { query: "胸部" } },
              ],
              modelCallCount: 1,
              toolCallCount: 1,
              messageCount: 3,
              durationMs: 90,
            },
            toolExecutions: [
              {
                sequence: 1,
                modelCallIndex: 1,
                runtimeStep: 1,
                toolCallId: "call_search_1",
                toolName: "searchExerciseResources",
                status: "succeeded",
                modelVisibleSummary,
                userProjection: {
                  resourceType: "exercise_search_results",
                  results: [{ exerciseId: "push-up", name: "俯卧撑" }],
                },
                traceSummary: {
                  totalMatches: 12,
                  returnedCount: 1,
                  truncated: true,
                },
                enteredModelContext: true,
              },
            ],
          },
          metadata: {
            pipeline: "langchain-agent-text-chat",
            boundary: "langchain_runtime",
          },
        }),
      ],
    };

    const payload = createTraceLogPayload(trace, groupTraceSteps(trace.steps));
    const report = payload.report as Record<string, unknown>;
    const traceSummary = report.traceSummary as Record<string, unknown>;
    const toolExecutionRefs = traceSummary.toolExecutionRefs as Array<Record<string, unknown>>;
    const detailRef = toolExecutionRefs[0];
    const detail = payload.details.find((item) => item.detailRef === detailRef.detailRef) as Record<string, unknown>;
    const toolExecution = detail.content as Record<string, unknown>;

    expect(toolExecution).toMatchObject({
      toolName: "searchExerciseResources",
      modelVisibleSummary,
      userProjection: expect.objectContaining({ resourceType: "exercise_search_results" }),
      traceSummary: { totalMatches: 12, returnedCount: 1, truncated: true },
      outputVisibility: {
        modelVisibleSummary: "llm_visible",
        userProjection: "user_projection",
        traceSummary: "debug_only",
      },
      candidateDiagnosticsVisibility: {
        fields: ["totalMatches", "returnedCount", "truncated"],
        visibility: "debug_only",
      },
    });
    expect(toolExecution).not.toHaveProperty("enteredModelContextMeaning");
    expect(JSON.stringify(toolExecution.modelVisibleSummary)).not.toContain("totalMatches");
    expect(JSON.stringify(toolExecution.modelVisibleSummary)).not.toContain("returnedCount");
    expect(JSON.stringify(toolExecution.modelVisibleSummary)).not.toContain("truncated");
    expect(detailRef).toMatchObject({
      kind: "tool_execution_detail",
      visibility: {
        modelVisibleSummary: "llm_visible",
        traceSummary: "debug_only",
      },
      summary: expect.objectContaining({
        outputVisibility: expect.objectContaining({
          traceSummary: "debug_only",
        }),
      }),
    });
    expect(detailRef).toMatchObject({
      visibility: expect.objectContaining({
        traceSummary: "debug_only",
      }),
    });
    expect(detail.content).toMatchObject({
      traceSummary: { totalMatches: 12, returnedCount: 1, truncated: true },
      outputVisibility: expect.objectContaining({
        traceSummary: "debug_only",
      }),
    });
  });

  it("keeps visibility metadata on contentRef headers when tool output sections are externalized", () => {
    const longModelVisibleSummary = `模型可见摘要 ${"只包含候选动作事实。".repeat(90)}`;
    const longTraceDiagnostic = `调试摘要 ${"totalMatches=12 returnedCount=3 truncated=true。".repeat(60)}`;

    const payload = extractTraceLogLongTexts({
      langChainToolExecutions: [
        {
          toolName: "searchExerciseResources",
          modelVisibleSummary: longModelVisibleSummary,
          traceSummary: {
            totalMatches: 12,
            returnedCount: 3,
            truncated: true,
            diagnostic: longTraceDiagnostic,
          },
        },
      ],
    }) as Record<string, unknown>;
    const toolExecutions = payload.langChainToolExecutions as Array<Record<string, unknown>>;
    const toolExecution = toolExecutions[0];
    const modelVisibleRef = toolExecution.modelVisibleSummary as Record<string, unknown>;
    const traceSummary = toolExecution.traceSummary as Record<string, unknown>;
    const traceDiagnosticRef = traceSummary.diagnostic as Record<string, unknown>;
    const longTextRefs = payload.longTextRefs as Array<Record<string, unknown>>;

    expect(modelVisibleRef).toMatchObject({
      contentRef: "text_0001",
      visibility: "llm_visible",
    });
    expect(traceDiagnosticRef).toMatchObject({
      contentRef: "text_0002",
      visibility: "debug_only",
    });
    expect(longTextRefs).toEqual([
      expect.objectContaining({
        contentRef: "text_0001",
        visibilityByPath: {
          "$.langChainToolExecutions[0].modelVisibleSummary": "llm_visible",
        },
      }),
      expect.objectContaining({
        contentRef: "text_0002",
        visibilityByPath: {
          "$.langChainToolExecutions[0].traceSummary.diagnostic": "debug_only",
        },
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
          toolNames: ["inspectVisibleTrainingProposals", "searchExerciseResources"],
          tools: [
            {
              name: "inspectVisibleTrainingProposals",
              version: "2026-06-04",
              description: "查询或读取最近的可见训练方案事实。",
            },
            {
              name: "searchExerciseResources",
              version: "2026-06-04",
              description: "查询动作资源，可使用 exerciseNames 匹配动作名称。",
            },
          ],
        },
      }),
    ]);

    expect(groups.find((group) => group.id === "registry_manifest")).toMatchObject({
      summary: expect.arrayContaining([
        { label: "tool count", value: "2" },
        { label: "tool names", value: "inspectVisibleTrainingProposals, searchExerciseResources" },
      ]),
    });
  });
});

function resolveBundleRefs(payload: ReturnType<typeof createTraceLogPayload>) {
  const eventRefs = new Set(payload.events.map((item) => item.eventRef));
  const modelInputRefs = new Set(payload.modelInputs.map((item) => item.modelInputRef));
  const detailRefs = new Set(payload.details.map((item) => item.detailRef));
  const contentRefs = new Set(payload.longTexts.map((item) => item.contentRef));
  const textRefs = new Set(payload.texts.map((item) => item.ref));
  const missing: string[] = [];

  visitRefs(payload.report, (key, value) => {
    if (key === "eventRef" && !eventRefs.has(value)) {
      missing.push(value);
    }
    if (key === "modelInputRef" && !modelInputRefs.has(value)) {
      missing.push(value);
    }
    if (key === "detailRef" && !detailRefs.has(value)) {
      missing.push(value);
    }
    if (key === "contentRef" && !contentRefs.has(value)) {
      missing.push(value);
    }
    if (key === "ref" && /^(schema|tool_catalog|system_prompt|finalization_schema)_/.test(value) && !textRefs.has(value)) {
      missing.push(value);
    }
  });

  for (const modelInput of payload.modelInputs) {
    for (const value of [
      modelInput.toolCatalogRef,
      modelInput.systemPromptRef,
      modelInput.finalizationToolRef,
      ...modelInput.schemaRefs,
    ]) {
      if (value && !textRefs.has(value)) {
        missing.push(value);
      }
    }
  }

  return missing;
}

function visitRefs(value: unknown, onRef: (key: string, value: string) => void) {
  if (Array.isArray(value)) {
    for (const item of value) {
      visitRefs(item, onRef);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string") {
      onRef(key, child);
    } else {
      visitRefs(child, onRef);
    }
  }
}

function createTraceLongTextEnvelope(contentType: string, content: string) {
  return {
    kind: "trace_long_text",
    contentType,
    originalLength: content.length,
    storedLength: content.length,
    chunkSize: content.length,
    hash: `fnv1a:testtrace-${contentType}-${content.length}`,
    preview: content.slice(0, 80),
    redacted: false,
    chunks: [
      {
        index: 0,
        start: 0,
        end: content.length,
        text: content,
      },
    ],
  };
}

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
