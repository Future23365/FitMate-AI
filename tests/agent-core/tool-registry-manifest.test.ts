import { z } from "zod";
import { describe, expect, it } from "vitest";

import { defineTool } from "@/lib/server/agent-core/define-tool";
import { AgentContractError, AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { ToolRegistry } from "@/lib/server/agent-core/tool-registry";
import { createProductionToolRegistry } from "@/lib/server/agent-tools";
import type { JsonValue, ToolManifest } from "@/lib/server/agent-core/contracts";
import type { ExerciseResourceFacetCatalog } from "@/lib/server/exercises/exercise-repository";

const chineseDescriptionPattern = /[\u3400-\u9FFF\uF900-\uFAFF]/;

function createNestedReadTool(name = "nestedRead") {
  return defineTool({
    name,
    version: "0.1.0",
    description: "用于嵌套 manifest 测试的只读 fixture。",
    whenToUse: "仅在嵌套 manifest 测试需要验证 schema 序列化时使用。",
    whenNotToUse: "不要在 agent-core 测试之外使用。",
    inputSchema: z.object({
      query: z.string(),
      items: z.array(z.object({
        kind: z.enum(["primary", "secondary"]),
        score: z.number(),
      })),
      record: z.record(z.string(), z.union([z.string(), z.number()])),
    }).strict(),
    outputSchema: z.object({
      ok: z.boolean(),
      nested: z.object({
        labels: z.array(z.string()),
      }),
    }).strict(),
    policy: {
      sideEffect: "read",
      riskLevel: "low",
      confirmation: "never",
    },
    examples: [
      {
        description: "验证敏感 example key 会从 manifest 中剔除。",
        input: {
          query: "hello",
          secretToken: "should-not-leak",
        },
      },
    ],
    handler: () => ({
      ok: true,
      nested: {
        labels: ["safe"],
      },
    }),
  });
}

function collectModelVisibleDescriptions(manifests: ToolManifest[]) {
  const descriptions: string[] = [];

  for (const manifest of manifests) {
    descriptions.push(manifest.description, manifest.whenToUse, manifest.whenNotToUse);
    for (const example of manifest.examples ?? []) {
      descriptions.push(example.description);
    }
    collectSchemaDescriptions(manifest.inputJsonSchema, descriptions);
    collectSchemaDescriptions(manifest.outputJsonSchema, descriptions);
  }

  return descriptions;
}

function collectSchemaDescriptions(value: JsonValue | undefined, descriptions: string[]) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectSchemaDescriptions(item, descriptions));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === "description" && typeof child === "string") {
      descriptions.push(child);
      continue;
    }
    collectSchemaDescriptions(child as JsonValue, descriptions);
  }
}

function collectJsonObjects(value: JsonValue | undefined, objects: Array<Record<string, JsonValue>>) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonObjects(item, objects));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  objects.push(value as Record<string, JsonValue>);
  Object.values(value).forEach((child) => collectJsonObjects(child as JsonValue, objects));
}

function objectHasReadRecentOperation(value: Record<string, JsonValue>) {
  const properties = value.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    return false;
  }

  const operation = (properties as Record<string, JsonValue>).operation;
  return JSON.stringify(operation).includes("read_recent");
}

function createExerciseResourceFacetCatalog(): ExerciseResourceFacetCatalog {
  return {
    muscles: ["胸部", "肱三头肌", "股四头肌"],
    categories: ["strength", "力量"],
    levels: ["beginner", "初级", "expert", "高级"],
    forces: ["push", "推"],
    mechanics: ["compound", "复合"],
    equipment: ["body only", "自重", "dumbbell", "哑铃"],
    homeRequirements: ["none", "无器械", "small_equipment", "居家小器械"],
    goalTags: ["strength"],
    riskTags: ["shoulder_pain"],
    suitabilities: ["warmup", "training", "stretch"],
  };
}

