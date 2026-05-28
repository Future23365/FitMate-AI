import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const manualLlmCaseCount = 20;
const apiKey = process.env.DEEPSEEK_API_KEY?.trim();

if (!apiKey) {
  console.log("Missing DEEPSEEK_API_KEY.");
  console.log("手动 LLM 一致性测试必须调用真实模型；请设置 DEEPSEEK_API_KEY 后重新运行 `npm run test:llm`。");
  console.log("该测试不会使用 mock、旧快照或非真实模型结果。");
  console.log(`Manual LLM consistency summary: total=${manualLlmCaseCount}, passed=0, failed=0, skipped=${manualLlmCaseCount}`);
  process.exit(0);
}

const vitestBin = fileURLToPath(new URL("../node_modules/.bin/vitest", import.meta.url));
const result = spawnSync(vitestBin, ["run", "--config", "vitest.llm.config.ts"], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
