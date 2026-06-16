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
    runtimeActivities: [],
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
    expect(prompt).toContain("任务层面的安全收口");
    expect(prompt).toContain("不要向用户提及系统错误");
    expect(prompt).toContain("系统处理限制");
    expect(prompt).toContain("系统繁忙");
    expect(prompt).toContain("稍后重试");
    expect(prompt).toContain("不要包含重试、稍后、系统、错误、繁忙、服务不可用等运维表达");
    expect(prompt).toContain("优先基于 userRequestSummary、failedToolExecutions 和 verifiedFactsSummary");
    expect(prompt).toContain("用户已经明确提供的条件、工具已经验证成功的事实、仍然不足或未完成收口的事实");
    expect(prompt).toContain("不得要求用户补充已经在 userRequestSummary 中明确提供的条件");
    expect(prompt).toContain("candidateGroups、sectionsWithCandidates、sectionsWithoutCandidates、allRequestedSectionsHaveCandidates、diagnostics 或 zeroMatchMuscles");
    expect(prompt).toContain("content 必须优先说明哪些候选已经确认、哪些候选或 section 仍不足");
    expect(prompt).toContain("suggestedQuestions 必须围绕仍不足的事实或未完成的收口点生成");
    expect(prompt).toContain("suggestedQuestions 必须使用用户口吻，是用户点击后可作为下一轮消息直接发送的完整自然语言请求");
    expect(prompt).toContain("不得写成助手对用户的命令、说明、追问模板或确认问句");
    expect(prompt).toContain("不得生成与失败原因无关的通用健身信息收集问题");
    expect(prompt).toContain("不得建议用户改问无关的动作解释、动作区别说明、普通知识问答或其他任务");
    expect(prompt).not.toContain("或把问题改成普通动作解释/区别说明");
    expect(prompt).toContain("只返回 JSON object");
  });
});
