import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import { evaluateBlackboxTurnResult } from "@/manual-tests/llm/assertions";
import { runBlackboxPreflight, type BlackboxTurnResult } from "@/manual-tests/llm/blackbox-runner";
import { getBlackboxFlowCases } from "@/manual-tests/llm/flow-fixtures";
import { createFlowFailureSkipReason } from "@/manual-tests/llm/flow-runner-policy";
import { estimateTokenUsageForReports } from "@/manual-tests/llm/token-estimate";

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
