import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
const args = process.argv.slice(2);
const suiteName = args.includes("--detail") || process.env.npm_config_detail === "true" ? "detail" : "basic";
const suiteLabel = suiteName === "detail" ? "详细" : "基础";
const suiteMetrics = suiteName === "detail"
  ? {
      flowCount: 53,
      turnCount: 159,
      reportFileName: "manual-llm-blackbox-flow-detail-latest-report.md",
    }
  : {
      flowCount: 9,
      turnCount: 27,
      reportFileName: "manual-llm-blackbox-flow-latest-report.md",
    };
const manualLlmFlowCount = suiteMetrics.flowCount;
const manualLlmTurnCount = suiteMetrics.turnCount;
const reportPath = path.join(process.cwd(), "docs", suiteMetrics.reportFileName);

loadEnvConfig(process.cwd());

const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
const tokenEstimate = estimateTokenUsage();

if (!apiKey) {
  console.log("Missing DEEPSEEK_API_KEY.");
  console.log("手动 LLM 黑盒流程测试必须调用真实模型；请设置 DEEPSEEK_API_KEY 后重新运行 `npm run test:llm` 或 `npm run test --detail`。");
  console.log("该测试不会使用 mock、旧快照或非真实模型结果。");
  writeSkippedReport();
  console.log(`Manual LLM blackbox flow summary: flows=${manualLlmFlowCount}, turns=${manualLlmTurnCount}, passed=0, failed=0, skipped=${manualLlmTurnCount}`);
  console.log(`Manual LLM blackbox acceptance report: ${reportPath}`);
  process.exit(0);
}

console.log(`手动 LLM 首页聊天黑盒流程测试 token 预估（${suiteLabel}套件）：`);
console.log(`预估输入token：${tokenEstimate.promptTokens}`);
console.log(`预估输出token：${tokenEstimate.completionTokens}`);
console.log(`预估总token：${tokenEstimate.totalTokens}`);
console.log(`流程用例数：${manualLlmFlowCount}`);
console.log(`轮次数：${manualLlmTurnCount}`);
console.log(`估算来源：${tokenEstimate.source}`);
console.log(`说明：${tokenEstimate.calibrationSummary}`);

const vitestBin = fileURLToPath(new URL("../node_modules/.bin/vitest", import.meta.url));
const result = spawnSync(vitestBin, ["run", "--config", "vitest.llm.config.ts"], {
  stdio: "inherit",
  env: {
    ...process.env,
    MANUAL_LLM_FLOW_SUITE: suiteName,
    MANUAL_LLM_REPORT_PATH: reportPath,
  },
});

printAcceptanceReportSummary();

process.exit(result.status ?? 1);

function printAcceptanceReportSummary() {
  if (!existsSync(reportPath)) {
    console.log(`Manual LLM blackbox acceptance report not found: ${reportPath}`);
    return;
  }

  const lines = readFileSync(reportPath, "utf8").split("\n");
  const summaryStart = lines.findIndex((line) => line === "## 汇总");
  const preflightStart = lines.findIndex((line) => line === "## Preflight");
  const summaryLines = lines.slice(summaryStart >= 0 ? summaryStart + 1 : 0, preflightStart >= 0 ? preflightStart : 25);
  const resultStart = lines.findIndex((line) => line === "## 流程轮次结果");
  const resultLines = lines
    .slice(resultStart >= 0 ? resultStart + 1 : 0)
    .filter((line) => line.startsWith("### ") || line.startsWith("- 状态：") || line.startsWith("- 失败原因："))
    .slice(0, 12);

  console.log("");
  console.log("Manual LLM blackbox report summary:");
  for (const line of summaryLines) {
    console.log(line);
  }
  console.log("");
  console.log("Manual LLM blackbox sample results:");
  for (const line of resultLines) {
    console.log(line);
  }
  console.log("");
  console.log(`Manual LLM blackbox acceptance report: ${reportPath}`);
}

