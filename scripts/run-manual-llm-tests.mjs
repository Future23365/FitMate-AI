import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import nextEnv from "@next/env";

const manualLlmFlowCount = 9;
const manualLlmTurnCount = 27;
const estimatedPromptTokens = 60_000;
const estimatedCompletionTokens = 18_900;
const reportPath = path.join(process.cwd(), "docs", "manual-llm-blackbox-flow-latest-report.md");
const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const apiKey = process.env.DEEPSEEK_API_KEY?.trim();

if (!apiKey) {
  console.log("Missing DEEPSEEK_API_KEY.");
  console.log("手动 LLM 黑盒流程测试必须调用真实模型；请设置 DEEPSEEK_API_KEY 后重新运行 `npm run test:llm`。");
  console.log("该测试不会使用 mock、旧快照或非真实模型结果。");
  writeSkippedReport();
  console.log(`Manual LLM blackbox flow summary: flows=${manualLlmFlowCount}, turns=${manualLlmTurnCount}, passed=0, failed=0, skipped=${manualLlmTurnCount}`);
  console.log(`Manual LLM blackbox acceptance report: ${reportPath}`);
  process.exit(0);
}

console.log("手动 LLM 首页聊天黑盒流程测试 token 预估：");
console.log(`预估输入token：${estimatedPromptTokens}`);
console.log(`预估输出token：${estimatedCompletionTokens}`);
console.log(`预估总token：${estimatedPromptTokens + estimatedCompletionTokens}`);
console.log(`流程用例数：${manualLlmFlowCount}`);
console.log(`轮次数：${manualLlmTurnCount}`);
console.log("说明：这是按首页聊天多轮流程粗略估算，最终以模型返回 usage 为准。");

const vitestBin = fileURLToPath(new URL("../node_modules/.bin/vitest", import.meta.url));
const result = spawnSync(vitestBin, ["run", "--config", "vitest.llm.config.ts"], {
  stdio: "inherit",
  env: process.env,
});

printAcceptanceReportSummary();

process.exit(result.status ?? 1);

function printAcceptanceReportSummary() {
  if (!existsSync(reportPath)) {
    console.log(`Manual LLM blackbox acceptance report not found: ${reportPath}`);
    return;
  }

  const lines = readFileSync(reportPath, "utf8").split("\n");
  const summaryLines = lines.slice(6, 19);
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
    "",
    "## 汇总",
    "",
    `- 流程用例数：${manualLlmFlowCount}`,
    `- 轮次数：${manualLlmTurnCount}`,
    "- 通过：0",
    "- 失败：0",
    `- 跳过：${manualLlmTurnCount}`,
    `- 预计输入 token：${estimatedPromptTokens}`,
    `- 预计输出 token：${estimatedCompletionTokens}`,
    `- 预计总 token：${estimatedPromptTokens + estimatedCompletionTokens}`,
    "- prompt_tokens：0",
    "- completion_tokens：0",
    "- total_tokens：0",
    "",
    "## 流程轮次结果",
    "",
    `- 跳过：缺少 DEEPSEEK_API_KEY，真实模型黑盒流程未运行；命令没有使用 mock、旧快照或非真实模型结果。`,
    "",
  ];

  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, lines.join("\n"), "utf8");
}
