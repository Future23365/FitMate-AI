import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, test } from "vitest";

import {
  createBlackboxConversationState,
  runBlackboxChatTurn,
  runBlackboxPreflight,
  type BlackboxAgentDiagnostics,
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
import { runFlowQueue } from "./flow-execution";
import { inspectBlackboxFlowGovernance, type FlowGovernanceSummary } from "./flow-governance";
import {
  formatSelectionConditions,
  selectBlackboxFlowCases,
  type FlowSelectionResult,
} from "./flow-selection";
import { getBlackboxFlowCases, type BlackboxFlowCase, type BlackboxFlowSuiteName, type BlackboxFlowTurn } from "./flow-fixtures";
import { countBlackboxFlowTurns, estimateTokenUsageForReports, type TokenEstimate } from "./token-estimate";

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
  expectedAgentStatus?: string;
  actualAgentStatus?: string;
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
  agentDiagnostics?: BlackboxAgentDiagnostics;
};

type RunSummary = ReturnType<typeof summarizeRunRecords>;

const model = "deepseek-v4-flash";
const configuredApiKey = process.env.DEEPSEEK_API_KEY?.trim();
const flowSuiteName: BlackboxFlowSuiteName = process.env.MANUAL_LLM_FLOW_SUITE === "detail" ? "detail" : "basic";
const suiteLabel = flowSuiteName === "detail" ? "详细" : "基础";
const runnerMode: BlackboxRunnerMode = "api_route";
const legacyEventsDisabled = process.env.MANUAL_LLM_DISABLE_LEGACY_EVENTS === "1";
const runCommand = process.env.MANUAL_LLM_RUN_COMMAND?.trim() || (flowSuiteName === "detail" ? "npm run test --detail" : "npm run test:llm");
const allFlowCases = getBlackboxFlowCases(flowSuiteName);
const reportPath = process.env.MANUAL_LLM_REPORT_PATH?.trim()
  ? path.resolve(process.env.MANUAL_LLM_REPORT_PATH)
  : path.join(process.cwd(), "docs", flowSuiteName === "detail" ? "manual-llm-blackbox-flow-detail-latest-report.md" : "manual-llm-blackbox-flow-latest-report.md");
const concurrency = readConcurrency();
const runRecords: ManualLlmTurnRecord[] = [];
let selectedFlowCases: BlackboxFlowCase[] = [];
let selectionResult: FlowSelectionResult | undefined;
let governanceSummary: FlowGovernanceSummary | undefined;
let preflightResult: BlackboxPreflightResult | undefined;
let estimatedTokenUsage: TokenEstimate = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  source: "fallback",
  calibrationSummary: "尚未执行 token 预估。",
};

if (!configuredApiKey) {
  console.warn(
    [
      "Missing DEEPSEEK_API_KEY.",
      "手动 LLM 黑盒流程测试必须调用真实模型；缺少 key 时只生成跳过摘要。",
      "该测试不会使用 mock、旧快照或非真实模型结果。",
    ].join("\n"),
  );
}

