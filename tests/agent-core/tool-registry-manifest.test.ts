import { z } from "zod";
import { describe, expect, it } from "vitest";

import { defineTool } from "@/lib/server/agent-core/define-tool";
import { AgentContractError, AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { ToolRegistry } from "@/lib/server/agent-core/tool-registry";

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
});
