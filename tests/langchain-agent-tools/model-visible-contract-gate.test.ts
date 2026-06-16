import { describe, expect, it } from "vitest";

import {
  collectLangChainToolWrapperModelVisibleSamples,
  createProductionAgentModelVisibleTextSamples,
  createProductionLangChainToolCatalog,
  executeLangChainToolWrapper,
  lintAgentModelVisibleTextSamples,
  validateAgentModelVisibleSummaryContract,
  type AgentModelVisibleSummarySample,
  type LangChainToolWrapper,
} from "@/lib/server/langchain-agent";
import type { ExerciseResourceFacetCatalog } from "@/lib/server/exercises/exercise-repository";

const baseContext = {
  actor: { userId: "user-1", conversationId: "conversation-1" },
};

describe("Agent model-visible contract gate", () => {
  it("lints actual production model-visible prompt, tool descriptions and schema descriptions", () => {
    const samples = createProductionAgentModelVisibleTextSamples({
      searchExerciseResourcesFacetCatalog: createFacetCatalog(),
    });
    const findings = lintAgentModelVisibleTextSamples(samples);

    expect(samples.some((sample) => sample.kind === "system_prompt")).toBe(true);
    expect(samples.some((sample) => sample.kind === "tool_description")).toBe(true);
    expect(samples.some((sample) => sample.kind === "schema_description")).toBe(true);
    expect(samples.some((sample) => sample.kind === "finalization_tool_description")).toBe(true);
    expect(findings).toEqual([]);
  });

  it("validates production catalog summaries, repair feedback and trace summaries with a whitelist contract", async () => {
    const tools = createProductionLangChainToolCatalog({
      searchExerciseResourcesFacetCatalog: createFacetCatalog(),
    });
    const samples: AgentModelVisibleSummarySample[] = [];

    for (const tool of tools) {
      const fixtures = readFixturesForTool(tool);

      expect(fixtures.length, `${tool.name} must have contract fixtures`).toBeGreaterThan(0);
      samples.push(...collectLangChainToolWrapperModelVisibleSamples(tool, fixtures));

      const schemaRejected = await executeLangChainToolWrapper(
        tool,
        { unexpectedField: "must be rejected before handler" },
        baseContext,
      );

      expect(schemaRejected.record.status, `${tool.name} schema fixture`).toBe("failed");
      samples.push({
        id: `${tool.name}.schema_rejected.repair_feedback`,
        kind: "repair_feedback",
        source: "executeLangChainToolWrapper schema rejection",
        value: schemaRejected.modelMessage,
      });
    }

    samples.push(...createRepresentativeRuntimeBoundarySamples());

    const findings = samples.flatMap((sample) =>
      validateAgentModelVisibleSummaryContract(sample).findings,
    );
    const searchModelSummaries = samples
      .filter((sample) => sample.id.startsWith("searchExerciseResources.") && sample.kind === "tool_result_summary")
      .map((sample) => JSON.stringify(sample.value));
    const searchTraceSummaries = samples
      .filter((sample) => sample.id.startsWith("searchExerciseResources.") && sample.kind === "trace_summary")
      .map((sample) => JSON.stringify(sample.value));
    const inspectModelSummaries = samples
      .filter((sample) => sample.id.startsWith("inspectVisibleTrainingProposals.") && sample.kind === "tool_result_summary")
      .map((sample) => JSON.stringify(sample.value));

    expect(findings).toEqual([]);
    expect(inspectModelSummaries.some((summaryJson) => summaryJson.includes("derivationFacts"))).toBe(true);
    expect(inspectModelSummaries.some((summaryJson) => summaryJson.includes("reusableFields"))).toBe(true);
    expect(inspectModelSummaries.some((summaryJson) => summaryJson.includes("missingForPlan"))).toBe(true);
    expect(inspectModelSummaries.join("\n")).not.toContain("supportsOutputKinds");
    expect(inspectModelSummaries.join("\n")).not.toContain("nextActionHints");
    expect(inspectModelSummaries.join("\n")).not.toContain("canDeliverPlan");
    expect(searchModelSummaries.length).toBeGreaterThan(0);
    for (const summaryJson of searchModelSummaries) {
      expect(summaryJson).toContain("candidateGroups");
      expect(summaryJson).toContain("coverage");
      expect(summaryJson).toContain("resourceBoundary");
      expect(summaryJson).toContain("resourceReadiness");
      expect(summaryJson).toContain("catalogRole");
      expect(summaryJson).toContain("emptyResultMeaning");
      expect(summaryJson).toContain("hasDisplayableExerciseResources");
      expect(summaryJson).toContain("sectionsWithCandidates");
      expect(summaryJson).toContain("sectionsWithoutCandidates");
      expect(summaryJson).not.toContain("\"groups\"");
      expectSearchExercisePlannerSummaryTextIsClean(summaryJson);
      expect(summaryJson).not.toContain("allowedSections");
      expect(summaryJson).not.toContain("allowedSectionsRelation");
      expect(summaryJson).not.toContain("sectionSummary");
      expect(summaryJson).not.toContain("availableSections");
      expect(summaryJson).not.toContain("missingSections");
      expect(summaryJson).not.toContain("groupSemantics");
    }
    expect(searchTraceSummaries.some((summaryJson) => summaryJson.includes("candidateCountPerSection"))).toBe(true);
    expect(searchTraceSummaries.some((summaryJson) => summaryJson.includes("totalMatches"))).toBe(true);
    expect(searchTraceSummaries.some((summaryJson) => summaryJson.includes("returnedCount"))).toBe(true);
  });

  it("fails for renamed readiness fields instead of only matching historical field names", () => {
    const exactHistorical = validateAgentModelVisibleSummaryContract({
      id: "bad.exact_historical",
      kind: "tool_result_summary",
      source: "negative fixture",
      value: {
        status: "succeeded",
        deliveryReadiness: { ready: true },
      },
    });
    const renamedSameClass = validateAgentModelVisibleSummaryContract({
      id: "bad.renamed_readiness",
      kind: "tool_result_summary",
      source: "negative fixture",
      value: {
        status: "succeeded",
        canDeliverPlan: true,
      },
    });

    expect(exactHistorical.findings.map((finding) => finding.ruleId)).toContain("historical_forbidden_summary_key");
    expect(renamedSameClass.findings.map((finding) => finding.ruleId)).toContain("undeclared_summary_key");
  });

  it("recursively rejects misleading searchExerciseResources Planner summary fields", () => {
    const result = validateAgentModelVisibleSummaryContract({
      id: "searchExerciseResources.bad_nested.model_visible_summary",
      kind: "tool_result_summary",
      source: "negative fixture",
      value: {
        status: "succeeded",
        query: {
          candidateCountPerSection: 12,
        },
        candidateGroups: [{
          suitability: "training",
          returnedCount: 3,
          nested: "{\"truncated\":true,\"diagnostics\":[{\"code\":\"exercise_name_too_broad\"}]}",
        }],
        diagnostics: [{
          code: "too_broad",
          message: "候选还不够，需要继续扩大 candidateCountPerSection。",
        }],
      },
    });

    expect(result.findings.map((finding) => finding.ruleId)).toEqual(expect.arrayContaining([
      "search_exercise_planner_forbidden_summary_key",
      "search_exercise_planner_forbidden_summary_text",
    ]));
    expect(result.findings.map((finding) => finding.path)).toEqual(expect.arrayContaining([
      "query.candidateCountPerSection",
      "candidateGroups[0].returnedCount",
      "candidateGroups[0].nested.truncated",
      "candidateGroups[0].nested.diagnostics",
      "candidateGroups[0].nested.diagnostics[0].code",
      "diagnostics",
      "diagnostics[0].code",
    ]));
  });

  it("allows stable muscleMatchRole semantics in model-visible contracts", () => {
    const textFindings = lintAgentModelVisibleTextSamples([
      {
        id: "ok.muscle_match_role_tool_description",
        kind: "tool_description",
        source: "positive fixture",
        text: 'muscleMatchRole = "primary" 用于主练肌群匹配；muscleMatchRole = "any" 用于主练或辅助任意参与匹配。目标肌群推荐默认主练口径，候选池可以选择子集并在已有可用候选时停止同类查询。',
      },
    ]);
    const summaryResult = validateAgentModelVisibleSummaryContract({
      id: "searchExerciseResources.ok_muscle_match_role.model_visible_summary",
      kind: "tool_result_summary",
      source: "positive fixture",
      value: {
        status: "succeeded",
        factLevel: "candidate",
        query: {
          suitabilities: ["training"],
          muscles: ["腹肌"],
          muscleMatchRole: "primary",
        },
        coverage: {
          hasCandidates: true,
          sectionsWithCandidates: ["training"],
          sectionsWithoutCandidates: [],
          allRequestedSectionsHaveCandidates: true,
          repeatQueryBoundary: "同一 run 内等价 input 已有查询事实；重复调用不会新增事实。请基于当前可见事实推理、澄清或失败收口。",
        },
        resourceBoundary: {
          catalogRole: "Exercise 动作库提供产品可渲染动作资源，用于动作卡片、图片、动作详情、结构化训练结果和训练执行项。",
          emptyResultMeaning: "空候选或点名动作未命中只表示当前查询口径下产品动作库没有匹配的可渲染资源；不表示现实训练动作或训练知识不存在。",
          plainTextKnowledgeBoundary: "不展示产品动作卡片、图片、结构化训练结果或训练执行项时，可以基于用户输入、上下文和通用训练知识给普通文本建议，并说明这些内容不是数据库动作条目。",
          structuredOutputBoundary: "需要展示具体数据库动作条目、动作卡片、图片、visibleTrainingProposal、routine、plan 或训练执行项时，具体 exerciseId 必须来自模型可见数据库动作事实或受控业务事实。",
          missingExerciseNames: ["跪姿俯卧撑"],
        },
        resourceReadiness: {
          hasDisplayableExerciseResources: true,
          consumptionBoundary: "candidateGroups[].exercises 已提供可展示、可校验的产品动作资源；当前任务若要生成训练卡片、routine 或 plan，应从中选择足够子集并提交结构化输出，不需要继续扩充候选池。",
          productScope: "FitMate 动作库是产品可渲染资源库，不是现实世界动作全集或专业最优动作筛选器。",
        },
        candidateGroups: [{
          suitability: "training",
          exercises: [{
            exerciseId: "plank",
            nameZh: "平板支撑",
            nameEn: "Plank",
            primaryMusclesZh: ["腹肌"],
            secondaryMusclesZh: ["肩部"],
          }],
        }],
      },
    });

    expect(textFindings).toEqual([]);
    expect(summaryResult.findings).toEqual([]);
  });

  it("fails for equivalent workflow guidance and case-specific production rules", () => {
    const findings = lintAgentModelVisibleTextSamples([
      {
        id: "bad.workflow",
        kind: "tool_description",
        source: "negative fixture",
        text: "如果缺少拉伸阶段，下一步请使用动作查询工具补查后再提交结构化结果。",
      },
      {
        id: "bad.case_specific",
        kind: "system_prompt",
        source: "negative fixture",
        text: "当用户说换一批时就调用 searchExerciseResources，并把 toolName = searchExerciseResources 作为固定路由。",
      },
      {
        id: "bad.generic_routine_case_specific",
        kind: "system_prompt",
        source: "negative fixture",
        text: "当用户说增肌计划时服务端固定改写为 routine，并阻止模型调用 searchExerciseResources。",
      },
      {
        id: "bad.field_combo",
        kind: "tool_description",
        source: "negative fixture",
        text: "当 toolName = searchExerciseResources 且字段 muscleMatchRole = any 时，模型必须继续补查。",
      },
      {
        id: "bad.fixed_refetch",
        kind: "tool_result_summary",
        source: "negative fixture",
        text: "为了候选池纯净度，必须继续调用动作查询工具补查。",
      },
      {
        id: "bad.server_semantic_routing",
        kind: "schema_description",
        source: "negative fixture",
        text: "服务端根据用户自然语言和关键词自动选择 muscleMatchRole。",
      },
      {
        id: "bad.readiness_text",
        kind: "tool_result_summary",
        source: "negative fixture",
        text: "该查询表示 canDeliverPlan=true，最终交付已经准备好。",
      },
    ]);

    expect(findings.map((finding) => finding.ruleId)).toEqual(expect.arrayContaining([
      "fixed_tool_workflow_instruction",
      "case_specific_production_rule",
      "business_readiness_in_model_visible_text",
    ]));
  });
});