describe("manual LLM blackbox chat flows", () => {
  beforeAll(async () => {
    selectionResult = await selectBlackboxFlowCases(allFlowCases, {
      ids: readListEnv("MANUAL_LLM_FLOW_IDS"),
      groups: readListEnv("MANUAL_LLM_FLOW_GROUPS"),
      suites: readListEnv("MANUAL_LLM_RUN_SUITES"),
      failedFromReportPath: process.env.MANUAL_LLM_FAILED_FROM_REPORT?.trim() || undefined,
    });
    selectedFlowCases = selectionResult.selectedFlowCases;
    governanceSummary = inspectBlackboxFlowGovernance(allFlowCases);
    estimatedTokenUsage = await estimateTokenUsage();

    if (selectionResult.errors.length > 0) {
      throw new Error(selectionResult.errors.join("\n"));
    }

    preflightResult = await runBlackboxPreflight({ apiKey: configuredApiKey });

    console.log(`手动 LLM 黑盒流程测试 token 预估（${suiteLabel}套件）：`);
    console.log(`筛选条件：${formatSelectionConditions(selectionResult.conditions)}`);
    console.log(`完整流程用例数：${allFlowCases.length}`);
    console.log(`本次流程用例数：${selectedFlowCases.length}`);
    console.log(`本次轮次数：${countBlackboxFlowTurns(selectedFlowCases)}`);
    console.log(`并发数：${concurrency}`);
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
        `flows=${summary.flowCount}`,
        `turns=${summary.total}`,
        `passed=${summary.passed}`,
        `failed=${summary.failed}`,
        `skipped=${summary.skipped}`,
        `needs_review=${summary.needsReview}`,
        `concurrency=${concurrency}`,
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

  test("runs selected homepage chat flows", async () => {
    if (selectionResult?.emptyReason === "no_failed_flows") {
      return;
    }

    const results = await runFlowQueue<BlackboxFlowCase, ManualLlmTurnRecord>(selectedFlowCases, concurrency, async (flowCase) => runFlowCase(flowCase));
    runRecords.push(...results.flatMap((result) => result.records));
    const workerErrors = results
      .filter((result) => result.error)
      .map((result) => `${result.item.id} ${result.item.name}: ${result.error?.message}`);
    const failedFlows = [...new Set(runRecords.filter((record) => record.status === "failed").map((record) => record.flowId))];
    const errors = [
      ...workerErrors,
      ...failedFlows.map((flowId) => `${flowId} flow assertion failed`),
    ];

    if (errors.length > 0) {
      throw new Error(errors.join("\n"));
    }
  }, 60 * 60 * 1000);
});

async function runFlowCase(flowCase: BlackboxFlowCase): Promise<ManualLlmTurnRecord[]> {
  const records: ManualLlmTurnRecord[] = [];
  const state = createBlackboxConversationState(flowCase.id);
  let flowFailureReason: string | undefined;

  if (preflightResult?.status !== "ready") {
    for (let turnIndex = 0; turnIndex < flowCase.turns.length; turnIndex += 1) {
      records.push(createSkippedRecord(
        flowCase,
        flowCase.turns[turnIndex],
        turnIndex + 1,
        state.conversationId,
        preflightResult?.reason ?? "preflight 未满足详细套件运行条件。",
      ));
    }
    return records;
  }

  for (let turnIndex = 0; turnIndex < flowCase.turns.length; turnIndex += 1) {
    const turn = flowCase.turns[turnIndex];

    if (flowFailureReason) {
      records.push(createSkippedRecord(flowCase, turn, turnIndex + 1, state.conversationId, flowFailureReason));
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

    records.push(createTurnRecord(flowCase, turn, turnIndex + 1, result, assertion));

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

  return records;
}

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
    expectedAgentStatus: turn.expectation.expectedAgentStatus,
    actualAgentStatus: result.agentDiagnostics.status,
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
    agentDiagnostics: result.agentDiagnostics,
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
    flowCases: selectedFlowCases,
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
    flowCount: selectedFlowCases.length,
    passed: records.filter((record) => record.status === "passed").length,
    failed: records.filter((record) => record.status === "failed").length,
    skipped: records.filter((record) => record.status === "skipped").length,
    needsReview: records.filter((record) => record.status === "needs_review").length,
    usage,
  };
}

async function writeAcceptanceReport(
  records: ManualLlmTurnRecord[],
  summary: RunSummary,
) {
  const generatedAt = formatShanghaiReportGeneratedAt();
  const tokenDeviation = summarizeTokenDeviation(summary.usage, estimatedTokenUsage);
  const selectionConditions = selectionResult
    ? formatSelectionConditions(selectionResult.conditions)
    : "selection=not_initialized";
  const reportLines = [
    "# 手动 LLM 首页聊天黑盒流程测试报告",
    "",
    `生成时间：${generatedAt}`,
    `模型：${model}`,
    `套件：${suiteLabel}`,
    `运行命令：${runCommand}`,
    `runner 类型：${runnerMode}`,
    `旧兼容事件：${legacyEventsDisabled ? "关闭" : "开启"}`,
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
    "## 运行范围",
    "",
    `- 完整 fixture flow 数：${allFlowCases.length}`,
    `- 完整 fixture turn 数：${countBlackboxFlowTurns(allFlowCases)}`,
    `- 本次筛选 flow 数：${selectedFlowCases.length}`,
    `- 本次筛选 turn 数：${countBlackboxFlowTurns(selectedFlowCases)}`,
    `- 筛选条件：${selectionConditions}`,
    `- 未运行 flow 数：${selectionResult?.excludedFlowCases.length ?? 0}`,
    `- 未运行原因：${formatUnrunReason()}`,
    `- 并发数：${concurrency}`,
    `- 去重检查：${formatGovernanceSummary(governanceSummary)}`,
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
    "## 断言分层",
    "",
    "- 用户可见闭环：回复非空、训练卡片类型、artifact/patch/suggestion 事件与用户可见结果一致。",
    "- Agent 执行证据：`AgentExecutionResult`、tool dependency graph、candidateSetId、validationId、revisionId 和 legacy path skip。",
    "- 语义质量：目标继承、器械排除、引用解析和澄清边界。",
    "- 人工复核：措辞质量、排序和非关键表达稳定性。",
    "",
    "## 失败分类摘要",
    "",
    ...formatFailureCategorySummary(records),
    "",
    "## 流程轮次结果",
    "",
    records.length > 0
      ? records.map(formatRunRecord).join("\n")
      : "- 本次没有需要重跑的失败 flow，未请求真实模型。",
    "",
  ].filter((line) => line !== "");

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, reportLines.join("\n"), "utf8");
}

function formatFailureCategorySummary(records: ManualLlmTurnRecord[]) {
  const categories = summarizeFailureCategories(records);
  const entries = Object.entries(categories);

  if (entries.every(([, value]) => value.count === 0)) {
    return ["- 本次没有失败轮次。"];
  }

  return entries.map(([label, value]) => (
    value.count > 0
      ? `- ${label}：${value.count}（${value.flowTurns.join("；")}）`
      : `- ${label}：0`
  ));
}

function summarizeFailureCategories(records: ManualLlmTurnRecord[]) {
  const categories: Record<string, { count: number; flowTurns: string[] }> = {
    "LLM 参数错误": { count: 0, flowTurns: [] },
    "tool 能力不足": { count: 0, flowTurns: [] },
    "候选不足": { count: 0, flowTurns: [] },
    "result requirement 未满足": { count: 0, flowTurns: [] },
    "hard boundary 失败": { count: 0, flowTurns: [] },
    "保存失败": { count: 0, flowTurns: [] },
  };

  for (const record of records.filter((item) => item.status === "failed")) {
    const text = [
      record.error,
      record.streamError,
      ...record.failureReasons,
      record.agentDiagnostics?.toolNames.join(","),
    ].filter(Boolean).join("\n");
    const flowTurn = `${record.flowId}#${record.turnIndex}`;

    for (const label of classifyFailureText(text)) {
      categories[label].count += 1;
      categories[label].flowTurns.push(flowTurn);
    }
  }

  return categories;
}

function classifyFailureText(text: string) {
  const labels = new Set<string>();

  if (/schema_validation_failed|missing_required_parameter|invalid_parameter|model_output_invalid/.test(text)) {
    labels.add("LLM 参数错误");
  }
  if (/unsupported_operation|ambiguous_resource|unverifiable_result/.test(text)) {
    labels.add("tool 能力不足");
  }
  if (/insufficient_candidates|no_exercise_after_filters|no_hybrid_match|候选不足/.test(text)) {
    labels.add("候选不足");
  }
  if (/result_requirement_unmet/.test(text)) {
    labels.add("result requirement 未满足");
  }
  if (/candidate_query_boundary_mismatch|candidate_set_mismatch|outside_candidate|invalid_dependency|forbidden/.test(text)) {
    labels.add("hard boundary 失败");
  }
  if (/saveConversationArtifactRevision|persistence_failed|保存失败|revisionId|保存 artifact/.test(text)) {
    labels.add("保存失败");
  }

  return [...labels];
}

// 手动验收报告面向本地排查，生成时间使用带 offset 的上海时间，同时保持 Date.parse 可解析。
function formatShanghaiReportGeneratedAt(date = new Date()) {
  const shanghaiOffsetMinutes = 8 * 60;
  const shanghaiTime = new Date(date.getTime() + shanghaiOffsetMinutes * 60_000);

  return shanghaiTime.toISOString().replace("Z", "+08:00");
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
  const agentDiagnostics = formatAgentDiagnostics(record.agentDiagnostics);
  const diagnostics = [
    `卡片类型断言：${record.cardStatus}`,
    `语义断言：${record.semanticStatus}`,
    record.failureLevel ? `失败等级：${record.failureLevel}` : "",
    record.error ? `失败原因：${record.error}` : "",
    record.streamError ? `请求/stream 错误摘要：${record.streamError}` : "",
    record.skipReason ? `跳过原因：${record.skipReason}` : "",
    artifactDiagnostics ? `artifact 诊断：${artifactDiagnostics}` : "",
    agentDiagnostics ? `Agent 诊断：${agentDiagnostics}` : "",
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
    record.expectedAgentStatus ? `- 期望 Agent status：${record.expectedAgentStatus}` : "",
    record.actualAgentStatus ? `- 实际 Agent status：${record.actualAgentStatus}` : "",
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

function formatAgentDiagnostics(diagnostics: BlackboxAgentDiagnostics | undefined) {
  if (!diagnostics) {
    return "";
  }

  return [
    `executionResult=${diagnostics.executionResultPresent}`,
    diagnostics.status ? `status=${diagnostics.status}` : undefined,
    diagnostics.toolNames.length ? `tools=${diagnostics.toolNames.join(",")}` : undefined,
    diagnostics.toolResultIds.length ? `toolResults=${diagnostics.toolResultIds.join(",")}` : undefined,
    diagnostics.candidateSetIds.length ? `candidateSetIds=${diagnostics.candidateSetIds.join(",")}` : undefined,
    diagnostics.validationIds.length ? `validationIds=${diagnostics.validationIds.join(",")}` : undefined,
    diagnostics.policyDecisionIds.length ? `policyDecisionIds=${diagnostics.policyDecisionIds.join(",")}` : undefined,
    diagnostics.revisionIds.length ? `revisionIds=${diagnostics.revisionIds.join(",")}` : undefined,
    diagnostics.repairFeedbackCodes.length ? `repairFeedbackCodes=${diagnostics.repairFeedbackCodes.join(",")}` : undefined,
    `repairTurnCount=${diagnostics.repairTurnCount}`,
    diagnostics.finalProjectionSourceToolResultId ? `finalProjectionSourceToolResultId=${diagnostics.finalProjectionSourceToolResultId}` : undefined,
    diagnostics.unregisteredResourceReferences.length ? `unregisteredResourceReferences=${diagnostics.unregisteredResourceReferences.join(",")}` : undefined,
    `fusedFailureCount=${diagnostics.fusedFailureCount}`,
    diagnostics.repairBudgetExhaustedReason ? `repairBudgetExhaustedReason=${diagnostics.repairBudgetExhaustedReason}` : undefined,
    `dependencyGraph=${diagnostics.dependencyGraphPresent}`,
    `legacyPathSkip=${JSON.stringify(diagnostics.legacyPathSkip)}`,
  ].filter(Boolean).join("；");
}

function formatUnrunReason() {
  if (selectionResult?.emptyReason === "no_failed_flows") {
    return "failed-from-report 中没有失败 flow，本次无需重跑。";
  }
  if ((selectionResult?.excludedFlowCases.length ?? 0) > 0) {
    return "被 suite/group/id/failed-from-report 筛选条件排除。";
  }
  if (preflightResult?.status !== "ready") {
    return preflightResult?.reason ?? "preflight 未满足。";
  }
  return "完整运行，无筛选排除。";
}

function formatGovernanceSummary(summary: FlowGovernanceSummary | undefined) {
  if (!summary) {
    return "not_run";
  }

  const unhandledStrictDuplicates = summary.strictDuplicateGroups.filter((group) => !group.allowed);

  return [
    `strictDuplicateGroups=${summary.strictDuplicateGroups.length}`,
    `unhandledStrictDuplicates=${unhandledStrictDuplicates.length}`,
    `repeatedStartGroups=${summary.repeatedStartGroups.length}`,
    `highOverlapGroups=${summary.highOverlapGroups.length}`,
    `missingMetadata=${summary.missingMetadataFlowIds.length}`,
  ].join("；");
}

function readConcurrency() {
  const value = Number(process.env.MANUAL_LLM_CONCURRENCY ?? "1");
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function readListEnv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
