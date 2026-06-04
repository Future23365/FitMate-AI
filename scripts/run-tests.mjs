import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);

const vitestBin = fileURLToPath(new URL("../node_modules/.bin/vitest", import.meta.url));
const result = spawnSync(vitestBin, ["run", ...args], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
