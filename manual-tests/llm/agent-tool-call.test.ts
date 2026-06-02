import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, test } from "vitest";

import {
  applyBlackboxStateFixture,
  createBlackboxConversationState,
  runBlackboxChatTurn,
  runBlackboxPreflight,
  type BlackboxAgentDiagnostics,
  type BlackboxPreflightResult,
  type BlackboxRunnerMode,
  type BlackboxStateFixtureResult,
} from "./blackbox-runner";
import {
  evaluateAgentToolCallResult,
  previewAgentToolText,
  type AgentToolAssertionFailureLevel,
  type AgentToolAssertionStatus,
} from "./agent-tool-assertions";
import { getAgentToolCallCases, type AgentToolCallCase } from "./agent-tool-fixtures";
import {
  formatAgentToolSelectionConditions,
  selectAgentToolCallCases,
  type AgentToolCallSelectionResult,
} from "./agent-tool-selection";
import { runFlowQueue } from "./flow-execution";

type DeepSeekUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type AgentToolTurnRecord = {
  caseId: string;
  caseName: string;
  source: string;
  group: string;
  stateFixture: string;
  userInput: string;
  expectationNote: string;
  expectedAgentStatuses: string[];
  actualAgentStatus?: string;
  expectedCardTypes: string[];
  actualCardTypes: string[];
  requiredAgentTools: string[];
  forbiddenAgentTools: string[];
  actualAgentTools: string[];
  assistantPreview: string;
  executionStatus: AgentToolAssertionStatus;
  toolStatus: AgentToolAssertionStatus;
  contractStatus: AgentToolAssertionStatus;
  status: AgentToolAssertionStatus;
  failureLevel?: AgentToolAssertionFailureLevel;
  failureReasons: string[];
  seededArtifactIds: string[];
  fixtureNote?: string;
  conversationId: string;
  responseMessageId?: string;
  traceId?: string;
  streamError?: string;
  skipReason?: string;
  usage?: DeepSeekUsage;
  agentDiagnostics?: BlackboxAgentDiagnostics;
};

type AgentToolTokenEstimate = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  source: "fallback";
  calibrationSummary: string;
};

type RunSummary = ReturnType<typeof summarizeRunRecords>;

const model = "deepseek-v4-flash";
const configuredApiKey = process.env.DEEPSEEK_API_KEY?.trim();
const runnerMode: BlackboxRunnerMode = "api_route";
const dryRun = process.env.MANUAL_LLM_AGENT_TOOL_DRY_RUN === "1";
const runCommand = process.env.MANUAL_LLM_AGENT_TOOL_RUN_COMMAND?.trim() || "npm run test:llm:agent-tool";
const allCases = getAgentToolCallCases();
const reportPath = process.env.MANUAL_LLM_AGENT_TOOL_REPORT_PATH?.trim()
  ? path.resolve(process.env.MANUAL_LLM_AGENT_TOOL_REPORT_PATH)
  : path.join(process.cwd(), "docs", "manual-llm-agent-tool-call-latest-report.md");
const concurrency = readConcurrency();
const runRecords: AgentToolTurnRecord[] = [];
let selectedCases: AgentToolCallCase[] = [];
let selectionResult: AgentToolCallSelectionResult | undefined;
let preflightResult: BlackboxPreflightResult | undefined;
let estimatedTokenUsage: AgentToolTokenEstimate = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  source: "fallback",
  calibrationSummary: "尚未执行 token 预估。",
};

if (!configuredApiKey && !dryRun) {
  console.warn(
    [
      "Missing DEEPSEEK_API_KEY.",
      "单次 Agent tool 调用测试必须调用真实模型；缺少 key 时只生成跳过摘要。",
      "该测试不会使用 mock、旧快照或非真实模型结果。",
    ].join("\n"),
  );
}

