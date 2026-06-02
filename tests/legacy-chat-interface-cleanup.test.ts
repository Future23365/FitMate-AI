import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

describe("legacy chat AI interface cleanup", () => {
  it("removes legacy chat AI Route Handlers and route-only services", () => {
    expect(existsSync(join(repoRoot, "app/api/ai/workout-plan/route.ts"))).toBe(false);
    expect(existsSync(join(repoRoot, "app/api/ai/exercise-recommendations/route.ts"))).toBe(false);
    expect(existsSync(join(repoRoot, "lib/server/workout-plans/ai-workout-plan-service.ts"))).toBe(false);
    expect(existsSync(join(repoRoot, "lib/server/exercise-recommendations/ai-exercise-recommendation-service.ts"))).toBe(false);
    expect(existsSync(join(repoRoot, "lib/server/reference-resolver/reference-resolver-service.ts"))).toBe(false);
    expect(existsSync(join(repoRoot, "lib/server/workout-patches/workout-patch-chat-service.ts"))).toBe(false);
    expect(existsSync(join(repoRoot, "lib/shared/reference-resolver/schema.ts"))).toBe(false);
  });

  it("keeps the frontend chat flow on Agent-first /api/chat contracts", () => {
    const frontendFiles = [
      "features/chat/api/chat-client.ts",
      "features/chat/hooks/use-chat-controller.ts",
      "features/chat/components/chat-page.tsx",
    ];
    const forbiddenPatterns = [
      "/api/ai/workout-plan",
      "/api/ai/exercise-recommendations",
      "requestWorkoutPlanDraft",
      "requestExerciseRecommendations",
      "features/chat/lib/workout-plan-trigger",
      "extractWorkoutPlanTrigger",
      "extractWorkoutRoutineTrigger",
      "extractExerciseRecommendationTrigger",
      "extractSuggestedReplyTrigger",
    ];

    for (const file of frontendFiles) {
      const content = readProjectFile(file);

      for (const pattern of forbiddenPatterns) {
        expect(content, `${file} must not contain ${pattern}`).not.toContain(pattern);
      }
    }
  });

  it("keeps production code free of deleted legacy service imports", () => {
    const productionFiles = listFiles(["app", "features", "lib"], [".ts", ".tsx"]);
    const forbiddenPatterns = [
      "ai-workout-plan-service",
      "ai-exercise-recommendation-service",
      "generateAiWorkoutPlanDraft",
      "aiWorkoutPlanRequestSchema",
      "generateAiExerciseRecommendations",
      "reference-resolver-service",
      "workout-patch-chat-service",
      "@/lib/shared/reference-resolver",
    ];

    for (const file of productionFiles) {
      const content = readFileSync(file, "utf8");
      const relativePath = relative(repoRoot, file);

      for (const pattern of forbiddenPatterns) {
        expect(content, `${relativePath} must not contain ${pattern}`).not.toContain(pattern);
      }
    }
  });

  it("keeps active OpenSpec requirements from requiring legacy AI routes", () => {
    const specFiles = listFiles(["openspec/specs"], [".md"]);
    const forbiddenPatterns = [
      "/api/ai/workout-plan",
      "/api/ai/exercise-recommendations",
      "requestWorkoutPlanDraft",
      "requestExerciseRecommendations",
      "workout plan、routine、exercise recommendation 和 suggested reply trigger 解析测试 MUST 覆盖",
    ];

    for (const file of specFiles) {
      const content = readFileSync(file, "utf8");
      const relativePath = relative(repoRoot, file);

      for (const pattern of forbiddenPatterns) {
        expect(content, `${relativePath} must not require ${pattern}`).not.toContain(pattern);
      }
    }
  });
});

function readProjectFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function listFiles(relativeDirs: string[], extensions: string[]) {
  return relativeDirs.flatMap((dir) => walk(join(repoRoot, dir), extensions));
}

function walk(dir: string, extensions: string[]): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (entry === "archive" || entry === "node_modules" || entry === ".next") {
        continue;
      }
      files.push(...walk(fullPath, extensions));
      continue;
    }

    if (extensions.some((extension) => fullPath.endsWith(extension))) {
      files.push(fullPath);
    }
  }

  return files;
}
