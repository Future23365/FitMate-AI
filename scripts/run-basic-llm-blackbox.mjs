import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
const projectDir = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const parsed = parseArgs(args);

if (parsed.help) {
  printHelp();
  process.exit(0);
}

if (parsed.errors.length > 0) {
  for (const error of parsed.errors) {
    console.error(error);
  }
  printHelp();
  process.exit(1);
}

loadEnvConfig(projectDir);

const vitestBin = fileURLToPath(new URL("../node_modules/.bin/vitest", import.meta.url));
const env = {
  ...process.env,
  ...(parsed.flowIds.length > 0 ? { MANUAL_LLM_BASIC_FLOW_IDS: parsed.flowIds.join(",") } : {}),
  ...(parsed.reportPath ? { MANUAL_LLM_BASIC_REPORT_PATH: parsed.reportPath } : {}),
};
const result = spawnSync(vitestBin, [
  "run",
  "manual-tests/llm/basic-chat-blackbox.manual.test.ts",
  "--config",
  "vitest.manual-llm.config.ts",
  "--reporter",
  "verbose",
], {
  cwd: projectDir,
  stdio: "inherit",
  env,
});

process.exit(result.status ?? 1);

function parseArgs(values) {
  const result = {
    flowIds: [],
    reportPath: "",
    help: false,
    errors: [],
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--help" || value === "-h") {
      result.help = true;
      continue;
    }

    if (value === "--flow") {
      const nextValue = values[index + 1];
      if (!nextValue) {
        result.errors.push("--flow 缺少 flow id。");
        continue;
      }
      result.flowIds.push(...splitFlowIds(nextValue));
      index += 1;
      continue;
    }

    if (value.startsWith("--flow=")) {
      result.flowIds.push(...splitFlowIds(value.slice("--flow=".length)));
      continue;
    }

    if (value === "--report") {
      const nextValue = values[index + 1];
      if (!nextValue) {
        result.errors.push("--report 缺少报告路径。");
        continue;
      }
      result.reportPath = nextValue;
      index += 1;
      continue;
    }

    if (value.startsWith("--report=")) {
      result.reportPath = value.slice("--report=".length);
      continue;
    }

    result.errors.push(`未知参数：${value}`);
  }

  result.flowIds = [...new Set(result.flowIds)];

  return result;
}

function splitFlowIds(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function printHelp() {
  console.log([
    "用法：npm run test:llm:basic -- [--flow F01] [--flow F02,F03] [--report docs/manual-llm-basic-blackbox-latest-report.md]",
    "",
    "该命令只运行 manual-tests/llm/basic-chat-blackbox.manual.test.ts，不会进入默认 npm test。",
  ].join("\n"));
}
