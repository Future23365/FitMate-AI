import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, test } from "vitest";

import {
  createBlackboxConversationState,
  runBlackboxChatTurn,
  type BlackboxTurnResult,
} from "./blackbox-runner";
import { assertBlackboxTurnResult, previewText } from "./assertions";
import { createFlowFailureSkipReason } from "./flow-runner-policy";
import { getBlackboxFlowCases, type BlackboxFlowCase, type BlackboxFlowSuiteName, type BlackboxFlowTurn } from "./flow-fixtures";

type DeepSeekUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type ManualLlmTurnRecord = {
  flowId: string;
  flowName: string;
  turnIndex: number;
  turnName: string;
  userInput: string;
  expectationNote: string;
  expectedCardTypes: string[];
  actualCardTypes: string[];
  assistantPreview: string;
  status: "passed" | "failed" | "skipped";
  conversationId: string;
  responseMessageId?: string;
  traceId?: string;
  error?: string;
  streamError?: string;
  skipReason?: string;
  usage?: DeepSeekUsage;
};

const model = "deepseek-v4-flash";
const configuredApiKey = process.env.DEEPSEEK_API_KEY?.trim();
const describeIfConfigured = configuredApiKey ? describe : describe.skip;
const flowSuiteName: BlackboxFlowSuiteName = process.env.MANUAL_LLM_FLOW_SUITE === "detail" ? "detail" : "basic";
const blackboxFlowCases = getBlackboxFlowCases(flowSuiteName);
const reportPath = process.env.MANUAL_LLM_REPORT_PATH?.trim()
  ? path.resolve(process.env.MANUAL_LLM_REPORT_PATH)
  : path.join(process.cwd(), "docs", "manual-llm-blackbox-flow-latest-report.md");
const runRecords: ManualLlmTurnRecord[] = [];
const estimatedTokenUsage = estimateTokenUsage();

if (!configuredApiKey) {
  console.warn(
    [
      "Missing DEEPSEEK_API_KEY.",
      "手动 LLM 黑盒流程测试必须调用真实模型；请设置 DEEPSEEK_API_KEY 后重新运行 `npm run test:llm`。",
      "该测试不会使用 mock、旧快照或非真实模型结果。",
    ].join("\n"),
  );
}

describeIfConfigured("manual LLM blackbox chat flows", () => {
  beforeAll(() => {
    console.log("手动 LLM 黑盒流程测试 token 预估：");
    console.log(`预估输入token：${estimatedTokenUsage.promptTokens}`);
    console.log(`预估输出token：${estimatedTokenUsage.completionTokens}`);
    console.log(`预估总token：${estimatedTokenUsage.totalTokens}`);
    console.log("说明：这是按首页聊天多轮流程粗略估算，最终以模型返回 usage 为准。");
  });

  afterAll(async () => {
    const summary = summarizeRunRecords(runRecords);

    console.log(
      [
        "Manual LLM blackbox flow summary:",
        `flows=${blackboxFlowCases.length}`,
        `turns=${summary.total}`,
        `passed=${summary.passed}`,
        `failed=${summary.failed}`,
        `skipped=${summary.skipped}`,
      ].join(" "),
    );
    console.log(
      [
        "Manual LLM blackbox actual token usage:",
        `prompt_tokens=${summary.usage.prompt_tokens}`,
        `completion_tokens=${summary.usage.completion_tokens}`,
        `total_tokens=${summary.usage.total_tokens}`,
      ].join(" "),
    );

    await writeAcceptanceReport(runRecords, summary);
    console.log(`Manual LLM blackbox acceptance report: ${reportPath}`);
  });

  test.each(blackboxFlowCases)("$id - $name", async (flowCase) => {
    const state = createBlackboxConversationState(flowCase.id);
    let flowFailureReason: string | undefined;

    for (let turnIndex = 0; turnIndex < flowCase.turns.length; turnIndex += 1) {
      const turn = flowCase.turns[turnIndex];

      if (flowFailureReason) {
        runRecords.push(createSkippedRecord(flowCase, turn, turnIndex + 1, state.conversationId, flowFailureReason));
        continue;
      }

      const result = await runBlackboxChatTurn({
        apiKey: configuredApiKey,
        state,
        userInput: turn.userInput,
      });

      try {
        assertBlackboxTurnResult({
          flowCase,
          turn,
          turnIndex: turnIndex + 1,
          result,
        });
        runRecords.push(createTurnRecord(flowCase, turn, turnIndex + 1, result, "passed"));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        runRecords.push(createTurnRecord(flowCase, turn, turnIndex + 1, result, "failed", message));
        flowFailureReason = createFlowFailureSkipReason(turnIndex, message);
      }
    }

    if (flowFailureReason) {
      throw new Error(flowFailureReason);
    }
  });
});

