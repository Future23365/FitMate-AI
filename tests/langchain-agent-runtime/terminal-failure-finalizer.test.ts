import { describe, expect, it, vi } from "vitest";

import {
  buildLangChainTerminalFailureFinalizerInput,
  buildLangChainTerminalFailureFinalizerSystemPrompt,
  runLangChainTerminalFailureFinalizer,
  type LangChainAgentRunFailure,
} from "@/lib/server/langchain-agent";

const baseFailure: LangChainAgentRunFailure = {
  ok: false,
  code: "budget_exhausted",
  message: "Recursion limit of 10 reached without hitting a stop condition.",
  retryable: true,
  messages: [],
  toolExecutions: [
    {
      toolName: "submitVisibleTrainingProposal",
      status: "failed",
      failureCode: "tool_schema_invalid",
      failureMessage: "工具参数未通过服务端 schema 校验。",
      schemaIssues: [
        {
          path: "payload.exerciseItems.0.prescription",
          code: "invalid_type",
          message: "Required",
          expected: "object",
          received: "undefined",
        },
      ],
      inputSummary: {
        payload: {
          secretRawPayload: "不应进入 finalizer 输入",
        },
      },
      enteredModelContext: true,
    },
  ],
  traceSummary: {
    runtimeVersion: "langchain-agent-runtime-v1",
    model: "deepseek-v4-flash",
    toolNames: ["submitVisibleTrainingProposal"],
    modelRequestSummary: {
      inputMessageCount: 1,
      inputMessagePreviews: [{ role: "user", contentPreview: "我想增肌" }],
      toolCount: 1,
    },
    modelResponseSummary: {
      generatedMessageCount: 1,
      assistantMessageCount: 1,
      toolMessageCount: 0,
    },
    modelCalls: [],
    providerToolCalls: [],
    modelCallCount: 5,
    toolCallCount: 6,
    messageCount: 11,
    durationMs: 16070,
  },
};

describe("LangChain terminal failure finalizer", () => {
  it("builds a redacted failure input from stable LangChain runtime facts", () => {
    const input = buildLangChainTerminalFailureFinalizerInput({
      result: baseFailure,
      failureCategory: "budget_exhausted",
      userRequestSummary: "我想增肌，每周 3 练。",
    });
    const serialized = JSON.stringify(input);

    expect(input).toMatchObject({
      failureCategory: "budget_exhausted",
      errorCode: "budget_exhausted",
      allowedResponseMode: "failure_explanation_only",
      failedToolExecutions: [
        {
          toolName: "submitVisibleTrainingProposal",
          failureCode: "tool_schema_invalid",
          schemaIssues: [
            expect.objectContaining({
              path: "payload.exerciseItems.0.prescription",
              code: "invalid_type",
            }),
          ],
        },
      ],
    });
    expect(serialized).not.toContain("secretRawPayload");
    expect(serialized).not.toContain("不应进入 finalizer 输入");
  });

  it("generates a shape-valid fallback response with the injected model", async () => {
    const invoke = vi.fn(async (
      _messages: readonly { role: "system" | "user"; content: string }[],
      _options?: { signal?: AbortSignal },
    ) => ({
      content: JSON.stringify({
        content: "这次没有生成可靠的训练卡片，主要是结构化训练方案没有通过校验。你可以先缩小到一次 30 分钟训练再试。",
        suggestedQuestions: ["先帮我生成一次 30 分钟徒手胸部训练"],
      }),
    }));

    const result = await runLangChainTerminalFailureFinalizer({
      result: baseFailure,
      userRequestSummary: "我想增肌，每周 3 练。",
      model: { invoke },
    });

    expect(result).toMatchObject({
      status: "succeeded",
      output: {
        content: expect.stringContaining("没有生成可靠"),
        suggestedQuestions: ["先帮我生成一次 30 分钟徒手胸部训练"],
      },
      trace: {
        status: "succeeded",
        failureCategory: "budget_exhausted",
        errorCode: "budget_exhausted",
      },
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    const firstCall = invoke.mock.calls[0];
    expect(firstCall).toBeDefined();
    expect(JSON.stringify(firstCall?.[0])).toContain("failure_explanation_only");
    expect(JSON.stringify(firstCall?.[0])).not.toContain("secretRawPayload");
  });

  it("falls back when the finalizer output is not valid JSON", async () => {
    const result = await runLangChainTerminalFailureFinalizer({
      result: baseFailure,
      userRequestSummary: "我想增肌。",
      model: { invoke: async () => ({ content: "我不能输出 JSON" }) },
    });

    expect(result).toMatchObject({
      status: "failed",
      reason: "finalizer_invalid_json",
      trace: {
        outputValidation: { ok: false, code: "finalizer_invalid_json" },
      },
    });
  });

  it("skips provider failures instead of recursively calling the same unavailable provider", async () => {
    const result = await runLangChainTerminalFailureFinalizer({
      result: {
        ...baseFailure,
        code: "provider_error",
        message: "401",
        toolExecutions: [],
      },
      userRequestSummary: "我想增肌。",
      model: { invoke: async () => ({ content: "{}" }) },
    });

    expect(result).toMatchObject({
      status: "skipped",
      reason: "failure_not_classifiable",
    });
  });

  it("uses a Chinese prompt that forbids business side effects", () => {
    const prompt = buildLangChainTerminalFailureFinalizerSystemPrompt();

    expect(prompt).toContain("不要继续执行原始任务");
    expect(prompt).toContain("不要输出 tool_call");
    expect(prompt).toContain("不要声称训练卡片、训练计划、保存或写入已经成功");
    expect(prompt).toContain("只返回 JSON object");
  });
});
