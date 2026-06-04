import { z } from "zod";
import { describe, expect, it } from "vitest";

import { defineTool } from "@/lib/server/agent-core/define-tool";
import { AgentContractError, AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { ToolRegistry } from "@/lib/server/agent-core/tool-registry";
import { createProductionToolRegistry } from "@/lib/server/agent-tools";
import type { JsonValue, ToolManifest } from "@/lib/server/agent-core/contracts";

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
    const registry = createProductionToolRegistry();
    const manifests = registry.serializeForPlanner();
    const inspectFactManifest = manifests.find((tool) => tool.name === "inspectVisibleTrainingProposals");
    const searchManifest = manifests.find((tool) => tool.name === "searchExerciseResources");
    const inspectInputSchemaObjects: Array<Record<string, JsonValue>> = [];
    const inputSchema = searchManifest?.inputJsonSchema as {
      properties: {
        q: unknown;
        suitabilities: { items: { enum: string[] }; minItems?: number; maxItems?: number };
        level: { description?: string };
        equipment: { description?: string };
        homeRequirement: { description?: string };
        bodyRegions: { items: { enum: string[] } };
        excludeExerciseIds: { items: unknown; maxItems?: number; description?: string };
        published: { const?: boolean; default?: boolean };
        sort: { default?: string; enum: string[] };
      };
      additionalProperties?: boolean;
    };
    const inspectManifestJson = JSON.stringify(inspectFactManifest);
    const inspectExamplesJson = JSON.stringify(inspectFactManifest?.examples ?? []);
    const searchExamplesJson = JSON.stringify(searchManifest?.examples ?? []);
    const manifestJson = JSON.stringify(manifests);
    collectJsonObjects(inspectFactManifest?.inputJsonSchema, inspectInputSchemaObjects);
    const readRecentInputBranches = inspectInputSchemaObjects.filter(objectHasReadRecentOperation);

    expect(manifests.map((tool) => tool.name)).toEqual([
      "inspectVisibleTrainingProposals",
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
    expect(inputSchema.properties).not.toHaveProperty("limit");
    expect(inputSchema.properties).not.toHaveProperty("page");
    expect(inputSchema.properties).not.toHaveProperty("pageSize");
    expect(searchExamplesJson).not.toContain("maxReturned");
    expect(searchExamplesJson).not.toContain("limit");
    expect(searchExamplesJson).not.toContain("pageSize");
    expect(inputSchema.properties).not.toHaveProperty("suitability");
    expect(inputSchema.properties.suitabilities.items.enum).toEqual(["warmup", "training", "stretch"]);
    expect(inputSchema.properties.suitabilities.maxItems).toBe(3);
    expect(inputSchema.properties.level.description).toContain("beginner/初级");
    expect(inputSchema.properties.level.description).toContain("expert/高级");
    expect(inputSchema.properties.equipment.description).toContain("body only/自重");
    expect(inputSchema.properties.equipment.description).toContain("dumbbell/哑铃");
    expect(inputSchema.properties.homeRequirement.description).toContain("none/无器械");
    expect(inputSchema.properties.homeRequirement.description).toContain("small_equipment/居家小器械");
    expect(inputSchema.properties.bodyRegions.items.enum).toEqual(["upper_body", "lower_body", "core", "full_body"]);
    expect(inputSchema.properties.excludeExerciseIds.maxItems).toBe(50);
    expect(inputSchema.properties.excludeExerciseIds.description).toContain("用户已经看到");
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
    expect(manifestJson).toContain("totalMatches=0");
    expect(manifestJson).toContain("0 条事实查询结果");
    expect(manifestJson).toContain("published");
    expect(manifestJson).toContain("excludeExerciseIds");
    expect(manifestJson).toContain("bodyRegions");
    expect(manifestJson).toContain("lower_body");
    expect(manifestJson).toContain("真实肌群 facet");
    expect(manifestJson).toContain("floor/地面/瑜伽垫");
    expect(manifestJson).toContain("machine/固定器械");
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
    expect(manifestJson).not.toContain("\"handler\"");
    expect(manifestJson).not.toContain("Query published exercise resources");
    expect(manifestJson).not.toContain("Use when the user asks");
    expect(collectModelVisibleDescriptions(manifests).every((text) => chineseDescriptionPattern.test(text))).toBe(true);
  });
});
