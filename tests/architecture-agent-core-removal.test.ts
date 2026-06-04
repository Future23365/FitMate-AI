import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const scanTargets = [
  "app",
  "components",
  "features",
  "lib",
  "scripts",
  "tests",
  "package.json",
];

const excludedFiles = new Set([
  "tests/architecture-agent-core-removal.test.ts",
]);

const textExtensions = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".json",
]);

function oldRuntimeTerms() {
  return [
    "run" + "AgentOrchestrator",
    "Agent" + "ExecutionResult",
    "Agent" + "ToolRegistry",
    "agent_" + "execution_result",
    "agent_" + "tool_decision",
    "agent_" + "response_writer",
    "legacy" + "PathSkip",
    "Context" + "Package",
    "create" + "Tool" + "First" + "Agent" + "Tool" + "Registry",
    "project" + "Agent" + "Execution" + "Result" + "To" + "Response",
    "manual-tests" + "/llm",
    "run-manual" + "-llm-tests",
    "run-manual" + "-agent-tool-tests",
    "@/lib/server/" + "agent" + "-orchestrator",
    "@/lib/server/" + "ai",
  ];
}

// collectScannableFiles 定义运行时代码缺席扫描的边界，历史 docs 和 OpenSpec archive 不参与。
function collectScannableFiles() {
  return scanTargets.flatMap((target) => collectPath(path.join(repoRoot, target)))
    .map((file) => path.relative(repoRoot, file))
    .filter((file) => !excludedFiles.has(file));
}

function collectPath(targetPath: string): string[] {
  const stat = statSync(targetPath);

  if (stat.isFile()) {
    return textExtensions.has(path.extname(targetPath)) ? [targetPath] : [];
  }

  return readdirSync(targetPath).flatMap((entry) => {
    const childPath = path.join(targetPath, entry);

    if (entry === "node_modules" || entry === ".next") {
      return [];
    }

    return collectPath(childPath);
  });
}

describe("removed Agent core runtime architecture", () => {
  it("keeps production and test code free of removed Agent runtime entrypoints", () => {
    const matches = [];

    for (const file of collectScannableFiles()) {
      const content = readFileSync(path.join(repoRoot, file), "utf8");

      for (const term of oldRuntimeTerms()) {
        if (content.includes(term)) {
          matches.push(`${file}: ${term}`);
        }
      }
    }

    expect(matches).toEqual([]);
  });

  it("keeps public non-AI domain services importable without the removed runtime", async () => {
    const modules = await Promise.all([
      import("@/lib/server/exercises/exercise-service"),
      import("@/lib/server/workout-plans/workout-plan-validation-service"),
      import("@/lib/server/conversation-artifacts/artifact-service"),
      import("@/lib/server/policy-confirmation/policy-engine"),
      import("@/lib/server/user-feedback-memory/user-feedback-memory-service"),
      import("@/lib/server/db/prisma"),
    ]);

    expect(modules.every((module) => Object.keys(module).length > 0)).toBe(true);
  });
});
