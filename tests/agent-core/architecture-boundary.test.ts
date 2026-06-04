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
const productionChatEntryFiles = [
  "app/api/chat/route.ts",
  "lib/server/chat/chat-service.ts",
  "lib/server/chat/agent-text-chat-service.ts",
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

function findImportMatches(files: string[], forbiddenSources: string[]) {
  const importPattern = /^\s*import\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["'];/gm;
  const matches: string[] = [];

  for (const file of files) {
    const content = readRelative(file);
    for (const importMatch of content.matchAll(importPattern)) {
      const source = importMatch[1];
      for (const forbiddenSource of forbiddenSources) {
        if (source === forbiddenSource || source.startsWith(`${forbiddenSource}/`)) {
          matches.push(`${file}: ${source}`);
        }
      }
    }
  }

  return matches;
}

describe("agent-core architecture boundaries", () => {
  it("keeps new core independent from removed runtime, production prompt modules, LLM SDKs and database access", () => {
    const forbiddenTerms = [
      "agent" + "-orchestrator",
      "Agent" + "ExecutionResult",
      "new Agent" + "ToolRegistry",
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

  it("keeps agent-core independent from Agent LLM prompt configuration", () => {
    const coreFiles = collectFiles("lib/server/agent-core").map((file) => path.relative(repoRoot, file));
    const matches = findImportMatches(coreFiles, [
      "@/lib/server/agent-planners/prompts",
    ]);

    expect(matches).toEqual([]);
  });

  it("keeps Agent LLM prompt config free of business tools, persistence and removed runtimes", () => {
    const promptConfigFiles = collectFiles("lib/server/agent-planners/prompts")
      .map((file) => path.relative(repoRoot, file));
    const forbiddenImportSources = [
      "@/lib/server/agent-tools",
      "@/lib/server/exercises",
      "@/lib/server/workout-plans",
      "@/lib/server/workouts",
      "@/lib/server/chat",
      "@/lib/server/db",
      "@/lib/server/" + "ai",
      "@/lib/server/" + "agent-orchestrator",
      "@prisma",
    ];
    const forbiddenTerms = [
      "searchExercises",
      "generateRoutine",
      "generatePlanDraft",
      "saveWorkout",
      "queryUserMemory",
      "recommendation",
      "artifact revision",
      "Agent" + "ExecutionResult",
    ];
    const matches = [
      ...findImportMatches(promptConfigFiles, forbiddenImportSources),
    ];

    for (const file of promptConfigFiles) {
      const content = readRelative(file);
      for (const term of forbiddenTerms) {
        if (content.includes(term)) {
          matches.push(`${file}: ${term}`);
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
      "visibleTrainingProposal",
      "searchExercises",
      "generateRoutine",
      "generatePlanDraft",
      "generateRoutineDraft",
      "payload.kind",
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

  it("keeps visible training proposal terminal validation free of concrete business toolName allowlists", () => {
    const files = [
      "lib/server/agent-core/terminal-output-validator.ts",
      "lib/server/visible-training-proposals/visible-training-proposal-validator.ts",
      "lib/server/visible-training-proposals/visible-training-proposal-renderer.ts",
    ];
    const forbiddenTerms = [
      "searchExerciseResources",
      "inspectVisibleTrainingProposals",
      "visible_training_proposal_fact",
      "toolResult.toolName",
      "result.toolName",
    ];
    const matches: string[] = [];

    for (const file of files) {
      const content = readRelative(file);
      for (const term of forbiddenTerms) {
        if (content.includes(term)) {
          matches.push(`${file}: ${term}`);
        }
      }
    }

    expect(matches).toEqual([]);
  });

  it("keeps agent-core free of business services, business tool handlers and concrete model adapters", () => {
    const coreFiles = collectFiles("lib/server/agent-core").map((file) => path.relative(repoRoot, file));
    const forbiddenImportSources = [
      "@/lib/server/agent-tools",
      "@/lib/server/exercises",
      "@/lib/server/workout-plans",
      "@/lib/server/workouts",
      "@/lib/server/chat",
      "@/lib/server/db",
      "@/lib/server/auth",
      "@/lib/server/" + "ai",
      "@/lib/server/agent-planners/model-adapters",
    ];
    const forbiddenTerms = [
      "DeepSeekModelAdapter",
      "FakeModelAdapter",
      "ModelAdapter",
      "searchExercises",
      "generateRoutine",
      "generatePlanDraft",
      "generateRoutineDraft",
      "payload.kind",
      "saveWorkout",
      "queryUserMemory",
      "exerciseRecommendation",
      "workoutRoutine",
    ];
    const matches = [
      ...findImportMatches(coreFiles, forbiddenImportSources),
    ];

    for (const file of coreFiles) {
      const content = readRelative(file);
      for (const term of forbiddenTerms) {
        if (content.includes(term)) {
          matches.push(`${file}: ${term}`);
        }
      }
    }

    expect(matches).toEqual([]);
  });

  it("keeps production chat entry free of business keyword routing and Agent tool loop bypasses", () => {
    const forbiddenTerms = [
      "searchExercises",
      "generateRoutine",
      "saveWorkout",
      "queryUserMemory",
      "createM0FixtureToolRegistry",
      "createM1FixtureToolRegistry",
      "readFixture",
      "message.content.includes",
      "userInput.includes",
      "new RegExp",
      ".match(",
      ".test(",
      "assistant_action",
      "intent_resolved",
      "agent_activity",
      "Agent" + "ExecutionResult",
      "runAgent" + "Orchestrator",
    ];
    const matches: string[] = [];

    for (const file of productionChatEntryFiles) {
      const content = readRelative(file);
      for (const term of forbiddenTerms) {
        if (content.includes(term)) {
          matches.push(`${file}: ${term}`);
        }
      }
    }

    expect(matches).toEqual([]);
  });

  it("keeps production text chat flow off removed orchestrator contracts and legacy stream events", () => {
    const forbiddenTerms = [
      "agent-orchestrator",
      "Agent" + "ExecutionResult",
      "runAgent" + "Orchestrator",
      "assistant_action",
      "intent_resolved",
      "agent_" + "execution_result",
    ];
    const matches: string[] = [];

    for (const file of productionChatEntryFiles) {
      const content = readRelative(file);
      for (const term of forbiddenTerms) {
        if (content.includes(term)) {
          matches.push(`${file}: ${term}`);
        }
      }
    }

    expect(matches).toEqual([]);
  });

  it("keeps production text chat registry controlled without fixture or unsafe business tools", () => {
    const service = readRelative("lib/server/chat/agent-text-chat-service.ts");
    const forbiddenTerms = [
      "createM0FixtureToolRegistry",
      "createM1FixtureToolRegistry",
      "readFixture",
      "searchExercises",
      "generateRoutine",
      "generatePlanDraft",
      "generateRoutineDraft",
      "saveWorkout",
      "queryUserMemory",
    ];
    const matches = forbiddenTerms.filter((term) => service.includes(term));

    expect(service).toContain("createProductionToolRegistry");
    expect(service).toContain("maxToolCalls: 10");
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

  it("allows only declared read-only tools as the current production business tools", () => {
    const allowedAgentToolFiles = new Set([
      "lib/server/agent-tools/index.ts",
      "lib/server/agent-tools/exercise-facts/inspect-visible-training-proposals.tool.ts",
      "lib/server/agent-tools/exercises/resolve-exercise-resource-mentions.tool.ts",
      "lib/server/agent-tools/exercises/search-exercise-resources.tool.ts",
      "lib/server/agent-tools/fixture/read-fixture.tool.ts",
      "lib/server/agent-tools/fixture/m1-safety-fixture.tools.ts",
    ]);
    const unexpectedFiles = collectFiles("lib/server/agent-tools")
      .map((file) => path.relative(repoRoot, file))
      .filter((file) => !allowedAgentToolFiles.has(file));
    const registryEntry = readRelative("lib/server/agent-tools/index.ts");
    const productionRegistryFunction = registryEntry.slice(
      registryEntry.indexOf("export function createProductionToolRegistry"),
      registryEntry.indexOf("/** productionAgentTools"),
    );
    const forbiddenRegistrations = [
      "routine",
      "workout",
      "memory",
      "saveWorkout",
      "searchExercises",
      "@/lib/server/db",
    ].filter((term) => registryEntry.includes(term));

    expect(unexpectedFiles).toEqual([]);
    expect(registryEntry).toContain("inspectVisibleTrainingProposalsTool");
    expect(registryEntry).toContain("resolveExerciseResourceMentionsTool");
    expect(registryEntry).toContain("searchExerciseResourcesTool");
    expect(registryEntry).toContain("productionAgentTools = [");
    expect(productionRegistryFunction).not.toContain("readFixtureTool");
    expect(productionRegistryFunction).not.toContain("m1SafetyFixtureTools");
    expect(forbiddenRegistrations).toEqual([]);
  });
});
