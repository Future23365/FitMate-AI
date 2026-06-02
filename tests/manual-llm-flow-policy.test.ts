import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import { evaluateBlackboxTurnResult } from "@/manual-tests/llm/assertions";
import { runBlackboxPreflight, type BlackboxTurnResult } from "@/manual-tests/llm/blackbox-runner";
import { runFlowQueue } from "@/manual-tests/llm/flow-execution";
import { inspectBlackboxFlowGovernance } from "@/manual-tests/llm/flow-governance";
import { getBlackboxFlowCases } from "@/manual-tests/llm/flow-fixtures";
import { createFlowFailureSkipReason } from "@/manual-tests/llm/flow-runner-policy";
import { parseFailedFlowIdsFromReport, selectBlackboxFlowCases } from "@/manual-tests/llm/flow-selection";
import { countBlackboxFlowTurns, estimateTokenUsageForReports } from "@/manual-tests/llm/token-estimate";

describe("manual LLM blackbox flow runner policy", () => {
  it("labels first-turn and mid-flow failures before downstream skips", () => {
    expect(createFlowFailureSkipReason(0, "first turn failed")).toContain("首轮基础能力失败");
    expect(createFlowFailureSkipReason(1, "second turn failed")).toContain("第 2 轮失败");
  });

  it("keeps the basic suite stable and adds a broader detail suite", () => {
    const basicCases = getBlackboxFlowCases("basic");
    const detailCases = getBlackboxFlowCases("detail");

    expect(basicCases).toHaveLength(9);
    expect(detailCases).toHaveLength(53);
    expect(detailCases.map((flowCase) => flowCase.id)).toEqual(
      expect.arrayContaining([
        "H01",
        "R03",
        "W08",
        "P04",
        "P07",
        "C03",
        "C05",
        "C06",
        "C08",
        "M03",
        "M04",
        "M05",
        "M07",
        "M08",
        "S03",
        "S05",
        "S06",
        "Q04",
      ]),
    );
    expect(detailCases.every((flowCase) => flowCase.turns.length === 3)).toBe(true);
  });

  it("requires suite, group and risk metadata for every flow", () => {
    const detailCases = getBlackboxFlowCases("detail");
    const governance = inspectBlackboxFlowGovernance(detailCases);

    expect(governance.missingMetadataFlowIds).toEqual([]);
    expect(detailCases.every((flowCase) => flowCase.suite && flowCase.groups.length > 0 && flowCase.riskLevel)).toBe(true);
    expect(new Set(detailCases.map((flowCase) => flowCase.suite))).toEqual(new Set(["basic", "detail_core", "detail_extended"]));
  });

  it("detects no unmarked strict duplicate input sequence in the detailed suite", () => {
    const governance = inspectBlackboxFlowGovernance(getBlackboxFlowCases("detail"));

    expect(governance.strictDuplicateGroups.filter((group) => !group.allowed)).toEqual([]);
    expect(governance.highOverlapGroups.map((group) => group.flowIds.join("/"))).toEqual(
      expect.arrayContaining(["F03/C06", "W08/M03", "W05/C03", "F13/H03", "P03/P04/M05"]),
    );
  });

  it("selects flows by id, group, suite and failed report intersection", async () => {
    const detailCases = getBlackboxFlowCases("detail");
    const dir = await mkdtemp(path.join(tmpdir(), "manual-llm-selection-"));

    try {
      const report = path.join(dir, "report.md");
      await writeFile(report, [
        "### C03 新目标覆盖旧目标 / 第 2 轮：切换腿部",
        "- 状态：失败",
        "### F01 纯动作推荐到刷新推荐 / 第 1 轮：胸部动作推荐",
        "- 状态：通过",
        "### M05 修改计划某一天 / 第 2 轮：第二天太累",
        "- 状态：失败",
      ].join("\n"), "utf8");

      const selection = await selectBlackboxFlowCases(detailCases, {
        groups: ["context"],
        suites: ["detail-core"],
        failedFromReportPath: report,
      });

      expect(selection.errors).toEqual([]);
      expect(selection.conditions.failedFlowIds).toEqual(["C03", "M05"]);
      expect(selection.selectedFlowCases.map((flowCase) => flowCase.id)).toEqual(["C03"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks unknown ids, unknown groups and ordinary empty selections before model calls", async () => {
    const detailCases = getBlackboxFlowCases("detail");
    const unknown = await selectBlackboxFlowCases(detailCases, {
      ids: ["NOPE"],
      groups: ["unknown"],
      suites: ["missing"],
    });
    const empty = await selectBlackboxFlowCases(detailCases, {
      ids: ["F01"],
      groups: ["safety"],
    });

    expect(unknown.errors.join("\n")).toContain("未知 flow id");
    expect(unknown.errors.join("\n")).toContain("未知 group");
    expect(unknown.errors.join("\n")).toContain("未知 suite");
    expect(empty.errors.join("\n")).toContain("筛选结果为空");
  });

  it("parses failed flow ids and treats reports without failures as an empty rerun", async () => {
    const detailCases = getBlackboxFlowCases("detail");
    const dir = await mkdtemp(path.join(tmpdir(), "manual-llm-failed-report-"));

    try {
      const noFailureReport = path.join(dir, "no-failure.md");
      await writeFile(noFailureReport, [
        "### F01 纯动作推荐到刷新推荐 / 第 1 轮：胸部动作推荐",
        "- 状态：通过",
      ].join("\n"), "utf8");

      expect(parseFailedFlowIdsFromReport([
        "### F01 纯动作推荐到刷新推荐 / 第 1 轮：胸部动作推荐",
        "- 状态：失败",
        "### F02 动作推荐升级为单次训练 / 第 1 轮：腿部动作推荐",
        "- 状态：通过",
      ].join("\n"))).toEqual(["F01"]);

      const selection = await selectBlackboxFlowCases(detailCases, {
        failedFromReportPath: noFailureReport,
      });

      expect(selection.errors).toEqual([]);
      expect(selection.emptyReason).toBe("no_failed_flows");
      expect(selection.selectedFlowCases).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps concurrent flow results in fixture order", async () => {
    const items = ["slow", "fast", "middle"];
    const completionOrder: string[] = [];
    const results = await runFlowQueue(items, 3, async (item) => {
      const delayMs = item === "slow" ? 20 : item === "middle" ? 10 : 0;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      completionOrder.push(item);
      return [`record:${item}`];
    });

    expect(completionOrder[0]).toBe("fast");
    expect(results.map((result) => result.item)).toEqual(items);
    expect(results.flatMap((result) => result.records)).toEqual(["record:slow", "record:fast", "record:middle"]);
  });

  it("fails semantic assertions when reference payload is not readable", () => {
    const flowCase = getBlackboxFlowCases("basic").find((item) => item.id === "F15");
    const turn = flowCase?.turns[2];

    expect(flowCase).toBeDefined();
    expect(turn).toBeDefined();

    const result = createResult({
      assistantText: "我找到了你引用的训练内容，但没有安全读取到对应的动作详情。",
      actionTypes: [],
      artifactDiagnostics: {
        recentSummaryCount: 1,
        producedArtifact: false,
        payloadReadable: false,
        payloadReadStatus: "missing",
        referenceResolutionStatus: "not_applicable",
      },
    });
    const assertion = evaluateBlackboxTurnResult({
      flowCase: flowCase!,
      turn: turn!,
      turnIndex: 3,
      result,
    });

    expect(assertion.cardStatus).toBe("passed");
    expect(assertion.semanticStatus).toBe("failed");
    expect(assertion.finalStatus).toBe("failed");
    expect(assertion.failureLevel).toBe("P1");
  });

  it("passes F15 semantic assertions when deterministic reference diagnostics are resolved", () => {
    const flowCase = getBlackboxFlowCases("basic").find((item) => item.id === "F15");
    const turn = flowCase?.turns[2];

    expect(flowCase).toBeDefined();
    expect(turn).toBeDefined();

    const result = createResult({
      assistantText: "最近训练里的第 1 个动作是俯卧撑。做法：保持核心收紧。",
      actionTypes: [],
      artifactDiagnostics: {
        recentSummaryCount: 1,
        producedArtifact: false,
        artifactKind: "routine",
        artifactId: "routine-1",
        payloadReadable: true,
        payloadReadStatus: "readable",
        referenceResolutionStatus: "resolved",
        referenceResolutionSummary: "artifactId=routine-1 kind=routine payload=readable exerciseId=push-up",
      },
    });
    const assertion = evaluateBlackboxTurnResult({
      flowCase: flowCase!,
      turn: turn!,
      turnIndex: 3,
      result,
    });

    expect(assertion.finalStatus).toBe("passed");
  });

  it("calibrates token estimates from recent real reports and ignores skipped or incomplete reports", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "manual-llm-token-"));

    try {
      const skippedReport = path.join(dir, "skipped.md");
      const incompleteReport = path.join(dir, "incomplete.md");
      const realReport = path.join(dir, "real.md");
      await writeFile(skippedReport, [
        "生成时间：2026-06-01T08:00:00.000Z",
        "真实/跳过状态：跳过或环境未满足",
        "- 轮次数：3",
        "- prompt_tokens：0",
        "- completion_tokens：0",
        "- total_tokens：0",
      ].join("\n"), "utf8");
      await writeFile(incompleteReport, [
        "生成时间：2026-06-01T09:00:00.000Z",
        "真实/跳过状态：真实模型已运行",
        "- 轮次数：3",
        "- prompt_tokens：0",
        "- completion_tokens：1200",
        "- total_tokens：1200",
      ].join("\n"), "utf8");
      await writeFile(realReport, [
        "生成时间：2026-06-01T07:00:00.000Z",
        "真实/跳过状态：真实模型已运行",
        "- 轮次数：3",
        "- prompt_tokens：3000",
        "- completion_tokens：900",
        "- total_tokens：3900",
      ].join("\n"), "utf8");

      const estimate = await estimateTokenUsageForReports({
        flowCases: getBlackboxFlowCases("basic").slice(0, 1),
        reportPaths: [skippedReport, incompleteReport, realReport],
      });

      expect(estimate.source).toBe("recent_real_report");
      expect(estimate.calibrationSummary).toContain("real.md");
      expect(estimate.totalTokens).toBeGreaterThan(0);
      expect(countBlackboxFlowTurns(getBlackboxFlowCases("basic").slice(0, 1))).toBe(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("preflight skips cleanly before touching the database when the model key is missing", async () => {
    const preflight = await runBlackboxPreflight({ apiKey: "" });

    expect(preflight.status).toBe("skipped");
    expect(preflight.modelAvailable).toBe(false);
    expect(preflight.reason).toContain("DEEPSEEK_API_KEY");
  });
});

function createResult(overrides: Partial<BlackboxTurnResult> = {}): BlackboxTurnResult {
  return {
    conversationId: "manual-llm-test",
    responseMessageId: "assistant_test",
    assistantText: "好的。",
    actionTypes: [],
    assistantActions: [],
    conversationSummary: "",
    usage: {},
    artifactDiagnostics: {
      recentSummaryCount: 0,
      producedArtifact: false,
      payloadReadable: false,
      payloadReadStatus: "not_applicable",
      referenceResolutionStatus: "not_applicable",
    },
    ...overrides,
  };
}
