import { afterEach, describe, expect, it, vi } from "vitest";

import { executeTool } from "@/lib/server/agent-core/executor";
import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { agentRuntimeConfig } from "@/lib/server/config";
import type {
  ExerciseResourceMentionResolutionResult,
  ExerciseResourceSummary,
} from "@/lib/server/exercises/exercise-repository";

const repositoryPath = "@/lib/server/exercises/exercise-repository";

describe("resolveExerciseResourceMentions tool", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock(repositoryPath);
  });

  it("resolves multiple mentioned exercises through the real tool boundary", async () => {
    const { tool, repository } = await importToolWithRepositoryImplementation(async (input) => {
      const text = (input as { text: string }).text;
      const exerciseByText: Record<string, ExerciseResourceSummary> = {
        "俯卧撑": createExerciseSummary({ id: "Pushups", nameZh: "俯卧撑", nameEn: "Pushups" }),
        "深蹲": createExerciseSummary({ id: "Bodyweight_Squat", nameZh: "深蹲", nameEn: "Bodyweight Squat", primaryMusclesZh: ["股四头肌"] }),
        "平板支撑": createExerciseSummary({ id: "Plank", nameZh: "平板支撑", nameEn: "Plank", primaryMusclesZh: ["腹肌"] }),
      };

      return createMentionResult({
        text,
        totalMatches: 1,
        exactMatchCount: 1,
        exercises: [exerciseByText[text]],
      });
    });

    const result = await executeTool({
      tool,
      input: {
        mentions: [
          { text: "俯卧撑", sectionHint: "training" },
          { text: "深蹲", sectionHint: "training" },
          { text: "平板支撑", sectionHint: "training" },
        ],
      },
      run: {
        runId: "run-resolve-mentions",
        actor: { userId: "user-1" },
        userInput: "我想做一套包含俯卧撑、深蹲和平板支撑的训练",
      },
      timeoutMs: 100,
      toolCallId: "tc_resolve_mentions",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        status: "succeeded",
        mentionCount: 3,
        matchedCount: 3,
        ambiguousCount: 0,
        notFoundCount: 0,
        results: [
          { text: "俯卧撑", status: "matched", matches: [{ exerciseId: "Pushups" }] },
          { text: "深蹲", status: "matched", matches: [{ exerciseId: "Bodyweight_Squat" }] },
          { text: "平板支撑", status: "matched", matches: [{ exerciseId: "Plank" }] },
        ],
      },
      fulfillment: {
        satisfied: true,
        summary: "解析 3 个点名动作：命中 3 个，歧义 0 个，未命中 0 个。",
      },
    });
    expect(repository.resolveExerciseResourceMentionSummaries).toHaveBeenCalledTimes(3);
    expect(repository.resolveExerciseResourceMentionSummaries.mock.calls.map(([input]) => input)).toEqual([
      { text: "俯卧撑", maxMatches: agentRuntimeConfig.tools.resolveExerciseResourceMentions.maxMatches },
      { text: "深蹲", maxMatches: agentRuntimeConfig.tools.resolveExerciseResourceMentions.maxMatches },
      { text: "平板支撑", maxMatches: agentRuntimeConfig.tools.resolveExerciseResourceMentions.maxMatches },
    ]);

    if (!result.ok) {
      throw new Error("resolveExerciseResourceMentions should succeed");
    }
    const modelObservation = tool.toModelObservation?.(
      result.output as Parameters<NonNullable<typeof tool.toModelObservation>>[0],
      {
        runId: "run-resolve-mentions",
        actor: { userId: "user-1" },
        toolCallId: "tc_resolve_mentions",
      },
    );
    expect(modelObservation).toMatchObject({
      mentionCount: 3,
      matchedCount: 3,
      ambiguousCount: 0,
      notFoundCount: 0,
      requiredExerciseIdsBoundary: expect.stringContaining("searchExerciseResources.requiredExerciseIds"),
      sourceBoundary: expect.stringContaining("不能直接作为 visibleTrainingProposal.exerciseItems[*].exerciseId"),
      nextStepBoundary: expect.stringContaining("不要求固定下一步 tool flow"),
    });
    expect(JSON.stringify(modelObservation)).toContain("allowedSections");
    const serializedProjection = JSON.stringify(result.projection);
    expect(serializedProjection).toContain("requiredExerciseIds");
    expect(serializedProjection).toContain("Pushups");
    expect(serializedProjection).toContain("Bodyweight_Squat");
    expect(serializedProjection).toContain("Plank");
    expect(serializedProjection).not.toContain("embedding");
    expect(serializedProjection).not.toContain("instructionsZh");
    expect(serializedProjection).not.toContain("candidateSetId");
    expect(serializedProjection).not.toContain("candidate_set");
    expect(serializedProjection).not.toContain("server-only-secret");
  });

  it("returns ambiguous and not_found diagnostics without choosing user semantics", async () => {
    const { tool } = await importToolWithRepositoryImplementation(async (input) => {
      const text = (input as { text: string }).text;
      if (text === "划船") {
        return createMentionResult({
          text,
          totalMatches: 2,
          exactMatchCount: 0,
          exercises: [
            createExerciseSummary({ id: "Dumbbell_Row", nameZh: "哑铃划船" }),
            createExerciseSummary({ id: "Cable_Row", nameZh: "绳索划船", equipmentZh: "绳索器械" }),
          ],
        });
      }

      return createMentionResult({
        text,
        totalMatches: 0,
        exactMatchCount: 0,
        exercises: [],
      });
    });

    const result = await executeTool({
      tool,
      input: {
        mentions: [
          { text: "划船", sectionHint: "training" },
          { text: "火星跳跃", sectionHint: "training" },
        ],
      },
      run: { runId: "run-ambiguous-mentions", actor: { userId: "user-1" }, userInput: "加划船和火星跳跃" },
      timeoutMs: 100,
      toolCallId: "tc_ambiguous_mentions",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        matchedCount: 0,
        ambiguousCount: 1,
        notFoundCount: 1,
        results: [
          {
            text: "划船",
            status: "ambiguous",
            matches: [
              { exerciseId: "Dumbbell_Row" },
              { exerciseId: "Cable_Row" },
            ],
            diagnostics: [{ code: "mention_ambiguous" }],
          },
          {
            text: "火星跳跃",
            status: "not_found",
            matches: [],
            diagnostics: [{ code: "mention_not_found" }],
          },
        ],
      },
    });

    if (!result.ok) {
      throw new Error("resolveExerciseResourceMentions should succeed");
    }
    const modelObservation = tool.toModelObservation?.(
      result.output as Parameters<NonNullable<typeof tool.toModelObservation>>[0],
      {
        runId: "run-ambiguous-mentions",
        actor: { userId: "user-1" },
        toolCallId: "tc_ambiguous_mentions",
      },
    );
    expect(modelObservation).toMatchObject({
      mentionCount: 2,
      matchedCount: 0,
      ambiguousCount: 1,
      notFoundCount: 1,
      nextStepBoundary: expect.stringContaining("选择候选、重查、澄清或失败收口"),
    });
    const observationJson = JSON.stringify(modelObservation);
    expect(observationJson).toContain("mention_ambiguous");
    expect(observationJson).toContain("mention_not_found");
    expect(observationJson).toContain("allowedSections");
    expect(observationJson).toContain("requiredExerciseIds");
    expect(observationJson).not.toContain("必须调用 searchExerciseResources");
  });

  it("rejects unknown fields and mention count overflow before handler execution", async () => {
    const { tool, repository } = await importToolWithRepositoryImplementation(async () => createMentionResult());

    await expect(executeTool({
      tool,
      input: {
        mentions: [{ text: "俯卧撑" }],
        userId: "user-1",
      },
      run: { runId: "run-unknown-field", actor: { userId: "user-1" }, userInput: "俯卧撑" },
      timeoutMs: 100,
      toolCallId: "tc_unknown",
    })).resolves.toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT } });

    await expect(executeTool({
      tool,
      input: {
        mentions: Array.from({ length: 13 }, (_, index) => ({ text: `动作 ${index + 1}` })),
      },
      run: { runId: "run-too-many-mentions", actor: { userId: "user-1" }, userInput: "很多动作" },
      timeoutMs: 100,
      toolCallId: "tc_too_many",
    })).resolves.toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT } });

    expect(repository.resolveExerciseResourceMentionSummaries).not.toHaveBeenCalled();
  });

  it("normalizes handler failures", async () => {
    const { tool } = await importToolWithRepositoryImplementation(async () => {
      throw new Error("database failed");
    });

    await expect(executeTool({
      tool,
      input: { mentions: [{ text: "俯卧撑" }] },
      run: { runId: "run-handler-failure", actor: { userId: "user-1" }, userInput: "俯卧撑" },
      timeoutMs: 100,
      toolCallId: "tc_failure",
    })).resolves.toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.HANDLER_ERROR } });
  });
});

