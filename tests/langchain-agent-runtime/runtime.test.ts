import { AIMessage, ToolMessage, fakeModel } from "langchain";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { agentRuntimeConfig } from "@/lib/server/config";
import {
  buildLangChainAgentSystemPrompt,
  defineLangChainToolWrapper,
  langChainFinalResponseToolName,
  reportAgentActivityLangChainTool,
  runLangChainAgentRuntime,
} from "@/lib/server/langchain-agent";

const echoTool = defineLangChainToolWrapper({
  name: "echoExerciseGoal",
  description: "把结构化训练目标回显为模型可见摘要，用于 runtime contract 测试。",
  inputSchema: z.object({
    goal: z.string().describe("用户明确表达的训练目标。"),
  }).strict(),
  handler: async (input) => ({
    status: "succeeded" as const,
    goal: input.goal,
  }),
  toModelVisibleSummary: (output) => ({
    status: output.status,
    goal: output.goal,
  }),
  toUserProjection: (output) => ({
    goal: output.goal,
  }),
});

const failingTool = defineLangChainToolWrapper({
  name: "failingExerciseTool",
  description: "稳定失败的测试工具，用于验证 wrapper 失败归一化。",
  inputSchema: z.object({
    goal: z.string(),
  }).strict(),
  handler: async () => {
    throw new Error("repository unavailable");
  },
  toModelVisibleSummary: () => "不会执行到这里。",
});

const sensitiveTool = defineLangChainToolWrapper({
  name: "sensitiveCredentialTool",
  description: "用于验证 schema repair payload 不回显敏感字段值的测试工具。",
  inputSchema: z.object({
    apiToken: z.string(),
  }).strict(),
  handler: async (input) => ({
    status: "succeeded" as const,
    tokenLength: input.apiToken.length,
  }),
  toModelVisibleSummary: (output) => output,
});

const baseInput = {
  messages: [{ role: "user" as const, content: "我今天想练胸。" }],
  actor: { userId: "user-1", conversationId: "conversation-1" },
};

function createFinalResponseToolCall(
  args: { content?: string; suggestedQuestions?: string[] },
  id = "call_final",
) {
  return {
    name: langChainFinalResponseToolName,
    args,
    id,
  };
}

function createFinalResponseMessage(
  args: { content?: string; suggestedQuestions?: string[] },
  options: { id?: string; usageMetadata?: { input_tokens: number; output_tokens: number; total_tokens: number } } = {},
) {
  return new AIMessage({
    content: "",
    tool_calls: [
      {
        ...createFinalResponseToolCall(args, options.id),
        type: "tool_call",
      },
    ],
    ...(options.usageMetadata
      ? {
          response_metadata: {
            token_usage: {
              prompt_tokens: options.usageMetadata.input_tokens,
              completion_tokens: options.usageMetadata.output_tokens,
              total_tokens: options.usageMetadata.total_tokens,
            },
          },
        }
      : {}),
  });
}