function readFixturesForTool(tool: LangChainToolWrapper) {
  const fixtures = modelVisibleOutputFixtures[tool.name];

  return fixtures ?? [];
}

function expectSearchExercisePlannerSummaryTextIsClean(summaryJson: string) {
  for (const forbiddenText of [
    "totalMatches",
    "returnedCount",
    "truncated",
    "excludedCount",
    "candidateCountPerSection",
    "sort",
    "maxReturned",
    "limit",
    "take",
    "offset",
    "page",
    "pageSize",
    "cursor",
    "querySpecificity",
    "filterSemantics",
    "appliedFilters",
    "filterApplicationBoundary",
    "filterApplications",
    "positiveAnchorBoundary",
    "refreshExclusionBoundary",
    "zeroMatchMuscles",
    "exercise_name_too_broad",
    "too_broad",
    "canDeliverPlan",
    "goalSatisfied",
    "businessGoalSatisfied",
    "complete",
  ]) {
    expect(summaryJson).not.toContain(forbiddenText);
  }
}

const modelVisibleOutputFixtures: Record<string, readonly { id: string; output: unknown }[]> = {
  inspectVisibleTrainingProposals: [
    {
      id: "empty_facts",
      output: {
        status: "succeeded",
        operation: "list_recent",
        facts: [],
      },
    },
    {
      id: "routine_fact",
      output: {
        status: "succeeded",
        operation: "list_recent",
        facts: [
          {
            index: 1,
            displayLabel: "最近第 1 条已展示训练方案",
            kind: "visible_training_proposal_displayed",
            status: "active",
            createdAt: "2026-06-03T14:30:00.000Z",
            proposalKind: "routine",
            visibleOutputSchemaVersion: "1",
            factSchemaVersion: 1,
            sectionSummary: { warmup: 1, training: 1, stretch: 1 },
            exerciseItems: [
              {
                exerciseId: "jumping-jack",
                section: "warmup",
                order: 1,
                prescription: createPrescription({ mode: "reps", target: 20 }),
                nameZh: "开合跳",
                nameEn: "Jumping Jack",
                equipmentZh: "自重",
                primaryMusclesZh: ["全身"],
                allowedSections: ["warmup"],
                imageUrl: null,
              },
              {
                exerciseId: "squat",
                section: "training",
                order: 1,
                prescription: createPrescription({ mode: "reps", target: 12 }),
                nameZh: "深蹲",
                nameEn: "Squat",
                equipmentZh: "自重",
                primaryMusclesZh: ["股四头肌"],
                allowedSections: ["training"],
                imageUrl: null,
              },
              {
                exerciseId: "standing-quad-stretch",
                section: "stretch",
                order: 1,
                prescription: createPrescription({ mode: "duration", target: 30 }),
                nameZh: "站姿股四头肌拉伸",
                nameEn: "Standing Quad Stretch",
                equipmentZh: "自重",
                primaryMusclesZh: ["股四头肌"],
                allowedSections: ["stretch"],
                imageUrl: null,
              },
            ],
            reusableTrainingExerciseCount: 1,
            reusableTrainingExercises: [{
              exerciseId: "squat",
              order: 1,
              section: "training",
              nameZh: "深蹲",
              nameEn: "Squat",
            }],
          },
        ],
      },
    },
    {
      id: "fact_store_failed",
      output: {
        status: "failed",
        operation: "list_recent",
        code: "fact_store_list_failed",
        message: "可见训练方案事实读取失败。",
      },
    },
  ],
  searchExerciseResources: [
    {
      id: "no_candidates",
      output: {
        status: "succeeded",
          query: {
            suitabilities: ["training"],
            muscleMatchRole: "primary",
            sort: "name_asc",
            appliedFilters: [{ field: "suitabilities", value: ["training"] }],
          filterApplications: [{
            section: "training",
            hardFilterPolicy: "training",
            appliedHardFilters: ["suitabilities"],
            unappliedInputFilters: [],
          }],
          filterSemantics: [],
          totalMatches: 0,
          returnedCount: 0,
          candidateCountPerSection: 8,
          maxReturned: 5,
          truncated: false,
          excludedCount: 0,
        },
        groups: {
          training: {
            suitability: "training",
            totalMatches: 0,
            returnedCount: 0,
            truncated: false,
            zeroMatchMuscles: [],
            exercises: [],
          },
        },
        diagnostics: [{
          suitability: "training",
          code: "no_candidates",
          message: "当前筛选条件下没有候选动作。",
        }],
      },
    },
    {
      id: "constrained_success",
      output: {
        status: "succeeded",
          query: {
            exerciseNames: ["俯卧撑"],
            muscles: ["胸部"],
            muscleMatchRole: "primary",
            executionProfile: "no_equipment",
            impactLimit: "low",
            noiseLimit: "quiet",
            suitabilities: ["training"],
            sort: "name_asc",
            appliedFilters: [
              { field: "suitabilities", value: ["training"] },
              { field: "exerciseNames", value: ["俯卧撑"] },
              { field: "executionProfile", value: "no_equipment" },
              { field: "impactLimit", value: "low" },
              { field: "noiseLimit", value: "quiet" },
              { field: "muscles", value: ["胸部"] },
            ],
            filterApplications: [{
              section: "training",
              hardFilterPolicy: "training",
              appliedHardFilters: ["suitabilities", "exerciseNames", "executionProfile", "impactLimit", "noiseLimit", "muscles"],
              unappliedInputFilters: [],
            }],
            filterSemantics: [{
              field: "executionProfile",
              requestedValue: "no_equipment",
              databaseMapping: {
                matchedValues: ["requiresExternalEquipment=false", "requiredEquipmentTags isEmpty"],
              },
              note: "executionProfile 已按动作库执行条件应用约束；该字段仅用于 trace 诊断。",
            }],
          totalMatches: 1,
          returnedCount: 1,
          candidateCountPerSection: 8,
          maxReturned: 5,
          truncated: false,
          excludedCount: 0,
        },
        groups: {
          training: {
            suitability: "training",
            totalMatches: 1,
            returnedCount: 1,
            truncated: false,
            zeroMatchMuscles: [],
            exercises: [createExerciseResource()],
          },
        },
        diagnostics: [{
          suitability: "training",
          code: "exercise_name_ambiguous",
          exerciseName: "俯卧撑",
          totalMatches: 2,
          returnedCount: 1,
          message: "动作名称“俯卧撑”匹配到多个动作候选；该诊断只表达数据库名称匹配歧义事实。",
        }],
      },
    },
  ],
  submitVisibleTrainingProposal: [
    {
      id: "accepted",
      output: {
        status: "accepted",
        visibleOutput: {
          outputType: "visibleTrainingProposal",
          schemaVersion: "1",
          payload: {
            kind: "exercise_selection",
            exerciseItems: [
              { exerciseId: "push-up", section: "training", order: 1 },
            ],
          },
          content: {
            sections: [
              {
                section: "training",
                items: [
                  { exerciseId: "push-up", order: 1 },
                ],
              },
            ],
          },
        },
        validation: {},
      },
    },
    {
      id: "validator_rejected",
      output: {
        status: "rejected",
        code: "structured_output_validation_failed",
        message: "visibleTrainingProposal 引用了数据库不存在的动作。",
      },
    },
  ],
};

