import { afterEach, describe, expect, it, vi } from "vitest";

import { toTerminalToolResultRefs } from "@/lib/server/agent-core/contracts";
import { createToolResultId, executeTool, hashNormalizedInput } from "@/lib/server/agent-core/executor";
import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { renderAgentResponseEvents } from "@/lib/server/agent-core/response-renderer";
import { runAgentRuntime } from "@/lib/server/agent-core/runtime";
import { ToolRegistry } from "@/lib/server/agent-core/tool-registry";
import { ReplayPlanner } from "@/lib/server/agent-planners/replay-planner";
import { agentRuntimeConfig } from "@/lib/server/config";
import type { ExerciseResourceSearchResult } from "@/lib/server/exercises/exercise-repository";

const repositoryPath = "@/lib/server/exercises/exercise-repository";
const dbPath = "@/lib/server/db/prisma";

type SearchResultOverrides = Omit<Partial<ExerciseResourceSearchResult>, "query"> & {
  query?: Partial<ExerciseResourceSearchResult["query"]>;
};

describe("searchExerciseResources tool", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock(repositoryPath);
    vi.doUnmock(dbPath);
  });

  it("executes through the real tool boundary and exposes exerciseId grouped by training", async () => {
    const { tool, repository } = await importToolWithRepositoryResult(createSearchResult({
      query: {
        muscles: ["胸部"],
        equipment: "no_equipment",
        suitability: "training",
        published: true,
        sort: "name_asc",
      },
      filterSemantics: [createNoEquipmentFilterSemantic("no_equipment")],
      totalMatches: 2,
      returnedCount: 1,
      exercises: [createExerciseSummary({ id: "push-up", nameZh: "俯卧撑", homeRequirement: "floor", homeRequirementZh: "地面/瑜伽垫" })],
    }));

    const result = await executeTool({
      tool,
      input: { muscles: ["胸部"], equipment: "no_equipment", suitabilities: ["training"] },
      run: { runId: "run-search", actor: { userId: "user-1" }, userInput: "找几个徒手胸部训练动作" },
      timeoutMs: 100,
      toolCallId: "tc_search",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        status: "succeeded",
        query: {
          suitabilities: ["training"],
          published: true,
          sort: "name_asc",
          totalMatches: 2,
          returnedCount: 1,
          truncated: false,
          appliedFilters: expect.arrayContaining([
            { field: "equipment", value: "no_equipment" },
            { field: "muscles", value: ["胸部"] },
            { field: "suitabilities", value: ["training"] },
            { field: "published", value: true },
          ]),
          filterSemantics: [createNoEquipmentFilterSemantic("no_equipment")],
        },
        groups: {
          training: {
            suitability: "training",
            exercises: [
              expect.objectContaining({
                exerciseId: "push-up",
                nameZh: "俯卧撑",
                imageUrl: "/push-up.png",
                allowedSections: ["training"],
                isPublished: true,
              }),
            ],
          },
        },
        diagnostics: [],
      },
      fulfillment: {
        satisfied: true,
        summary: "按 training 查询到 2 个发布态动作，返回 1 个摘要。",
      },
    });
    expect(repository.searchExerciseResourceSummaries).toHaveBeenCalledWith({
      q: undefined,
      category: undefined,
      suitability: "training",
      level: undefined,
      force: undefined,
      mechanic: undefined,
      equipment: "no_equipment",
      homeRequirement: undefined,
      muscles: ["胸部"],
      goalTag: undefined,
      riskTag: undefined,
      excludeExerciseIds: undefined,
      maxReturned: agentRuntimeConfig.tools.searchExerciseResources.maxReturnedPerSection,
      published: true,
      sort: "name_asc",
    });

    if (!result.ok) {
      throw new Error("searchExerciseResources should succeed");
    }
    const modelObservation = tool.toModelObservation?.(
      result.output as Parameters<NonNullable<typeof tool.toModelObservation>>[0],
      {
      runId: "run-search",
      actor: { userId: "user-1" },
      toolCallId: "tc_search",
      },
    );
    const serializedObservation = JSON.stringify(modelObservation);
    expect(serializedObservation).toContain("exerciseId");
    expect(serializedObservation).toContain("availableSections");
    expect(serializedObservation).toContain("section-scoped 动作事实");
    expect(modelObservation).toMatchObject({
      availableSections: ["training"],
      sectionSummary: { warmup: 0, training: 1, stretch: 0 },
      missingSectionsForRoutineOrPlan: ["warmup", "stretch"],
      supportsOutputKinds: ["exercise_selection"],
      groupSemantics: {
        groupKey: "groups.<section>",
        sectionRelation: expect.stringContaining("visibleTrainingProposal.exerciseItems[]"),
        allowedSectionsRelation: expect.stringContaining("allowedSections"),
      },
      routinePlanCompositionBoundary: {
        returnedSections: ["training"],
        sectionSummary: { warmup: 0, training: 1, stretch: 0 },
        missingSectionsForRoutineOrPlan: ["warmup", "stretch"],
        forbiddenFinalVisibleOutputs: expect.stringContaining("缺口补齐前只能继续补事实、澄清或失败收口"),
        allowedNextActions: expect.arrayContaining([
          "如果目标已经是 routine 或 plan，且关键约束足以解释方案，可继续用 suitabilities = [\"warmup\", \"stretch\"] 或等价缺失 section 查询候选。",
          "只有候选不足、约束冲突、tool 不可用或关键约束仍不足时，才使用 ask_user 澄清必要约束。",
          "无法补齐时不输出 visibleOutputs，应说明缺少哪些 section 候选和可恢复下一步。",
        ]),
        note: expect.stringContaining("当前结果只提供 training 动作事实"),
      },
      refreshExclusionBoundary: expect.stringContaining("本次查询未应用 excludeExerciseIds"),
      filterSemantics: [createNoEquipmentFilterSemantic("no_equipment")],
    });
    expect(serializedObservation).toContain("section 应与使用的 group key 保持一致");
    expect(serializedObservation).toContain("当前结果只提供 training 动作事实");
    expect(serializedObservation).toContain("还需要当前 run 可消费的 warmup 和 stretch 动作事实");
    expect(serializedObservation).toContain("suitabilities = [\\\"warmup\\\", \\\"stretch\\\"]");
    expect(serializedObservation).toContain("missingSectionsForRoutineOrPlan 非空");
    expect(serializedObservation).toContain("不能支撑 successful routine 或 plan visible output");
    expect(serializedObservation).toContain("缺口补齐前只能继续补事实、澄清或失败收口");
    expect(serializedObservation).toContain("不得把未返回 section 伪造成已获得事实");
    expect(serializedObservation).toContain("不得把本次 tool result 直接当作最终 visibleTrainingProposal");
    expect(serializedObservation).toContain("本次查询未使用 requiredExerciseIds");
    expect(serializedObservation).toContain("地面/瑜伽垫");
    expect(serializedObservation).toContain("repository 只映射到自重动作字段");
    expect(serializedObservation).toContain("正向事实来源");
    expect(serializedObservation).not.toContain("sectionEvidence");
    expect(serializedObservation).not.toContain("exerciseSectionEvidence");
    expect(serializedObservation).not.toContain("visibleTrainingProposalEvidence");
    expect(serializedObservation).not.toContain("candidate_set");
    expect(serializedObservation).not.toContain("imageUrl");
    expect(serializedObservation).not.toContain("bodyRegions");
    expect(serializedObservation).not.toContain("expandedMuscles");
    expect(serializedObservation).not.toContain("\"id\"");
    expect(serializedObservation).not.toContain("visibleTrainingProposal\":{\"");
    expect(serializedObservation).toContain("groups.<section>.exercises[] 是本次实际返回的 section-scoped 动作事实");
    expect(serializedObservation).toContain("availableSections 只包含本次 groups 中有动作的 section");
    expect(serializedObservation).toContain("引用对象不可见时，不得用本查询结果宣称刷新、替换或调整成功");
    expect(serializedObservation).toContain("prescription、schedule 和最终 payload.kind");
    expect(serializedObservation).toContain("section-scoped 动作事实");
    expect(serializedObservation).toContain("visibleOutputs[] 或当前 run 可消费事实承载");
    expect(serializedObservation).not.toContain("不是 visibleTrainingProposal");
    expect(serializedObservation).not.toContain("\"warmup\":{\"suitability\":\"warmup\"");
    expect(serializedObservation).not.toContain("\"stretch\":{\"suitability\":\"stretch\"");
  });

  it("treats missing support sections as a routine composition step before asking the user to self-compose", async () => {
    const { tool } = await importToolWithRepositoryImplementation(async (input) => {
      const suitability = (input as { suitability?: string }).suitability;

      return createSearchResult({
        query: {
          muscles: ["胸部"],
          equipment: "no_equipment",
          suitability: suitability as "training",
          published: true,
          sort: "name_asc",
        },
        totalMatches: 1,
        returnedCount: 1,
        exercises: [createExerciseSummary({
          id: "push-up",
          nameZh: "俯卧撑",
          allowedSections: ["training"],
        })],
      });
    });

    const result = await executeTool({
      tool,
      input: { muscles: ["胸部"], equipment: "no_equipment", suitabilities: ["training"] },
      run: { runId: "run-routine-training-only", actor: { userId: "user-1" }, userInput: "给我一套胸部20分钟无器械训练" },
      timeoutMs: 100,
      toolCallId: "tc_routine_training_only",
    });

    if (!result.ok) {
      throw new Error("searchExerciseResources should succeed");
    }
    const observation = tool.toModelObservation?.(
      result.output as Parameters<NonNullable<typeof tool.toModelObservation>>[0],
      {
        runId: "run-routine-training-only",
        actor: { userId: "user-1" },
        toolCallId: "tc_routine_training_only",
      },
    );
    const observationJson = JSON.stringify(observation);

    expect(observationJson).toContain("suitabilities = [\\\"warmup\\\", \\\"stretch\\\"]");
    expect(observationJson).toContain("缺口补齐前只能继续补事实、澄清或失败收口");
    expect(observationJson).toContain("当前结果只提供 training 动作事实");
    expect(observationJson).not.toContain("你可以从中挑选");
    expect(observationJson).not.toContain("如果你需要完整计划");
  });

  it("returns diagnostic unsatisfied fulfillment for broad queries without explanatory constraints", async () => {
    const { tool, repository } = await importToolWithRepositoryResult(createSearchResult({
      query: {
        suitability: "training",
        published: true,
        sort: "name_asc",
      },
      totalMatches: 12,
      returnedCount: 1,
      exercises: [createExerciseSummary({ id: "push-up", nameZh: "俯卧撑" })],
    }));

    const result = await executeTool({
      tool,
      input: { suitabilities: ["training"] },
      run: { runId: "run-broad", actor: { userId: "user-1" }, userInput: "推荐一个动作" },
      timeoutMs: 100,
      toolCallId: "tc_broad",
    });

    expect(repository.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      q: undefined,
      muscles: undefined,
      equipment: undefined,
      homeRequirement: undefined,
      suitability: "training",
    }));
    expect(result).toMatchObject({
      ok: true,
      fulfillment: {
        satisfied: false,
        summary: expect.stringContaining("input 缺少可解释训练目标"),
      },
    });

    if (!result.ok) {
      throw new Error("searchExerciseResources should return diagnostic success output");
    }
    const modelObservation = tool.toModelObservation?.(
      result.output as Parameters<NonNullable<typeof tool.toModelObservation>>[0],
      {
        runId: "run-broad",
        actor: { userId: "user-1" },
        toolCallId: "tc_broad",
      },
    );

    expect(modelObservation).toMatchObject({
      querySpecificity: {
        status: "too_broad",
        specificFilters: [],
        forbiddenFinalAnswer: expect.stringContaining("普通 final_answer 只能解释当前条件过宽或事实不足"),
      },
    });
    const serializedObservation = JSON.stringify(modelObservation);
    expect(serializedObservation).toContain("fulfillment.satisfied=false");
    expect(serializedObservation).toContain("可支撑普通文本解释条件过宽");
    expect(serializedObservation).toContain("不能作为训练推送可消费事实");
    expect(serializedObservation).toContain("使用 ask_user 澄清训练目标");

    const sameInputDifferentUserTextResult = await executeTool({
      tool,
      input: { suitabilities: ["training"] },
      run: { runId: "run-broad-user-text", actor: { userId: "user-1" }, userInput: "找几个胸部动作" },
      timeoutMs: 100,
      toolCallId: "tc_broad_user_text",
    });
    expect(sameInputDifferentUserTextResult).toMatchObject({
      ok: true,
      fulfillment: { satisfied: false },
    });
  });

  it("passes multiple real muscle facets through the tool boundary", async () => {
    const { tool, repository } = await importToolWithRepositoryImplementation(async (input) => createSearchResult({
      query: input as ExerciseResourceSearchResult["query"],
      totalMatches: 2,
      returnedCount: 2,
      exercises: [
        createExerciseSummary({ id: "push-up", nameZh: "俯卧撑", primaryMusclesZh: ["胸部"] }),
        createExerciseSummary({ id: "diamond-push-up", nameZh: "钻石俯卧撑", primaryMusclesZh: ["肱三头肌"] }),
      ],
    }));

    const result = await executeTool({
      tool,
      input: {
        muscles: ["胸部", "肱三头肌", "肱三头肌"],
        suitabilities: ["training"],
      },
      run: { runId: "run-muscles", actor: { userId: "user-1" }, userInput: "找胸部和手臂动作" },
      timeoutMs: 100,
      toolCallId: "tc_muscles",
    });

    expect(repository.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      muscles: ["胸部", "肱三头肌"],
      suitability: "training",
    }));
    expect(result).toMatchObject({
      ok: true,
      output: {
        query: {
          muscles: ["胸部", "肱三头肌"],
          appliedFilters: expect.arrayContaining([
            { field: "muscles", value: ["胸部", "肱三头肌"] },
          ]),
        },
      },
    });
  });

  it("queries warmup and stretch in one tool call and returns structured empty diagnostics", async () => {
    const { tool, repository } = await importToolWithRepositoryImplementation(async (input) => {
      const suitability = (input as { suitability?: string }).suitability;
      return createSearchResult({
        query: {
          suitability: suitability as "warmup" | "stretch",
          published: true,
          sort: "name_asc",
        },
        totalMatches: suitability === "warmup" ? 1 : 0,
        returnedCount: suitability === "warmup" ? 1 : 0,
        exercises: suitability === "warmup"
          ? [createExerciseSummary({ id: "jumping-jack", nameZh: "开合跳", allowedSections: ["warmup"] })]
          : [],
      });
    });

    const result = await executeTool({
      tool,
      input: { suitabilities: ["warmup", "stretch"] },
      run: { runId: "run-groups", actor: { userId: "user-1" }, userInput: "把这些动作编排一下" },
      timeoutMs: 100,
      toolCallId: "tc_groups",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        query: {
          suitabilities: ["warmup", "stretch"],
          totalMatches: 1,
          returnedCount: 1,
        },
        groups: {
          warmup: {
            exercises: [expect.objectContaining({ exerciseId: "jumping-jack" })],
          },
          stretch: {
            exercises: [],
          },
        },
        diagnostics: [
          {
            suitability: "stretch",
            code: "no_candidates",
            message: expect.stringContaining("stretch 用途当前没有匹配候选"),
          },
        ],
      },
    });
    expect(repository.searchExerciseResourceSummaries).toHaveBeenCalledTimes(2);
    expect(repository.searchExerciseResourceSummaries.mock.calls.map(([input]) => (input as { suitability: string }).suitability)).toEqual([
      "warmup",
      "stretch",
    ]);
  });

  it("explains replacement shortage after excluding visible training proposal exercises without refilling excluded ids", async () => {
    const { tool, repository } = await importToolWithRepositoryResult(createSearchResult({
      query: {
        suitability: "training",
        equipment: "body only",
        excludeExerciseIds: ["squat", "lunge"],
        published: true,
        sort: "name_asc",
      },
      totalMatches: 0,
      returnedCount: 0,
      excludedCount: 2,
      exercises: [],
    }));

    const result = await executeTool({
      tool,
      input: {
        suitabilities: ["training"],
        equipment: "body only",
        excludeExerciseIds: ["squat", "lunge"],
      },
      run: { runId: "run-excluded-shortage", actor: { userId: "user-1" }, userInput: "不要刚才那套，重新来一套" },
      timeoutMs: 100,
      toolCallId: "tc_excluded_shortage",
    });

    expect(repository.searchExerciseResourceSummaries).toHaveBeenCalledWith(expect.objectContaining({
      suitability: "training",
      equipment: "body only",
      excludeExerciseIds: ["squat", "lunge"],
      published: true,
    }));
    expect(result).toMatchObject({
      ok: true,
      output: {
        query: {
          totalMatches: 0,
          returnedCount: 0,
          excludedCount: 2,
          excludeExerciseIds: ["squat", "lunge"],
          appliedFilters: expect.arrayContaining([
            { field: "excludeExerciseIds", value: ["squat", "lunge"] },
          ]),
        },
        groups: {
          training: {
            exercises: [],
          },
        },
        diagnostics: [
          {
            suitability: "training",
            code: "no_candidates",
            message: expect.stringContaining("排除用户已看到或明确要求排除的动作后没有更多匹配候选"),
          },
        ],
      },
      fulfillment: {
        satisfied: true,
        summary: "查询已执行，排除用户已看到动作后当前发布态动作库没有更多匹配结果。",
      },
    });

    if (!result.ok) {
      throw new Error("searchExerciseResources should succeed");
    }
    const modelObservation = tool.toModelObservation?.(
      result.output as Parameters<NonNullable<typeof tool.toModelObservation>>[0],
      {
        runId: "run-excluded-shortage",
        actor: { userId: "user-1" },
        toolCallId: "tc_excluded_shortage",
      },
    );
    const serializedObservation = JSON.stringify(modelObservation);

    expect(serializedObservation).toContain("无法完全换新");
    expect(serializedObservation).toContain("不得为了填满新方案回填已排除动作");
    expect(serializedObservation).not.toContain("\"exerciseId\":\"squat\"");
    expect(serializedObservation).not.toContain("\"exerciseId\":\"lunge\"");
  });

  it("prioritizes requiredExerciseIds inside the existing grouped exercises output", async () => {
    const requiredExercises = [
      createExerciseSummary({ id: "Pushups", nameZh: "俯卧撑", nameEn: "Pushups" }),
      createExerciseSummary({ id: "Bodyweight_Squat", nameZh: "深蹲", nameEn: "Bodyweight Squat", primaryMusclesZh: ["股四头肌"] }),
      createExerciseSummary({ id: "Plank", nameZh: "平板支撑", nameEn: "Plank", primaryMusclesZh: ["腹肌"] }),
    ];
    const { tool, repository } = await importToolWithRepositoryResult(createSearchResult({
      query: {
        q: "俯卧撑",
        suitability: "training",
        published: true,
        sort: "name_asc",
      },
      totalMatches: 1,
      returnedCount: 1,
      exercises: [requiredExercises[0]],
    }), requiredExercises);

    const result = await executeTool({
      tool,
      input: {
        q: "俯卧撑",
        suitabilities: ["training"],
        requiredExerciseIds: ["Pushups", "Bodyweight_Squat", "Plank"],
      },
      run: { runId: "run-required-exercises", actor: { userId: "user-1" }, userInput: "包含俯卧撑、深蹲和平板支撑" },
      timeoutMs: 100,
      toolCallId: "tc_required",
    });

    expect(repository.getExerciseResourceSummariesByIds).toHaveBeenCalledWith(["Pushups", "Bodyweight_Squat", "Plank"]);
    expect(result).toMatchObject({
      ok: true,
      output: {
        query: {
          requiredExerciseIds: ["Pushups", "Bodyweight_Squat", "Plank"],
          excludeExerciseIds: undefined,
          appliedFilters: expect.arrayContaining([
            { field: "q", value: "俯卧撑" },
            { field: "requiredExerciseIds", value: ["Pushups", "Bodyweight_Squat", "Plank"] },
          ]),
          totalMatches: 3,
          returnedCount: 3,
        },
        groups: {
          training: {
            totalMatches: 3,
            returnedCount: 3,
            exercises: [
              { exerciseId: "Pushups" },
              { exerciseId: "Bodyweight_Squat" },
              { exerciseId: "Plank" },
            ],
          },
        },
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: "required_exercise_filter_mismatch", exerciseId: "Bodyweight_Squat", conflictFields: ["q"] }),
          expect.objectContaining({ code: "required_exercise_filter_mismatch", exerciseId: "Plank", conflictFields: ["q"] }),
        ]),
      },
    });

    if (!result.ok) {
      throw new Error("searchExerciseResources should succeed");
    }
    const projectionJson = JSON.stringify(result.projection);
    expect(projectionJson).toContain("groups");
    expect(projectionJson).toContain("requiredExerciseIds");
    expect(projectionJson).toContain("正向锚点");
    expect(projectionJson).toContain("不表示排除、替换或已经生成最终训练方案");
    expect(projectionJson).toContain("positiveAnchorBoundary");
    expect(projectionJson).not.toContain("requiredMatches");
    expect(projectionJson).not.toContain("supplementalMatches");
    expect(projectionJson).not.toContain("selectedRequiredExercises");
    expect(projectionJson).not.toContain("embedding");
  });

  it("diagnoses required exercise boundary conflicts without adding parallel output fields", async () => {
    const { tool } = await importToolWithRepositoryResult(createSearchResult({
      query: {
        level: "beginner",
        equipment: "body only",
        suitability: "training",
        published: true,
        sort: "name_asc",
      },
      totalMatches: 0,
      returnedCount: 0,
      exercises: [],
    }), [
      createExerciseSummary({ id: "draft-exercise", isPublished: false }),
      createExerciseSummary({ id: "warmup-only", allowedSections: ["warmup"] }),
      createExerciseSummary({ id: "excluded-exercise" }),
      createExerciseSummary({ id: "Dumbbell_Bench", nameZh: "哑铃卧推", level: "intermediate", levelZh: "中级", equipment: "dumbbell", equipmentZh: "哑铃" }),
    ]);

    const result = await executeTool({
      tool,
      input: {
        suitabilities: ["training"],
        level: "beginner",
        equipment: "body only",
        excludeExerciseIds: ["excluded-exercise"],
        requiredExerciseIds: [
          "missing-exercise",
          "draft-exercise",
          "warmup-only",
          "excluded-exercise",
          "Dumbbell_Bench",
        ],
      },
      run: { runId: "run-required-diagnostics", actor: { userId: "user-1" }, userInput: "指定动作冲突测试" },
      timeoutMs: 100,
      toolCallId: "tc_required_diagnostics",
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        groups: {
          training: {
            exercises: [{ exerciseId: "Dumbbell_Bench" }],
          },
        },
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: "required_exercise_not_found", exerciseId: "missing-exercise" }),
          expect.objectContaining({ code: "required_exercise_unpublished", exerciseId: "draft-exercise" }),
          expect.objectContaining({ code: "required_exercise_section_conflict", exerciseId: "warmup-only", conflictFields: ["suitabilities"] }),
          expect.objectContaining({ code: "required_exercise_excluded", exerciseId: "excluded-exercise" }),
          expect.objectContaining({
            code: "required_exercise_filter_mismatch",
            exerciseId: "Dumbbell_Bench",
            conflictFields: ["level", "equipment"],
          }),
        ]),
      },
    });
  });

  it("rejects legacy suitability input and unsupported suitabilities before handler execution", async () => {
    const { tool, repository } = await importToolWithRepositoryResult(createSearchResult());

    await expect(executeTool({
      tool,
      input: { suitability: "training" },
      run: { runId: "run-legacy-input", actor: { userId: "user-1" }, userInput: "练胸" },
      timeoutMs: 100,
      toolCallId: "tc_legacy",
    })).resolves.toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT } });
    expect(repository.searchExerciseResourceSummaries).not.toHaveBeenCalled();

    await expect(executeTool({
      tool,
      input: { bodyRegions: ["lower_body"], suitabilities: ["training"] },
      run: { runId: "run-removed-input", actor: { userId: "user-1" }, userInput: "练腿" },
      timeoutMs: 100,
      toolCallId: "tc_removed",
    })).resolves.toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT } });
    expect(repository.searchExerciseResourceSummaries).not.toHaveBeenCalled();

    await expect(executeTool({
      tool,
      input: { muscle: "胸部", suitabilities: ["training"] },
      run: { runId: "run-removed-muscle", actor: { userId: "user-1" }, userInput: "练胸" },
      timeoutMs: 100,
      toolCallId: "tc_removed_muscle",
    })).resolves.toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT } });
    expect(repository.searchExerciseResourceSummaries).not.toHaveBeenCalled();

    await expect(executeTool({
      tool,
      input: { homeRequirement: "none", suitabilities: ["training"] },
      run: { runId: "run-removed-home-none", actor: { userId: "user-1" }, userInput: "不要器械" },
      timeoutMs: 100,
      toolCallId: "tc_removed_home_none",
    })).resolves.toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT } });
    expect(repository.searchExerciseResourceSummaries).not.toHaveBeenCalled();

    await expect(executeTool({
      tool,
      input: { homeRequirement: "无器械", suitabilities: ["training"] },
      run: { runId: "run-removed-home-zh", actor: { userId: "user-1" }, userInput: "不要器械" },
      timeoutMs: 100,
      toolCallId: "tc_removed_home_zh",
    })).resolves.toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT } });
    expect(repository.searchExerciseResourceSummaries).not.toHaveBeenCalled();

    await expect(executeTool({
      tool,
      input: { suitabilities: ["cooldown"] },
      run: { runId: "run-bad-input", actor: { userId: "user-1" }, userInput: "放松" },
      timeoutMs: 100,
      toolCallId: "tc_bad",
    })).resolves.toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.INVALID_TOOL_INPUT } });
    expect(repository.searchExerciseResourceSummaries).not.toHaveBeenCalled();
  });

  it("normalizes repository failures as handler errors", async () => {
    const { tool } = await importToolWithRepositoryImplementation(async () => {
      throw new Error("repository boom");
    });

    await expect(executeTool({
      tool,
      input: { suitabilities: ["training"], muscles: ["胸部"] },
      run: { runId: "run-handler-error", actor: { userId: "user-1" }, userInput: "找胸部动作" },
      timeoutMs: 100,
      toolCallId: "tc_handler_error",
    })).resolves.toMatchObject({ ok: false, error: { code: AGENT_ERROR_CODES.HANDLER_ERROR } });
  });

  it("renders search results as tool_result only and does not save final proposal facts from candidates", async () => {
    const { tool } = await importToolWithRepositoryResult(createSearchResult({
      query: { suitability: "training", published: true, sort: "name_asc" },
      exercises: [createExerciseSummary({ id: "plank", nameZh: "平板支撑" })],
    }));
    const registry = new ToolRegistry();
    registry.register(tool);
    const toolInput = { muscles: ["腹肌"], suitabilities: ["training"] };
    const expectedToolResultId = createToolResultId("run-runtime-search", "searchExerciseResources", hashNormalizedInput(toolInput));
    const result = await runAgentRuntime({
      registry,
      planner: new ReplayPlanner([
        { type: "tool_call", toolName: "searchExerciseResources", input: toolInput },
        { type: "final_answer", content: "找到平板支撑这类核心训练动作。", usedRefs: toTerminalToolResultRefs([expectedToolResultId]) },
      ]),
      run: {
        runId: "run-runtime-search",
        actor: { userId: "user-1" },
        userInput: "找几个核心训练动作",
        limits: { maxSteps: 3 },
      },
    });
    const events = renderAgentResponseEvents(result);
    const serializedEvents = JSON.stringify(events);

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "tool_result", toolName: "searchExerciseResources" }),
      { type: "content", content: "找到平板支撑这类核心训练动作。" },
      { type: "done" },
    ]));
    expect(serializedEvents).toContain("exerciseId");
    expect(serializedEvents).not.toContain("visibleTrainingProposal");
    expect(serializedEvents).not.toContain("prescription");
    expect(serializedEvents).not.toContain("schedule");
  });

  it("pushes filters into Prisma where/count/take/select without full-table reads or vector rerank", async () => {
    const prisma = {
      exercise: {
        count: vi.fn().mockResolvedValue(13),
        findMany: vi.fn().mockResolvedValue(
          Array.from({ length: 13 }, (_, index) => createRepositoryExerciseRecord({
            id: `exercise-${index + 1}`,
            nameZh: `动作 ${index + 1}`,
          })),
        ),
      },
    };
    vi.doMock(dbPath, () => ({
      isDatabaseConfigured: () => true,
      getPrismaClient: () => prisma,
    }));
    vi.doUnmock(repositoryPath);
    const {
      searchExerciseResourceSummaries,
    } = await import("@/lib/server/exercises/exercise-repository");
    const configuredMaxReturned = agentRuntimeConfig.tools.searchExerciseResources.maxReturnedPerSection;

    const result = await searchExerciseResourceSummaries({
      q: "俯卧撑",
      category: "strength",
      suitability: "training",
      level: "beginner",
      force: "push",
      mechanic: "compound",
      equipment: "no_equipment",
      homeRequirement: "floor",
      goalTag: "strength",
      riskTag: "shoulder_pain",
      excludeExerciseIds: ["push-up", "squat"],
      muscles: ["胸部", "股四头肌", "腘绳肌"],
      published: true,
      sort: "name_asc",
    });
    const countArgs = prisma.exercise.count.mock.calls[0][0];
    const findManyArgs = prisma.exercise.findMany.mock.calls[0][0];
    const serializedFindMany = JSON.stringify(findManyArgs);

    expect(countArgs.where).toEqual(findManyArgs.where);
    expect(findManyArgs.take).toBe(configuredMaxReturned + 1);
    expect(findManyArgs).not.toHaveProperty("skip");
    expect(findManyArgs.select).toMatchObject({
      id: true,
      nameZh: true,
      imageUrls: true,
      allowedSections: true,
      isPublished: true,
    });
    expect(findManyArgs.select).not.toHaveProperty("instructionsEn");
    expect(findManyArgs.select).not.toHaveProperty("instructionsZh");
    expect(findManyArgs.select).not.toHaveProperty("embedding");
    expect(findManyArgs.where).toMatchObject({
      AND: expect.arrayContaining([
        { isPublished: true },
        { allowedSections: { has: "training" } },
        { goalTags: { has: "strength" } },
        { riskTags: { has: "shoulder_pain" } },
        { id: { notIn: ["push-up", "squat"] } },
      ]),
    });
    expect(serializedFindMany).toContain("\"primaryMuscles\":{\"has\":\"胸部\"}");
    expect(serializedFindMany).toContain("\"secondaryMuscles\":{\"has\":\"腘绳肌\"}");
    expect(serializedFindMany).toContain("\"primaryMusclesZh\":{\"has\":\"股四头肌\"}");
    expect(serializedFindMany).toContain("\"secondaryMusclesZh\":{\"has\":\"腘绳肌\"}");
    expect(serializedFindMany).toContain("\"embeddingText\"");
    expect(serializedFindMany).toContain("\"contains\":\"俯卧撑\"");
    expect(serializedFindMany).toContain("\"equipment\":{\"in\":[\"body only\",\"bodyweight\"]}");
    expect(serializedFindMany).toContain("\"equipmentZh\":{\"in\":[\"自重\"]}");
    expect(serializedFindMany).toContain("\"homeRequirement\":\"floor\"");
    expect(serializedFindMany).not.toContain("\"homeRequirement\":\"none\"");
    expect(serializedFindMany).not.toContain("\"homeRequirementZh\":\"无器械\"");
    expect(serializedFindMany).not.toContain("pgvector");
    expect(serializedFindMany).not.toContain("Vector DB");
    expect(serializedFindMany).not.toContain("rerank");
    expect(result).toMatchObject({
      totalMatches: 13,
      returnedCount: configuredMaxReturned,
      maxReturned: configuredMaxReturned,
      truncated: true,
      excludedCount: 2,
      filterSemantics: [createNoEquipmentFilterSemantic("no_equipment")],
    });
    expect(result.exercises).toHaveLength(configuredMaxReturned);
    expect(result.exercises[0]).toMatchObject({
      id: "exercise-1",
      allowedSections: ["training"],
      isPublished: true,
    });
  });

  it("maps Chinese no-equipment equipment query to bodyweight database facts without homeRequirement fallback", async () => {
    const prisma = {
      exercise: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          createRepositoryExerciseRecord({
            id: "floor-push-up",
            nameZh: "俯卧撑",
            equipment: "body only",
            equipmentZh: "自重",
            homeRequirement: "floor",
            homeRequirementZh: "地面/瑜伽垫",
          }),
        ]),
      },
    };
    vi.doMock(dbPath, () => ({
      isDatabaseConfigured: () => true,
      getPrismaClient: () => prisma,
    }));
    vi.doUnmock(repositoryPath);
    const {
      searchExerciseResourceSummaries,
    } = await import("@/lib/server/exercises/exercise-repository");

    const result = await searchExerciseResourceSummaries({
      equipment: "无器械",
      suitability: "training",
      published: true,
      sort: "name_asc",
    });
    const findManyArgs = prisma.exercise.findMany.mock.calls[0][0];
    const serializedWhere = JSON.stringify(findManyArgs.where);

    expect(serializedWhere).toContain("\"equipment\":{\"in\":[\"body only\",\"bodyweight\"]}");
    expect(serializedWhere).toContain("\"equipmentZh\":{\"in\":[\"自重\"]}");
    expect(serializedWhere).not.toContain("\"homeRequirement\":\"none\"");
    expect(serializedWhere).not.toContain("\"homeRequirementZh\":\"无器械\"");
    expect(result).toMatchObject({
      totalMatches: 1,
      returnedCount: 1,
      filterSemantics: [createNoEquipmentFilterSemantic("无器械")],
      exercises: [
        expect.objectContaining({
          id: "floor-push-up",
          equipmentZh: "自重",
          homeRequirementZh: "地面/瑜伽垫",
        }),
      ],
    });
  });

  it("clamps repository maxReturned to the hard cap when callers pass an unsafe value", async () => {
    const prisma = {
      exercise: {
        count: vi.fn().mockResolvedValue(30),
        findMany: vi.fn(),
      },
    };
    vi.doMock(dbPath, () => ({
      isDatabaseConfigured: () => true,
      getPrismaClient: () => prisma,
    }));
    vi.doUnmock(repositoryPath);
    const {
      EXERCISE_RESOURCE_SEARCH_HARD_MAX_RETURNED,
      searchExerciseResourceSummaries,
    } = await import("@/lib/server/exercises/exercise-repository");
    prisma.exercise.findMany.mockResolvedValue(
      Array.from({ length: EXERCISE_RESOURCE_SEARCH_HARD_MAX_RETURNED + 1 }, (_, index) => createRepositoryExerciseRecord({
        id: `hard-cap-exercise-${index + 1}`,
        nameZh: `硬上限动作 ${index + 1}`,
      })),
    );

    const result = await searchExerciseResourceSummaries({
      suitability: "training",
      published: true,
      sort: "name_asc",
      maxReturned: EXERCISE_RESOURCE_SEARCH_HARD_MAX_RETURNED + 100,
    });

    expect(prisma.exercise.findMany.mock.calls[0][0].take).toBe(EXERCISE_RESOURCE_SEARCH_HARD_MAX_RETURNED + 1);
    expect(result.maxReturned).toBe(EXERCISE_RESOURCE_SEARCH_HARD_MAX_RETURNED);
    expect(result.exercises).toHaveLength(EXERCISE_RESOURCE_SEARCH_HARD_MAX_RETURNED);
  });

  it("reads a complete facetCatalog from published exercise facts", async () => {
    const prisma = {
      exercise: {
        findMany: vi.fn().mockResolvedValue([
          createRepositoryExerciseRecord({
            category: "strength",
            categoryZh: "力量",
            level: "beginner",
            levelZh: "初级",
            force: "push",
            forceZh: "推",
            mechanic: "compound",
            mechanicZh: "复合",
            equipment: "body only",
            equipmentZh: "自重",
            homeRequirement: "floor",
            homeRequirementZh: "地面/瑜伽垫",
            primaryMuscles: ["chest", ""],
            primaryMusclesZh: ["胸部"],
            secondaryMuscles: ["triceps"],
            secondaryMusclesZh: ["肱三头肌"],
            allowedSections: ["training", "warmup"],
            goalTags: ["strength", ""],
            riskTags: ["shoulder_pain"],
          }),
          createRepositoryExerciseRecord({
            category: "mobility",
            categoryZh: "灵活性",
            level: "beginner",
            levelZh: "初级",
            force: "pull",
            forceZh: "拉",
            mechanic: "isolation",
            mechanicZh: "孤立",
            equipment: "dumbbell",
            equipmentZh: "哑铃",
            homeRequirement: "small_equipment",
            homeRequirementZh: "居家小器械",
            primaryMuscles: ["chest"],
            primaryMusclesZh: ["胸部"],
            secondaryMuscles: ["biceps"],
            secondaryMusclesZh: ["肱二头肌"],
            allowedSections: ["stretch"],
            goalTags: ["mobility"],
            riskTags: ["shoulder_pain", "wrist_load"],
          }),
        ]),
      },
    };
    vi.doMock(dbPath, () => ({
      isDatabaseConfigured: () => true,
      getPrismaClient: () => prisma,
    }));
    vi.doUnmock(repositoryPath);
    const { readExerciseResourceFacetCatalog } = await import("@/lib/server/exercises/exercise-repository");

    const catalog = await readExerciseResourceFacetCatalog();

    expect(prisma.exercise.findMany).toHaveBeenCalledWith({
      where: { isPublished: true },
      select: expect.objectContaining({
        primaryMuscles: true,
        primaryMusclesZh: true,
        secondaryMuscles: true,
        secondaryMusclesZh: true,
        allowedSections: true,
      }),
    });
    expect(catalog.muscles).toEqual(expect.arrayContaining(["chest", "胸部", "triceps", "肱三头肌", "biceps", "肱二头肌"]));
    expect(catalog.categories).toEqual(expect.arrayContaining(["strength", "力量", "mobility", "灵活性"]));
    expect(catalog.levels).toEqual(expect.arrayContaining(["beginner", "初级"]));
    expect(catalog.forces).toEqual(expect.arrayContaining(["push", "推", "pull", "拉"]));
    expect(catalog.mechanics).toEqual(expect.arrayContaining(["compound", "复合", "isolation", "孤立"]));
    expect(catalog.equipment).toEqual(expect.arrayContaining(["body only", "自重", "dumbbell", "哑铃", "no_equipment"]));
    expect(catalog.equipment).not.toContain("无器械");
    expect(catalog.homeRequirements).toEqual(expect.arrayContaining(["floor", "地面/瑜伽垫", "small_equipment", "居家小器械"]));
    expect(catalog.homeRequirements).not.toContain("none");
    expect(catalog.homeRequirements).not.toContain("无器械");
    expect(catalog.goalTags).toEqual(expect.arrayContaining(["strength", "mobility"]));
    expect(catalog.riskTags).toEqual(expect.arrayContaining(["shoulder_pain", "wrist_load"]));
    expect(catalog.suitabilities).toEqual(["warmup", "training", "stretch"]);
    expect(catalog.muscles).not.toContain("");
    expect(catalog.muscles.filter((value) => value === "胸部")).toHaveLength(1);
  });
});

