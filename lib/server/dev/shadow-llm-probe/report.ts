import "server-only";

import {
  ShadowLlmProbeConcernCategorySchema,
  ShadowLlmProbeDecisionSchema,
  type ShadowLlmProbeConcernCategory,
  type ShadowLlmProbeManifest,
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

  const developerDiagnosis = buildDeveloperDiagnosis({
    finalStatus: manifest.status,
    terminalReason: manifest.terminal?.reason,
    rounds,
    categories,
  });

  const report: ShadowLlmProbeReport = {
    schemaVersion: 1,
    runId: manifest.runId,
    generatedAt: new Date().toISOString(),
    finalStatus: manifest.status,
    inputSource: manifest.inputSource,
    roundCount: manifest.rounds.length,
    rounds,
    categories: [...categories].filter((category) => ShadowLlmProbeConcernCategorySchema.safeParse(category).success),
    developerDiagnosis,
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
    "## 诊断结论",
    "",
    `- summary: ${report.developerDiagnosis.summary}`,
    `- basis: ${report.developerDiagnosis.basis}`,
    `- included: ${String(report.developerDiagnosis.included)}`,
    report.developerDiagnosis.runBlocker ? `- runBlocker: ${report.developerDiagnosis.runBlocker.kind} - ${report.developerDiagnosis.runBlocker.summary}` : undefined,
    "",
    "### 合同问题分类",
    "",
    ...renderCategoryChecklist(report),
    "",
    "### 开发者建议",
    "",
    ...renderDeveloperFindings(report),
    "",
    "### 无法判断的项目",
    "",
    report.developerDiagnosis.unavailableChecks.length
      ? report.developerDiagnosis.unavailableChecks.map((item) => `- ${item}`).join("\n")
      : "- none",
    "",
    report.developerDiagnosis.note,
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
    `- ${report.developerDiagnosis.summary}`,
    ...(report.developerDiagnosis.runBlocker ? [
      `- 阻断影响：${report.developerDiagnosis.runBlocker.impact}`,
      `- 建议下一步：${report.developerDiagnosis.runBlocker.nextStep}`,
    ] : []),
    "",
  ].filter((line): line is string => typeof line === "string");

  return `${lines.join("\n")}\n`;
}

type TerminalStatus = ShadowLlmProbeManifest["status"];

type BuildDeveloperDiagnosisInput = {
  finalStatus: TerminalStatus;
  terminalReason?: string;
  rounds: ShadowLlmProbeReport["rounds"];
  categories: Set<ShadowLlmProbeConcernCategory>;
};

const CONTRACT_CATEGORY_LABELS: Record<ShadowLlmProbeConcernCategory, string> = {
  prompt_conflict: "system prompt / planner policy 是否存在过多或互相打架的规则",
  tool_selection_ambiguous: "tool description 是否讲清什么时候该调用",
  schema_source_unclear: "schema description 是否讲清字段来源、枚举和 ref 来源",
  tool_result_summary_insufficient: "tool result summary 是否把关键事实投影给模型",
  stop_condition_unclear: "预算、重复调用、停止条件是否放在模型可操作的位置",
  finalization_contract_unclear: "finalization tool 的完成条件是否清楚",
  debug_only_leakage: "Shadow input 是否泄漏 debug-only 或模型不可见事实",
  case_specific_rule_smell: "规则是否把具体 case 升格成生产通用规则",
  runtime_budget_mismatch: "模型可见预算是否与 runner / runtime 实际预算一致",
  contamination_risk: "Shadow 决策是否使用了 input 外部知识",
};

