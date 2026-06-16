import "server-only";

import {
  ShadowLlmProbeConcernCategorySchema,
  ShadowLlmProbeDecisionSchema,
  type ShadowLlmProbeConcernCategory,
  type ShadowLlmProbeReport,
} from "@/lib/shared/shadow-llm-probe/schema";

import { createShadowLlmProbeFileStore } from "./file-store";

export type GenerateShadowLlmProbeReportOptions = {
  cwd?: string;
  runId: string;
};

/** generateShadowLlmProbeReport 只读取 run 目录文件生成报告，不重新执行 tool，也不调用模型。 */
export async function generateShadowLlmProbeReport(options: GenerateShadowLlmProbeReportOptions) {
  const store = createShadowLlmProbeFileStore(options.cwd);
  const manifest = await store.readManifest(options.runId);
  const rounds: ShadowLlmProbeReport["rounds"] = [];
  const categories = new Set<ShadowLlmProbeConcernCategory>();

  for (const round of manifest.rounds) {
    const decision = await tryReadDecision(store, manifest.runId, round.roundId);
    const toolResult = round.toolResultPath ? await tryReadToolResult(store, manifest.runId, round.roundId) : undefined;

    decision?.contractConcerns.forEach((concern) => categories.add(concern.category));
    if (decision?.contaminationAudit.usedOnlyShadowInput === false) {
      categories.add("contamination_risk");
    }

    rounds.push({
      roundId: round.roundId,
      ...(decision ? { decision: decision.decision } : {}),
      ...(decision?.toolName ? { toolName: decision.toolName } : {}),
      evidence: decision?.evidence ?? [],
      fieldRationale: decision?.fieldRationale ?? [],
      missingFacts: decision?.missingFacts ?? [],
      contractConcerns: decision?.contractConcerns ?? [],
      ...(decision?.contaminationAudit ? { contaminationAudit: decision.contaminationAudit } : {}),
      ...(toolResult ? { toolResultStatus: toolResult.status } : {}),
    });
  }

  const report: ShadowLlmProbeReport = {
    schemaVersion: 1,
    runId: manifest.runId,
    generatedAt: new Date().toISOString(),
    finalStatus: manifest.status,
    inputSource: manifest.inputSource,
    roundCount: manifest.rounds.length,
    rounds,
    categories: [...categories].filter((category) => ShadowLlmProbeConcernCategorySchema.safeParse(category).success),
    developerDiagnosis: {
      included: false,
      note: "本报告未读取源码、测试或 OpenSpec 生成开发者诊断建议；如需补充，应在 Shadow 决策报告冻结后另行追加，且不得作为 Shadow 决策依据。",
    },
  };
  const markdown = renderShadowLlmProbeMarkdown(report, manifest.terminal?.reason);

  await store.writeReport(manifest.runId, report, markdown);

  return {
    runId: manifest.runId,
    reportJsonPath: store.reportJsonPath(manifest.runId),
    reportMarkdownPath: store.reportMarkdownPath(manifest.runId),
  };
}

function renderShadowLlmProbeMarkdown(report: ShadowLlmProbeReport, terminalReason: string | undefined) {
  const lines = [
    `# Codex Shadow LLM Probe Report`,
    "",
    "## Shadow 决策报告",
    "",
    `- runId: ${report.runId}`,
    `- finalStatus: ${report.finalStatus}`,
    `- roundCount: ${report.roundCount}`,
    `- inputSource: ${report.inputSource.kind}`,
    terminalReason ? `- terminalReason: ${terminalReason}` : undefined,
    "",
    "### 轮次摘要",
    "",
    ...report.rounds.flatMap((round) => [
      `#### ${round.roundId}`,
      "",
      `- decision: ${round.decision ?? "missing_decision"}`,
      round.toolName ? `- toolName: ${round.toolName}` : undefined,
      round.toolResultStatus ? `- toolResultStatus: ${round.toolResultStatus}` : undefined,
      `- evidence: ${round.evidence.map((item) => `${item.path} ${item.summary}`).join(" | ") || "none"}`,
      `- fieldRationale: ${round.fieldRationale.map((item) => `${item.path} ${item.reason}`).join(" | ") || "none"}`,
      `- missingFacts: ${round.missingFacts.join(" | ") || "none"}`,
      `- contractConcerns: ${round.contractConcerns.map((item) => `${item.category}: ${item.summary}`).join(" | ") || "none"}`,
      `- contaminationAudit: ${round.contaminationAudit ? JSON.stringify(round.contaminationAudit) : "missing"}`,
      "",
    ]),
    "### 合同问题归因",
    "",
    report.categories.length ? report.categories.map((category) => `- ${category}`).join("\n") : "- none",
    "",
    "## 开发者诊断建议",
    "",
    report.developerDiagnosis.note,
    "",
  ].filter((line): line is string => typeof line === "string");

  return `${lines.join("\n")}\n`;
}

async function tryReadDecision(store: ReturnType<typeof createShadowLlmProbeFileStore>, runId: string, roundId: string) {
  try {
    return ShadowLlmProbeDecisionSchema.parse(await store.readDecision(runId, roundId));
  } catch {
    return undefined;
  }
}

async function tryReadToolResult(store: ReturnType<typeof createShadowLlmProbeFileStore>, runId: string, roundId: string) {
  try {
    return await store.readToolResult(runId, roundId);
  } catch {
    return undefined;
  }
}

