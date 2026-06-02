import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
const args = process.argv.slice(2);
const options = parseArgs(args);
const suiteName = options.detail ? "detail" : "basic";
const suiteLabel = suiteName === "detail" ? "详细" : "基础";
const reportPath = process.env.MANUAL_LLM_REPORT_PATH?.trim()
  ? path.resolve(process.env.MANUAL_LLM_REPORT_PATH)
  : path.join(
      process.cwd(),
      "docs",
      suiteName === "detail" ? "manual-llm-blackbox-flow-detail-latest-report.md" : "manual-llm-blackbox-flow-latest-report.md",
    );

loadEnvConfig(process.cwd());

if (options.errors.length > 0) {
  for (const error of options.errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log(`手动 LLM 首页聊天黑盒流程测试（${suiteLabel}套件）`);
console.log(`筛选参数：${formatCliSelection(options)}`);
console.log(`并发数：${options.concurrency}`);
console.log("说明：缺少 DEEPSEEK_API_KEY 时只生成跳过报告，不请求真实模型。");

const vitestBin = fileURLToPath(new URL("../node_modules/.bin/vitest", import.meta.url));
const result = spawnSync(vitestBin, ["run", "--config", "vitest.llm.config.ts"], {
  stdio: "inherit",
  env: {
    ...process.env,
    MANUAL_LLM_FLOW_SUITE: suiteName,
    MANUAL_LLM_FLOW_IDS: options.ids.join(","),
    MANUAL_LLM_FLOW_GROUPS: options.groups.join(","),
    MANUAL_LLM_RUN_SUITES: options.suites.join(","),
    MANUAL_LLM_FAILED_FROM_REPORT: options.failedFromReport ?? "",
    MANUAL_LLM_CONCURRENCY: String(options.concurrency),
    MANUAL_LLM_REPORT_PATH: reportPath,
    MANUAL_LLM_RUN_COMMAND: buildRunCommand(options),
  },
});

printAcceptanceReportSummary(reportPath);

process.exit(result.status ?? 1);

function parseArgs(rawArgs) {
  const parsed = {
    detail: rawArgs.includes("--detail") || process.env.npm_config_detail === "true",
    ids: [],
    groups: [],
    suites: [],
    failedFromReport: undefined,
    concurrency: readPositiveInteger(process.env.MANUAL_LLM_CONCURRENCY, 1),
    errors: [],
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === "--detail") {
      continue;
    }

    if (arg === "--ids" || arg === "--group" || arg === "--suite" || arg === "--failed-from-report" || arg === "--concurrency") {
      const value = rawArgs[index + 1];
      if (!value || value.startsWith("--")) {
        parsed.errors.push(`缺少 ${arg} 参数值。`);
        continue;
      }
      applyOption(parsed, arg, value);
      index += 1;
      continue;
    }

    if (arg.startsWith("--ids=") || arg.startsWith("--group=") || arg.startsWith("--suite=") || arg.startsWith("--failed-from-report=") || arg.startsWith("--concurrency=")) {
      const [name, ...valueParts] = arg.split("=");
      applyOption(parsed, name, valueParts.join("="));
      continue;
    }

    parsed.errors.push(`未知参数：${arg}`);
  }

  return parsed;
}

function applyOption(parsed, name, value) {
  if (name === "--ids") {
    parsed.ids.push(...splitCsv(value));
    return;
  }
  if (name === "--group") {
    parsed.groups.push(...splitCsv(value));
    return;
  }
  if (name === "--suite") {
    parsed.suites.push(...splitCsv(value));
    return;
  }
  if (name === "--failed-from-report") {
    parsed.failedFromReport = path.resolve(value);
    return;
  }
  if (name === "--concurrency") {
    parsed.concurrency = readPositiveInteger(value, 1);
  }
}

function splitCsv(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function readPositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function formatCliSelection(options) {
  return [
    `ids=${options.ids.length ? options.ids.join(",") : "all"}`,
    `groups=${options.groups.length ? options.groups.join(",") : "all"}`,
    `suites=${options.suites.length ? options.suites.join(",") : "all"}`,
    `failedFromReport=${options.failedFromReport ?? "none"}`,
  ].join("; ");
}

function buildRunCommand(options) {
  const command = ["npm run", options.detail ? "test --detail" : "test:llm"];

  if (options.ids.length > 0) {
    command.push(`--ids=${options.ids.join(",")}`);
  }
  if (options.groups.length > 0) {
    command.push(`--group=${options.groups.join(",")}`);
  }
  if (options.suites.length > 0) {
    command.push(`--suite=${options.suites.join(",")}`);
  }
  if (options.failedFromReport) {
    command.push(`--failed-from-report=${options.failedFromReport}`);
  }
  if (options.concurrency !== 1) {
    command.push(`--concurrency=${options.concurrency}`);
  }

  return command.join(" ");
}

function printAcceptanceReportSummary(currentReportPath) {
  if (!existsSync(currentReportPath)) {
    console.log(`Manual LLM blackbox acceptance report not found: ${currentReportPath}`);
    return;
  }

  const lines = readFileSync(currentReportPath, "utf8").split("\n");
  const summaryStart = lines.findIndex((line) => line === "## 汇总");
  const scopeStart = lines.findIndex((line) => line === "## 运行范围");
  const preflightStart = lines.findIndex((line) => line === "## Preflight");
  const summaryLines = lines.slice(summaryStart >= 0 ? summaryStart + 1 : 0, scopeStart >= 0 ? scopeStart : 25);
  const scopeLines = lines.slice(scopeStart >= 0 ? scopeStart + 1 : 0, preflightStart >= 0 ? preflightStart : 45);
  const categoryStart = lines.findIndex((line) => line === "## 失败分类摘要");
  const resultStart = lines.findIndex((line) => line === "## 流程轮次结果");
  const categoryLines = lines.slice(
    categoryStart >= 0 ? categoryStart + 1 : 0,
    resultStart >= 0 ? resultStart : categoryStart + 8,
  ).filter((line) => line.startsWith("- "));
  const resultLines = lines
    .slice(resultStart >= 0 ? resultStart + 1 : 0)
    .filter((line) => line.startsWith("### ") || line.startsWith("- 状态：") || line.startsWith("- 失败原因：") || line.startsWith("- 本次没有"))
    .slice(0, 12);

  console.log("");
  console.log("Manual LLM blackbox report summary:");
  for (const line of summaryLines) {
    console.log(line);
  }
  console.log("");
  console.log("Manual LLM blackbox run scope:");
  for (const line of scopeLines) {
    console.log(line);
  }
  console.log("");
  console.log("Manual LLM blackbox failure categories:");
  for (const line of categoryLines) {
    console.log(line);
  }
  console.log("");
  console.log("Manual LLM blackbox sample results:");
  for (const line of resultLines) {
    console.log(line);
  }
  console.log("");
  console.log(`Manual LLM blackbox acceptance report: ${currentReportPath}`);
}