describe("manual LLM single Agent tool call flows", () => {
  beforeAll(async () => {
    selectionResult = await selectAgentToolCallCases(allCases, {
      ids: readListEnv("MANUAL_LLM_AGENT_TOOL_IDS"),
      groups: readListEnv("MANUAL_LLM_AGENT_TOOL_GROUPS"),
      tools: readListEnv("MANUAL_LLM_AGENT_TOOL_NAMES"),
      statuses: readListEnv("MANUAL_LLM_AGENT_TOOL_STATUSES"),
      states: readListEnv("MANUAL_LLM_AGENT_TOOL_STATES"),
      failedFromReportPath: process.env.MANUAL_LLM_AGENT_TOOL_FAILED_FROM_REPORT?.trim() || undefined,
    });
    selectedCases = selectionResult.selectedCases;
    estimatedTokenUsage = estimateAgentToolTokenUsage(selectedCases);

    if (selectionResult.errors.length > 0) {
      throw new Error(selectionResult.errors.join("\n"));
    }

    preflightResult = dryRun
      ? createDryRunPreflightResult()
      : await runBlackboxPreflight({ apiKey: configuredApiKey });

    console.log("手动 LLM 单次 Agent tool 调用流程测试：");
    console.log(`筛选条件：${formatAgentToolSelectionConditions(selectionResult.conditions)}`);
    console.log(`完整用例数：${allCases.length}`);
    console.log(`本次用例数：${selectedCases.length}`);
    console.log(`并发数：${concurrency}`);
    console.log(`dryRun：${dryRun ? "true" : "false"}`);
    console.log(`预估输入token：${estimatedTokenUsage.promptTokens}`);
    console.log(`预估输出token：${estimatedTokenUsage.completionTokens}`);
    console.log(`预估总token：${estimatedTokenUsage.totalTokens}`);
    console.log(`preflight：${preflightResult.status}`);
  });

  afterAll(async () => {
    const summary = summarizeRunRecords(runRecords);

    console.log(
      [
        "Manual LLM Agent tool call summary:",
        `cases=${summary.caseCount}`,
        `passed=${summary.passed}`,
        `failed=${summary.failed}`,
        `skipped=${summary.skipped}`,
        `needs_review=${summary.needsReview}`,
        `concurrency=${concurrency}`,
      ].join(" "),
    );
    console.log(
      [
        "Manual LLM Agent tool actual token usage:",
        `prompt_tokens=${summary.usage.prompt_tokens}`,
        `completion_tokens=${summary.usage.completion_tokens}`,
        `total_tokens=${summary.usage.total_tokens}`,
      ].join(" "),
    );

    await writeAcceptanceReport(runRecords, summary);
    console.log(`Manual LLM Agent tool acceptance report: ${reportPath}`);
  });

  test("runs selected single Agent tool call cases", async () => {
    if (selectionResult?.emptyReason === "no_failed_cases") {
      return;
    }

    const results = await runFlowQueue<AgentToolCallCase, AgentToolTurnRecord>(
      selectedCases,
      concurrency,
      async (testCase) => [await runAgentToolCase(testCase)],
    );
    runRecords.push(...results.flatMap((result) => result.records));
    const workerErrors = results
      .filter((result) => result.error)
      .map((result) => `${result.item.id} ${result.item.name}: ${result.error?.message}`);
    const failedCases = runRecords
      .filter((record) => record.status === "failed")
      .map((record) => `${record.caseId} case assertion failed`);
    const errors = [...workerErrors, ...failedCases];

    if (errors.length > 0) {
      throw new Error(errors.join("\n"));
    }
  }, 60 * 60 * 1000);
});

async function runAgentToolCase(testCase: AgentToolCallCase): Promise<AgentToolTurnRecord> {
  const state = createBlackboxConversationState(testCase.id);

  if (preflightResult?.status !== "ready") {
    return createSkippedRecord(
      testCase,
      state.conversationId,
      preflightResult?.reason ?? "preflight 未满足单次 Agent tool 测试运行条件。",
    );
  }

  let fixtureResult: BlackboxStateFixtureResult;

  try {
    fixtureResult = await applyBlackboxStateFixture({
      state,
      fixtureName: testCase.stateFixture,
    });
  } catch (error) {
    return createFixtureFailedRecord(
      testCase,
      state.conversationId,
      error instanceof Error ? error.message : String(error),
    );
  }

  const result = await runBlackboxChatTurn({
    apiKey: configuredApiKey,
    state,
    userInput: testCase.userInput,
  });
  const assertion = evaluateAgentToolCallResult({ testCase, result });

  return {
    caseId: testCase.id,
    caseName: testCase.name,
    source: testCase.source,
    group: testCase.group,
    stateFixture: testCase.stateFixture,
    userInput: testCase.userInput,
    expectationNote: testCase.expectation.note,
    expectedAgentStatuses: testCase.expectation.expectedAgentStatuses,
    actualAgentStatus: result.agentDiagnostics.status,
    expectedCardTypes: testCase.expectation.expectedCardTypes,
    actualCardTypes: result.actionTypes,
    requiredAgentTools: testCase.expectation.requiredAgentTools,
    forbiddenAgentTools: testCase.expectation.forbiddenAgentTools,
    actualAgentTools: result.agentDiagnostics.toolNames,
    assistantPreview: previewAgentToolText(result.assistantText || "未获得可展示回复", 220),
    executionStatus: assertion.executionStatus,
    toolStatus: assertion.toolStatus,
    contractStatus: assertion.contractStatus,
    status: assertion.finalStatus,
    failureLevel: assertion.failureLevel,
    failureReasons: assertion.failureReasons,
    seededArtifactIds: fixtureResult.seededArtifactIds,
    fixtureNote: fixtureResult.note,
    conversationId: result.conversationId,
    responseMessageId: result.responseMessageId,
    traceId: result.traceId,
    streamError: result.error ? `${result.error.code}: ${result.error.message}` : undefined,
    usage: result.usage,
    agentDiagnostics: result.agentDiagnostics,
  };
}

