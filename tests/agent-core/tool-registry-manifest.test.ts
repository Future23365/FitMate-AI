import { z } from "zod";
import { describe, expect, it } from "vitest";

import { defineTool } from "@/lib/server/agent-core/define-tool";
import { AgentContractError, AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { ToolRegistry } from "@/lib/server/agent-core/tool-registry";
import { createProductionAgentToolRegistry } from "@/lib/server/agent-tools";

function createNestedReadTool(name = "nestedRead") {
  return defineTool({
    name,
    version: "0.1.0",
    description: "Nested read fixture.",
    whenToUse: "Use for nested manifest tests.",
    whenNotToUse: "Do not use outside agent-core tests.",
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
        description: "Sensitive example keys are stripped from manifest.",
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

  it("serializes the production registry with only searchExerciseResources and its key schema fields", () => {
    const registry = createProductionAgentToolRegistry();
    const manifests = registry.serializeForPlanner();
    const [manifest] = manifests;
    const inputSchema = manifest.inputJsonSchema as {
      properties: {
        q: unknown;
        suitability: { enum: string[] };
        level: { description?: string };
        equipment: { description?: string };
        homeRequirement: { description?: string };
        bodyRegions: { items: { enum: string[] } };
        published: { const?: boolean; default?: boolean };
        sort: { default?: string; enum: string[] };
      };
      additionalProperties?: boolean;
    };
    const manifestJson = JSON.stringify(manifest);

    expect(manifests.map((tool) => tool.name)).toEqual(["searchExerciseResources"]);
    expect(manifest.policyHint).toEqual({
      sideEffect: "read",
      riskLevel: "low",
      confirmation: "never",
    });
    expect(inputSchema.properties).toHaveProperty("q");
    expect(inputSchema.properties.suitability.enum).toEqual(["warmup", "training", "stretch"]);
    expect(inputSchema.properties.level.description).toContain("beginner/初级");
    expect(inputSchema.properties.level.description).toContain("expert/高级");
    expect(inputSchema.properties.equipment.description).toContain("body only/自重");
    expect(inputSchema.properties.equipment.description).toContain("dumbbell/哑铃");
    expect(inputSchema.properties.homeRequirement.description).toContain("none/无器械");
    expect(inputSchema.properties.homeRequirement.description).toContain("small_equipment/居家小器械");
    expect(inputSchema.properties.bodyRegions.items.enum).toEqual(["upper_body", "lower_body", "core", "full_body"]);
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
    expect(manifestJson).toContain("published");
    expect(manifestJson).toContain("bodyRegions");
    expect(manifestJson).toContain("lower_body");
    expect(manifestJson).toContain("真实肌群 facet");
    expect(manifestJson).toContain("floor/地面/瑜伽垫");
    expect(manifestJson).toContain("machine/固定器械");
    expect(manifestJson).not.toContain("home_friendly");
    expect(manifestJson).not.toContain("no_equipment");
    expect(manifestJson).not.toContain("readFixture");
    expect(manifestJson).not.toContain("m1ResourceProducer");
    expect(manifestJson).not.toContain("candidateSetId");
    expect(manifestJson).not.toContain("candidate_set");
    expect(manifestJson).not.toContain("handler");
  });
});