function createRepresentativeRuntimeBoundarySamples(): AgentModelVisibleSummarySample[] {
  return [
    {
      id: "runtime.duplicate_input_feedback",
      kind: "repair_feedback",
      source: "LangChain runtime duplicate input feedback",
      value: {
        status: "duplicate_tool_input",
        code: "duplicate_tool_input",
        toolName: "searchExerciseResources",
        toolVersion: "default",
        message: "同一 run 内该工具已使用相同归一化 input 产生过模型可见事实；重复调用不会产生新的事实。请基于本轮已可见事实继续推理，或在确实需要新事实时调整工具输入。",
        factBoundary: "这是重复输入反馈，不表示用户业务目标已经完成，也不要求调用任何下一步业务 tool。",
      },
    },
    {
      id: "runtime.policy_rejected_feedback",
      kind: "repair_feedback",
      source: "policy boundary representative fixture",
      value: {
        status: "failed",
        code: "policy_rejected",
        message: "服务端 policy 拒绝执行该写入。",
        policyBoundary: "这是权限或确认边界，不表示业务目标已经完成，也不替代用户确认。",
      },
    },
    {
      id: "terminal_failure.trace_summary",
      kind: "trace_summary",
      source: "terminal failure finalizer trace representative fixture",
      value: {
        status: "failed",
        failureCategory: "structured_output_invalid",
        errorCode: "structured_output_validation_failed",
        reason: "finalizer_output_invalid",
        outputValidation: {
          ok: false,
          code: "finalizer_output_invalid",
        },
      },
    },
  ];
}

