import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, test } from "vitest";

import {
  createBlackboxConversationState,
  runBlackboxChatTurn,
  runBlackboxPreflight,
  type BlackboxArtifactDiagnostics,
  type BlackboxPreflightResult,
  type BlackboxRunnerMode,
  type BlackboxTurnResult,
} from "./blackbox-runner";
import {
  assertBlackboxTurnResult,
  evaluateBlackboxTurnResult,
  previewText,
  type AssertionFailureLevel,
  type AssertionStatus,
} from "./assertions";
import { createFlowFailureSkipReason } from "./flow-runner-policy";
import { getBlackboxFlowCases, type BlackboxFlowCase, type BlackboxFlowSuiteName, type BlackboxFlowTurn } from "./flow-fixtures";
import { estimateTokenUsageForReports, type TokenEstimate } from "./token-estimate";

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
  cardStatus: AssertionStatus;
  semanticStatus: AssertionStatus;
  status: AssertionStatus;
  failureLevel?: AssertionFailureLevel;
  failureReasons: string[];
  conversationId: string;
  responseMessageId?: string;
  traceId?: string;
  error?: string;
  streamError?: string;
  skipReason?: string;
  usage?: DeepSeekUsage;
  artifactDiagnostics?: BlackboxArtifactDiagnostics;
};

const model = "deepseek-v4-flash";
const configuredApiKey = process.env.DEEPSEEK_API_KEY?.trim();
const describeIfConfigured = configuredApiKey ? describe : describe.skip;
const flowSuiteName: BlackboxFlowSuiteName = process.env.MANUAL_LLM_FLOW_SUITE === "detail" ? "detail" : "basic";
const suiteLabel = flowSuiteName === "detail" ? "详细" : "基础";
const runnerMode: BlackboxRunnerMode = "api_route";
const runCommand = flowSuiteName === "detail" ? "npm run test --detail" : "npm run test:llm";
const blackboxFlowCases = getBlackboxFlowCases(flowSuiteName);
const reportPath = process.env.MANUAL_LLM_REPORT_PATH?.trim()
  ? path.resolve(process.env.MANUAL_LLM_REPORT_PATH)
  : path.join(process.cwd(), "docs", "manual-llm-blackbox-flow-latest-report.md");