async function importToolWithRepositoryImplementation(
  implementation: (...args: unknown[]) => Promise<ExerciseResourceMentionResolutionResult>,
) {
  vi.resetModules();
  const resolveExerciseResourceMentionSummaries = vi.fn(implementation);
  vi.doMock(repositoryPath, () => ({
    resolveExerciseResourceMentionSummaries,
  }));
  const toolModule = await import("@/lib/server/agent-tools/exercises/resolve-exercise-resource-mentions.tool");

  return {
    tool: toolModule.resolveExerciseResourceMentionsTool,
    repository: {
      resolveExerciseResourceMentionSummaries,
    },
  };
}

function createMentionResult(overrides: Partial<ExerciseResourceMentionResolutionResult> = {}): ExerciseResourceMentionResolutionResult {
  const exercises = overrides.exercises ?? [createExerciseSummary()];

  return {
    text: overrides.text ?? "俯卧撑",
    totalMatches: overrides.totalMatches ?? exercises.length,
    returnedCount: overrides.returnedCount ?? exercises.length,
    maxMatches: overrides.maxMatches ?? 5,
    truncated: overrides.truncated ?? false,
    exactMatchCount: overrides.exactMatchCount ?? (exercises.length === 1 ? 1 : 0),
    exercises,
  };
}

