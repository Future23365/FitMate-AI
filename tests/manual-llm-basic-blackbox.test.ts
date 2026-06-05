import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  BasicChatFixtureParseError,
  parseBasicChatFixtureFromMarkdown,
  readBasicChatFixture,
} from "@/manual-tests/llm/basic-chat-fixtures";
import {
  basicChatJudgeResultSchema,
  buildBasicChatJudgeModelInput,
  createBasicChatJudgeMessages,
  normalizeBasicChatTokenUsage,
} from "@/manual-tests/llm/basic-chat-judge";
import {
  renderBasicChatBlackboxReport,
  summarizeTokenDiagnostics,
  type BasicChatSuiteSummary,
  type BasicChatTurnRunRecord,
} from "@/manual-tests/llm/basic-chat-report";
import {
  createBasicChatRequestBody,
  normalizeChatOutput,
} from "@/manual-tests/llm/basic-chat-runner";
import { buildFitnessConversationContext } from "@/lib/shared/chat/fitness-conversation-context";

describe("manual basic LLM blackbox fixtures", () => {
  it("parses llm基础测试.md as the single basic three-turn flow source", async () => {
    const fixture = await readBasicChatFixture();
    const ids = fixture.flows.map((flow) => flow.id);

    expect(fixture.sourcePath).toContain("llm基础测试.md");
    expect(fixture.stats.flowCount).toBeGreaterThan(0);
    expect(fixture.stats.turnCount).toBe(fixture.stats.flowCount * 3);
    expect(fixture.stats.flowCount).toBeLessThanOrEqual(9);
    expect(ids).toContain("F12");
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("F16");
    expect(ids).not.toContain("F17");
    expect(ids).not.toContain("F18");
    expect(ids).not.toContain("F21");
    expect(ids).not.toContain("F22");
    expect(fixture.flows.every((flow) => flow.turns.length === 3)).toBe(true);
    expect(fixture.flows.every((flow) => flow.id.trim() && flow.goal.trim())).toBe(true);
    expect(fixture.flows.every((flow) =>
      flow.turns.every((turn) => turn.userInput.trim() && turn.expectation.trim()),
    )).toBe(true);
  });

  it("builds the basic runner request body without full history or bypass fields", () => {
    const requestBody = createBasicChatRequestBody({
      conversationId: "chat-1",
      responseMessageId: "assistant-1",
      latestUserMessage: "今天我想练胸",
      conversationSummary: "用户想练胸。",
      conversationContext: buildFitnessConversationContext([{ role: "user", content: "今天我想练胸" }]),
      thinkingEnabled: false,
    });
    const serialized = JSON.stringify(requestBody);

    expect(requestBody).toEqual({
      conversationId: "chat-1",
      responseMessageId: "assistant-1",
      latestUserMessage: "今天我想练胸",
      conversationSummary: "用户想练胸。",
      conversationContext: expect.any(Object),
      thinkingEnabled: false,
    });
    expect(requestBody).not.toHaveProperty("messages");
    expect(serialized).not.toContain("plannerOverride");
    expect(serialized).not.toContain("toolOverride");
    expect(serialized).not.toContain("traceOverride");
    expect(serialized).not.toContain("runtimeState");
  });

  it("fails preflight before model calls for missing columns, duplicate ids, and empty fields", () => {
    const markdown = [
      "## 三轮流程用例",
      "",
      "| ID | 流程目标 | 第 1 轮用户输入 | 第 1 轮期望 | 第 2 轮用户输入 | 第 2 轮期望 | 第 3 轮用户输入 | 第 3 轮期望 |",
      "|---|---|---|---|---|---|---|---|",
      "| F01 | 目标 A | 输入 | 期望 | 输入 | 期望 | 输入 | 期望 |",
      "| F01 | 目标 B |  | 期望 | 输入 |  | 输入 | 期望 |",
    ].join("\n");

    expect(() => parseBasicChatFixtureFromMarkdown(markdown)).toThrow(BasicChatFixtureParseError);

    try {
      parseBasicChatFixtureFromMarkdown(markdown);
    } catch (error) {
      expect(error).toBeInstanceOf(BasicChatFixtureParseError);
      expect((error as BasicChatFixtureParseError).errors.join("\n")).toContain("重复 ID：F01");
      expect((error as BasicChatFixtureParseError).errors.join("\n")).toContain("第 1 轮用户输入为空");
      expect((error as BasicChatFixtureParseError).errors.join("\n")).toContain("第 2 轮期望为空");
    }

    const missingColumnMarkdown = markdown.replace(" | 第 3 轮期望", "");
    expect(() => parseBasicChatFixtureFromMarkdown(missingColumnMarkdown)).toThrow(/表格列名必须严格/);
  });
});