function createSkippedRecord(
  testCase: AgentToolCallCase,
  conversationId: string,
  skipReason: string,
): AgentToolTurnRecord {
  return {
    caseId: testCase.id,
    caseName: testCase.name,
    source: testCase.source,
    group: testCase.group,
    stateFixture: testCase.stateFixture,
    userInput: testCase.userInput,
    expectationNote: testCase.expectation.note,
    expectedAgentStatuses: testCase.expectation.expectedAgentStatuses,
    expectedCardTypes: testCase.expectation.expectedCardTypes,
    actualCardTypes: [],
    requiredAgentTools: testCase.expectation.requiredAgentTools,
    forbiddenAgentTools: testCase.expectation.forbiddenAgentTools,
    actualAgentTools: [],
    assistantPreview: "未请求真实模型。",
    executionStatus: "skipped",
    toolStatus: "skipped",
    contractStatus: "skipped",
    status: "skipped",
    failureReasons: [],
    seededArtifactIds: [],
    conversationId,
    skipReason,
  };
}

function createFixtureFailedRecord(
  testCase: AgentToolCallCase,
  conversationId: string,
  errorMessage: string,
): AgentToolTurnRecord {
  return {
    ...createSkippedRecord(testCase, conversationId, ""),
    assistantPreview: "测试状态预置失败。",
    executionStatus: "failed",
    toolStatus: "failed",
    contractStatus: "failed",
    status: "failed",
    failureLevel: "P0",
    failureReasons: [`[P0] stateFixture 预置失败：${errorMessage}`],
    skipReason: undefined,
  };
}

function estimateAgentToolTokenUsage(cases: AgentToolCallCase[]): AgentToolTokenEstimate {
  const charCount = cases.reduce((sum, testCase) => (
    sum + testCase.userInput.length + testCase.expectation.note.length
  ), 0);
  const promptTokens = Math.ceil(charCount / 2) + cases.length * 2_400;
  const completionTokens = cases.length * 760;

  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    source: "fallback",
    calibrationSummary: `按 ${cases.length} 个单次 Agent tool case 和保守均值估算。`,
  };
}

function summarizeRunRecords(records: AgentToolTurnRecord[]) {
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
    caseCount: selectedCases.length,
    passed: records.filter((record) => record.status === "passed").length,
    failed: records.filter((record) => record.status === "failed").length,
    skipped: records.filter((record) => record.status === "skipped").length,
    needsReview: records.filter((record) => record.status === "needs_review").length,
    usage,
  };
}

