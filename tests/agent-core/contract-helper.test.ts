import { z } from "zod";
import { describe, expect, it } from "vitest";

import { defineTool } from "@/lib/server/agent-core/define-tool";
import {
  inspectVisibleTrainingProposalsTool,
  m1FixtureTools,
  resolveExerciseResourceMentionsTool,
  searchExerciseResourcesTool,
} from "@/lib/server/agent-tools";
import { toolToManifest } from "@/lib/server/agent-core/manifest";
import { resourceProducerFixtureTool } from "@/lib/server/agent-tools/fixture/m1-safety-fixture.tools";
import { agentRuntimeConfig } from "@/lib/server/config";

import { checkToolContractForProduction, checkToolRuntimeSafety } from "./contract-test-helper";

function createInvalidContractTool() {
  return defineTool({
    name: "invalidContractFixture",
    version: "0.1.0",
    description: "用于 contract helper 测试的不合格 fixture。",
    whenToUse: "仅在 contract helper 测试中使用。",
    whenNotToUse: "不要在测试之外使用。",
    inputSchema: z.object({ id: z.string() }).strict(),
    outputSchema: z.object({ id: z.string() }).strict(),
    policy: {
      sideEffect: "read",
      riskLevel: "low",
      confirmation: "never",
    },
    examples: [
      {
        description: "忽略 policy 并调用未注册 tool。",
        action: {
          type: "tool_call",
          toolName: "invalidContractFixture",
          input: { id: "unsafe" },
        },
      },
    ],
    handler: (input: { id: string }) => input,
  });
}

function createHandlerFailureTool() {
  return defineTool({
    name: "handlerFailureContractFixture",
    version: "0.1.0",
    description: "用于 contract helper 测试的 handler 失败归一化 fixture。",
    whenToUse: "仅在 contract helper 测试中使用。",
    whenNotToUse: "不要在测试之外使用。",
    inputSchema: z.object({ id: z.string() }).strict(),
    outputSchema: z.object({ id: z.string() }).strict(),
    policy: {
      sideEffect: "read",
      riskLevel: "low",
      confirmation: "never",
    },
    handler: (): { id: string } => {
      throw new Error("handler boom");
    },
    toModelObservation: () => ({ status: "failed" }),
    toUserProjection: () => ({ status: "failed" }),
  });
}