describe("manual basic LLM judge contract", () => {
  it("builds judge input from final user-visible output only", () => {
    const modelInput = buildBasicChatJudgeModelInput({
      flowId: "F01",
      goal: "纯动作推荐到刷新推荐",
      turnIndex: 1,
      userInput: "今天我想练胸",
      expectation: "触发动作推荐卡片",
      visibleUserOutput: {
        finalAssistantText: "可以，给你推荐几个胸部动作。",
        visibleOutputs: [
          { outputType: "exercise_recommendation", schemaVersion: "1", summary: "胸部动作推荐卡片" },
        ],
        assistantSuggestions: ["换一批"],
        confirmationRequests: ["是否保存这套训练？"],
        safeErrorMessage: "聊天生成失败，请稍后重试。",
      },
    });
    const messages = createBasicChatJudgeMessages(modelInput);
    const userPayload = JSON.parse(messages[1].content) as Record<string, unknown>;
    const systemPrompt = messages[0].content;
    const serializedPayload = JSON.stringify(userPayload);

    expect(userPayload).toEqual({
      flowId: "F01",
      goal: "纯动作推荐到刷新推荐",
      turnIndex: 1,
      userInput: "今天我想练胸",
      expectation: "触发动作推荐卡片",
      visibleUserOutput: {
        finalAssistantText: "可以，给你推荐几个胸部动作。",
        visibleOutputs: [
          { outputType: "exercise_recommendation", schemaVersion: "1", summary: "胸部动作推荐卡片" },
        ],
        assistantSuggestions: ["换一批"],
        confirmationRequests: ["是否保存这套训练？"],
        safeErrorMessage: "聊天生成失败，请稍后重试。",
      },
    });
    expect(serializedPayload).not.toContain("agent_progress");
    expect(serializedPayload).not.toContain("tool_result");
    expect(serializedPayload).not.toContain("trace");
    expect(serializedPayload).not.toContain("raw provider response");
    expect(serializedPayload).not.toContain("token diagnostics");
    expect(systemPrompt).toContain("不直接生成随机卡片");
    expect(systemPrompt).toContain("visibleTrainingProposal、exercise_recommendation、workout_routine、workout_plan");
    expect(systemPrompt).toContain("生成 routine、单次训练、训练编排或三段式训练");
    expect(systemPrompt).toContain("kind=exercise_selection");
    expect(systemPrompt).toContain("让用户自行组合");
    expect(systemPrompt).toContain("生成 plan、多天安排、周期计划、每周训练安排或训练日 / 休息日安排");
    expect(systemPrompt).toContain("无 schedule.assignments 的单次 routine");
    expect(systemPrompt).toContain("只建议用户下一轮再生成计划");
    expect(systemPrompt).toContain("不能因为同时存在 assistantSuggestions 而返回 passed_via_suggestion");
  });

  it("validates judge schema and rejects inconsistent passed/status pairs", () => {
    expect(basicChatJudgeResultSchema.safeParse({
      passed: true,
      status: "passed",
      reason: "最终输出满足期望。",
      matchedExpectations: ["推荐胸部动作"],
      missingExpectations: [],
      visibleOutputKinds: ["exercise_recommendation@1"],
    }).success).toBe(true);

    expect(basicChatJudgeResultSchema.safeParse({
      passed: true,
      status: "passed_via_suggestion",
      reason: "正文没有直接生成计划，但建议提问可直接发送并补齐生成动作。",
      matchedExpectations: ["建议提问覆盖缺失下一步"],
      missingExpectations: [],
      visibleOutputKinds: [],
    }).success).toBe(true);

    expect(basicChatJudgeResultSchema.safeParse({
      passed: true,
      status: "failed",
      reason: "状态冲突。",
      matchedExpectations: [],
      missingExpectations: ["缺少卡片"],
      visibleOutputKinds: [],
    }).success).toBe(false);
  });

  it("normalizes provider token usage for report summaries", () => {
    expect(normalizeBasicChatTokenUsage({
      prompt_tokens: 12,
      completion_tokens: 5,
      total_tokens: 17,
    })).toEqual({ promptTokens: 12, completionTokens: 5, totalTokens: 17 });
  });

  it("reuses the production NDJSON parser and projects visible user output", async () => {
    const output = await normalizeChatOutput([
      JSON.stringify({ type: "content", content: "可以。" }),
      JSON.stringify({
        type: "visible_output",
        outputType: "visibleTrainingProposal",
        schemaVersion: "1",
        payload: { kind: "exercise_selection" },
        content: { title: "胸部训练" },
      }),
      JSON.stringify({ type: "suggested_questions", suggestedQuestions: ["换一批", "只要徒手"] }),
      JSON.stringify({
        type: "confirmation_request",
        pendingActionId: "pending-1",
        actionHash: "hash-1",
        expiresAt: "2026-06-04T09:00:00.000Z",
        message: "是否保存这套训练？",
        toolName: "saveRoutine",
      }),
      JSON.stringify({
        type: "error",
        error: { code: "chat_ai_not_configured", message: "Chat AI model configuration is missing." },
      }),
      JSON.stringify({ type: "done" }),
    ].join("\n"));

    expect(output).toMatchObject({
      assistantText: "可以。",
      visibleOutputKinds: ["visibleTrainingProposal@1"],
      assistantSuggestions: ["换一批", "只要徒手"],
      confirmationRequests: ["是否保存这套训练？"],
      safeErrorMessage: "聊天服务暂时不可用，请稍后再试。",
      done: true,
    });

    await expect(normalizeChatOutput(JSON.stringify({ type: "unknown_internal_event" })))
      .rejects
      .toThrow(/未知聊天响应事件/);
  });
});

