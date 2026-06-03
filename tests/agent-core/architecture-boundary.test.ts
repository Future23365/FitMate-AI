import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const coreDirs = [
  "lib/server/agent-core",
  "lib/server/agent-planners",
  "lib/server/agent-tools",
];
const coreFlowFiles = [
  "lib/server/agent-core/action-validator.ts",
  "lib/server/agent-core/executor.ts",
  "lib/server/agent-core/policy-guard.ts",
  "lib/server/agent-core/resource-contract.ts",
  "lib/server/agent-core/runtime.ts",
  "lib/server/agent-core/response-renderer.ts",
];

function collectFiles(target: string): string[] {
  const absolutePath = path.join(repoRoot, target);
  const stat = statSync(absolutePath);

  if (stat.isFile()) {
    return [absolutePath];
  }

  return readdirSync(absolutePath).flatMap((entry) => collectFiles(path.join(target, entry)));
}

function readRelative(file: string) {
  return readFileSync(path.join(repoRoot, file), "utf8");
}

describe("agent-core architecture boundaries", () => {
  it("keeps new core independent from removed runtime, production prompt modules, LLM SDKs and database access", () => {
    const forbiddenTerms = [
      "agent" + "-orchestrator",
      "Agent" + "ExecutionResult",
      "Agent" + "ToolRegistry",
      "agent_" + "response_writer",
      "@/lib/server/" + "ai",
      "openai",
      "@prisma",
      "@/lib/server/db",
    ];
    const matches: string[] = [];

    for (const file of coreDirs.flatMap(collectFiles)) {
      const content = readFileSync(file, "utf8");
      for (const term of forbiddenTerms) {
        if (content.includes(term)) {
          matches.push(`${path.relative(repoRoot, file)}: ${term}`);
        }
      }
    }

    expect(matches).toEqual([]);
  });

  it("keeps agent-core independent from DeepSeek adapter details", () => {
    const forbiddenTerms = [
      "deepseek",
      "DEEPSEEK_API_KEY",
      "chat/completions",
      "response_format",
    ];
    const matches: string[] = [];

    for (const file of collectFiles("lib/server/agent-core")) {
      const content = readFileSync(file, "utf8").toLowerCase();
      for (const term of forbiddenTerms) {
        if (content.includes(term.toLowerCase())) {
          matches.push(`${path.relative(repoRoot, file)}: ${term}`);
        }
      }
    }

    expect(matches).toEqual([]);
  });

  it("does not connect M0/M1 runtime or fixture tools to production chat route", () => {
    const route = readRelative("app/api/chat/route.ts");

    expect(route).not.toContain("agent-core");
    expect(route).not.toContain("agent-planners");
    expect(route).not.toContain("agent-tools");
    expect(route).not.toContain("readFixture");
    expect(route).not.toContain("m1ResourceProducer");
    expect(route).not.toContain("m1ConfirmationWrite");
  });

  it("keeps runtime, executor, validator and renderer free of business tool branches and text keyword routing", () => {
    const forbiddenTerms = [
      "readFixture",
      "m1ResourceProducer",
      "m1ResourceConsumer",
      "m1ConfirmationWrite",
      "m1DiagnosticFailure",
      "searchExercises",
      "generateRoutine",
      "targetMuscles",
      "userInput.includes",
      "new RegExp",
      ".match(",
      ".includes(input.run.userInput",
    ];
    const matches: string[] = [];

    for (const file of coreFlowFiles) {
      const content = readRelative(file);
      for (const term of forbiddenTerms) {
        if (content.includes(term)) {
          matches.push(`${file}: ${term}`);
        }
      }
    }

    expect(matches).toEqual([]);
  });

  it("keeps M1 fixture layer free of real business tools, real LLM adapters and production persistence", () => {
    const forbiddenTerms = [
      "searchExercises",
      "generateRoutine",
      "saveWorkout",
      "openai",
      "@prisma",
      "@/lib/server/db",
      "agent" + "-orchestrator",
    ];
    const matches: string[] = [];

    for (const file of collectFiles("lib/server/agent-tools")) {
      const content = readFileSync(file, "utf8");
      for (const term of forbiddenTerms) {
        if (content.includes(term)) {
          matches.push(`${path.relative(repoRoot, file)}: ${term}`);
        }
      }
    }

    expect(matches).toEqual([]);
  });

  it("does not add or register real domain tools in the M2 hardening change", () => {
    const allowedAgentToolFiles = new Set([
      "lib/server/agent-tools/index.ts",
      "lib/server/agent-tools/fixture/read-fixture.tool.ts",
      "lib/server/agent-tools/fixture/m1-safety-fixture.tools.ts",
    ]);
    const unexpectedFiles = collectFiles("lib/server/agent-tools")
      .map((file) => path.relative(repoRoot, file))
      .filter((file) => !allowedAgentToolFiles.has(file));
    const registryEntry = readRelative("lib/server/agent-tools/index.ts");
    const forbiddenRegistrations = [
      "exercise",
      "routine",
      "workout",
      "memory",
      "saveWorkout",
      "searchExercises",
      "@/lib/server/db",
    ].filter((term) => registryEntry.includes(term));

    expect(unexpectedFiles).toEqual([]);
    expect(forbiddenRegistrations).toEqual([]);
  });
});
