import { AIMessage, ToolMessage, fakeModel } from "langchain";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { agentRuntimeConfig } from "@/lib/server/config";
import {
  buildLangChainAgentSystemPrompt,
  defineLangChainToolWrapper,
  executeLangChainToolWrapper,
  getLangChainToolProviderInputSchema,
  langChainFinalResponseJsonSchema,
  langChainFinalResponseToolName,
  resolveLangChainGraphRecursionLimit,
  runLangChainAgentRuntime,
} from "@/lib/server/langchain-agent";

const echoTool = defineLangChainToolWrapper({
  name: "echoExerciseGoal",
  description: "把结构化训练目标回显为模型可见摘要，用于 runtime contract 测试。",
  inputSchema: z.object({
    goal: z.string().describe("用户明确表达的训练目标。"),
  }).strict(),
  runtimeActivity: {
    defaultSummary: "正在整理训练目标",
  },
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

class RepeatingUnknownToolModel extends BaseChatModel {
  private callIndex = 0;

  constructor() {
    super({});
  }

  _llmType() {
    return "repeating-unknown-tool-model";
  }

  _combineLLMOutput() {
    return [];
  }

  bindTools() {
    return this;
  }

  async _generate() {
    this.callIndex += 1;
    const message = new AIMessage({
      content: "",
      id: `model_${this.callIndex}`,
      tool_calls: [{
        name: "unknownExerciseTool",
        args: { goal: "胸部训练" },
        id: `call_unknown_${this.callIndex}`,
        type: "tool_call",
      }],
    });

    return {
      generations: [{
        text: "",
        message,
      }],
      llmOutput: {},
    };
  }
}

class RepeatingAvailableToolModel extends BaseChatModel {
  private callIndex = 0;
  private currentToolNames: readonly string[] = [];

  readonly boundToolNamesByCall: string[][] = [];

  constructor(private readonly repeatedToolName: string) {
    super({});
  }

  _llmType() {
    return "repeating-available-tool-model";
  }

  _combineLLMOutput() {
    return [];
  }

  bindTools(tools: unknown[]) {
    this.currentToolNames = tools
      .map((tool) => {
        const record = tool && typeof tool === "object" ? tool as { name?: unknown; function?: { name?: unknown } } : {};
        const name = typeof record.name === "string" ? record.name : record.function?.name;

        return typeof name === "string" ? name : undefined;
      })
      .filter((toolName): toolName is string => Boolean(toolName));
    this.boundToolNamesByCall.push([...this.currentToolNames]);

    return this;
  }

  async _generate() {
    this.callIndex += 1;

    if (this.currentToolNames.includes(this.repeatedToolName)) {
      const message = new AIMessage({
        content: "",
        id: `model_${this.callIndex}`,
        tool_calls: [{
          name: this.repeatedToolName,
          args: { goal: `训练目标 ${this.callIndex}` },
          id: `call_repeated_${this.callIndex}`,
          type: "tool_call",
        }],
      });

      return {
        generations: [{
          text: "",
          message,
        }],
        llmOutput: {},
      };
    }

    const message = createFinalResponseMessage({
      content: "同一个工具达到上限后已收口。",
    }, {
      id: `call_final_${this.callIndex}`,
    });

    return {
      generations: [{
        text: "",
        message,
      }],
      llmOutput: {},
    };
  }
}

class SequencedAvailableToolModel extends BaseChatModel {
  private callIndex = 0;
  private currentToolNames: readonly string[] = [];

  readonly boundToolNamesByCall: string[][] = [];

  constructor(private readonly toolCalls: Array<{ name: string; args: Record<string, unknown>; id: string }>) {
    super({});
  }

  _llmType() {
    return "sequenced-available-tool-model";
  }

  _combineLLMOutput() {
    return [];
  }

  bindTools(tools: unknown[]) {
    this.currentToolNames = tools
      .map((tool) => {
        const record = tool && typeof tool === "object" ? tool as { name?: unknown; function?: { name?: unknown } } : {};
        const name = typeof record.name === "string" ? record.name : record.function?.name;

        return typeof name === "string" ? name : undefined;
      })
      .filter((toolName): toolName is string => Boolean(toolName));
    this.boundToolNamesByCall.push([...this.currentToolNames]);

    return this;
  }

  async _generate() {
    this.callIndex += 1;
    const nextToolCall = this.toolCalls[this.callIndex - 1];

    if (nextToolCall && this.currentToolNames.includes(nextToolCall.name)) {
      const message = new AIMessage({
        content: "",
        id: `model_${this.callIndex}`,
        tool_calls: [{
          ...nextToolCall,
          type: "tool_call",
        }],
      });

      return {
        generations: [{
          text: "",
          message,
        }],
        llmOutput: {},
      };
    }

    const message = createFinalResponseMessage({
      content: nextToolCall
        ? `工具 ${nextToolCall.name} 当前不可用，已收口。`
        : "工具序列已完成。",
    }, {
      id: `call_final_${this.callIndex}`,
    });

    return {
      generations: [{
        text: "",
        message,
      }],
      llmOutput: {},
    };
  }
}

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
  it("injects runtimeMetadata into provider schema while keeping handler input business-only", async () => {
    const handler = vi.fn(async (input: { goal: string }) => ({
      status: "succeeded" as const,
      goal: input.goal,
    }));
    const wrapper = defineLangChainToolWrapper({
      name: "runtimeMetadataEcho",
      description: "用于验证 runtime metadata envelope 的测试业务工具。",
      inputSchema: z.object({
        goal: z.string().describe("用户明确表达的训练目标。"),
      }).strict(),
      runtimeActivity: {
        defaultSummary: "正在整理训练目标",
      },
      handler,
      toModelVisibleSummary: (output) => output,
      toUserProjection: (output) => output,
      toTraceSummary: (output) => output,
    });
    const providerSchemaDescriptions = JSON.stringify(z.toJSONSchema(getLangChainToolProviderInputSchema(wrapper)));
    const runtimeActivities: unknown[] = [];

    const result = await executeLangChainToolWrapper(
      wrapper,
      {
        goal: "核心训练",
        runtimeMetadata: {
          activitySummary: "正在整理核心训练目标",
        },
      },
      baseInput,
      {
        toolCallId: "call_runtime_metadata",
        onRuntimeActivity: (activity) => {
          runtimeActivities.push(activity);
        },
      },
    );

    expect(providerSchemaDescriptions).toContain("runtimeMetadata");
    expect(providerSchemaDescriptions).toContain("activitySummary");
    expect(providerSchemaDescriptions).toContain("当前业务 tool call 的用户可见 UI 状态短句");
    expect(handler).toHaveBeenCalledWith({ goal: "核心训练" }, baseInput);
    expect(JSON.stringify(handler.mock.calls[0][0])).not.toContain("runtimeMetadata");
    expect(runtimeActivities).toEqual([
      expect.objectContaining({
        toolName: "runtimeMetadataEcho",
        toolCallId: "call_runtime_metadata",
        activitySummary: "正在整理核心训练目标",
        source: "model",
      }),
    ]);
    expect(result.record).toMatchObject({
      status: "succeeded",
      inputSummary: { goal: "核心训练" },
      runtimeActivity: {
        activitySummary: "正在整理核心训练目标",
        source: "model",
      },
    });
    expect(JSON.stringify(result.record.modelVisibleSummary)).not.toContain("runtimeMetadata");
    expect(JSON.stringify(result.record.userProjection)).not.toContain("activitySummary");
    expect(JSON.stringify(result.record.traceSummary)).not.toContain("activitySummary");
  });

  it("falls back for missing or unsafe runtimeMetadata without blocking valid business input", async () => {
    const handler = vi.fn(async (input: { goal: string }) => ({
      status: "succeeded" as const,
      goal: input.goal,
    }));
    const wrapper = defineLangChainToolWrapper({
      name: "runtimeMetadataFallback",
      description: "用于验证 runtime metadata fallback 的测试业务工具。",
      inputSchema: z.object({
        goal: z.string(),
      }).strict(),
      runtimeActivity: {
        defaultSummary: "正在整理训练目标",
      },
      handler,
      toModelVisibleSummary: (output) => output,
    });
    const runtimeActivities: unknown[] = [];

    const result = await executeLangChainToolWrapper(
      wrapper,
      {
        goal: "胸部训练",
        runtimeMetadata: {
          activitySummary: "toolName=runtimeMetadataFallback 已完成",
        },
      },
      baseInput,
      {
        onRuntimeActivity: (activity) => {
          runtimeActivities.push(activity);
        },
      },
    );

    expect(result.record.status).toBe("succeeded");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(runtimeActivities).toEqual([
      expect.objectContaining({
        activitySummary: "正在整理训练目标",
        source: "tool_default",
        discardedSummaryReason: "internal_detail",
      }),
    ]);
    expect(result.record.runtimeActivity).toMatchObject({
      activitySummary: "正在整理训练目标",
      source: "tool_default",
      discardedSummaryReason: "internal_detail",
    });
  });

  it("keeps business schema failures independent from runtimeMetadata", async () => {
    const handler = vi.fn(async (input: { goal: string }) => ({
      status: "succeeded" as const,
      goal: input.goal,
    }));
    const wrapper = defineLangChainToolWrapper({
      name: "runtimeMetadataSchemaFailure",
      description: "用于验证 metadata 不放宽业务 schema 的测试业务工具。",
      inputSchema: z.object({
        goal: z.string(),
      }).strict(),
      runtimeActivity: {
        defaultSummary: "正在整理训练目标",
      },
      handler,
      toModelVisibleSummary: (output) => output,
    });

    const result = await executeLangChainToolWrapper(
      wrapper,
      {
        runtimeMetadata: {
          activitySummary: "正在整理训练目标",
        },
      },
      baseInput,
    );

    expect(result.record.status).toBe("failed");
    expect(result.record.failureCode).toBe("tool_schema_invalid");
    expect(handler).not.toHaveBeenCalled();
    expect(result.record.schemaIssues?.[0]?.path).toBe("goal");
    expect(JSON.stringify(result.record.inputSummary)).not.toContain("runtimeMetadata");
  });

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

  it("streams runtime activity metadata before handler without consuming extra tool budget", async () => {
    const executionOrder: string[] = [];
    const runtimeActivityTool = defineLangChainToolWrapper({
      name: "runtimeActivityExerciseGoal",
      description: "用于验证 runtime metadata 投影时序的测试业务工具。",
      inputSchema: z.object({
        goal: z.string(),
      }).strict(),
      runtimeActivity: {
        defaultSummary: "正在整理训练目标",
      },
      handler: async (input) => {
        executionOrder.push(`handler:${input.goal}`);
        return {
          status: "succeeded" as const,
          goal: input.goal,
        };
      },
      toModelVisibleSummary: (output) => ({
        status: output.status,
        goal: output.goal,
      }),
    });
    const model = fakeModel()
      .respondWithTools([
        {
          name: "runtimeActivityExerciseGoal",
          args: {
            goal: "胸部训练",
            runtimeMetadata: {
              activitySummary: "正在确认胸部训练目标",
            },
          },
          id: "call_1",
        },
      ])
      .respondWithTools([createFinalResponseToolCall({ content: "已按胸部训练目标整理。" })]);
    const runtimeEvents: unknown[] = [];

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: [runtimeActivityTool],
      onRuntimeEvent: (event) => {
        runtimeEvents.push(event);
        if (event.type === "runtime_activity_reported") {
          executionOrder.push(`activity:${event.activitySummary}`);
        }
      },
    });

    expect(result.ok).toBe(true);
    expect(result.toolExecutions).toMatchObject([
      {
        toolCallId: "call_1",
        toolName: "runtimeActivityExerciseGoal",
        executionKind: "business",
        status: "succeeded",
        inputSummary: {
          goal: "胸部训练",
        },
        runtimeActivity: {
          activitySummary: "正在确认胸部训练目标",
          source: "model",
        },
      },
    ]);
    expect(executionOrder).toEqual([
      "activity:正在确认胸部训练目标",
      "handler:胸部训练",
    ]);
    expect(runtimeEvents).toEqual([
      expect.objectContaining({
        type: "model_call_started",
        loopTurn: 1,
        modelCallIndex: 1,
      }),
      expect.objectContaining({
        type: "runtime_activity_reported",
        activitySummary: "正在确认胸部训练目标",
        source: "model",
        toolCallId: "call_1",
      }),
      expect.objectContaining({
        type: "model_call_started",
        loopTurn: 2,
        modelCallIndex: 2,
      }),
    ]);
    expect(result.traceSummary?.runtimeActivities).toEqual([
      expect.objectContaining({
        toolName: "runtimeActivityExerciseGoal",
        toolCallId: "call_1",
        activitySummary: "正在确认胸部训练目标",
      }),
    ]);
  });

  it("keeps graph recursion budget aligned for runtime metadata, business tools, and final response", async () => {
    const businessToolWrappers = Array.from({ length: agentRuntimeConfig.langChain.runBudget.maxToolCalls }, (_, index) => defineLangChainToolWrapper({
      name: `echoExerciseGoal${index + 1}`,
      description: "用于验证 LangChain runtime 图递归预算的测试工具。",
      inputSchema: z.object({
        goal: z.string(),
      }).strict(),
      runtimeActivity: {
        defaultSummary: "正在整理训练目标",
      },
      handler: async (input) => ({
        status: "succeeded" as const,
        goal: input.goal,
      }),
      toModelVisibleSummary: (output) => ({
        status: output.status,
        goal: output.goal,
      }),
    }));
    const businessToolCalls = businessToolWrappers.map((wrapper, index) => ({
      name: wrapper.name,
      args: {
        goal: `训练目标 ${index + 1}`,
        runtimeMetadata: {
          activitySummary: `正在整理第 ${index + 1} 个训练目标`,
        },
      },
      id: `call_business_${index + 1}`,
    }));
    const model = fakeModel()
      .respondWithTools(businessToolCalls)
      .respondWithTools([createFinalResponseToolCall({ content: "已基于全部工具事实完成回答。" })]);

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: businessToolWrappers,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.finalText).toBe("已基于全部工具事实完成回答。");
    }
    expect(result.traceSummary?.modelCallCount).toBe(2);
    expect(result.toolExecutions).toHaveLength(agentRuntimeConfig.langChain.runBudget.maxToolCalls);
    expect(result.toolExecutions[0]).toMatchObject({
      toolName: "echoExerciseGoal1",
      executionKind: "business",
      status: "succeeded",
      runtimeActivity: {
        activitySummary: "正在整理第 1 个训练目标",
      },
    });
    expect(result.traceSummary?.runtimeActivities).toHaveLength(agentRuntimeConfig.langChain.runBudget.maxToolCalls);
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

  it("returns duplicate input feedback without repeating a successful business handler", async () => {
    const handler = vi.fn(async (input: { goal: string }) => ({
      status: "succeeded" as const,
      goal: input.goal,
    }));
    const duplicateTool = defineLangChainToolWrapper({
      name: "duplicateExerciseGoal",
      description: "用于验证 runtime duplicate input 反馈的测试工具。",
      inputSchema: z.object({
        goal: z.string(),
      }).strict(),
      handler,
      toModelVisibleSummary: (output) => ({
        status: output.status,
        goal: output.goal,
      }),
    });
    const model = fakeModel()
      .respondWithTools([{ name: "duplicateExerciseGoal", args: { goal: "胸部训练" }, id: "call_duplicate_1" }])
      .respondWithTools([{ name: "duplicateExerciseGoal", args: { goal: "胸部训练" }, id: "call_duplicate_2" }])
      .respondWithTools([createFinalResponseToolCall({ content: "已基于第一次工具事实回答。" })]);

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: [duplicateTool],
    });

    expect(result.ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.toolExecutions).toMatchObject([
      {
        toolCallId: "call_duplicate_1",
        toolName: "duplicateExerciseGoal",
        status: "succeeded",
      },
      {
        toolCallId: "call_duplicate_2",
        toolName: "duplicateExerciseGoal",
        status: "duplicate_input",
        feedbackCode: "duplicate_tool_input",
        traceSummary: {
          status: "duplicate_input",
          code: "duplicate_tool_input",
        },
      },
    ]);
    const duplicateSummary = JSON.stringify(result.toolExecutions[1]);
    expect(duplicateSummary).not.toContain("duplicate_tool_success");
    expect(duplicateSummary).not.toContain("duplicate-success");
    expect(duplicateSummary).not.toContain("satisfied");
    expect(result.traceSummary?.modelCallCount).toBeLessThan(agentRuntimeConfig.langChain.runBudget.maxModelCalls);
  });

  it("allows ok=true empty facts to support an ordinary final text response", async () => {
    const emptyFactsTool = defineLangChainToolWrapper({
      name: "emptyExerciseFacts",
      description: "用于验证空事实仍可作为普通文本解释材料的测试工具。",
      inputSchema: z.object({
        query: z.string(),
      }).strict(),
      handler: async (input) => ({
        status: "succeeded" as const,
        query: input.query,
        totalMatches: 0,
        facts: [],
      }),
      toModelVisibleSummary: (output) => ({
        status: output.status,
        factLevel: "query_facts",
        query: output.query,
        totalMatches: output.totalMatches,
        facts: output.facts,
      }),
    });
    const model = fakeModel()
      .respondWithTools([{ name: "emptyExerciseFacts", args: { query: "铅球动作" }, id: "call_empty_1" }])
      .respondWithTools([createFinalResponseToolCall({ content: "当前动作库没有匹配铅球动作。" })]);

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: [emptyFactsTool],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.finalText).toBe("当前动作库没有匹配铅球动作。");
    }
    expect(result.toolExecutions).toMatchObject([
      {
        toolName: "emptyExerciseFacts",
        status: "succeeded",
        traceSummary: {
          status: "succeeded",
          totalMatches: 0,
        },
      },
    ]);
  });

  it("terminates the main agent loop on the third consecutive call to the same business tool", async () => {
    const handler = vi.fn(async (input: { goal: string }) => ({
      status: "succeeded" as const,
      goal: input.goal,
    }));
    const limitedTool = defineLangChainToolWrapper({
      name: "limitedExerciseGoal",
      description: "用于验证单个业务 tool 独立调用上限的测试工具。",
      inputSchema: z.object({
        goal: z.string(),
      }).strict(),
      handler,
      toModelVisibleSummary: (output) => ({
        status: output.status,
        goal: output.goal,
      }),
    });
    const requestedToolCalls = agentRuntimeConfig.langChain.runBudget.maxToolCallsPerTool + 1;
    const model = fakeModel()
      .respondWithTools(Array.from({ length: requestedToolCalls }, (_, index) => ({
        name: "limitedExerciseGoal",
        args: { goal: `训练目标 ${index + 1}` },
        id: `call_limited_${index + 1}`,
      })))
      .respondWithTools([createFinalResponseToolCall({ content: "已停止重复调用同一个工具。" })]);

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: [limitedTool],
    });

    expect(result.ok).toBe(false);
    expect(handler).toHaveBeenCalledTimes(agentRuntimeConfig.langChain.runBudget.maxToolCallsPerTool);
    expect(result.toolExecutions.filter((execution) => execution.toolName === "limitedExerciseGoal")).toHaveLength(
      requestedToolCalls,
    );
    if (!result.ok) {
      expect(result.code).toBe("tool_handler_failed");
      expect(result.message).toContain("consecutive business tool calls exceeded");
      expect(result.traceSummary?.modelCallCount).toBe(1);
    }
    const blockedExecution = result.toolExecutions.find((execution) => execution.toolCallId === "call_limited_3");
    expect(blockedExecution).toMatchObject({
      toolCallId: "call_limited_3",
      toolName: "limitedExerciseGoal",
      status: "failed",
      failureCode: "tool_handler_failed",
      enteredModelContext: true,
    });
    expect(blockedExecution?.modelVisibleSummary).toContain("tool_consecutive_call_limit_exceeded");
    expect(blockedExecution?.modelVisibleSummary).toContain("终止当前主 Agent loop");
  });

  it("removes a consecutively exhausted business tool from the next provider request", async () => {
    const handler = vi.fn(async (input: { goal: string }) => ({
      status: "succeeded" as const,
      goal: input.goal,
    }));
    const limitedTool = defineLangChainToolWrapper({
      name: "limitedExerciseGoal",
      description: "用于验证单个业务 tool 达到上限后不再暴露给后续模型请求。",
      inputSchema: z.object({
        goal: z.string(),
      }).strict(),
      handler,
      toModelVisibleSummary: (output) => ({
        status: output.status,
        goal: output.goal,
      }),
    });
    const model = new RepeatingAvailableToolModel("limitedExerciseGoal");

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: [limitedTool],
    });

    expect(result.ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(agentRuntimeConfig.langChain.runBudget.maxToolCallsPerTool);
    expect(model.boundToolNamesByCall).toHaveLength(agentRuntimeConfig.langChain.runBudget.maxToolCallsPerTool + 1);
    expect(model.boundToolNamesByCall[0]).toContain("limitedExerciseGoal");
    expect(model.boundToolNamesByCall[1]).toContain("limitedExerciseGoal");
    expect(model.boundToolNamesByCall[2]).not.toContain("limitedExerciseGoal");
    expect(result.traceSummary?.providerToolCalls.filter((toolCall) => toolCall.name === "limitedExerciseGoal")).toHaveLength(
      agentRuntimeConfig.langChain.runBudget.maxToolCallsPerTool,
    );
    expect(result.toolExecutions.filter((execution) => execution.toolName === "limitedExerciseGoal")).toHaveLength(
      agentRuntimeConfig.langChain.runBudget.maxToolCallsPerTool,
    );
    if (result.ok) {
      expect(result.finalText).toBe("同一个工具达到上限后已收口。");
    }
  });

  it("allows a business tool again after another business tool interrupts the consecutive sequence before limit failure", async () => {
    const firstHandler = vi.fn(async (input: { goal: string }) => ({
      status: "succeeded" as const,
      goal: input.goal,
    }));
    const secondHandler = vi.fn(async (input: { goal: string }) => ({
      status: "succeeded" as const,
      goal: input.goal,
    }));
    const firstTool = defineLangChainToolWrapper({
      name: "primaryExerciseSearch",
      description: "用于验证连续业务 tool 限制中第一个业务能力的测试工具。",
      inputSchema: z.object({
        goal: z.string(),
      }).strict(),
      handler: firstHandler,
      toModelVisibleSummary: (output) => ({
        status: output.status,
        goal: output.goal,
      }),
    });
    const secondTool = defineLangChainToolWrapper({
      name: "secondaryExerciseResolver",
      description: "用于验证连续业务 tool 限制中打断连续序列的测试工具。",
      inputSchema: z.object({
        goal: z.string(),
      }).strict(),
      handler: secondHandler,
      toModelVisibleSummary: (output) => ({
        status: output.status,
        goal: output.goal,
      }),
    });
    const model = new SequencedAvailableToolModel([
      { name: "primaryExerciseSearch", args: { goal: "初次查询" }, id: "call_primary_1" },
      { name: "primaryExerciseSearch", args: { goal: "补充查询" }, id: "call_primary_2" },
      { name: "secondaryExerciseResolver", args: { goal: "解析候选" }, id: "call_secondary_1" },
      { name: "primaryExerciseSearch", args: { goal: "回访查询" }, id: "call_primary_3" },
    ]);

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: [firstTool, secondTool],
    });

    expect(result.ok).toBe(true);
    expect(firstHandler).toHaveBeenCalledTimes(3);
    expect(secondHandler).toHaveBeenCalledTimes(1);
    expect(model.boundToolNamesByCall[2]).not.toContain("primaryExerciseSearch");
    expect(model.boundToolNamesByCall[2]).toContain("secondaryExerciseResolver");
    expect(model.boundToolNamesByCall[3]).toContain("primaryExerciseSearch");
    expect(result.toolExecutions.filter((execution) => execution.toolName === "primaryExerciseSearch")).toHaveLength(3);
    expect(result.toolExecutions.every((execution) => execution.status === "succeeded")).toBe(true);
  });

  it("does not let another business tool recover the loop after consecutive limit failure", async () => {
    const firstHandler = vi.fn(async (input: { goal: string }) => ({
      status: "succeeded" as const,
      goal: input.goal,
    }));
    const secondHandler = vi.fn(async (input: { goal: string }) => ({
      status: "succeeded" as const,
      goal: input.goal,
    }));
    const firstTool = defineLangChainToolWrapper({
      name: "terminalPrimaryExerciseLookup",
      description: "用于验证连续超限后主循环终止的第一个测试业务工具。",
      inputSchema: z.object({
        goal: z.string(),
      }).strict(),
      handler: firstHandler,
      toModelVisibleSummary: (output) => ({
        status: output.status,
        goal: output.goal,
      }),
    });
    const secondTool = defineLangChainToolWrapper({
      name: "terminalSecondaryExerciseLookup",
      description: "用于验证连续超限后不会被继续调用的第二个测试业务工具。",
      inputSchema: z.object({
        goal: z.string(),
      }).strict(),
      handler: secondHandler,
      toModelVisibleSummary: (output) => ({
        status: output.status,
        goal: output.goal,
      }),
    });
    const model = fakeModel()
      .respondWithTools([
        { name: "terminalPrimaryExerciseLookup", args: { goal: "第一次查询" }, id: "call_terminal_primary_1" },
        { name: "terminalPrimaryExerciseLookup", args: { goal: "第二次查询" }, id: "call_terminal_primary_2" },
        { name: "terminalPrimaryExerciseLookup", args: { goal: "第三次查询" }, id: "call_terminal_primary_3" },
      ])
      .respondWithTools([
        { name: "terminalSecondaryExerciseLookup", args: { goal: "尝试恢复循环" }, id: "call_terminal_secondary_1" },
      ])
      .respondWithTools([createFinalResponseToolCall({ content: "不应该执行到这里。" })]);

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: [firstTool, secondTool],
    });

    expect(result.ok).toBe(false);
    expect(firstHandler).toHaveBeenCalledTimes(agentRuntimeConfig.langChain.runBudget.maxToolCallsPerTool);
    expect(secondHandler).not.toHaveBeenCalled();
    expect(result.toolExecutions.map((execution) => execution.toolName)).toEqual([
      "terminalPrimaryExerciseLookup",
      "terminalPrimaryExerciseLookup",
      "terminalPrimaryExerciseLookup",
    ]);
    if (!result.ok) {
      expect(result.code).toBe("tool_handler_failed");
      expect(result.traceSummary?.providerToolCalls.map((toolCall) => toolCall.name)).toEqual([
        "terminalPrimaryExerciseLookup",
        "terminalPrimaryExerciseLookup",
        "terminalPrimaryExerciseLookup",
      ]);
    }
  });

  it("keeps a business tool consecutively exhausted when only runtimeMetadata changes", async () => {
    const handler = vi.fn(async (input: { goal: string }) => ({
      status: "succeeded" as const,
      goal: input.goal,
    }));
    const limitedTool = defineLangChainToolWrapper({
      name: "activityBypassExerciseSearch",
      description: "用于验证 runtime metadata 不打断业务 tool 连续限制的测试工具。",
      inputSchema: z.object({
        goal: z.string(),
      }).strict(),
      runtimeActivity: {
        defaultSummary: "正在查询动作库",
      },
      handler,
      toModelVisibleSummary: (output) => ({
        status: output.status,
        goal: output.goal,
      }),
    });
    const model = fakeModel()
      .respondWithTools([{ name: "activityBypassExerciseSearch", args: { goal: "第一次查询", runtimeMetadata: { activitySummary: "正在查询第一组动作" } }, id: "call_search_1" }])
      .respondWithTools([{ name: "activityBypassExerciseSearch", args: { goal: "第二次查询", runtimeMetadata: { activitySummary: "正在查询第二组动作" } }, id: "call_search_2" }])
      .respondWithTools([{ name: "activityBypassExerciseSearch", args: { goal: "第三次查询", runtimeMetadata: { activitySummary: "正在查询第三组动作" } }, id: "call_search_3" }])
      .respondWithTools([createFinalResponseToolCall({ content: "已停止连续重复查询。" })]);

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: [limitedTool],
    });

    expect(result.ok).toBe(false);
    expect(handler).toHaveBeenCalledTimes(agentRuntimeConfig.langChain.runBudget.maxToolCallsPerTool);
    expect(result.toolExecutions).toMatchObject([
      {
        toolCallId: "call_search_1",
        toolName: "activityBypassExerciseSearch",
        status: "succeeded",
      },
      {
        toolCallId: "call_search_2",
        toolName: "activityBypassExerciseSearch",
        status: "succeeded",
      },
      {
        toolCallId: "call_search_3",
        toolName: "activityBypassExerciseSearch",
        status: "failed",
        failureCode: "tool_handler_failed",
      },
    ]);
    if (!result.ok) {
      expect(result.code).toBe("tool_handler_failed");
      expect(result.traceSummary?.modelCallCount).toBe(3);
    }
    expect(result.toolExecutions[2].modelVisibleSummary).toContain("tool_consecutive_call_limit_exceeded");
  });

  it("keeps duplicate input feedback from bypassing the terminal consecutive limit", async () => {
    const handler = vi.fn(async (input: { goal: string }) => ({
      status: "succeeded" as const,
      goal: input.goal,
    }));
    const duplicateLimitedTool = defineLangChainToolWrapper({
      name: "duplicateLimitedExerciseGoal",
      description: "用于验证 duplicate input 与连续限制组合边界的测试业务工具。",
      inputSchema: z.object({
        goal: z.string(),
      }).strict(),
      handler,
      toModelVisibleSummary: (output) => ({
        status: output.status,
        goal: output.goal,
      }),
    });
    const model = fakeModel()
      .respondWithTools([{ name: "duplicateLimitedExerciseGoal", args: { goal: "胸部训练" }, id: "call_duplicate_limited_1" }])
      .respondWithTools([{ name: "duplicateLimitedExerciseGoal", args: { goal: "胸部训练" }, id: "call_duplicate_limited_2" }])
      .respondWithTools([{ name: "duplicateLimitedExerciseGoal", args: { goal: "背部训练" }, id: "call_duplicate_limited_3" }])
      .respondWithTools([createFinalResponseToolCall({ content: "不应该执行到这里。" })]);

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: [duplicateLimitedTool],
    });

    expect(result.ok).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.toolExecutions).toMatchObject([
      {
        toolCallId: "call_duplicate_limited_1",
        status: "succeeded",
      },
      {
        toolCallId: "call_duplicate_limited_2",
        status: "duplicate_input",
        feedbackCode: "duplicate_tool_input",
      },
      {
        toolCallId: "call_duplicate_limited_3",
        status: "failed",
        failureCode: "tool_handler_failed",
      },
    ]);
    if (!result.ok) {
      expect(result.code).toBe("tool_handler_failed");
    }
  });

  it("blocks tool handler execution after the configured total business tool call budget is exhausted", async () => {
    const handler = vi.fn(async (input: { goal: string }) => ({
      status: "succeeded" as const,
      goal: input.goal,
    }));
    const requestedToolCalls = agentRuntimeConfig.langChain.runBudget.maxToolCalls + 1;
    const budgetedTools = Array.from({ length: requestedToolCalls }, (_, index) => defineLangChainToolWrapper({
      name: `budgetedExerciseGoal${index + 1}`,
      description: "用于验证 LangChain runtime 工具调用总预算的测试工具。",
      inputSchema: z.object({
        goal: z.string(),
      }).strict(),
      handler,
      toModelVisibleSummary: (output) => ({
        status: output.status,
        goal: output.goal,
      }),
    }));
    const model = fakeModel()
      .respondWithTools(Array.from({ length: requestedToolCalls }, (_, index) => ({
        name: `budgetedExerciseGoal${index + 1}`,
        args: { goal: `训练目标 ${index + 1}` },
        id: `call_budget_${index + 1}`,
      })))
      .respondWithTools([createFinalResponseToolCall({ content: "预算超限后不应作为成功结果。" })]);

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: budgetedTools,
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
      const budgetExecution = result.toolExecutions.find((execution) => execution.toolCallId === `call_budget_${requestedToolCalls}`);
      expect(budgetExecution).toMatchObject({
        toolName: `budgetedExerciseGoal${requestedToolCalls}`,
        status: "failed",
        failureCode: "budget_exhausted",
        enteredModelContext: true,
      });
    }
  });

    it("derives LangChain recursion limit from the model call budget", () => {
      expect(resolveLangChainGraphRecursionLimit(agentRuntimeConfig.langChain.runBudget)).toBe(
        agentRuntimeConfig.langChain.runBudget.maxModelCalls * 3,
      );
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
    const requestedToolCalls = agentRuntimeConfig.langChain.runBudget.maxToolCalls + 1;
    const budgetedTools = Array.from({ length: requestedToolCalls }, (_, index) => defineLangChainToolWrapper({
      name: `budgetNormalizationTool${index + 1}`,
      description: "用于验证预算耗尽归一化的测试工具。",
      inputSchema: z.object({
        goal: z.string(),
      }).strict(),
      handler: async (input) => ({
        status: "succeeded" as const,
        goal: input.goal,
      }),
      toModelVisibleSummary: (output) => ({
        status: output.status,
        goal: output.goal,
      }),
    }));
    const model = fakeModel()
      .respondWithTools(budgetedTools.map((wrapper, index) => ({
        name: wrapper.name,
        args: { goal: "胸部训练" },
        id: `call_${index + 1}`,
      })))
      .respondWithTools([createFinalResponseToolCall({ content: "预算超限后不应作为成功结果。" })]);

    const result = await runLangChainAgentRuntime({
      ...baseInput,
      model,
      toolWrappers: budgetedTools,
	    });

	    expect(result.ok).toBe(false);
	    if (!result.ok) {
	      expect(result.code).toBe("budget_exhausted");
	      expect(result.traceSummary?.modelCallCount).toBeGreaterThan(0);
	      expect(result.traceSummary?.modelCalls[0]).toMatchObject({
	        modelCallIndex: 1,
	        providerToolCalls: expect.arrayContaining([
	          expect.objectContaining({
	            id: "call_1",
	            modelCallIndex: 1,
	            runtimeStep: 1,
	          }),
	        ]),
	      });
	    }
	  });

	  it("stops before provider calls exceed the configured model call budget", async () => {
	    const model = new RepeatingUnknownToolModel();

	    const result = await runLangChainAgentRuntime({
	      ...baseInput,
	      model,
	      toolWrappers: [echoTool],
	    });

	    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("budget_exhausted");
      expect(result.message).toContain("model call budget exhausted");
      expect(result.traceSummary?.modelCallCount).toBe(agentRuntimeConfig.langChain.runBudget.maxModelCalls);
      expect(result.traceSummary?.toolCallCount).toBe(0);
      expect(result.traceSummary?.providerToolCalls).toHaveLength(agentRuntimeConfig.langChain.runBudget.maxModelCalls);
      expect(result.traceSummary?.modelCalls.at(-1)).toMatchObject({
        modelCallIndex: agentRuntimeConfig.langChain.runBudget.maxModelCalls,
        status: "success",
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
    expect(prompt).toContain("runtimeMetadata.activitySummary");
    expect(prompt).toContain("活动摘要");
    expect(prompt).toContain(`本轮最多 ${agentRuntimeConfig.langChain.runBudget.maxToolCalls} 次业务工具调用`);
    expect(prompt).toContain(`同一个业务工具最多连续调用 ${agentRuntimeConfig.langChain.runBudget.maxToolCallsPerTool} 次`);
    expect(prompt).toContain("runtimeMetadata.activitySummary 不计入业务工具调用预算");
    expect(prompt).toContain("不打断业务工具连续调用计数");
    expect(prompt).toContain("保守默认继续");
    expect(prompt).toContain("追问一个最影响结果质量的关键问题");
    expect(prompt).toContain("只补齐完成当前任务所需的最小边界");
    expect(prompt).toContain("在正文中说明默认口径");
    expect(prompt).toContain("代表性覆盖理解");
    expect(prompt).toContain("每个细分肌群");
    expect(prompt).toContain("目标肌群动作推荐、训练动作筛选或结构化训练结果候选");
    expect(prompt).toContain("默认把请求肌群理解为主练目标");
    expect(prompt).toContain("不要把只作为辅助参与该肌群的动作当作同等优先的目标肌群推荐候选");
    expect(prompt).toContain("查询肌群参与、动作会带到哪些肌群、辅助刺激、稳定参与或宽泛相关动作");
    expect(prompt).toContain("主练或辅助任意参与口径");
    expect(prompt).toContain("返回的是参与候选，不代表每个候选都适合作为目标肌群主练推荐");
    expect(prompt).toContain("普通训练知识、动作教学、注意事项、热身或拉伸方法、动作原理或差异解释");
    expect(prompt).toContain("工具返回的候选列表是可选择的候选池");
    expect(prompt).toContain("当前可见事实中是否已有可选子集能满足用户目标");
    expect(prompt).toContain("不要因为仍可能存在更多匹配、候选被截断、部分候选不适合或想查看更多而继续调用同类查询工具");
    expect(prompt).toContain("不要为了移除未选候选、让候选池完全纯净或追求更理想列表而重复调用同类查询工具");
    expect(prompt).toContain("可见候选事实已经足够");
    expect(prompt).toContain("下一步应进入结构化训练收口");
    expect(prompt).toContain("不足以支撑任何可选子集");
    expect(prompt).toContain("最终回答准备向用户呈现一个或多个具体数据库动作条目");
    expect(prompt).toContain("当前模型可见工具事实或已验证业务事实支撑");
    expect(prompt).toContain("动作推荐卡片、单次训练 routine 和多天训练 plan");
    expect(prompt).toContain("具体结构形态、字段要求和边界");
    expect(prompt).toContain("结构化训练收口工具");
    expect(prompt).toContain("正文 content 不能替代结构化训练结果");
    expect(prompt).toContain("content 只负责解释已通过结构化训练结果承载的推荐理由");
    expect(prompt).toContain("不要把未经校验的动作、处方、日程事实只写在正文里");
    expect(prompt).toContain("决策示例");
    expect(prompt).toContain("不是用户话术匹配规则");
    expect(prompt).toContain("示例 1：只交付动作推荐集合");
    expect(prompt).toContain("payload.kind=exercise_selection");
    expect(prompt).toContain("exerciseItems[].section 全部是 training");
    expect(prompt).toContain("不填写 prescription，不填写 schedule");
    expect(prompt).toContain("示例 2：交付一次可执行训练");
    expect(prompt).toContain("payload.kind=routine");
    expect(prompt).toContain("每个 exerciseItems[] 必须填写 prescription");
    expect(prompt).toContain("示例 3：交付多天或周期训练计划");
    expect(prompt).toContain("payload.kind=plan");
    expect(prompt).toContain("必须填写 schedule");
    expect(prompt).toContain("示例 4：只回答训练知识或动作要点");
    expect(prompt).toContain("不需要展示具体数据库动作条目时");
    expect(prompt).toContain("不调用 searchExerciseResources");
    expect(prompt).toContain("不调用 submitVisibleTrainingProposal");
    expect(prompt).not.toContain("提交为 exercise_selection");
    expect(prompt).toContain("suggestedQuestions");
    expect(prompt).toContain("适合聊天正文的 Markdown 子集");
    expect(prompt).toContain("emoji、段落、短标题、编号列表、项目列表、加粗、斜体和行内代码");
    expect(prompt).toContain("emoji 可以正常使用");
    expect(prompt).toContain("raw HTML、Markdown 水平分割线、删除线、表格、脚注、任务清单、代码块和一级大标题");
    expect(prompt).toContain("禁止使用 Markdown 水平分割线或装饰性分隔行");
    expect(prompt).toContain("单独一行的 ---、***、___、<hr>");
    expect(prompt).toContain("数字范围使用 8-12、8 到 12 或 8 至 12");
    expect(prompt).toContain("不要使用 ~ 表达范围");
    expect(prompt).toContain("服务端负责认证、权限隔离、Zod 校验");
    expect(prompt).toContain("不要把未经校验的模型想象当作数据库动作事实或处方参数");
    expect(prompt).not.toContain("禁止 emoji");
    expect(prompt).not.toContain("当用户说");
    expect(prompt).not.toContain("toolName =");
    expect(prompt).not.toContain("字段组合");
    expect(prompt).not.toContain("reportAgentActivity");
    expect(prompt).not.toContain("maxActivityReports");
    expect(prompt).not.toContain("AgentAction");
    expect(prompt).not.toContain("ToolRegistry");
    expect(prompt).not.toContain("PlannerPort");
    expect(prompt).not.toContain("final_answer");
    expect(prompt).not.toContain("ask_user");
    expect(prompt).not.toContain(`本轮最多 ${agentRuntimeConfig.langChain.runBudget.maxToolCalls} 次工具调用`);
  });

  it("keeps final response content schema aligned with the chat markdown subset contract", () => {
    const contentProperty = langChainFinalResponseJsonSchema.properties?.content as { description?: string };

    expect(contentProperty.description).toContain("适合聊天正文的 Markdown 子集");
    expect(contentProperty.description).toContain("emoji、段落、短标题、编号列表、项目列表、加粗、斜体和行内代码");
    expect(contentProperty.description).toContain("emoji 可以正常使用");
    expect(contentProperty.description).toContain("raw HTML、Markdown 水平分割线、删除线、表格、脚注、任务清单、代码块和一级大标题");
    expect(contentProperty.description).toContain("禁止使用 Markdown 水平分割线或装饰性分隔行");
    expect(contentProperty.description).toContain("单独一行的 ---、***、___、<hr>");
    expect(contentProperty.description).toContain("数字范围使用 8-12、8 到 12 或 8 至 12");
    expect(contentProperty.description).toContain("不要使用 ~ 表达范围");
  });
});
