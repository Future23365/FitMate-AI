import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import nextEnv from "@next/env";

const manualLlmCaseCount = 20;
const estimatedPromptTokens = 33_800;
const estimatedCompletionTokens = 12_000;
const reportPath = path.join(process.cwd(), "docs", "manual-llm-consistency-latest-report.md");
const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const apiKey = process.env.DEEPSEEK_API_KEY?.trim();

if (!apiKey) {
  console.log("Missing DEEPSEEK_API_KEY.");
  console.log("手动 LLM 一致性测试必须调用真实模型；请设置 DEEPSEEK_API_KEY 后重新运行 `npm run test:llm`。");
  console.log("该测试不会使用 mock、旧快照或非真实模型结果。");
  console.log(`Manual LLM consistency summary: total=${manualLlmCaseCount}, passed=0, failed=0, skipped=${manualLlmCaseCount}`);
  process.exit(0);
}

console.log("手动 LLM 一致性测试 token 预估：");
console.log(`预估输入token：${estimatedPromptTokens}`);
console.log(`预估输出token：${estimatedCompletionTokens}`);
console.log(`预估总token：${estimatedPromptTokens + estimatedCompletionTokens}`);
console.log("说明：这是按当前用例规模粗略估算，最终以模型返回 usage 为准。");

const vitestBin = fileURLToPath(new URL("../node_modules/.bin/vitest", import.meta.url));
const result = spawnSync(vitestBin, ["run", "--config", "vitest.llm.config.ts"], {
  stdio: "inherit",
  env: process.env,
});

printAcceptanceReportSummary();

process.exit(result.status ?? 1);

function printAcceptanceReportSummary() {
  if (!existsSync(reportPath)) {
    console.log(`Manual LLM acceptance report not found: ${reportPath}`);
    return;
  }

  const lines = readFileSync(reportPath, "utf8").split("\n");
  const summaryLines = lines.slice(5, 12);
  const resultStart = lines.findIndex((line) => line === "## 样例验收结果");
  const resultLines = lines
    .slice(resultStart >= 0 ? resultStart + 1 : 0)
    .filter((line) => line.startsWith("- 失败：") || line.startsWith("- 通过："))
    .slice(0, 8);

  console.log("");
  console.log("Manual LLM consistency report summary:");
  for (const line of summaryLines) {
    console.log(line);
  }
  console.log("");
  console.log("Manual LLM consistency sample results:");
  for (const line of resultLines) {
    console.log(line);
  }
  console.log("");
  console.log(`Manual LLM acceptance report: ${reportPath}`);
}
