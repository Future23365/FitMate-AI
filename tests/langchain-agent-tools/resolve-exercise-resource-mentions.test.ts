import { afterEach, describe, expect, it, vi } from "vitest";

import { agentRuntimeConfig } from "@/lib/server/config";
import type {
  ExerciseResourceMentionResolutionResult,
  ExerciseResourceSummary,
} from "@/lib/server/exercises/exercise-repository";

const repositoryPath = "@/lib/server/exercises/exercise-repository";

describe("resolveExerciseResourceMentions LangChain tool", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock(repositoryPath);
  });

  it("resolves mentioned exercises and exposes model/user/trace projections", async () => {
    const { executeLangChainToolWrapper, tool, repository } = await importToolWithRepositoryImplementation(async (input) => {
      const text = (input as { text: string }).text;
      const exerciseByText: Record<string, ExerciseResourceSummary> = {
        "俯卧撑": createExerciseSummary({ id: "Pushups", nameZh: "俯卧撑", nameEn: "Pushups" }),
        "深蹲": createExerciseSummary({ id: "Bodyweight_Squat", nameZh: "深蹲", nameEn: "Bodyweight Squat", primaryMusclesZh: ["股四头肌"] }),
      };

      return createMentionResult({
        text,
        totalMatches: 1,
        exactMatchCount: 1,
        exercises: [exerciseByText[text]],
      });
    });

    const result = await executeLangChainToolWrapper(
      tool,
      {
        mentions: [
          { text: "俯卧撑", sectionHint: "training" },
          { text: "深蹲", sectionHint: "training" },
        ],
      },
      { actor: { userId: "user-1", conversationId: "conversation-1" } },
      { toolCallId: "tc_resolve_mentions" },
    );
    const modelMessage = JSON.parse(result.modelMessage);

    expect(result.record).toMatchObject({
      toolCallId: "tc_resolve_mentions",
      toolName: "resolveExerciseResourceMentions",
      status: "succeeded",
      userProjection: {
        mentionCount: 2,
        matchedCount: 2,
      },
      traceSummary: {
        status: "succeeded",
        mentionCount: 2,
        matchedCount: 2,
      },
      enteredModelContext: true,
    });
    expect(modelMessage).toMatchObject({
      factLevel: "resolved_candidates",
      mentionCount: 2,
      matchedCount: 2,
      candidateBoundary: expect.stringContaining("发布态动作候选事实"),
      outputBoundary: expect.stringContaining("不是最终训练卡片"),
      results: [
        { text: "俯卧撑", status: "matched", matches: [{ exerciseId: "Pushups" }] },
        { text: "深蹲", status: "matched", matches: [{ exerciseId: "Bodyweight_Squat" }] },
      ],
    });
    expect(JSON.stringify(modelMessage)).toContain("allowedSections");
    expect(JSON.stringify(modelMessage)).not.toContain("nextActionHints");
    expect(JSON.stringify(result.record.userProjection)).not.toContain("embedding");
    expect(repository.resolveExerciseResourceMentionSummaries).toHaveBeenCalledTimes(2);
    expect(repository.resolveExerciseResourceMentionSummaries.mock.calls.map(([input]) => input)).toEqual([
      { text: "俯卧撑", maxMatches: agentRuntimeConfig.tools.resolveExerciseResourceMentions.maxMatches },
      { text: "深蹲", maxMatches: agentRuntimeConfig.tools.resolveExerciseResourceMentions.maxMatches },
    ]);
  });

  it("returns ambiguous and not_found diagnostics without forcing a next tool", async () => {
    const { executeLangChainToolWrapper, tool } = await importToolWithRepositoryImplementation(async (input) => {
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

    const result = await executeLangChainToolWrapper(
      tool,
      {
        mentions: [
          { text: "划船", sectionHint: "training" },
          { text: "火星跳跃", sectionHint: "training" },
        ],
      },
      { actor: { userId: "user-1", conversationId: "conversation-1" } },
    );
    const modelMessage = JSON.parse(result.modelMessage);
    const modelJson = JSON.stringify(modelMessage);

    expect(modelMessage).toMatchObject({
      factLevel: "resolved_candidates",
      ambiguousCount: 1,
      notFoundCount: 1,
      results: [
        { text: "划船", status: "ambiguous", diagnostics: [{ code: "mention_ambiguous" }] },
        { text: "火星跳跃", status: "not_found", diagnostics: [{ code: "mention_not_found" }] },
      ],
    });
    expect(modelJson).toContain("发布态动作候选事实");
    expect(modelJson).not.toContain("必须调用 searchExerciseResources");
    expect(modelJson).not.toContain("supportsOutputKinds");
  });

  it("rejects invalid inputs before repository execution", async () => {
    const { executeLangChainToolWrapper, tool, repository } = await importToolWithRepositoryImplementation(async () => createMentionResult());

    const result = await executeLangChainToolWrapper(
      tool,
      {
        mentions: [{ text: "俯卧撑" }],
        userId: "user-1",
      },
      { actor: { userId: "user-1" } },
    );

    expect(result.record).toMatchObject({
      toolName: "resolveExerciseResourceMentions",
      status: "failed",
      failureCode: "tool_schema_invalid",
    });
    expect(JSON.parse(result.modelMessage)).toMatchObject({
      status: "failed",
      code: "tool_schema_invalid",
    });
    expect(repository.resolveExerciseResourceMentionSummaries).not.toHaveBeenCalled();
  });

  it("normalizes repository failures as handler failures", async () => {
    const { executeLangChainToolWrapper, tool } = await importToolWithRepositoryImplementation(async () => {
      throw new Error("database failed");
    });

    const result = await executeLangChainToolWrapper(
      tool,
      { mentions: [{ text: "俯卧撑" }] },
      { actor: { userId: "user-1" } },
    );

    expect(result.record).toMatchObject({
      toolName: "resolveExerciseResourceMentions",
      status: "failed",
      failureCode: "tool_handler_failed",
      failureMessage: "database failed",
    });
  });
});

async function importToolWithRepositoryImplementation(
  implementation: (...args: unknown[]) => Promise<ExerciseResourceMentionResolutionResult>,
) {
  vi.resetModules();
  const resolveExerciseResourceMentionSummaries = vi.fn(implementation);
  vi.doMock(repositoryPath, () => ({
    getExerciseResourceSummariesByIds: vi.fn(),
    isBodyweightExerciseResourceEquipment: vi.fn(),
    isNoEquipmentResourceQueryValue: (value: string) => value === "no_equipment" || value === "无器械",
    isRemovedNoEquipmentHomeRequirementValue: (value: string) => ["none", "no_equipment", "无器械"].includes(value),
    normalizeExerciseResourceFacetCatalogForPlanner: (catalog: unknown) => catalog,
    resolveExerciseResourceMentionSummaries,
    searchExerciseResourceSummaries: vi.fn(),
  }));
  const [{ executeLangChainToolWrapper }, toolModule] = await Promise.all([
    import("@/lib/server/langchain-agent/tool-wrapper"),
    import("@/lib/server/langchain-agent/tools/exercise-resource-tools"),
  ]);

  return {
    executeLangChainToolWrapper,
    tool: toolModule.resolveExerciseResourceMentionsLangChainTool,
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