async function importToolWithRepositoryResult(
  result: ExerciseResourceSearchResult,
  requiredExercises: ExerciseResourceSearchResult["exercises"] = [],
) {
  return importToolWithRepositoryImplementation(async () => result, requiredExercises);
}

async function importToolWithRepositoryImplementation(
  implementation: (...args: unknown[]) => Promise<ExerciseResourceSearchResult>,
  requiredExercises: ExerciseResourceSearchResult["exercises"] = [],
) {
  vi.resetModules();
  const searchExerciseResourceSummaries = vi.fn(implementation);
  const getExerciseResourceSummariesByIds = vi.fn(async () => requiredExercises);
  vi.doMock(repositoryPath, () => ({
    searchExerciseResourceSummaries,
    getExerciseResourceSummariesByIds,
    isNoEquipmentResourceQueryValue: isTestNoEquipmentResourceQueryValue,
    isRemovedNoEquipmentHomeRequirementValue: isTestRemovedNoEquipmentHomeRequirementValue,
    isBodyweightExerciseResourceEquipment: isTestBodyweightExerciseResourceEquipment,
    normalizeExerciseResourceFacetCatalogForPlanner: normalizeTestExerciseResourceFacetCatalogForPlanner,
  }));
  const toolModule = await import("@/lib/server/agent-tools/exercises/search-exercise-resources.tool");

  return {
    tool: toolModule.searchExerciseResourcesTool,
    repository: {
      searchExerciseResourceSummaries,
      getExerciseResourceSummariesByIds,
    },
  };
}