describe("manual basic LLM report and isolation", () => {
  it("renders a safe markdown report without prompt or raw payload dumps", async () => {
    const fixture = await readBasicChatFixture();
    const records: BasicChatTurnRunRecord[] = [{
      flowId: "F01",
      goal: "纯动作推荐到刷新推荐",
      turnIndex: 1,
      userInput: "今天我想练胸",
      expectation: "触发动作推荐卡片",
      executed: true,
      status: "passed_via_suggestion",
      finalAssistantTextSummary: "可以，给你推荐几个胸部动作。",
      visibleOutputKinds: ["exercise_recommendation@1"],
      judge: {
        passed: true,
        status: "passed_via_suggestion",
        reason: "建议提问可恢复完成当前期望。",
        matchedExpectations: ["胸部动作推荐"],
        missingExpectations: [],
        visibleOutputKinds: ["exercise_recommendation@1"],
      },
      chatTokenUsage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
      judgeTokenUsage: { promptTokens: 8, completionTokens: 3, totalTokens: 11 },
      assistantSuggestions: ["换一批"],
      confirmationRequests: ["是否保存这套训练？"],
      safeErrorMessage: "聊天生成失败，请稍后重试。",
      hydration: {
        source: "server_saved",
        savedConversationFound: true,
        restoredMessageCount: 2,
        hasSavedConversationContext: true,
        hasClientConversationContext: true,
        save: {
          status: "saved",
          savedMessageCount: 2,
          savedVisibleOutputCount: 1,
        },
      },
      chatTokenDiagnostics: {
        source: "dev_trace_store",
        status: "missing",
        reason: "trace token usage not found",
      },
      responseOutcome: {
        status: "terminal_failure_finalizer",
        projectionType: "terminal_failure_finalizer",
        mainAgentFailureCode: "repair_limit_exceeded",
        finalizerCalled: true,
      },
    }];
    const summary: BasicChatSuiteSummary = {
      status: "passed",
      model: "deepseek-chat",
      judgeModel: "deepseek-chat",
      sourcePath: "llm基础测试.md",
      reportPath: "docs/manual-llm-basic-blackbox-latest-report.md",
      startedAt: new Date("2026-06-04T01:00:00.000Z"),
      endedAt: new Date("2026-06-04T01:01:00.000Z"),
      selectedFlowIds: ["F01"],
      filterLabel: "F01",
      fullFlowCount: fixture.stats.flowCount,
      fullTurnCount: fixture.stats.turnCount,
      executedFlowCount: 1,
      executedTurnCount: 1,
      passedTurnCount: 1,
      suggestionPassedTurnCount: 1,
      failedTurnCount: 0,
      skippedTurnCount: 0,
      estimatedTokenTotal: 3000,
      actualChatTokenUsage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
      actualJudgeTokenUsage: { promptTokens: 8, completionTokens: 3, totalTokens: 11 },
      chatTokenDiagnosticsSummary: summarizeTokenDiagnostics([{
        source: "dev_trace_store",
        status: "missing",
        reason: "trace token usage not found",
      }]),
      missingConfiguration: [],
      preflightErrors: [],
    };
    const report = renderBasicChatBlackboxReport({
      summary,
      flows: fixture.flows.slice(0, 1),
      records,
    });

    expect(report).toContain("# 基础 LLM 首页聊天黑盒测试报告");
    expect(report).toContain("2026-06-04T09:01:00+08:00");
    expect(report).toContain("F01");
    expect(report).toContain("建议可恢复通过 turn 数：1");
    expect(report).toContain("passed_via_suggestion");
    expect(report).toContain("exercise_recommendation@1");
    expect(report).toContain("换一批");
    expect(report).toContain("是否保存这套训练？");
    expect(report).toContain("source=server_saved");
    expect(report).toContain("terminal_failure_finalizer");
    expect(report).toContain("finalizerCalled=true");
    expect(report).toContain("source=dev_trace_store, available=0, missing=1, unavailable=0");
    expect(report).toContain("status=missing");
    expect(report).not.toContain("完整 prompt");
    expect(report).not.toContain("raw provider response");
    expect(report).not.toContain("tool input");
  });

  it("keeps manual LLM files outside the default npm test include", async () => {
    const vitestConfig = await import("../vitest.config");
    const manualVitestConfig = await import("../vitest.manual-llm.config");
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(vitestConfig.default.test?.include).toEqual(["tests/**/*.test.ts"]);
    expect(JSON.stringify(vitestConfig.default.test?.include)).not.toContain("manual-tests/llm");
    expect(manualVitestConfig.default.test?.include).toEqual(["manual-tests/llm/**/*.manual.test.ts"]);
    expect(packageJson.scripts.test).toBe("node scripts/run-tests.mjs");
    expect(packageJson.scripts["test:llm:basic"]).toBe("node scripts/run-basic-llm-blackbox.mjs");
  });

  it("keeps real model opt-in branches out of default test files", async () => {
    const defaultTestFiles = await collectDefaultTestFiles("tests");
    const forbiddenTerms = [
      "RUN_DEEPSEEK_" + "BLACKBOX",
      "create" + "DeepSeekModelAdapterFromEnv",
      "api." + "deepseek.com/chat/completions",
    ];
    const matches: string[] = [];

    for (const file of defaultTestFiles) {
      const content = await readFile(file, "utf8");
      for (const term of forbiddenTerms) {
        if (content.includes(term)) {
          matches.push(`${file}: ${term}`);
        }
      }
    }

    expect(matches).toEqual([]);
  });
});

async function collectDefaultTestFiles(target: string): Promise<string[]> {
  const targetStat = await stat(target);

  if (targetStat.isFile()) {
    return target.endsWith(".test.ts") ? [target] : [];
  }

  const entries = await readdir(target);
  const nested = await Promise.all(entries.map((entry) => collectDefaultTestFiles(path.join(target, entry))));

  return nested.flat();
}
