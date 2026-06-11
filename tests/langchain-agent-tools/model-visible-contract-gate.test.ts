import { describe, expect, it } from "vitest";

import {
  collectLangChainToolWrapperModelVisibleSamples,
  createProductionAgentModelVisibleTextSamples,
  createProductionLangChainToolCatalog,
  executeLangChainToolWrapper,
  lintAgentModelVisibleTextSamples,
  validateAgentModelVisibleSummaryContract,
  type AgentModelVisibleSummarySample,
  type LangChainJsonValue,
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

    expect(findings).toEqual([]);
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

const modelVisibleOutputFixtures: Record<string, readonly { id: string; output: unknown }[]> = {
  reportAgentActivity: [
    {
      id: "recorded",
      output: {
        status: "recorded",
        summary: "正在整理动作候选。",
        stepType: "planning",
      },
    },
    {
      id: "skipped",
      output: {
        status: "skipped",
      },
    },
  ],
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
      id: "fact_store_failed",
      output: {
        status: "failed",
        operation: "list_recent",
        code: "fact_store_list_failed",
        message: "可见训练方案事实读取失败。",
      },
    },
  ],
  resolveExerciseResourceMentions: [
    {
      id: "mixed_resolution",
      output: {
        status: "succeeded",
        mentionCount: 3,
        matchedCount: 1,
        ambiguousCount: 1,
        notFoundCount: 1,
        results: [
          createMentionResult({
            text: "俯卧撑",
            status: "matched",
            matches: [createExerciseMention({ exerciseId: "push-up", nameZh: "俯卧撑" })],
          }),
          createMentionResult({
            text: "划船",
            status: "ambiguous",
            totalMatches: 2,
            matches: [
              createExerciseMention({ exerciseId: "dumbbell-row", nameZh: "哑铃划船" }),
              createExerciseMention({ exerciseId: "cable-row", nameZh: "绳索划船" }),
            ],
            diagnostics: [{
              code: "mention_ambiguous",
              message: "点名动作匹配到多个发布态动作；该结果只表达候选歧义事实。",
              text: "划船",
              sectionHint: "training",
            }],
          }),
          createMentionResult({
            text: "火星跳跃",
            status: "not_found",
            totalMatches: 0,
            matches: [],
            diagnostics: [{
              code: "mention_not_found",
              message: "点名动作没有解析到发布态数据库动作；该结果不能作为动作事实来源。",
              text: "火星跳跃",
              sectionHint: "training",
            }],
          }),
        ],
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
          equipment: "no_equipment",
          muscles: ["胸部"],
          suitabilities: ["training"],
          sort: "name_asc",
          appliedFilters: [
            { field: "suitabilities", value: ["training"] },
            { field: "equipment", value: "no_equipment" },
            { field: "muscles", value: ["胸部"] },
          ],
          filterApplications: [{
            section: "training",
            hardFilterPolicy: "training",
            appliedHardFilters: ["suitabilities", "equipment", "muscles"],
            unappliedInputFilters: [],
          }],
          filterSemantics: [{
            field: "equipment",
            requestedValue: "no_equipment",
            databaseMapping: {
              equipment: ["body only"],
              equipmentZh: ["自重"],
            },
            note: "no_equipment 映射到自重动作。",
          }],
          totalMatches: 1,
          returnedCount: 1,
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
            exercises: [createExerciseResource()],
          },
        },
        diagnostics: [],
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

function createMentionResult(input: {
  text: string;
  status: "matched" | "ambiguous" | "not_found";
  totalMatches?: number;
  matches: ReturnType<typeof createExerciseMention>[];
  diagnostics?: LangChainJsonValue[];
}) {
  return {
    text: input.text,
    sectionHint: "training",
    status: input.status,
    totalMatches: input.totalMatches ?? input.matches.length,
    returnedCount: input.matches.length,
    truncated: false,
    matches: input.matches,
    diagnostics: input.diagnostics ?? [],
  };
}

function createExerciseMention(input: { exerciseId: string; nameZh: string }) {
  return {
    exerciseId: input.exerciseId,
    nameEn: input.exerciseId,
    nameZh: input.nameZh,
    categoryZh: "力量",
    levelZh: "初级",
    equipmentZh: "自重",
    homeRequirementZh: "无器械",
    primaryMusclesZh: ["胸部"],
    allowedSections: ["training"],
    imageUrl: "/exercise.png",
    reviewStatus: "human_reviewed",
    isPublished: true,
  };
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

function createFacetCatalog(): ExerciseResourceFacetCatalog {
  return {
    muscles: ["胸部", "肱三头肌"],
    categories: ["力量"],
    levels: ["beginner"],
    forces: ["push"],
    mechanics: ["compound"],
    equipment: ["自重"],
    homeRequirements: ["none", "地面"],
    goalTags: ["strength"],
    riskTags: [],
    suitabilities: ["training", "warmup", "stretch"],
  };
}