describe("agent-core ToolRegistry and manifest", () => {
  it("registers read tools and rejects duplicate names", () => {
    const registry = new ToolRegistry();
    registry.register(createNestedReadTool());

    expect(registry.get("nestedRead")?.name).toBe("nestedRead");

    expect(() => registry.register(createNestedReadTool())).toThrow(AgentContractError);
    try {
      registry.register(createNestedReadTool());
      throw new Error("duplicate registration should fail");
    } catch (error) {
      expect(error).toMatchObject({ code: AGENT_ERROR_CODES.DUPLICATE_TOOL });
    }
  });

  it("rejects incomplete tool definitions before exposing them", () => {
    try {
      defineTool({
        ...createNestedReadTool("invalidRead"),
        name: "",
      });
      throw new Error("invalid tool should fail");
    } catch (error) {
      expect(error).toMatchObject({ code: AGENT_ERROR_CODES.INVALID_TOOL_DEFINITION });
    }

    try {
      defineTool({
        ...createNestedReadTool("missingHandler"),
        handler: undefined,
      } as never);
      throw new Error("invalid tool should fail");
    } catch (error) {
      expect(error).toMatchObject({ code: AGENT_ERROR_CODES.INVALID_TOOL_DEFINITION });
    }
  });

  it("keeps only M0 executable read tools in the planner manifest", () => {
    const registry = new ToolRegistry();
    registry.register(createNestedReadTool());
    registry.register(defineTool({
      ...createNestedReadTool("writeTool"),
      policy: {
        sideEffect: "write",
        riskLevel: "low",
        confirmation: "never",
      },
    }));

    expect(registry.listAvailable().map((tool) => tool.name)).toEqual(["nestedRead"]);
    expect(registry.serializeForPlanner().map((tool) => tool.name)).toEqual(["nestedRead"]);
  });

  it("serializes nested Zod schemas without exposing handler or sensitive example keys", () => {
    const registry = new ToolRegistry();
    registry.register(createNestedReadTool());

    const [manifest] = registry.serializeForPlanner();
    const inputSchema = manifest.inputJsonSchema as {
      properties: {
        items: { items: { properties: { kind: { enum: string[] } } } };
        record: { additionalProperties: { anyOf: unknown[] } };
      };
      required: string[];
    };
    const manifestJson = JSON.stringify(manifest);

    expect(inputSchema.required).toEqual(["query", "items", "record"]);
    expect(inputSchema.properties.items.items.properties.kind.enum).toEqual(["primary", "secondary"]);
    expect(inputSchema.properties.record.additionalProperties.anyOf).toHaveLength(2);
    expect(manifestJson).not.toContain("handler");
    expect(manifestJson).not.toContain("secretToken");
    expect(manifestJson).not.toContain("should-not-leak");
  });

  it("serializes the production registry with visible training proposal inspect/read and search schema fields", () => {
    const facetCatalog = createExerciseResourceFacetCatalog();
    const registry = createProductionToolRegistry({
      searchExerciseResourcesFacetCatalog: facetCatalog,
    });
    const manifests = registry.serializeForPlanner();
    const inspectFactManifest = manifests.find((tool) => tool.name === "inspectVisibleTrainingProposals");
    const resolveMentionManifest = manifests.find((tool) => tool.name === "resolveExerciseResourceMentions");
    const searchManifest = manifests.find((tool) => tool.name === "searchExerciseResources");
    const inspectInputSchemaObjects: Array<Record<string, JsonValue>> = [];
    const inputSchema = searchManifest?.inputJsonSchema as {
      properties: {
        q: unknown;
        suitabilities: { items: { enum: string[] }; minItems?: number; maxItems?: number; description?: string };
        level: { description?: string };
        equipment: { description?: string };
        homeRequirement: { description?: string };
        muscles: { items: unknown; maxItems?: number; description?: string };
        excludeExerciseIds: { items: unknown; maxItems?: number; description?: string };
        requiredExerciseIds: { items: unknown; maxItems?: number; description?: string };
        published: { const?: boolean; default?: boolean };
        sort: { default?: string; enum: string[] };
      };
      additionalProperties?: boolean;
    };
    const resolveInputSchema = resolveMentionManifest?.inputJsonSchema as {
      properties: {
        mentions: {
          maxItems?: number;
          items: {
            properties: {
              text: { description?: string };
              sectionHint: { enum?: string[]; description?: string };
            };
          };
        };
      };
      additionalProperties?: boolean;
    };
    const inspectManifestJson = JSON.stringify(inspectFactManifest);
    const inspectExamplesJson = JSON.stringify(inspectFactManifest?.examples ?? []);
    const searchExamplesJson = JSON.stringify(searchManifest?.examples ?? []);
    const searchManifestJson = JSON.stringify(searchManifest);
    const manifestJson = JSON.stringify(manifests);
    collectJsonObjects(inspectFactManifest?.inputJsonSchema, inspectInputSchemaObjects);
    const readRecentInputBranches = inspectInputSchemaObjects.filter(objectHasReadRecentOperation);

    expect(manifests.map((tool) => tool.name)).toEqual([
      "inspectVisibleTrainingProposals",
      "resolveExerciseResourceMentions",
      "searchExerciseResources",
    ]);
    expect(inspectFactManifest?.policyHint).toEqual({
      sideEffect: "read",
      riskLevel: "low",
      confirmation: "never",
    });
    expect(searchManifest?.policyHint).toEqual({
      sideEffect: "read",
      riskLevel: "low",
      confirmation: "never",
    });
    expect(resolveMentionManifest?.policyHint).toEqual({
      sideEffect: "read",
      riskLevel: "low",
      confirmation: "never",
    });
    expect(inspectManifestJson).toContain("operation");
    expect(inspectManifestJson).toContain("list_recent");
    expect(inspectManifestJson).toContain("read_recent");
    expect(inspectManifestJson).toContain("factRef");
    expect(inspectManifestJson).toContain("messageId");
    expect(inspectManifestJson).toContain("visible_training_proposal_fact_index");
    expect(inspectManifestJson).toContain("visible_training_proposal_fact");
    expect(inspectManifestJson).toContain("visibleOutputSchemaVersion");
    expect(inspectManifestJson).toContain("factSchemaVersion");
    expect(inspectManifestJson).toContain("schemaVersion 必须写字符串 \\\"1\\\"");
    expect(inspectManifestJson).toContain("不要重复读取同一引用");
    expect(inspectManifestJson).toContain("上一套 exerciseItems、section 摘要和计划结构");
    expect(inspectManifestJson).toContain("自主规划差异化刷新、保留、排除、结构调整或失败收口");
    expect(inspectManifestJson).toContain("保留、排除、替换、查询新动作、调整结构、澄清或失败收口");
    expect(inspectManifestJson).toContain("本 tool 不要求固定 tool 调用次数或顺序");
    expect(inspectManifestJson).not.toContain("readRecentVisibleTrainingProposal");
    expect(inspectManifestJson).not.toContain("fact_recent_visible_training_01");
    expect(inspectManifestJson).not.toContain("从上一条 list_recent result 中复制真实 factRef");
    expect(inspectManifestJson).not.toContain("占位值");
    expect(inspectManifestJson).not.toContain("换一个");
    expect(inspectManifestJson).not.toContain("换一批");
    expect(inspectManifestJson).not.toContain("再推荐一批");
    expect(inspectExamplesJson).not.toContain("\"operation\":\"read_recent\"");
    expect(inspectExamplesJson).toContain("\"operation\":\"list_recent\"");
    expect(readRecentInputBranches.some((branch) => Array.isArray(branch.required) && branch.required.includes("factRef"))).toBe(true);
    expect(readRecentInputBranches.some((branch) => Array.isArray(branch.required) && branch.required.includes("messageId"))).toBe(true);
    expect(manifestJson).toContain("inspectVisibleTrainingProposals(operation = \\\"list_recent\\\")");
    expect(manifestJson).toContain("inspectVisibleTrainingProposals(operation = \\\"read_recent\\\")");
    expect(inputSchema.properties).toHaveProperty("q");
    expect(inputSchema.properties).not.toHaveProperty("maxReturned");
    expect(inputSchema.properties).not.toHaveProperty("purpose");
    expect(inputSchema.properties).not.toHaveProperty("queryIntent");
    expect(inputSchema.properties).not.toHaveProperty("candidateUse");
    expect(inputSchema.properties).not.toHaveProperty("resultRequirements");
    expect(inputSchema.properties).not.toHaveProperty("rankingHints");
    expect(inputSchema.properties).not.toHaveProperty("limit");
    expect(inputSchema.properties).not.toHaveProperty("offset");
    expect(inputSchema.properties).not.toHaveProperty("page");
    expect(inputSchema.properties).not.toHaveProperty("pageSize");
    expect(searchExamplesJson).not.toContain("maxReturned");
    expect(searchExamplesJson).not.toContain("purpose");
    expect(searchExamplesJson).not.toContain("queryIntent");
    expect(searchExamplesJson).not.toContain("candidateUse");
    expect(searchExamplesJson).not.toContain("resultRequirements");
    expect(searchExamplesJson).not.toContain("rankingHints");
    expect(searchExamplesJson).not.toContain("limit");
    expect(searchExamplesJson).not.toContain("offset");
    expect(searchExamplesJson).not.toContain("pageSize");
    expect(inputSchema.properties).not.toHaveProperty("suitability");
    expect(inputSchema.properties).not.toHaveProperty("bodyRegions");
    expect(inputSchema.properties.suitabilities.items.enum).toEqual(["warmup", "training", "stretch"]);
    expect(inputSchema.properties.suitabilities.maxItems).toBe(3);
    expect(inputSchema.properties.suitabilities.description).toContain("目标需要 routine 或 plan");
    expect(inputSchema.properties.suitabilities.description).toContain("[\"warmup\", \"stretch\"]");
    expect(inputSchema.properties.level.description).toContain("metadata.facetCatalog");
    expect(inputSchema.properties.equipment.description).toContain("metadata.facetCatalog");
    expect(inputSchema.properties.homeRequirement.description).toContain("metadata.facetCatalog");
    expect(inputSchema.properties.muscles.maxItems).toBe(20);
    expect(inputSchema.properties.muscles.description).toContain("多个主肌群");
    expect(searchManifest?.metadata).toEqual({
      facetCatalog,
    });
    expect(searchManifest?.metadata?.facetCatalog).toMatchObject({
      muscles: expect.arrayContaining(["胸部", "股四头肌"]),
      equipment: expect.arrayContaining(["body only", "哑铃"]),
      homeRequirements: expect.arrayContaining(["none", "居家小器械"]),
      suitabilities: ["warmup", "training", "stretch"],
    });
    expect(inputSchema.properties.excludeExerciseIds.maxItems).toBe(50);
    expect(inputSchema.properties.excludeExerciseIds.description).toContain("用户已经看到");
    expect(inputSchema.properties.requiredExerciseIds.maxItems).toBe(12);
    expect(inputSchema.properties.requiredExerciseIds.description).toContain("resolveExerciseResourceMentions");
    expect(resolveInputSchema.properties.mentions.maxItems).toBe(12);
    expect(resolveInputSchema.properties.mentions.items.properties.text.description).toContain("结构化提取");
    expect(resolveInputSchema.properties.mentions.items.properties.sectionHint.enum).toEqual(["warmup", "training", "stretch"]);
    expect(resolveInputSchema.additionalProperties).toBe(false);
    expect(inputSchema.properties.sort.enum).toEqual([
      "name_asc",
      "name_desc",
      "level_asc",
      "level_desc",
      "category_asc",
      "category_desc",
    ]);
    expect(inputSchema.properties.sort.default).toBe("name_asc");
    expect(inputSchema.additionalProperties).toBe(false);
    expect(manifestJson).toContain("usedToolResultIds");
    expect(manifestJson).toContain("visibleOutputs");
    expect(manifestJson).toContain("visibleTrainingProposal");
    expect(manifestJson).toContain("exerciseId");
    expect(searchManifestJson).toContain("发布态动作事实原料");
    expect(searchManifestJson).toContain("不生成最终 visibleTrainingProposal");
    expect(searchManifestJson).toContain("groups.<section>.exercises[*].exerciseId");
    expect(searchManifestJson).toContain("fulfillment.satisfied = true");
    expect(searchManifestJson).toContain("visibleTrainingProposal.exerciseItems[*].exerciseId");
    expect(searchManifestJson).toContain("最终训练输出只能由 final_answer.visibleOutputs[] 承载");
    expect(searchManifestJson).toContain("替换上一套用户可见 visibleTrainingProposal 的动作");
    expect(searchManifestJson).toContain("保留原目标、器械、难度、居家条件、section、时长或计划约束");
    expect(searchManifestJson).toContain("用 excludeExerciseIds 查询替代动作");
    expect(searchManifestJson).toContain("不同 section 的替代动作仍必须来自对应 groups.<section>.exercises");
    expect(searchManifestJson).toContain("当前 run 可见事实获得上一套已看到 exerciseItems");
    expect(searchManifestJson).toContain("当前 run 可见的用户已经看到动作事实");
    expect(searchManifestJson).toContain("未展示的内部候选、trace 摘要、handler-only 结果或 list_recent 索引");
    expect(searchManifestJson).toContain("模型根据用户目标已经需要 routine 或 plan");
    expect(searchManifestJson).toContain("当前 run 只有 training 动作事实或缺少 warmup / stretch 动作事实");
    expect(searchManifestJson).toContain("suitabilities = [\\\"warmup\\\", \\\"stretch\\\"]");
    expect(searchManifestJson).toContain("不得因为当前只查到 training 动作事实就把 routine 或 plan 目标降级输出为 payload.kind = \\\"exercise_selection\\\"");
    expect(searchManifestJson).toContain("普通动作推荐和动作事实问答不要求固定查询 warmup / training / stretch");
    expect(searchManifestJson).toContain("本 tool 不要求固定 tool 调用次数或顺序");
    expect(searchManifestJson).toContain("不要因为当前只查到 training 动作事实");
    expect(searchManifestJson).toContain("failed、invalid-input 或 satisfied=false 的结果不能支撑成功 final_answer");
    expect(manifestJson).toContain("groups.<section>.exercises[*].exerciseId 是该查询结果中对应 section 的动作事实来源");
    expect(manifestJson).toContain("visibleTrainingProposal.exerciseItems[*].section");
    expect(manifestJson).toContain("allowedSections 是动作可进入哪些 section 的动作事实字段");
    expect(manifestJson).toContain("exerciseItems[*].section 应对应使用的 groups.<section> key");
    expect(manifestJson).not.toContain("必须调用 searchExerciseResources");
    expect(manifestJson).not.toContain("必须调用 inspectVisibleTrainingProposals");
    expect(searchExamplesJson).not.toContain("用户说");
    expect(searchExamplesJson).not.toContain("固定短语");
    expect(searchExamplesJson).not.toContain("先用 resolveExerciseResourceMentions");
    expect(searchExamplesJson).not.toContain("上一轮结果中真实 matched exerciseId");
    expect(manifestJson).toContain("totalMatches=0");
    expect(manifestJson).toContain("0 条事实查询结果");
    expect(manifestJson).toContain("published");
    expect(manifestJson).toContain("excludeExerciseIds");
    expect(manifestJson).toContain("requiredExerciseIds");
    expect(manifestJson).toContain("mentions");
    expect(manifestJson).toContain("俯卧撑");
    expect(manifestJson).toContain("深蹲");
    expect(manifestJson).toContain("平板支撑");
    expect(searchExamplesJson).toContain("当前 run 已有受控 exerciseId");
    expect(searchExamplesJson).toContain("routine 或 plan 目标已有 training 动作事实");
    expect(searchExamplesJson).not.toContain("示例 id 不可脱离上一步结果照抄");
    expect(manifestJson).not.toContain("bodyRegions");
    expect(manifestJson).not.toContain("lower_body");
    expect(manifestJson).not.toContain("upper_body");
    expect(manifestJson).not.toContain("full_body");
    expect(manifestJson).toContain("真实肌群 facet");
    expect(manifestJson).toContain("metadata.facetCatalog");
    expect(manifestJson).toContain("股四头肌");
    expect(manifestJson).toContain("居家小器械");
    expect(manifestJson).not.toContain("home_friendly");
    expect(manifestJson).not.toContain("no_equipment");
    expect(manifestJson).not.toContain("cbf_previous_response");
    expect(manifestJson).not.toContain("readFixture");
    expect(manifestJson).not.toContain("m1ResourceProducer");
    expect(manifestJson).not.toContain("candidateSetId");
    expect(manifestJson).not.toContain("candidate_set");
    expect(manifestJson).not.toContain("displayedExerciseIds");
    expect(manifestJson).not.toContain("displayedExercises");
    expect(manifestJson).not.toContain("recentExerciseRecommendationFacts");
    expect(manifestJson).not.toContain("readRecentExerciseRecommendationFact");
    expect(manifestJson).not.toContain("readRecentVisibleTrainingProposal");
    expect(manifestJson).not.toContain("exercise_recommendation_fact");
    expect(manifestJson).not.toContain("generatePlanDraft");
    expect(manifestJson).not.toContain("generateRoutineDraft");
    expect(manifestJson).not.toContain("\"handler\"");
    expect(manifestJson).not.toContain("Query published exercise resources");
    expect(manifestJson).not.toContain("Use when the user asks");
    expect(collectModelVisibleDescriptions(manifests).every((text) => chineseDescriptionPattern.test(text))).toBe(true);
  });
});
