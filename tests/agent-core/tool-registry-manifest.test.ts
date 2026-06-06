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
        action: {
          type: "tool_call",
          toolName: name,
          input: {
            query: "hello",
            items: [{ kind: "primary", score: 1 }],
            record: {
              publicValue: "ok",
              secretToken: "should-not-leak",
            },
          },
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
  return JSON.stringify(operation ?? "").includes("read_recent");
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
    const searchFacetCatalog = searchManifest?.metadata?.facetCatalog as ExerciseResourceFacetCatalog | undefined;
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
    for (const manifest of manifests) {
      for (const example of manifest.examples ?? []) {
        expect(example.action).toMatchObject({
          type: "tool_call",
          toolName: manifest.name,
        });
        expect(example.action).toHaveProperty("input");
        expect(example).not.toHaveProperty("input");
      }
    }
    expect(inspectManifestJson).toContain("operation");
    expect(inspectManifestJson).toContain("list_recent");
    expect(inspectManifestJson).toContain("read_recent");
    expect(inspectManifestJson).toContain("factRef");
    expect(inspectManifestJson).toContain("messageId");
    expect(inspectManifestJson).toContain("visible_training_proposal_fact_index");
    expect(inspectManifestJson).toContain("visible_training_proposal_fact");
    expect(inspectManifestJson).toContain("visibleOutputSchemaVersion");
    expect(inspectManifestJson).toContain("factSchemaVersion");
    expect(inspectManifestJson).toContain("consumable visible_training_proposal_fact");
    expect(inspectManifestJson).toContain("没有本轮 list_recent 索引时应先调用 operation = \\\"list_recent\\\"");
    expect(inspectManifestJson).toContain("final_answer.usedRefs.resource.id 必须来自当前 run producedResources");
    expect(inspectManifestJson).not.toContain("readRecentVisibleTrainingProposal");
    expect(inspectManifestJson).not.toContain("fact_recent_visible_training_01");
    expect(inspectManifestJson).not.toContain("从上一条 list_recent result 中复制真实 factRef");
    expect(inspectManifestJson).not.toContain("占位值");
    expect(inspectManifestJson).not.toContain("换一个");
    expect(inspectManifestJson).not.toContain("换一批");
    expect(inspectManifestJson).not.toContain("再推荐一批");
    expect(inspectManifestJson).not.toContain("再来一组");
    expect(inspectManifestJson).not.toContain("不要这个");
    expect(inspectManifestJson).not.toContain("factCount = 0");
    expect(inspectExamplesJson).toContain("\"type\":\"tool_call\"");
    expect(inspectExamplesJson).toContain("\"toolName\":\"inspectVisibleTrainingProposals\"");
    expect(inspectExamplesJson).toContain("\"operation\":\"read_recent\"");
    expect(inspectExamplesJson).toContain("\"ref\"");
    expect(inspectExamplesJson).not.toContain("\"fact-1\"");
    expect(inspectExamplesJson).toContain("\"operation\":\"list_recent\"");
    expect(readRecentInputBranches.some((branch) => Array.isArray(branch.required) && branch.required.includes("ref"))).toBe(true);
    expect(readRecentInputBranches.some((branch) => Array.isArray(branch.required) && branch.required.includes("factRef"))).toBe(false);
    expect(readRecentInputBranches.some((branch) => Array.isArray(branch.required) && branch.required.includes("messageId"))).toBe(false);
    expect(manifestJson).toContain("operation = \\\"list_recent\\\"");
    expect(manifestJson).toContain("operation = \\\"read_recent\\\"");
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
    expect(inputSchema.properties).not.toHaveProperty("muscle");
    expect(inputSchema.properties.suitabilities.items.enum).toEqual(["warmup", "training", "stretch"]);
    expect(inputSchema.properties.suitabilities.maxItems).toBe(3);
    expect(inputSchema.properties.suitabilities.description).toContain("目标需要 routine 或 plan");
    expect(inputSchema.properties.suitabilities.description).toContain("[\"warmup\", \"stretch\"]");
    expect(inputSchema.properties.level.description).toContain("metadata.facetCatalog");
    expect(inputSchema.properties.equipment.description).toContain("metadata.facetCatalog");
    expect(inputSchema.properties.equipment.description).toContain("no_equipment");
    expect(inputSchema.properties.equipment.description).not.toContain("无器械");
    expect(inputSchema.properties.homeRequirement.description).toContain("metadata.facetCatalog");
    expect(inputSchema.properties.homeRequirement.description).toContain("环境、场地或支撑条件");
    expect(inputSchema.properties.homeRequirement.description).not.toContain("none");
    expect(inputSchema.properties.homeRequirement.description).not.toContain("无器械");
    expect(inputSchema.properties.muscles.maxItems).toBe(20);
    expect(inputSchema.properties.muscles.description).toContain("一个或多个主肌群");
    expect(searchFacetCatalog).toMatchObject({
      muscles: expect.arrayContaining(["胸部", "股四头肌"]),
      equipment: expect.arrayContaining(["body only", "哑铃", "no_equipment"]),
      homeRequirements: expect.arrayContaining(["居家小器械"]),
      suitabilities: ["warmup", "training", "stretch"],
    });
    expect(searchFacetCatalog?.equipment).not.toContain("无器械");
    expect(searchFacetCatalog?.homeRequirements).not.toContain("none");
    expect(searchFacetCatalog?.homeRequirements).not.toContain("无器械");
    expect(inputSchema.properties.excludeExerciseIds.maxItems).toBe(50);
    expect(inputSchema.properties.excludeExerciseIds.description).toContain("用户已经看到");
    expect(inputSchema.properties.excludeExerciseIds.description).toContain("负向动作 id 列表");
    expect(inputSchema.properties.excludeExerciseIds.description).toContain("不用于保留、复用、派生或调整已有动作");
    expect(inputSchema.properties.requiredExerciseIds.maxItems).toBe(12);
    expect(inputSchema.properties.requiredExerciseIds.description).toContain("resolveExerciseResourceMentions");
    expect(inputSchema.properties.requiredExerciseIds.description).toContain("正向查询锚点");
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
    expect(manifestJson).toContain("usedRefs");
    expect(manifestJson).not.toContain("usedToolResultIds");
    expect(manifestJson).not.toContain("usedResourceRefs");
    expect(manifestJson).toContain("visibleOutputs");
    expect(manifestJson).toContain("visibleTrainingProposal");
    expect(manifestJson).toContain("exerciseId");
    expect(searchManifestJson).toContain("发布态动作事实");
    expect(searchManifestJson).toContain("groups.<section>.exercises[]");
    expect(searchManifestJson).not.toContain("不生成 visibleTrainingProposal");
    expect(searchManifestJson).toContain("groups.<section>.exercises[] 是 section-scoped 动作事实来源");
    expect(searchManifestJson).toContain("visibleTrainingProposal.exerciseItems[]");
    expect(searchManifestJson).toContain("exerciseItems[*].section");
    expect(searchManifestJson).toContain("当前 run 可见的用户已经看到动作事实");
    expect(searchManifestJson).toContain("requiredExerciseIds 是正向锚点");
    expect(searchManifestJson).toContain("excludeExerciseIds 是负向排除");
    expect(searchManifestJson).toContain("不要把同一批动作同时放入 requiredExerciseIds 和 excludeExerciseIds");
    expect(searchManifestJson).toContain("用户需要动作候选、routine 或 plan");
    expect(searchManifestJson).toContain("缺少 warmup / stretch");
    expect(searchManifestJson).not.toContain("不要求固定调用次数或顺序");
    expect(searchManifestJson).toContain("过宽查询不能支撑 visibleOutputs");
    expect(searchManifestJson).not.toContain("不得用成功 final_answer.content 承诺本轮回复后还会自动继续查询或生成");
    expect(manifestJson).toContain("groups.<section>.exercises[] 是 section-scoped 动作事实来源");
    expect(manifestJson).toContain("visibleTrainingProposal.exerciseItems[*].section");
    expect(manifestJson).toContain("动作可进入哪些 visibleTrainingProposal.exerciseItems[*].section");
    expect(manifestJson).toContain("section 必须等于 groups key");
    expect(manifestJson).toContain("section 应与所在 group key");
    expect(manifestJson).not.toContain("必须调用 searchExerciseResources");
    expect(manifestJson).not.toContain("必须调用 inspectVisibleTrainingProposals");
    expect(searchExamplesJson).not.toContain("用户说");
    expect(searchExamplesJson).not.toContain("固定短语");
    expect(searchExamplesJson).not.toContain("先用 resolveExerciseResourceMentions");
    expect(searchExamplesJson).not.toContain("上一轮结果中真实 matched exerciseId");
    expect(manifestJson).toContain("totalMatches=0");
    expect(manifestJson).toContain("published");
    expect(manifestJson).toContain("excludeExerciseIds");
    expect(manifestJson).toContain("requiredExerciseIds");
    expect(manifestJson).toContain("mentions");
    expect(manifestJson).toContain("俯卧撑");
    expect(manifestJson).toContain("深蹲");
    expect(manifestJson).toContain("平板支撑");
    expect(searchExamplesJson).toContain("当前 run 已有受控 exerciseId");
    expect(searchExamplesJson).toContain("缺少 support section");
    expect(searchExamplesJson).toContain("当前约束查询 warmup 和 stretch 动作事实");
    expect(searchExamplesJson).toContain("\"type\":\"tool_call\"");
    expect(searchExamplesJson).toContain("\"toolName\":\"searchExerciseResources\"");
    expect(searchExamplesJson).toContain("\"equipment\":\"no_equipment\"");
    expect(searchExamplesJson).not.toContain("\"equipment\":\"无器械\"");
    expect(searchExamplesJson).toContain("\"level\":\"beginner\"");
    expect(searchExamplesJson).toContain("\"suitabilities\":[\"warmup\",\"stretch\"]");
    expect(searchExamplesJson).not.toContain("\"homeRequirement\":\"none\"");
    expect(searchExamplesJson).not.toContain("\"homeRequirement\":\"无器械\"");
    expect(searchExamplesJson).not.toContain("示例 id 不可脱离上一步结果照抄");
    expect(manifestJson).not.toContain("bodyRegions");
    expect(manifestJson).not.toContain("lower_body");
    expect(manifestJson).not.toContain("upper_body");
    expect(manifestJson).not.toContain("full_body");
    expect(manifestJson).toContain("真实肌群值");
    expect(manifestJson).toContain("metadata.facetCatalog");
    expect(manifestJson).toContain("股四头肌");
    expect(manifestJson).toContain("居家小器械");
    expect(manifestJson).not.toContain("home_friendly");
    expect(manifestJson).toContain("no_equipment");
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