async function writeAcceptanceReport(records: AgentToolTurnRecord[], summary: RunSummary) {
  const generatedAt = formatShanghaiReportGeneratedAt();
  const tokenDeviation = summarizeTokenDeviation(summary.usage, estimatedTokenUsage);
  const selectionConditions = selectionResult
    ? formatAgentToolSelectionConditions(selectionResult.conditions)
    : "selection=not_initialized";
  const reportLines = [
    "# 手动 LLM 单次 Agent Tool 调用流程测试报告",
    "",
    `生成时间：${generatedAt}`,
    `模型：${model}`,
    `运行命令：${runCommand}`,
    `runner 类型：${runnerMode}`,
    `dryRun：${dryRun ? "true" : "false"}`,
    `旧兼容事件：${process.env.MANUAL_LLM_DISABLE_LEGACY_EVENTS === "1" ? "关闭" : "开启"}`,
    `真实/跳过状态：${preflightResult?.status === "ready" ? "真实模型已运行" : "跳过或环境未满足"}`,
    "",
    "## 汇总",
    "",
    `- 用例数：${summary.caseCount}`,
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
    `- 完整 fixture case 数：${allCases.length}`,
    `- 本次筛选 case 数：${selectedCases.length}`,
    `- 筛选条件：${selectionConditions}`,
    `- 未运行 case 数：${selectionResult?.excludedCases.length ?? 0}`,
    `- 未运行原因：${formatUnrunReason()}`,
    `- 并发数：${concurrency}`,
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
    "- `passed`：执行基础、tool 选择和结果合同断言都通过。",
    "- `failed`：P0/P1/P2 自动断言失败。",
    "- `skipped`：缺少 key、dry-run、preflight 未满足或 failed-from-report 没有失败用例。",
    "- `needs_review`：仅 P3 内容质量需要人工复核，不计为通过。",
    "",
    "## 断言分层",
    "",
    "- 执行基础：stream 成功、回复非空、`AgentExecutionResult` 和 `dependencyGraph` 存在。",
    "- tool 选择：Agent status、必需 tool、禁用 tool、训练卡片类型和 legacy path skip。",
    "- 结果合同：candidateSetId、validationId、revisionId、usedToolResultIds、repair 和未注册资源引用。",
    "",
    "## 失败分类摘要",
    "",
    ...formatFailureCategorySummary(records),
    "",
    "## 用例结果",
    "",
    records.length > 0
      ? records.map(formatRunRecord).join("\n")
      : "- 本次没有需要运行的失败 case，未请求真实模型。",
    "",
  ].filter((line) => line !== "");

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, reportLines.join("\n"), "utf8");
}

function formatFailureCategorySummary(records: AgentToolTurnRecord[]) {
  const categories = summarizeFailureCategories(records);
  const entries = Object.entries(categories);

  if (entries.every(([, value]) => value.count === 0)) {
    return ["- 本次没有失败用例。"];
  }

  return entries.map(([label, value]) => (
    value.count > 0
      ? `- ${label}：${value.count}（${value.caseIds.join("；")}）`
      : `- ${label}：0`
  ));
}

function summarizeFailureCategories(records: AgentToolTurnRecord[]) {
  const categories: Record<string, { count: number; caseIds: string[] }> = {
    tool_missing: { count: 0, caseIds: [] },
    unexpected_tool: { count: 0, caseIds: [] },
    tool_input_invalid: { count: 0, caseIds: [] },
    dependency_invalid: { count: 0, caseIds: [] },
    result_contract_invalid: { count: 0, caseIds: [] },
    legacy_path_used: { count: 0, caseIds: [] },
    persistence_failed: { count: 0, caseIds: [] },
  };

  for (const record of records.filter((item) => item.status === "failed")) {
    const text = [
      record.streamError,
      ...record.failureReasons,
      record.actualAgentTools.join(","),
      record.agentDiagnostics?.repairFeedbackCodes.join(","),
    ].filter(Boolean).join("\n");

    for (const label of classifyFailureText(text)) {
      categories[label].count += 1;
      categories[label].caseIds.push(record.caseId);
    }
  }

  return categories;
}

function classifyFailureText(text: string): Array<keyof ReturnType<typeof summarizeFailureCategories>> {
  const labels = new Set<keyof ReturnType<typeof summarizeFailureCategories>>();

  if (/缺少必需 Agent tool|tool_missing/.test(text)) labels.add("tool_missing");
  if (/出现禁用 Agent tool|unexpected_tool/.test(text)) labels.add("unexpected_tool");
  if (/schema_validation_failed|missing_required_parameter|invalid_parameter|tool_input_invalid/.test(text)) labels.add("tool_input_invalid");
  if (/dependencyGraph|candidate_set_mismatch|invalid_dependency|unregisteredResourceReferences|dependency_invalid/.test(text)) labels.add("dependency_invalid");
  if (/candidateSetId|validationId|revisionId|usedToolResultIds|result_contract_invalid/.test(text)) labels.add("result_contract_invalid");
  if (/legacy path skip|legacy_path_used|legacyIntentNormalize|runReadonlyToolLoop/.test(text)) labels.add("legacy_path_used");
  if (/saveConversationArtifactRevision|persistence_failed|保存失败|persistence/.test(text)) labels.add("persistence_failed");

  if (labels.size === 0) {
    labels.add("result_contract_invalid");
  }

  return [...labels];
}