function writeSkippedReport() {
  const lines = [
    "# 手动 LLM 首页聊天黑盒流程测试报告",
    "",
    `生成时间：${new Date().toISOString()}`,
    "模型：deepseek-v4-flash",
    `套件：${suiteLabel}`,
    `运行命令：${suiteName === "detail" ? "npm run test --detail" : "npm run test:llm"}`,
    "runner 类型：api_route",
    "真实/跳过状态：skipped",
    "",
    "## 汇总",
    "",
    `- 流程用例数：${manualLlmFlowCount}`,
    `- 轮次数：${manualLlmTurnCount}`,
    "- 通过：0",
    "- 失败：0",
    `- 跳过：${manualLlmTurnCount}`,
    "- 需复核：0",
    `- 预计输入 token：${tokenEstimate.promptTokens}`,
    `- 预计输出 token：${tokenEstimate.completionTokens}`,
    `- 预计总 token：${tokenEstimate.totalTokens}`,
    `- 估算来源：${tokenEstimate.source}`,
    `- 估算口径：${tokenEstimate.calibrationSummary}`,
    "- prompt_tokens：0",
    "- completion_tokens：0",
    "- total_tokens：0",
    "- token 偏差摘要：本次因缺少 DEEPSEEK_API_KEY 跳过真实模型，没有真实 token usage。",
    "",
    "## Preflight",
    "",
    "- 状态：skipped",
    "- 模型 key：不可用",
    "- 数据库：未检查",
    "- artifact 表：未检查",
    "- seed 数据：未检查",
    "- 原因：缺少 DEEPSEEK_API_KEY，真实模型黑盒流程未运行。",
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
    `- 跳过：缺少 DEEPSEEK_API_KEY，真实模型黑盒流程未运行；命令没有使用 mock、旧快照或非真实模型结果。`,
    "",
  ];

  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, lines.join("\n"), "utf8");
}

function estimateTokenUsage() {
  const recent = estimateFromRecentReport();

  if (recent) {
    return recent;
  }

  const promptTokens = manualLlmTurnCount * 2_400;
  const completionTokens = manualLlmTurnCount * 760;

  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    source: "fallback",
    calibrationSummary: `未找到可用真实运行报告，按 ${manualLlmFlowCount} 个 fixture、${manualLlmTurnCount} 轮和保守均值估算。`,
  };
}

function estimateFromRecentReport() {
  const candidateReports = [
    path.join(process.cwd(), "docs", "manual-llm-blackbox-flow-latest-report.md"),
    path.join(process.cwd(), "docs", "manual-llm-blackbox-flow-detail-latest-report.md"),
  ];
  const reports = candidateReports
    .map(readReportTokenStats)
    .filter((report) => report && report.totalTokens > 0 && !report.isSkipped)
    .sort((left, right) => right.generatedAtMs - left.generatedAtMs);
  const latest = reports[0];

  if (!latest) {
    return null;
  }

  const promptPerTurn = latest.promptTokens / Math.max(latest.turnCount, 1);
  const completionPerTurn = latest.completionTokens / Math.max(latest.turnCount, 1);
  const promptTokens = Math.ceil(promptPerTurn * manualLlmTurnCount);
  const completionTokens = Math.ceil(completionPerTurn * manualLlmTurnCount);

  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    source: "recent_real_report",
    calibrationSummary: `基于 ${latest.fileName} 的真实 token 均值校准：${latest.turnCount} 轮、total_tokens=${latest.totalTokens}。`,
  };
}

function readReportTokenStats(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  const content = readFileSync(filePath, "utf8");
  const generatedAt = content.match(/生成时间：(.+)/)?.[1]?.trim();

  return {
    fileName: path.basename(filePath),
    promptTokens: readNumberLine(content, "prompt_tokens"),
    completionTokens: readNumberLine(content, "completion_tokens"),
    totalTokens: readNumberLine(content, "total_tokens"),
    turnCount: readNumberLine(content, "轮次数"),
    isSkipped: /真实模型.*未运行|跳过报告|缺少 DEEPSEEK_API_KEY/.test(content),
    generatedAtMs: generatedAt ? Date.parse(generatedAt) || 0 : 0,
  };
}

function readNumberLine(content, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`${escaped}[：:]\\s*(\\d+)`));

  return match ? Number(match[1]) : 0;
}