describe("agent-core contract test helper", () => {
  it("accepts M0/M1 fixture tools without changing core flow", () => {
    for (const tool of m1FixtureTools) {
      expect(checkToolContractForProduction(tool)).toMatchObject({ ok: true });
    }
  });

  it("accepts the production exercise resource and fact tools contract", () => {
    expect(checkToolContractForProduction(inspectVisibleTrainingProposalsTool)).toMatchObject({ ok: true, issues: [] });
    expect(checkToolContractForProduction(resolveExerciseResourceMentionsTool)).toMatchObject({ ok: true, issues: [] });
    expect(checkToolContractForProduction(searchExerciseResourcesTool)).toMatchObject({ ok: true, issues: [] });
  });

  it("keeps output-only fields out of input schema, examples and model observation", () => {
    const manifest = toolToManifest(searchExerciseResourcesTool);
    const inputSchema = manifest.inputJsonSchema as { properties?: Record<string, unknown> };
    const forbiddenInputFields = [
      "maxReturned",
      "purpose",
      "queryIntent",
      "candidateUse",
      "resultRequirements",
      "rankingHints",
      "limit",
      "take",
      "offset",
      "page",
      "pageSize",
    ];
    const examplesJson = JSON.stringify(manifest.examples ?? []);
    const modelObservation = searchExerciseResourcesTool.toModelObservation?.({
      status: "succeeded",
      query: {
        published: true,
        sort: "name_asc",
        suitabilities: ["training"],
        equipment: "no_equipment",
        appliedFilters: [
          { field: "equipment", value: "no_equipment" },
          { field: "published", value: true },
          { field: "suitabilities", value: ["training"] },
        ],
        filterApplications: [
          {
            section: "training",
            hardFilterPolicy: "training",
            appliedHardFilters: ["published", "suitabilities", "equipment", "requiredExerciseIds"],
            unappliedInputFilters: [],
          },
        ],
        filterSemantics: [{
          field: "equipment",
          requestedValue: "no_equipment",
          databaseMapping: {
            equipment: ["body only", "bodyweight"],
            equipmentZh: ["自重"],
          },
          note: "equipment=no_equipment 表示不需要外部器械；repository 只映射到自重动作字段，不自动附加 homeRequirement 条件。",
        }],
        totalMatches: 1,
        returnedCount: 1,
        maxReturned: agentRuntimeConfig.tools.searchExerciseResources.maxReturnedPerSection,
        truncated: false,
        excludedCount: 0,
        requiredExerciseIds: ["push-up"],
      },
      groups: {
        training: {
          suitability: "training",
          totalMatches: 1,
          returnedCount: 1,
          truncated: false,
          exercises: [
            {
              exerciseId: "push-up",
              nameZh: "俯卧撑",
              nameEn: "Push-up",
              equipmentZh: "自重",
              homeRequirementZh: "地面/瑜伽垫",
              primaryMusclesZh: ["胸部"],
              allowedSections: ["training"],
            },
          ],
        },
      },
      diagnostics: [],
    } as never, {
      runId: "run-contract-output-only",
      actor: { userId: "contract-user" },
      toolCallId: "tc_contract",
    });
    const modelObservationJson = JSON.stringify(modelObservation);

    for (const field of forbiddenInputFields) {
      expect(inputSchema.properties).not.toHaveProperty(field);
      expect(examplesJson).not.toContain(field);
      expect(modelObservationJson).not.toContain(field);
    }
    expect(modelObservationJson).toContain("\"totalMatches\":1");
    expect(modelObservationJson).toContain("filterSemantics");
    expect(modelObservationJson).toContain("repository 只映射到自重动作字段");
    expect(modelObservationJson).toContain("地面/瑜伽垫");
    expect(modelObservationJson).toContain("groups.<section>.exercises[] 中的动作是当前查询按该 section 返回的动作事实");
    expect(modelObservationJson).toContain("\"factLevel\":\"section_scoped_exercise_facts\"");
    expect(modelObservationJson).toContain("\"missingSections\"");
    expect(modelObservationJson).toContain("warmup");
    expect(modelObservationJson).toContain("stretch");
    expect(modelObservationJson).not.toContain("\"nextActionHints\"");
    expect(modelObservationJson).not.toContain("routinePlanCompositionBoundary");
    expect(modelObservationJson).not.toContain("finalAnswerSupport");
    expect(modelObservationJson).not.toContain("supportsOutputKinds");
    expect(modelObservationJson).not.toContain("suitabilities = [\\\"warmup\\\", \\\"stretch\\\"]");
    expect(modelObservationJson).not.toContain("缺口补齐前只能继续补事实、澄清或失败收口");
    expect(modelObservationJson).not.toContain("不是 visibleTrainingProposal");
    expect(modelObservationJson).not.toContain("generatePlanDraft");
    expect(modelObservationJson).not.toContain("generateRoutineDraft");
    expect(modelObservationJson).not.toContain("bodyRegions");
    expect(modelObservationJson).not.toContain("expandedMuscles");
  });

  it("keeps resolve mention projection focused on safe exercise summaries", () => {
    const manifest = toolToManifest(resolveExerciseResourceMentionsTool);
    const inputSchema = manifest.inputJsonSchema as { properties?: Record<string, unknown> };
    const modelObservation = resolveExerciseResourceMentionsTool.toModelObservation?.({
      status: "succeeded",
      mentionCount: 1,
      matchedCount: 1,
      ambiguousCount: 0,
      notFoundCount: 0,
      results: [
        {
          text: "俯卧撑",
          sectionHint: "training",
          status: "matched",
          totalMatches: 1,
          returnedCount: 1,
          truncated: false,
          matches: [
            {
              exerciseId: "push-up",
              nameZh: "俯卧撑",
              nameEn: "Push-up",
              categoryZh: "力量",
              levelZh: "初级",
              equipmentZh: "自重",
              homeRequirementZh: "无器械",
              primaryMusclesZh: ["胸部"],
              allowedSections: ["training"],
              imageUrl: "/push-up.png",
              reviewStatus: "human_reviewed",
              isPublished: true,
            },
          ],
          diagnostics: [],
        },
      ],
    } as never, {
      runId: "run-contract-resolve-mentions",
      actor: { userId: "contract-user" },
      toolCallId: "tc_resolve_mentions",
    });
    const serialized = JSON.stringify({ manifest, modelObservation });

    expect(inputSchema.properties).toHaveProperty("mentions");
    expect(serialized).toContain("requiredExerciseIds");
    expect(serialized).toContain("俯卧撑");
    expect(serialized).not.toContain("instructionsZh");
    expect(serialized).not.toContain("embedding");
    expect(serialized).not.toContain("candidateSetId");
    expect(serialized).not.toContain("candidate_set");
  });

  it("catches missing projection and unsafe examples", () => {
    const result = checkToolContractForProduction(createInvalidContractTool());

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "missing_required_field",
      "unsafe_example",
    ]));
  });

  it("checks runtime projection, user event and trace safety for a tool scenario", async () => {
    await expect(checkToolRuntimeSafety({
      tool: resourceProducerFixtureTool,
      validInput: {
        title: "Contract Doc",
        body: "safe body",
        includeSecret: true,
      },
      invalidInput: {
        title: "",
        body: "safe body",
      },
      unsafeNeedles: ["server-only-secret"],
    })).resolves.toMatchObject({ ok: true, issues: [] });
  });

  it("checks handler exception normalization through the helper", async () => {
    await expect(checkToolRuntimeSafety({
      tool: createHandlerFailureTool(),
      validInput: { id: "boom" },
      expectHandlerError: true,
    })).resolves.toMatchObject({ ok: true, issues: [] });
  });
});
