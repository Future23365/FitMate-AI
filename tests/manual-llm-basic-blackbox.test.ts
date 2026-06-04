import { readFile } from "node:fs/promises";

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
  type BasicChatSuiteSummary,
  type BasicChatTurnRunRecord,
} from "@/manual-tests/llm/basic-chat-report";

describe("manual basic LLM blackbox fixtures", () => {
  it("parses llm基础测试.md as the single basic three-turn flow source", async () => {
    const fixture = await readBasicChatFixture();

    expect(fixture.sourcePath).toContain("llm基础测试.md");
    expect(fixture.stats).toEqual({ flowCount: 19, turnCount: 57 });
    expect(fixture.flows.map((flow) => flow.id)).toEqual([
      "F01",
      "F02",
      "F03",
      "F04",
      "F05",
      "F08",
      "F12",
      "F13",
      "F14",
      "F15",
      "F16",
      "F17",
      "F18",
      "F19",
      "F20",
      "F21",
      "F22",
      "F23",
      "F24",
    ]);
    expect(fixture.flows[0]).toMatchObject({
      id: "F01",
      goal: "纯动作推荐到刷新推荐",
      turns: [
        { index: 1, userInput: "今天我想练胸" },
        { index: 2, userInput: "换一批" },
        { index: 3, userInput: "推荐几个不用器械的" },
      ],
    });
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
      finalAssistantText: "可以，给你推荐几个胸部动作。",
      visibleOutputs: [
        { outputType: "exercise_recommendation", schemaVersion: "1", summary: "胸部动作推荐卡片" },
      ],
    });
    const messages = createBasicChatJudgeMessages(modelInput);
    const userPayload = JSON.parse(messages[1].content) as Record<string, unknown>;
    const serializedPayload = JSON.stringify(userPayload);

    expect(userPayload).toEqual({
      flowId: "F01",
      goal: "纯动作推荐到刷新推荐",
      turnIndex: 1,
      userInput: "今天我想练胸",
      expectation: "触发动作推荐卡片",
      finalAssistantText: "可以，给你推荐几个胸部动作。",
      visibleOutputs: [
        { outputType: "exercise_recommendation", schemaVersion: "1", summary: "胸部动作推荐卡片" },
      ],
    });
    expect(serializedPayload).not.toContain("agent_progress");
    expect(serializedPayload).not.toContain("tool_result");
    expect(serializedPayload).not.toContain("trace");
    expect(serializedPayload).not.toContain("raw provider response");
    expect(serializedPayload).not.toContain("token diagnostics");
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
      status: "passed",
      finalAssistantTextSummary: "可以，给你推荐几个胸部动作。",
      visibleOutputKinds: ["exercise_recommendation@1"],
      judge: {
        passed: true,
        status: "passed",
        reason: "满足胸部动作推荐和卡片期望。",
        matchedExpectations: ["胸部动作推荐"],
        missingExpectations: [],
        visibleOutputKinds: ["exercise_recommendation@1"],
      },
      chatTokenUsage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
      judgeTokenUsage: { promptTokens: 8, completionTokens: 3, totalTokens: 11 },
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
      failedTurnCount: 0,
      skippedTurnCount: 0,
      estimatedTokenTotal: 3000,
      actualChatTokenUsage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
      actualJudgeTokenUsage: { promptTokens: 8, completionTokens: 3, totalTokens: 11 },
      missingConfiguration: [],
      preflightErrors: [],
    };
    const report = renderBasicChatBlackboxReport({
      summary,
      flows: fixture.flows.slice(0, 1),
      records,
    });

    expect(report).toContain("# 基础 LLM 首页聊天黑盒测试报告");
    expect(report).toContain("2026-06-04 09:01:00 +08:00");
    expect(report).toContain("F01");
    expect(report).toContain("exercise_recommendation@1");
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
});
