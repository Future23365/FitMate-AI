import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const serverOnlyMock = fileURLToPath(new URL("../tests/mocks/server-only.ts", import.meta.url));

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