function createTurnRecord(
  flowCase: BlackboxFlowCase,
  turn: BlackboxFlowTurn,
  turnIndex: number,
  result: BlackboxTurnResult,
  status: "passed" | "failed",
  error?: string,
): ManualLlmTurnRecord {
  return {
    flowId: flowCase.id,
    flowName: flowCase.name,
    turnIndex,
    turnName: turn.name,
    userInput: turn.userInput,
    expectationNote: turn.expectation.note,
    expectedCardTypes: turn.expectation.expectedCardTypes,
    actualCardTypes: result.actionTypes,
    assistantPreview: previewText(result.assistantText || "未获得可展示回复", 220),
    status,
    conversationId: result.conversationId,
    responseMessageId: result.responseMessageId,
    traceId: result.traceId,
    error: error ? previewText(error, 500) : undefined,
    streamError: result.error ? `${result.error.code}: ${result.error.message}` : undefined,
    usage: result.usage,
  };
}

function createSkippedRecord(
  flowCase: BlackboxFlowCase,
  turn: BlackboxFlowTurn,
  turnIndex: number,
  conversationId: string,
  skipReason: string,
): ManualLlmTurnRecord {
  return {
    flowId: flowCase.id,
    flowName: flowCase.name,
    turnIndex,
    turnName: turn.name,
    userInput: turn.userInput,
    expectationNote: turn.expectation.note,
    expectedCardTypes: turn.expectation.expectedCardTypes,
    actualCardTypes: [],
    assistantPreview: "前序轮次失败后跳过，未请求模型。",
    status: "skipped",
    conversationId,
    skipReason,
  };
}

function estimateTokenUsage() {
  const charCount = blackboxFlowCases.reduce(
    (flowTotal, flowCase) =>
      flowTotal + flowCase.turns.reduce((turnTotal, turn) => turnTotal + turn.userInput.length + turn.expectation.note.length, 0),
    0,
  );
  const promptTokens = Math.ceil(charCount / 2) + blackboxFlowCases.length * 3 * 2_200;
  const completionTokens = blackboxFlowCases.length * 3 * 700;

  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

function summarizeRunRecords(records: ManualLlmTurnRecord[]) {
  const usage = records.reduce(
    (summary, record) => ({
      prompt_tokens: summary.prompt_tokens + (record.usage?.prompt_tokens ?? 0),
      completion_tokens: summary.completion_tokens + (record.usage?.completion_tokens ?? 0),
      total_tokens: summary.total_tokens + (record.usage?.total_tokens ?? 0),
    }),
    { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  );

  return {
    total: records.length,
    flowCount: blackboxFlowCases.length,
    passed: records.filter((record) => record.status === "passed").length,
    failed: records.filter((record) => record.status === "failed").length,
    skipped: records.filter((record) => record.status === "skipped").length,
    usage,
  };
}

async function writeAcceptanceReport(
  records: ManualLlmTurnRecord[],
  summary: ReturnType<typeof summarizeRunRecords>,
) {
  const generatedAt = new Date().toISOString();
  const reportLines = [
    "# 手动 LLM 首页聊天黑盒流程测试报告",
    "",
    `生成时间：${generatedAt}`,
    `模型：${model}`,
    `套件：${flowSuiteName === "detail" ? "详细" : "基础"}`,
    "",
    "## 汇总",
    "",
    `- 流程用例数：${summary.flowCount}`,
    `- 轮次数：${summary.total}`,
    `- 通过：${summary.passed}`,
    `- 失败：${summary.failed}`,
    `- 跳过：${summary.skipped}`,
    `- 预计输入 token：${estimatedTokenUsage.promptTokens}`,
    `- 预计输出 token：${estimatedTokenUsage.completionTokens}`,
    `- 预计总 token：${estimatedTokenUsage.totalTokens}`,
    `- prompt_tokens：${summary.usage.prompt_tokens}`,
    `- completion_tokens：${summary.usage.completion_tokens}`,
    `- total_tokens：${summary.usage.total_tokens}`,
    "",
    "## 流程轮次结果",
    "",
    ...records.map(formatRunRecord),
    "",
  ];

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, reportLines.join("\n"), "utf8");
}

function formatRunRecord(record: ManualLlmTurnRecord) {
  const statusLabel = record.status === "passed" ? "通过" : record.status === "failed" ? "失败" : "跳过";
  const expected = record.expectedCardTypes.length ? record.expectedCardTypes.join(", ") : "无训练卡片";
  const actual = record.actualCardTypes.length ? record.actualCardTypes.join(", ") : "无训练卡片";
  const diagnostics = [
    record.error ? `失败原因：${record.error}` : "",
    record.streamError ? `请求/stream 错误摘要：${record.streamError}` : "",
    record.skipReason ? `跳过原因：${record.skipReason}` : "",
    record.responseMessageId ? `responseMessageId：${record.responseMessageId}` : "",
    record.traceId ? `traceId：${record.traceId}` : "",
    `conversationId：${record.conversationId}`,
  ].filter(Boolean);

  return [
    `### ${record.flowId} ${record.flowName} / 第 ${record.turnIndex} 轮：${record.turnName}`,
    "",
    `- 状态：${statusLabel}`,
    `- 用户输入：${record.userInput}`,
    `- 期望结果：${record.expectationNote}`,
    `- 期望卡片类型：${expected}`,
    `- 实际卡片类型：${actual}`,
    `- assistant 摘要：${record.assistantPreview}`,
    ...diagnostics.map((line) => `- ${line}`),
    "",
  ].join("\n");
}