const CONTRACT_CATEGORY_RECOMMENDATIONS: Record<ShadowLlmProbeConcernCategory, string> = {
  prompt_conflict: "收敛为少量稳定优先级规则，把 case-specific 例子移到测试或业务 tool 局部说明。",
  tool_selection_ambiguous: "在 tool description 中写清 resource、能力族、何时调用、不能支撑什么输出，以及与相邻 tool 的边界。",
  schema_source_unclear: "在 schema description 中标明字段由用户提供、tool result 引用、数据库候选还是模型生成，避免模型猜 ID 或 ref。",
  tool_result_summary_insufficient: "补足下一轮决策需要的正向事实、负向边界、resource role、coverage 和可消费性说明。",
  stop_condition_unclear: "把停止条件、预算含义、重复调用边界和恢复路径放入模型实际可见且可逐轮判断的位置。",
  finalization_contract_unclear: "明确 finalization tool 的输入来源、完成条件、可引用资源和失败/澄清边界。",
  debug_only_leakage: "从模型可见输入中移除 debug-only 字段，只保留生产 provider request 中真实可见的事实。",
  case_specific_rule_smell: "改写为稳定抽象合同；具体用户原话、字段组合或 trace 个例只进入回归测试。",
  runtime_budget_mismatch: "统一 runner、runtime config 和模型可见预算摘要，确保模型看到的预算就是实际保险丝。",
  contamination_risk: "重新执行该轮 Shadow 决策，只提供 round input，避免源码、memory、trace 或开发者解释进入判断。",
};

const ALL_CONTRACT_CATEGORIES = Object.keys(CONTRACT_CATEGORY_LABELS) as ShadowLlmProbeConcernCategory[];

function buildDeveloperDiagnosis(input: BuildDeveloperDiagnosisInput): ShadowLlmProbeReport["developerDiagnosis"] {
  const findings = [...input.categories].map((category) => ({
    category,
    severity: severityForCategory(category),
    title: CONTRACT_CATEGORY_LABELS[category],
    evidence: collectCategoryEvidence(category, input.rounds),
    recommendation: CONTRACT_CATEGORY_RECOMMENDATIONS[category],
  }));
  const runBlocker = createRunBlocker(input.finalStatus, input.terminalReason);
  const unavailableChecks = createUnavailableChecks(input.finalStatus);
  const summary = summarizeDeveloperDiagnosis({
    finalStatus: input.finalStatus,
    findingCount: findings.length,
    runBlockerSummary: runBlocker?.summary,
  });

  return {
    included: true,
    basis: "shadow_run_only",
    summary,
    ...(runBlocker ? { runBlocker } : {}),
    findings,
    unavailableChecks,
    note: "开发者诊断建议只基于本次 shadow run 文件生成；它不是 Shadow 决策依据，也没有读取源码、测试、OpenSpec 或数据库 raw payload。",
  };
}

function severityForCategory(category: ShadowLlmProbeConcernCategory): "info" | "warning" | "error" {
  if (category === "contamination_risk" || category === "debug_only_leakage") {
    return "error";
  }
  return "warning";
}

function collectCategoryEvidence(category: ShadowLlmProbeConcernCategory, rounds: ShadowLlmProbeReport["rounds"]) {
  const evidence = rounds.flatMap((round) => [
    ...round.contractConcerns
      .filter((concern) => concern.category === category)
      .map((concern) => `${round.roundId}: ${concern.summary}${concern.evidencePath ? ` (${concern.evidencePath})` : ""}`),
    ...(category === "contamination_risk" && round.contaminationAudit?.usedOnlyShadowInput === false
      ? [`${round.roundId}: contaminationAudit.usedOnlyShadowInput=false`]
      : []),
  ]);

  return evidence.length ? evidence : [`报告归因包含 ${category}，但当前轮次没有更细的 evidencePath。`];
}

