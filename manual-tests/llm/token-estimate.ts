import { readFile } from "node:fs/promises";
import path from "node:path";

import type { BlackboxFlowCase } from "./flow-fixtures";

export type TokenEstimate = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  source: "recent_real_report" | "fallback";
  calibrationSummary: string;
};

type ReportTokenStats = {
  fileName: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  turnCount: number;
  isSkipped: boolean;
  generatedAtMs: number;
};

// token 预估只接受完整真实报告，避免跳过报告或缺字段报告把成本校准到 0。
export async function estimateTokenUsageForReports(input: {
  flowCases: BlackboxFlowCase[];
  reportPaths: string[];
}): Promise<TokenEstimate> {
  const reportEstimate = await estimateFromRecentReport(input.flowCases, input.reportPaths);

  if (reportEstimate) {
    return reportEstimate;
  }

  return estimateFallbackTokenUsage(input.flowCases);
}

export function estimateFallbackTokenUsage(flowCases: BlackboxFlowCase[]): TokenEstimate {
  const turnCount = countTurns(flowCases);
  const charCount = flowCases.reduce(
    (flowTotal, flowCase) =>
      flowTotal + flowCase.turns.reduce((turnTotal, turn) => turnTotal + turn.userInput.length + turn.expectation.note.length, 0),
    0,
  );
  const promptTokens = Math.ceil(charCount / 2) + turnCount * 2_400;
  const completionTokens = turnCount * 760;

  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    source: "fallback",
    calibrationSummary: `未找到可用真实运行报告，按 ${flowCases.length} 个 fixture、${turnCount} 轮和保守均值估算。`,
  };
}

async function estimateFromRecentReport(
  flowCases: BlackboxFlowCase[],
  reportPaths: string[],
): Promise<TokenEstimate | null> {
  const reports = await Promise.all(reportPaths.map(readReportTokenStats));
  const realReports = reports.filter(isUsableRealReport)
    .sort((left, right) => right.generatedAtMs - left.generatedAtMs);
  const latest = realReports[0];

  if (!latest) {
    return null;
  }

  const currentTurnCount = countTurns(flowCases);
  const promptPerTurn = latest.promptTokens / latest.turnCount;
  const completionPerTurn = latest.completionTokens / latest.turnCount;
  const promptTokens = Math.ceil(promptPerTurn * currentTurnCount);
  const completionTokens = Math.ceil(completionPerTurn * currentTurnCount);

  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    source: "recent_real_report",
    calibrationSummary: `基于 ${latest.fileName} 的真实 token 均值校准：${latest.turnCount} 轮、total_tokens=${latest.totalTokens}。`,
  };
}

export async function readReportTokenStats(filePath: string): Promise<ReportTokenStats | null> {
  try {
    const content = await readFile(filePath, "utf8");
    const promptTokens = readNumberLine(content, "prompt_tokens");
    const completionTokens = readNumberLine(content, "completion_tokens");
    const totalTokens = readNumberLine(content, "total_tokens");
    const turnCount = readNumberLine(content, "轮次数");
    const generatedAt = content.match(/生成时间：(.+)/)?.[1]?.trim();

    return {
      fileName: path.basename(filePath),
      promptTokens,
      completionTokens,
      totalTokens,
      turnCount,
      isSkipped: /真实模型.*未运行|跳过报告|缺少 DEEPSEEK_API_KEY|跳过或环境未满足/.test(content),
      generatedAtMs: generatedAt ? Date.parse(generatedAt) || 0 : 0,
    };
  } catch {
    return null;
  }
}

function isUsableRealReport(report: ReportTokenStats | null): report is ReportTokenStats {
  return Boolean(
    report &&
      !report.isSkipped &&
      report.promptTokens > 0 &&
      report.completionTokens > 0 &&
      report.totalTokens > 0 &&
      report.turnCount > 0,
  );
}

function countTurns(flowCases: BlackboxFlowCase[]) {
  return flowCases.reduce((sum, flowCase) => sum + flowCase.turns.length, 0);
}

function readNumberLine(content: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`${escaped}[：:]\\s*(\\d+)`));

  return match ? Number(match[1]) : 0;
}