function formatRunRecord(record: AgentToolTurnRecord) {
  const statusLabel = record.status === "passed"
    ? "通过"
    : record.status === "failed"
      ? "失败"
      : record.status === "needs_review"
        ? "需复核"
        : "跳过";
  const expectedCards = record.expectedCardTypes.length ? record.expectedCardTypes.join(", ") : "无固定卡片类型";
  const actualCards = record.actualCardTypes.length ? record.actualCardTypes.join(", ") : "无卡片";
  const diagnostics = [
    `执行基础断言：${record.executionStatus}`,
    `tool 选择断言：${record.toolStatus}`,
    `结果合同断言：${record.contractStatus}`,
    record.failureLevel ? `失败等级：${record.failureLevel}` : "",
    record.failureReasons.length ? `失败原因：${record.failureReasons.join("；")}` : "",
    record.streamError ? `请求/stream 错误摘要：${record.streamError}` : "",
    record.skipReason ? `跳过原因：${record.skipReason}` : "",
    record.fixtureNote ? `stateFixture：${record.fixtureNote}` : "",
    record.seededArtifactIds.length ? `预置 artifact：${record.seededArtifactIds.join(",")}` : "",
    record.responseMessageId ? `responseMessageId：${record.responseMessageId}` : "",
    record.traceId ? `traceId：${record.traceId}` : "",
    `conversationId：${record.conversationId}`,
    record.agentDiagnostics ? `Agent 诊断：${formatAgentDiagnostics(record.agentDiagnostics)}` : "",
  ].filter(Boolean);

  return [
    `### ${record.caseId} ${record.caseName}`,
    "",
    `- 状态：${statusLabel}`,
    `- 来源：${record.source}`,
    `- group：${record.group}`,
    `- stateFixture：${record.stateFixture}`,
    `- 用户输入：${record.userInput}`,
    `- 期望结果：${record.expectationNote}`,
    `- 期望 Agent status：${record.expectedAgentStatuses.join(" 或 ")}`,
    `- 实际 Agent status：${record.actualAgentStatus ?? "missing"}`,
    `- 期望卡片类型：${expectedCards}`,
    `- 实际卡片类型：${actualCards}`,
    `- 必需 tool：${record.requiredAgentTools.length ? record.requiredAgentTools.join(", ") : "无"}`,
    `- 禁止 tool：${record.forbiddenAgentTools.length ? record.forbiddenAgentTools.join(", ") : "无"}`,
    `- 实际 tool：${record.actualAgentTools.length ? record.actualAgentTools.join(", ") : "无"}`,
    `- assistant 摘要：${record.assistantPreview}`,
    ...diagnostics.map((line) => `- ${line}`),
    "",
  ].join("\n");
}

function formatAgentDiagnostics(diagnostics: BlackboxAgentDiagnostics) {
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

function createDryRunPreflightResult(): BlackboxPreflightResult {
  return {
    status: "skipped",
    modelAvailable: Boolean(configuredApiKey),
    databaseAvailable: false,
    artifactTablesAvailable: false,
    seedDataAvailable: false,
    checkedAt: new Date().toISOString(),
    reason: "--dry-run 已开启，只生成筛选、预估和跳过报告，不请求真实模型。",
  };
}

function formatShanghaiReportGeneratedAt(date = new Date()) {
  const shanghaiOffsetMinutes = 8 * 60;
  const shanghaiTime = new Date(date.getTime() + shanghaiOffsetMinutes * 60_000);

  return shanghaiTime.toISOString().replace("Z", "+08:00");
}

function summarizeTokenDeviation(actual: Required<DeepSeekUsage>, estimate: AgentToolTokenEstimate) {
  if (actual.total_tokens <= 0) {
    return "本次没有真实 token usage，通常表示 dry-run、跳过或运行失败。";
  }

  const delta = actual.total_tokens - estimate.totalTokens;
  const ratio = estimate.totalTokens > 0 ? Math.round((delta / estimate.totalTokens) * 100) : 0;

  return `实际 total_tokens=${actual.total_tokens}，预估=${estimate.totalTokens}，偏差=${delta} (${ratio}%)。`;
}

function formatUnrunReason() {
  if (selectionResult?.emptyReason === "no_failed_cases") {
    return "failed-from-report 中没有失败 case，本次无需重跑。";
  }
  if ((selectionResult?.excludedCases.length ?? 0) > 0) {
    return "被 group/id/tool/status/state/failed-from-report 筛选条件排除。";
  }
  if (dryRun) {
    return "--dry-run 开启。";
  }
  if (preflightResult?.status !== "ready") {
    return preflightResult?.reason ?? "preflight 未满足。";
  }
  return "完整运行，无筛选排除。";
}

function readListEnv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readConcurrency() {
  const value = Number(process.env.MANUAL_LLM_AGENT_TOOL_CONCURRENCY ?? "1");

  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}