function createSearchResult(overrides: SearchResultOverrides = {}): ExerciseResourceSearchResult {
  const query = {
    published: true,
    sort: "name_asc" as const,
    ...overrides.query,
  };
  const exercises = overrides.exercises ?? [createExerciseSummary()];

  return {
    query,
    appliedFilters: overrides.appliedFilters ?? [{ field: "published", value: true }],
    filterSemantics: overrides.filterSemantics ?? [],
    totalMatches: overrides.totalMatches ?? exercises.length,
    returnedCount: overrides.returnedCount ?? exercises.length,
    maxReturned: overrides.maxReturned ?? agentRuntimeConfig.tools.searchExerciseResources.maxReturnedPerSection,
    truncated: overrides.truncated ?? false,
    excludedCount: overrides.excludedCount ?? 0,
    exercises,
  };
}

function createExerciseSummary(overrides: Partial<ExerciseResourceSearchResult["exercises"][number]> = {}) {
  return {
    id: overrides.id ?? "push-up",
    nameEn: overrides.nameEn ?? "Push-up",
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
    homeRequirement: overrides.homeRequirement ?? "floor",
    homeRequirementZh: overrides.homeRequirementZh ?? "地面/瑜伽垫",
    primaryMuscles: overrides.primaryMuscles ?? ["chest"],
    primaryMusclesZh: overrides.primaryMusclesZh ?? ["胸部"],
    secondaryMuscles: overrides.secondaryMuscles ?? ["triceps"],
    secondaryMusclesZh: overrides.secondaryMusclesZh ?? ["肱三头肌"],
    imageUrls: overrides.imageUrls ?? ["/push-up.png"],
    allowedSections: overrides.allowedSections ?? ["training"],
    goalTags: overrides.goalTags ?? ["strength"],
    riskTags: overrides.riskTags ?? ["shoulder_pain"],
    reviewStatus: overrides.reviewStatus ?? "human_reviewed",
    isPublished: overrides.isPublished ?? true,
  } satisfies ExerciseResourceSearchResult["exercises"][number];
}

