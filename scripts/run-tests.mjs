import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const runDetailedLlmTests = args.includes("--detail") || process.env.npm_config_detail === "true";

if (runDetailedLlmTests) {
  const llmRunner = fileURLToPath(new URL("./run-manual-llm-tests.mjs", import.meta.url));
  const forwardedArgs = args.filter((arg) => arg !== "--detail");
  const result = spawnSync(process.execPath, [llmRunner, "--detail", ...forwardedArgs], {
    stdio: "inherit",
    env: process.env,
  });

  process.exit(result.status ?? 1);
}

const vitestBin = fileURLToPath(new URL("../node_modules/.bin/vitest", import.meta.url));
const result = spawnSync(vitestBin, ["run", ...args], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