function createExerciseSummary(overrides: Partial<ExerciseResourceSummary> = {}): ExerciseResourceSummary {
  return {
    id: overrides.id ?? "Pushups",
    nameEn: overrides.nameEn ?? "Pushups",
    nameZh: overrides.nameZh ?? "俯卧撑",
    category: overrides.category ?? "strength",
    categoryZh: overrides.categoryZh ?? "力量",
    level: overrides.level ?? "beginner",
    levelZh: overrides.levelZh ?? "初级",
    force: overrides.force ?? "push",
    forceZh: overrides.forceZh ?? "推",
    mechanic: overrides.mechanic ?? "compound",
    mechanicZh: overrides.mechanicZh ?? "复合",
    equipment: overrides.equipment ?? "body only",
    equipmentZh: overrides.equipmentZh ?? "自重",
    homeRequirement: overrides.homeRequirement ?? "none",
    homeRequirementZh: overrides.homeRequirementZh ?? "无器械",
    primaryMuscles: overrides.primaryMuscles ?? ["chest"],
    primaryMusclesZh: overrides.primaryMusclesZh ?? ["胸部"],
    secondaryMuscles: overrides.secondaryMuscles ?? ["triceps"],
    secondaryMusclesZh: overrides.secondaryMusclesZh ?? ["肱三头肌"],
    imageUrls: overrides.imageUrls ?? ["/push-up.png"],
    allowedSections: overrides.allowedSections ?? ["training"],
    goalTags: overrides.goalTags ?? ["strength"],
    riskTags: overrides.riskTags ?? [],
    reviewStatus: overrides.reviewStatus ?? "human_reviewed",
    isPublished: overrides.isPublished ?? true,
  };
}