function createRepositoryExerciseRecord(overrides: Partial<ReturnType<typeof createExerciseSummary>> = {}) {
  return createExerciseSummary(overrides);
}

function createNoEquipmentFilterSemantic(requestedValue: string) {
  return {
    field: "equipment" as const,
    requestedValue,
    databaseMapping: {
      equipment: ["body only", "bodyweight"],
      equipmentZh: ["自重"],
    },
    note: "equipment=no_equipment 表示不需要外部器械；repository 只映射到自重动作字段，不自动附加 homeRequirement 条件。",
  };
}

function isTestNoEquipmentResourceQueryValue(value: string) {
  return value.trim().toLowerCase() === "no_equipment" || value.trim() === "无器械";
}

function isTestRemovedNoEquipmentHomeRequirementValue(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "none" || normalized === "no_equipment" || value.trim() === "无器械";
}

function isTestBodyweightExerciseResourceEquipment(input: { equipment?: string | null; equipmentZh?: string | null }) {
  return input.equipment === "body only"
    || input.equipment === "bodyweight"
    || input.equipmentZh === "自重";
}

function normalizeTestExerciseResourceFacetCatalogForPlanner(catalog: {
  equipment: string[];
  homeRequirements: string[];
}) {
  return {
    ...catalog,
    equipment: [...new Set([...catalog.equipment.filter((value) => value.trim() !== "无器械"), "no_equipment"])],
    homeRequirements: catalog.homeRequirements.filter((value) => !isTestRemovedNoEquipmentHomeRequirementValue(value)),
  };
}