function createExerciseResource() {
  return {
    exerciseId: "push-up",
    nameEn: "Push-Up",
    nameZh: "俯卧撑",
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
    homeRequirement: "none",
    homeRequirementZh: "无器械",
    executionTaxonomy: {
      requiresExternalEquipment: false,
      requiredEquipmentTags: [],
      supportRequirementTags: ["none"],
      setupComplexity: "zero_setup",
      impactLevel: "low",
      noiseLevel: "quiet",
    },
    primaryMuscles: ["chest"],
    primaryMusclesZh: ["胸部"],
    secondaryMuscles: ["triceps"],
    secondaryMusclesZh: ["肱三头肌"],
    imageUrls: ["/exercise.png"],
    imageUrl: "/exercise.png",
    allowedSections: ["training"],
    goalTags: ["strength"],
    riskTags: [],
    reviewStatus: "human_reviewed",
    isPublished: true,
  };
}

function createPrescription(input: { mode: "reps" | "duration"; target: number }) {
  return {
    mode: input.mode,
    sets: 2,
    target: input.target,
    setRestSeconds: 45,
    transitionRestSeconds: 30,
  };
}

function createFacetCatalog(): ExerciseResourceFacetCatalog {
  return {
    muscles: ["胸部", "肱三头肌"],
    categories: ["力量"],
    levels: ["beginner"],
    forces: ["push"],
    mechanics: ["compound"],
    executionTaxonomy: {
      requiresExternalEquipment: [false, true],
      requiredEquipmentTags: ["dumbbell", "resistance_band"],
      supportRequirementTags: ["none", "floor_or_mat"],
      setupComplexities: ["zero_setup", "floor_or_mat"],
      impactLevels: ["low", "medium"],
      noiseLevels: ["quiet", "normal"],
    },
    goalTags: ["strength"],
    riskTags: [],
    suitabilities: ["training", "warmup", "stretch"],
  };
}