const runRecords: ManualLlmTurnRecord[] = [];
let preflightResult: BlackboxPreflightResult | undefined;
let estimatedTokenUsage: TokenEstimate;

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
  beforeAll(async () => {
    estimatedTokenUsage = await estimateTokenUsage();
    preflightResult = await runBlackboxPreflight({ apiKey: configuredApiKey });

    console.log(`手动 LLM 黑盒流程测试 token 预估（${suiteLabel}套件）：`);
    console.log(`预估输入token：${estimatedTokenUsage.promptTokens}`);
    console.log(`预估输出token：${estimatedTokenUsage.completionTokens}`);
    console.log(`预估总token：${estimatedTokenUsage.totalTokens}`);
    console.log(`估算来源：${estimatedTokenUsage.source}`);
    console.log(`估算口径：${estimatedTokenUsage.calibrationSummary}`);
    console.log(`preflight：${preflightResult.status}`);
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
        `needs_review=${summary.needsReview}`,
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

    if (preflightResult?.status !== "ready") {
      for (let turnIndex = 0; turnIndex < flowCase.turns.length; turnIndex += 1) {
        runRecords.push(createSkippedRecord(
          flowCase,
          flowCase.turns[turnIndex],
          turnIndex + 1,
          state.conversationId,
          preflightResult?.reason ?? "preflight 未满足详细套件运行条件。",
        ));
      }
      return;
    }

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
      const assertion = evaluateBlackboxTurnResult({
        flowCase,
        turn,
        turnIndex: turnIndex + 1,
        result,
      });

      runRecords.push(createTurnRecord(flowCase, turn, turnIndex + 1, result, assertion));

      try {
        assertBlackboxTurnResult({
          flowCase,
          turn,
          turnIndex: turnIndex + 1,
          result,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
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
  assertion: ReturnType<typeof evaluateBlackboxTurnResult>,
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
    cardStatus: assertion.cardStatus,
    semanticStatus: assertion.semanticStatus,
    status: assertion.finalStatus,
    failureLevel: assertion.failureLevel,
    failureReasons: assertion.failureReasons,
    conversationId: result.conversationId,
    responseMessageId: result.responseMessageId,
    traceId: result.traceId,
    error: assertion.failureReasons.length ? previewText(assertion.failureReasons.join("；"), 500) : undefined,
    streamError: result.error ? `${result.error.code}: ${result.error.message}` : undefined,
    usage: result.usage,
    artifactDiagnostics: result.artifactDiagnostics,
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
    assistantPreview: "未请求真实模型。",
    cardStatus: "skipped",
    semanticStatus: "skipped",
    status: "skipped",
    failureReasons: [],
    conversationId,
    skipReason,
  };
}

async function estimateTokenUsage(): Promise<TokenEstimate> {
  const candidateReports = [
    path.join(process.cwd(), "docs", "manual-llm-blackbox-flow-latest-report.md"),
    path.join(process.cwd(), "docs", "manual-llm-blackbox-flow-detail-latest-report.md"),
  ];

  return estimateTokenUsageForReports({
    flowCases: blackboxFlowCases,
    reportPaths: candidateReports,
  });
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
    needsReview: records.filter((record) => record.status === "needs_review").length,
    usage,
  };
}

async function writeAcceptanceReport(
  records: ManualLlmTurnRecord[],
  summary: ReturnType<typeof summarizeRunRecords>,
) {
  const generatedAt = new Date().toISOString();
  const tokenDeviation = summarizeTokenDeviation(summary.usage, estimatedTokenUsage);
  const reportLines = [
    "# 手动 LLM 首页聊天黑盒流程测试报告",
    "",
    `生成时间：${generatedAt}`,
    `模型：${model}`,
    `套件：${suiteLabel}`,
    `运行命令：${runCommand}`,
    `runner 类型：${runnerMode}`,
    `真实/跳过状态：${preflightResult?.status === "ready" ? "真实模型已运行" : "跳过或环境未满足"}`,
    "",
    "## 汇总",
    "",
    `- 流程用例数：${summary.flowCount}`,
    `- 轮次数：${summary.total}`,
    `- 通过：${summary.passed}`,
    `- 失败：${summary.failed}`,
    `- 跳过：${summary.skipped}`,
    `- 需复核：${summary.needsReview}`,
    `- 预计输入 token：${estimatedTokenUsage.promptTokens}`,
    `- 预计输出 token：${estimatedTokenUsage.completionTokens}`,
    `- 预计总 token：${estimatedTokenUsage.totalTokens}`,
    `- 估算来源：${estimatedTokenUsage.source}`,
    `- 估算口径：${estimatedTokenUsage.calibrationSummary}`,
    `- prompt_tokens：${summary.usage.prompt_tokens}`,
    `- completion_tokens：${summary.usage.completion_tokens}`,
    `- total_tokens：${summary.usage.total_tokens}`,
    `- token 偏差摘要：${tokenDeviation}`,
    "",
    "## Preflight",
    "",
    `- 状态：${preflightResult?.status ?? "not_run"}`,
    `- 模型 key：${preflightResult?.modelAvailable ? "可用" : "不可用"}`,
    `- 数据库：${preflightResult?.databaseAvailable ? "可用" : "不可用"}`,
    `- artifact 表：${preflightResult?.artifactTablesAvailable ? "可用" : "不可用"}`,
    `- seed 数据：${preflightResult?.seedDataAvailable ? "可用" : "不可用"}`,
    preflightResult?.reason ? `- 原因：${preflightResult.reason}` : "",
    preflightResult?.detail ? `- 详情：${preflightResult.detail}` : "",
    "",
    "## 最终状态枚举",
    "",
    "- `passed`：卡片类型断言和语义断言都通过。",
    "- `failed`：P0/P1/P2 自动断言失败。",
    "- `skipped`：缺少 key、preflight 未满足或前序轮次失败导致未执行。",
    "- `needs_review`：仅 P3 内容质量或自动断言无法稳定判断，需要人工复核，不计为通过。",
    "",
    "## 流程轮次结果",
    "",
    ...records.map(formatRunRecord),
    "",
  ].filter((line) => line !== "");

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, reportLines.join("\n"), "utf8");
}

function summarizeTokenDeviation(actual: Required<DeepSeekUsage>, estimate: TokenEstimate) {
  if (actual.total_tokens <= 0) {
    return "本次没有真实 token usage，通常表示跳过或运行失败。";
  }

  const delta = actual.total_tokens - estimate.totalTokens;
  const ratio = estimate.totalTokens > 0 ? Math.round((delta / estimate.totalTokens) * 100) : 0;

  return `实际 total_tokens=${actual.total_tokens}，预估=${estimate.totalTokens}，偏差=${delta} (${ratio}%)。`;
}

function formatRunRecord(record: ManualLlmTurnRecord) {
  const statusLabel = record.status === "passed"
    ? "通过"
    : record.status === "failed"
      ? "失败"
      : record.status === "needs_review"
        ? "需复核"
        : "跳过";
  const expected = record.expectedCardTypes.length ? record.expectedCardTypes.join(", ") : "无训练卡片";
  const actual = record.actualCardTypes.length ? record.actualCardTypes.join(", ") : "无训练卡片";
  const artifactDiagnostics = formatArtifactDiagnostics(record.artifactDiagnostics);
  const diagnostics = [
    `卡片类型断言：${record.cardStatus}`,
    `语义断言：${record.semanticStatus}`,
    record.failureLevel ? `失败等级：${record.failureLevel}` : "",
    record.error ? `失败原因：${record.error}` : "",
    record.streamError ? `请求/stream 错误摘要：${record.streamError}` : "",
    record.skipReason ? `跳过原因：${record.skipReason}` : "",
    artifactDiagnostics ? `artifact 诊断：${artifactDiagnostics}` : "",
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

function formatArtifactDiagnostics(diagnostics: BlackboxArtifactDiagnostics | undefined) {
  if (!diagnostics) {
    return "";
  }

  return [
    `recentSummaryCount=${diagnostics.recentSummaryCount}`,
    `producedArtifact=${diagnostics.producedArtifact}`,
    diagnostics.artifactKind ? `kind=${diagnostics.artifactKind}` : undefined,
    diagnostics.artifactId ? `artifactId=${diagnostics.artifactId}` : undefined,
    `payload=${diagnostics.payloadReadStatus}`,
    diagnostics.referenceResolutionStatus ? `reference=${diagnostics.referenceResolutionStatus}` : undefined,
    diagnostics.referenceResolutionSummary,
  ].filter(Boolean).join("；");
}
