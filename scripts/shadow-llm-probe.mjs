import nextEnv from "@next/env";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const serverOnlyMock = fileURLToPath(new URL("../tests/mocks/server-only.ts", import.meta.url));
const { loadEnvConfig } = nextEnv;

// Shadow Probe CLI 复用 Next 本地环境变量加载规则，让 dev-safe tool runner 能读取 .env.local 中的 DATABASE_URL 等配置。
loadEnvConfig(projectRoot);

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": projectRoot,
    "server-only": serverOnlyMock,
  },
});

const { runShadowLlmProbeCli } = await jiti.import("../lib/server/dev/shadow-llm-probe/cli.ts");
const result = await runShadowLlmProbeCli(process.argv.slice(2), projectRoot);

if (result.stdout) {
  process.stdout.write(`${result.stdout}\n`);
}
if (result.stderr) {
  process.stderr.write(`${result.stderr}\n`);
}

process.exitCode = result.exitCode;