describe("LangChain Agent runtime", () => {
  it("returns a structured final response without business tools", async () => {
    const model = fakeModel().respondWithTools([
      createFinalResponseToolCall({
        content: "可以，今天先做低强度胸部训练。",
        suggestedQuestions: ["帮我安排 20 分钟训练"],
      }),
    ]);

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: [],
    });

    expect(result).toMatchObject({
      ok: true,
      finalText: "可以，今天先做低强度胸部训练。",
      suggestedQuestions: ["帮我安排 20 分钟训练"],
      toolExecutions: [],
    });
    expect(result.traceSummary?.runtimeVersion).toBe("langchain-agent-runtime-v1");
  });

  it("keeps final response on tool strategy even when the model advertises native structured output", async () => {
    const model = fakeModel().respondWithTools([
      createFinalResponseToolCall({
        content: "可以，今天先用自重动作热身。",
        suggestedQuestions: ["帮我安排 15 分钟自重训练"],
      }),
    ]);
    Object.defineProperty(model, "profile", {
      value: { structuredOutput: true },
      configurable: true,
    });
    const boundToolNames: string[] = [];
    const originalBindTools = model.bindTools.bind(model);
    vi.spyOn(model, "bindTools").mockImplementation((tools) => {
      boundToolNames.push(...tools.map((tool) => {
        const record = tool as { name?: unknown; function?: { name?: unknown } };
        const name = typeof record.name === "string" ? record.name : record.function?.name;

        return typeof name === "string" ? name : "unknown";
      }));

      return originalBindTools(tools);
    });

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: [],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.finalText).toBe("可以，今天先用自重动作热身。");
      expect(boundToolNames).toContain(langChainFinalResponseToolName);
    }
  });

  it("records one successful tool call before final text", async () => {
    const model = fakeModel()
      .respondWithTools([{ name: "echoExerciseGoal", args: { goal: "胸部训练" }, id: "call_1" }])
      .respondWithTools([createFinalResponseToolCall({ content: "已按胸部训练目标整理。" })]);

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: [echoTool],
    });

    expect(result.ok).toBe(true);
    expect(result.toolExecutions).toMatchObject([
      {
        toolCallId: "call_1",
        toolName: "echoExerciseGoal",
        status: "succeeded",
        enteredModelContext: true,
        userProjection: { goal: "胸部训练" },
      },
    ]);
    expect(result.traceSummary?.providerToolCalls).toEqual([
      {
        id: "call_1",
        name: "echoExerciseGoal",
        argsSummary: { goal: "胸部训练" },
        modelCallIndex: 1,
        runtimeStep: 1,
      },
    ]);
    expect(result.traceSummary?.modelCalls).toMatchObject([
      {
        modelCallIndex: 1,
        runtimeStep: 1,
        status: "success",
        providerToolCalls: [
          {
            id: "call_1",
            name: "echoExerciseGoal",
          },
        ],
      },
      {
        modelCallIndex: 2,
        runtimeStep: 2,
        status: "success",
        providerToolCalls: [],
      },
    ]);
    expect(result.toolExecutions).toMatchObject([
      {
        sequence: 1,
        modelCallIndex: 1,
        runtimeStep: 1,
      },
    ]);
  });

  it("streams model activity observer events without consuming business tool budget", async () => {
    const model = fakeModel()
      .respondWithTools([
        { name: "reportAgentActivity", args: { summary: "我先去动作库里确认可用动作", stepType: "query_resources" }, id: "call_activity_1" },
        { name: "echoExerciseGoal", args: { goal: "胸部训练" }, id: "call_1" },
      ])
      .respondWithTools([createFinalResponseToolCall({ content: "已按胸部训练目标整理。" })]);
    const runtimeEvents: unknown[] = [];

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: [reportAgentActivityLangChainTool, echoTool],
      onRuntimeEvent: (event) => {
        runtimeEvents.push(event);
      },
    });

    expect(result.ok).toBe(true);
    expect(result.toolExecutions).toMatchObject([
      {
        toolCallId: "call_activity_1",
        toolName: "reportAgentActivity",
        executionKind: "activity",
        status: "succeeded",
        userProjection: {
          activitySummary: "我先去动作库里确认可用动作",
          stepType: "query_resources",
        },
      },
      {
        toolCallId: "call_1",
        toolName: "echoExerciseGoal",
        executionKind: "business",
        status: "succeeded",
      },
    ]);
    expect(runtimeEvents).toEqual([
      expect.objectContaining({
        type: "model_call_started",
        loopTurn: 1,
        modelCallIndex: 1,
      }),
      expect.objectContaining({
        type: "model_activity_reported",
        summary: "我先去动作库里确认可用动作",
        stepType: "query_resources",
        toolCallId: "call_activity_1",
      }),
      expect.objectContaining({
        type: "model_call_started",
        loopTurn: 2,
        modelCallIndex: 2,
      }),
    ]);
  });

  it("records LangChain model token usage from provider response metadata", async () => {
    const model = fakeModel().respond(new AIMessage({
      content: "这条回复缺少结构化 final response。",
      usage_metadata: {
        input_tokens: 12,
        output_tokens: 4,
        total_tokens: 16,
      },
    }));

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: [],
    });

    expect(result.ok).toBe(false);
    expect(result.traceSummary?.modelCalls).toMatchObject([
      {
        modelCallIndex: 1,
        tokenUsage: {
          prompt_tokens: 12,
          completion_tokens: 4,
          total_tokens: 16,
        },
      },
    ]);
  });

  it("records multiple tool calls in one model turn", async () => {
    const model = fakeModel()
      .respondWithTools([
        { name: "echoExerciseGoal", args: { goal: "热身" }, id: "call_1" },
        { name: "echoExerciseGoal", args: { goal: "主训练" }, id: "call_2" },
      ])
      .respondWithTools([createFinalResponseToolCall({ content: "已整理热身和主训练。" })]);

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: [echoTool],
    });

    expect(result.ok).toBe(true);
    expect(result.toolExecutions.map((execution) => execution.toolCallId)).toEqual(["call_1", "call_2"]);
    expect(result.traceSummary?.toolCallCount).toBe(2);
  });

  it("blocks tool handler execution after the configured tool call budget is exhausted", async () => {
    const handler = vi.fn(async (input: { goal: string }) => ({
      status: "succeeded" as const,
      goal: input.goal,
    }));
    const budgetedTool = defineLangChainToolWrapper({
      name: "budgetedExerciseGoal",
      description: "用于验证 LangChain runtime 工具调用预算的测试工具。",
      inputSchema: z.object({
        goal: z.string(),
      }).strict(),
      handler,
      toModelVisibleSummary: (output) => ({
        status: output.status,
        goal: output.goal,
      }),
    });
    const requestedToolCalls = agentRuntimeConfig.langChain.runBudget.maxToolCalls + 1;
    const model = fakeModel()
      .respondWithTools(Array.from({ length: requestedToolCalls }, (_, index) => ({
        name: "budgetedExerciseGoal",
        args: { goal: `训练目标 ${index + 1}` },
        id: `call_budget_${index + 1}`,
      })))
      .respondWithTools([createFinalResponseToolCall({ content: "预算超限后不应作为成功结果。" })]);

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: [budgetedTool],
    });

    expect(result.ok).toBe(false);
    expect(handler).toHaveBeenCalledTimes(agentRuntimeConfig.langChain.runBudget.maxToolCalls);
    if (!result.ok) {
      expect(result.code).toBe("budget_exhausted");
      expect(result.toolExecutions).toHaveLength(requestedToolCalls);
      expect(result.traceSummary).toMatchObject({
        providerToolCalls: expect.arrayContaining([
          expect.objectContaining({
            id: "call_budget_1",
            modelCallIndex: 1,
            runtimeStep: 1,
          }),
        ]),
      });
      expect(result.traceSummary?.modelCallCount).toBeGreaterThanOrEqual(1);
      expect(result.toolExecutions.at(-1)).toMatchObject({
        toolName: "budgetedExerciseGoal",
        status: "failed",
        failureCode: "budget_exhausted",
        enteredModelContext: true,
      });
    }
  });

  it("normalizes unknown tool calls from LangChain tool messages", async () => {
    const model = fakeModel()
      .respondWithTools([{ name: "unknownExerciseTool", args: { goal: "胸部训练" }, id: "call_1" }])
      .respondWithTools([createFinalResponseToolCall({ content: "当前工具不可用。" })]);

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: [echoTool],
    });

    expect(result.ok).toBe(true);
    expect(result.toolExecutions).toMatchObject([
      {
        toolCallId: "call_1",
        toolName: "unknownExerciseTool",
        status: "failed",
        failureCode: "unknown_tool",
      },
    ]);
  });

  it("normalizes illegal tool arguments before domain side effects", async () => {
    const model = fakeModel()
      .respondWithTools([{ name: "echoExerciseGoal", args: {}, id: "call_1" }])
      .respondWithTools([createFinalResponseToolCall({ content: "工具参数需要修正。" })]);

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: [echoTool],
    });

    expect(result.ok).toBe(true);
    expect(result.toolExecutions).toMatchObject([
      {
        toolCallId: "call_1",
        toolName: "echoExerciseGoal",
        status: "failed",
        failureCode: "tool_schema_invalid",
        schemaIssues: [
          expect.objectContaining({
            path: "goal",
            code: "invalid_type",
            expected: "string",
          }),
        ],
      },
    ]);

    const failedToolMessage = result.messages
      .filter((message): message is ToolMessage => ToolMessage.isInstance(message))
      .find((message) => String(message.content).includes("tool_schema_invalid"));
    const modelVisibleFailure = JSON.parse(String(failedToolMessage?.content));

    expect(modelVisibleFailure).toMatchObject({
      status: "failed",
      code: "tool_schema_invalid",
      issues: [
        expect.objectContaining({
          path: "goal",
          code: "invalid_type",
          expected: "string",
        }),
      ],
    });
  });

  it("redacts sensitive actual values from schema repair payloads", async () => {
    const model = fakeModel()
      .respondWithTools([{ name: "sensitiveCredentialTool", args: { apiToken: 123456 }, id: "call_1" }])
      .respondWithTools([createFinalResponseToolCall({ content: "工具参数需要修正。" })]);

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: [sensitiveTool],
    });
    const failedToolMessage = result.messages
      .filter((message): message is ToolMessage => ToolMessage.isInstance(message))
      .find((message) => String(message.content).includes("tool_schema_invalid"));
    const modelVisibleFailure = JSON.parse(String(failedToolMessage?.content));

    expect(result.toolExecutions[0]).toMatchObject({
      status: "failed",
      failureCode: "tool_schema_invalid",
      schemaIssues: [
        expect.objectContaining({
          path: "apiToken",
          actual: "redacted",
        }),
      ],
    });
    expect(modelVisibleFailure.issues[0]).toMatchObject({
      path: "apiToken",
      actual: "redacted",
    });
  });

  it("returns wrapper failure summaries to the model context", async () => {
    const model = fakeModel()
      .respondWithTools([{ name: "failingExerciseTool", args: { goal: "胸部训练" }, id: "call_1" }])
      .respondWithTools([createFinalResponseToolCall({ content: "工具失败，建议稍后重试。" })]);

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: [failingTool],
    });

    expect(result.ok).toBe(true);
    expect(result.toolExecutions).toMatchObject([
      {
        toolCallId: "call_1",
        toolName: "failingExerciseTool",
        status: "failed",
        failureCode: "tool_handler_failed",
        failureMessage: "repository unavailable",
      },
    ]);
  });

  it("normalizes provider failures", async () => {
    const model = fakeModel().alwaysThrow(new Error("provider unavailable"));

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: [echoTool],
    });

    expect(result).toMatchObject({
      ok: false,
      code: "provider_error",
      retryable: true,
      message: "provider unavailable",
    });
    expect(result.traceSummary).toMatchObject({
      modelCallCount: 1,
      modelCalls: [
        expect.objectContaining({
          modelCallIndex: 1,
          status: "failed",
          failureCode: "provider_error",
          failureMessage: "provider unavailable",
        }),
      ],
    });
  });

  it("normalizes agent budget exhaustion", async () => {
    let model = fakeModel();
    for (const index of Array.from({ length: 20 }, (_, itemIndex) => itemIndex)) {
      model = model.respondWithTools([{
        name: "echoExerciseGoal",
        args: { goal: "胸部训练" },
        id: `call_${index + 1}`,
      }]);
    }

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: [echoTool],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("budget_exhausted");
      expect(result.traceSummary?.modelCallCount).toBeGreaterThan(0);
      expect(result.traceSummary?.modelCalls[0]).toMatchObject({
        modelCallIndex: 1,
        providerToolCalls: [
          expect.objectContaining({
            id: "call_1",
            modelCallIndex: 1,
            runtimeStep: 1,
          }),
        ],
      });
    }
  });

  it("rejects unstructured final assistant text as a structured output failure", async () => {
    const model = fakeModel().respond(new AIMessage("可以，今天先做低强度胸部训练。"));

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: [],
    });

    expect(result).toMatchObject({
      ok: false,
      code: "structured_output_validation_failed",
      retryable: true,
    });
  });
});

describe("LangChain Agent prompt", () => {
  it("describes native tool calling without old AgentAction contract terms", () => {
    const prompt = buildLangChainAgentSystemPrompt({ currentDate: "2026-06-11" });

    expect(prompt).toContain("DeepSeek native tool calling");
    expect(prompt).toContain("结构化终态工具");
    expect(prompt).toContain("reportAgentActivity");
    expect(prompt).toContain("活动摘要");
    expect(prompt).toContain("用户可见、可后续引用的一组训练动作");
    expect(prompt).toContain("正文 content 不能替代结构化训练结果");
    expect(prompt).toContain("suggestedQuestions");
    expect(prompt).toContain("不使用独立的 ---");
    expect(prompt).toContain("服务端负责认证、权限隔离、Zod 校验");
    expect(prompt).not.toContain("AgentAction");
    expect(prompt).not.toContain("ToolRegistry");
    expect(prompt).not.toContain("PlannerPort");
    expect(prompt).not.toContain("final_answer");
    expect(prompt).not.toContain("ask_user");
  });
});