function createRunBlocker(finalStatus: TerminalStatus, terminalReason: string | undefined) {
  const reason = terminalReason ?? finalStatus;

  if (finalStatus === "tool_execution_failed") {
    return {
      kind: finalStatus,
      summary: `真实 dev-safe tool 执行失败：${reason}`,
      impact: "本次诊断没有拿到成功的模型可见 tool result summary，无法继续判断后续 summary 投影、finalization 收口和停止条件是否足够。",
      nextStep: "先修复本地运行环境或 tool handler 失败原因，再用同一用户问题重新运行 Shadow Probe；如果失败来自数据库连接，优先检查 .env.local 中的 DATABASE_URL 和本地数据库状态。",
    } as const;
  }

  if (finalStatus === "decision_validation_failed") {
    return {
      kind: finalStatus,
      summary: `Shadow decision 未通过 runner 校验：${reason}`,
      impact: "本次结果只能说明 Codex 写出的 shadow decision 不符合当前模型可见合同或 schema，不能继续推断真实 tool result 后续链路。",
      nextStep: "根据校验失败原因修正 round decision，或检查 skill 的 decision schema 说明是否仍不够清楚。",
    } as const;
  }

  if (finalStatus === "budget_exhausted") {
    return {
      kind: finalStatus,
      summary: `Shadow Probe 预算耗尽：${reason}`,
      impact: "模型可见预算或 runner 预算阻止继续推进，需要先判断这是合理停止还是预算说明/保险丝位置不清。",
      nextStep: "对照 round input 中的 budget、runtime config 和重复调用记录，确认预算是否真实反映生产模型可操作边界。",
    } as const;
  }

  return undefined;
}

function createUnavailableChecks(finalStatus: TerminalStatus) {
  if (finalStatus === "tool_execution_failed") {
    return [
      "tool result summary 是否投影关键事实：不可判断，因为 tool 未成功返回 summary。",
      "finalization tool 完成条件是否清楚：不可判断，因为未进入成功 tool result 后的收口轮次。",
      "停止条件是否可操作：只能判断失败前预算可见性，不能判断成功链路中的停止边界。",
    ];
  }

  if (finalStatus === "decision_validation_failed") {
    return [
      "后续 tool result summary、finalization 和停止条件不可判断，因为当前 decision 未通过 runner 校验。",
    ];
  }

  if (finalStatus === "budget_exhausted") {
    return [
      "预算耗尽后的理想下一步不可判断，需要先确认预算是否符合本轮诊断目标。",
    ];
  }

  if (finalStatus === "active") {
    return [
      "run 尚未进入终态，最终合同归因和收口判断不可视为完成。",
    ];
  }

  return [];
}

function summarizeDeveloperDiagnosis(input: {
  finalStatus: TerminalStatus;
  findingCount: number;
  runBlockerSummary?: string;
}) {
  if (input.runBlockerSummary) {
    return `诊断未完成：${input.runBlockerSummary}`;
  }

  if (input.finalStatus === "contract_gap") {
    return `Shadow 决策进入 contract_gap，发现 ${input.findingCount} 个稳定合同类别疑点。`;
  }

  if (input.finalStatus === "final_answer") {
    return input.findingCount
      ? `Shadow 决策已收口为 final_answer，但仍记录 ${input.findingCount} 个合同风险。`
      : "Shadow 决策已收口为 final_answer，本次 run 未记录明确合同类别疑点。";
  }

  if (input.finalStatus === "active") {
    return "诊断尚未完成：run 仍处于 active，需要继续写 decision 并运行 --continue。";
  }

  return `诊断结束：finalStatus=${input.finalStatus}。`;
}

function renderCategoryChecklist(report: ShadowLlmProbeReport) {
  const found = new Set(report.categories);

  return ALL_CONTRACT_CATEGORIES.map((category) => {
    const status = found.has(category) ? "命中" : "未命中";
    return `- ${category}: ${status} - ${CONTRACT_CATEGORY_LABELS[category]}`;
  });
}

function renderDeveloperFindings(report: ShadowLlmProbeReport) {
  if (!report.developerDiagnosis.findings.length) {
    return ["- 未发现明确合同类别疑点；如果真实生产表现仍异常，需要结合源码、trace 或黑盒测试做第二阶段外部审查。"];
  }

  return report.developerDiagnosis.findings.flatMap((finding) => [
    `- [${finding.severity}] ${finding.category}: ${finding.title}`,
    `  - evidence: ${finding.evidence.join(" | ")}`,
    `  - recommendation: ${finding.recommendation}`,
  ]);
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
