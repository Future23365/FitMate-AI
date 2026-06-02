import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
const args = process.argv.slice(2);
const options = parseArgs(args);
const reportPath = options.report
  ? path.resolve(options.report)
  : process.env.MANUAL_LLM_AGENT_TOOL_REPORT_PATH?.trim()
    ? path.resolve(process.env.MANUAL_LLM_AGENT_TOOL_REPORT_PATH)
    : path.join(process.cwd(), "docs", "manual-llm-agent-tool-call-latest-report.md");

loadEnvConfig(process.cwd());

if (options.errors.length > 0) {
  for (const error of options.errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log("手动 LLM 单次 Agent tool 调用流程测试");
console.log(`筛选参数：${formatCliSelection(options)}`);
console.log(`并发数：${options.concurrency}`);
console.log(`报告路径：${reportPath}`);
console.log(`dry-run：${options.dryRun ? "true" : "false"}`);
console.log("说明：缺少 DEEPSEEK_API_KEY 时只生成跳过报告，不请求真实模型。");

const vitestBin = fileURLToPath(new URL("../node_modules/.bin/vitest", import.meta.url));
const result = spawnSync(vitestBin, ["run", "--config", "vitest.llm-agent-tool.config.ts"], {
  stdio: "inherit",
  env: {
    ...process.env,
    MANUAL_LLM_AGENT_TOOL_IDS: options.ids.join(","),
    MANUAL_LLM_AGENT_TOOL_GROUPS: options.groups.join(","),
    MANUAL_LLM_AGENT_TOOL_NAMES: options.tools.join(","),
    MANUAL_LLM_AGENT_TOOL_STATUSES: options.statuses.join(","),
    MANUAL_LLM_AGENT_TOOL_STATES: options.states.join(","),
    MANUAL_LLM_AGENT_TOOL_FAILED_FROM_REPORT: options.failedFromReport ?? "",
    MANUAL_LLM_AGENT_TOOL_CONCURRENCY: String(options.concurrency),
    MANUAL_LLM_AGENT_TOOL_REPORT_PATH: reportPath,
    MANUAL_LLM_AGENT_TOOL_DRY_RUN: options.dryRun ? "1" : "",
    MANUAL_LLM_DISABLE_LEGACY_EVENTS: options.disableLegacyEvents ? "1" : process.env.MANUAL_LLM_DISABLE_LEGACY_EVENTS ?? "",
    MANUAL_LLM_AGENT_TOOL_RUN_COMMAND: buildRunCommand(options),
  },
});

printAcceptanceReportSummary(reportPath);

process.exit(result.status ?? 1);

function parseArgs(rawArgs) {
  const parsed = {
    ids: [],
    groups: [],
    tools: [],
    statuses: [],
    states: [],
    failedFromReport: undefined,
    concurrency: readPositiveInteger(process.env.MANUAL_LLM_AGENT_TOOL_CONCURRENCY, 1),
    report: undefined,
    disableLegacyEvents: true,
    dryRun: false,
    errors: [],
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === "--disable-legacy-events") {
      parsed.disableLegacyEvents = true;
      continue;
    }

    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }

    if (arg === "--no-disable-legacy-events") {
      parsed.disableLegacyEvents = false;
      continue;
    }

    if (
      arg === "--ids" ||
      arg === "--group" ||
      arg === "--tool" ||
      arg === "--status" ||
      arg === "--state" ||
      arg === "--failed-from-report" ||
      arg === "--concurrency" ||
      arg === "--report"
    ) {
      const value = rawArgs[index + 1];
      if (!value || value.startsWith("--")) {
        parsed.errors.push(`缺少 ${arg} 参数值。`);
        continue;
      }
      applyOption(parsed, arg, value);
      index += 1;
      continue;
    }

    if (
      arg.startsWith("--ids=") ||
      arg.startsWith("--group=") ||
      arg.startsWith("--tool=") ||
      arg.startsWith("--status=") ||
      arg.startsWith("--state=") ||
      arg.startsWith("--failed-from-report=") ||
      arg.startsWith("--concurrency=") ||
      arg.startsWith("--report=")
    ) {
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
  if (name === "--tool") {
    parsed.tools.push(...splitCsv(value));
    return;
  }
  if (name === "--status") {
    parsed.statuses.push(...splitCsv(value));
    return;
  }
  if (name === "--state") {
    parsed.states.push(...splitCsv(value));
    return;
  }
  if (name === "--failed-from-report") {
    parsed.failedFromReport = path.resolve(value);
    return;
  }
  if (name === "--concurrency") {
    parsed.concurrency = readPositiveInteger(value, 1);
    return;
  }
  if (name === "--report") {
    parsed.report = value;
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
    `tools=${options.tools.length ? options.tools.join(",") : "all"}`,
    `statuses=${options.statuses.length ? options.statuses.join(",") : "all"}`,
    `states=${options.states.length ? options.states.join(",") : "all"}`,
    `failedFromReport=${options.failedFromReport ?? "none"}`,
  ].join("; ");
}

function buildRunCommand(options) {
  const command = ["npm run test:llm:agent-tool"];

  if (options.ids.length > 0) command.push(`--ids=${options.ids.join(",")}`);
  if (options.groups.length > 0) command.push(`--group=${options.groups.join(",")}`);
  if (options.tools.length > 0) command.push(`--tool=${options.tools.join(",")}`);
  if (options.statuses.length > 0) command.push(`--status=${options.statuses.join(",")}`);
  if (options.states.length > 0) command.push(`--state=${options.states.join(",")}`);
  if (options.failedFromReport) command.push(`--failed-from-report=${options.failedFromReport}`);
  if (options.concurrency !== 1) command.push(`--concurrency=${options.concurrency}`);
  if (options.report) command.push(`--report=${options.report}`);
  if (options.disableLegacyEvents) command.push("--disable-legacy-events");
  if (options.dryRun) command.push("--dry-run");

  return command.join(" ");
}

function printAcceptanceReportSummary(currentReportPath) {
  if (!existsSync(currentReportPath)) {
    console.log(`Manual LLM Agent tool acceptance report not found: ${currentReportPath}`);
    return;
  }

  const lines = readFileSync(currentReportPath, "utf8").split("\n");
  const summaryStart = lines.findIndex((line) => line === "## 汇总");
  const scopeStart = lines.findIndex((line) => line === "## 运行范围");
  const preflightStart = lines.findIndex((line) => line === "## Preflight");
  const summaryLines = lines.slice(summaryStart >= 0 ? summaryStart + 1 : 0, scopeStart >= 0 ? scopeStart : 25);
  const scopeLines = lines.slice(scopeStart >= 0 ? scopeStart + 1 : 0, preflightStart >= 0 ? preflightStart : 45);
  const categoryStart = lines.findIndex((line) => line === "## 失败分类摘要");
  const resultStart = lines.findIndex((line) => line === "## 用例结果");
  const categoryLines = lines.slice(
    categoryStart >= 0 ? categoryStart + 1 : 0,
    resultStart >= 0 ? resultStart : categoryStart + 8,
  ).filter((line) => line.startsWith("- "));
  const resultLines = lines
    .slice(resultStart >= 0 ? resultStart + 1 : 0)
    .filter((line) => line.startsWith("### ") || line.startsWith("- 状态：") || line.startsWith("- 失败原因：") || line.startsWith("- 本次没有"))
    .slice(0, 12);

  console.log("");
  console.log("Manual LLM Agent tool report summary:");
  for (const line of summaryLines) console.log(line);
  console.log("");
  console.log("Manual LLM Agent tool run scope:");
  for (const line of scopeLines) console.log(line);
  console.log("");
  console.log("Manual LLM Agent tool failure categories:");
  for (const line of categoryLines) console.log(line);
  console.log("");
  console.log("Manual LLM Agent tool sample results:");
  for (const line of resultLines) console.log(line);
  console.log("");
  console.log(`Manual LLM Agent tool acceptance report: ${currentReportPath}`);
}
