import { z } from "zod";
import { describe, expect, it } from "vitest";

import { AgentActionSchema } from "@/lib/server/agent-core/contracts";
import { projectSchemaValidationFeedback } from "@/lib/server/agent-core/schema-error-projector";

describe("schema error projector", () => {
  it("projects missing and unknown AgentAction fields as deterministic facts", () => {
    const action = { type: "ask_user", question: "你今天能练多久？" };
    const parsed = AgentActionSchema.safeParse(action);
    expect(parsed.success).toBe(false);

    const feedback = parsed.success ? undefined : projectSchemaValidationFeedback({
      target: { kind: "AgentAction", schemaId: "AgentAction", variant: "ask_user" },
      schema: AgentActionSchema,
      issues: parsed.error.issues,
      value: action,
    });

    expect(feedback).toMatchObject({
      type: "schema_validation_failed",
      target: {
        kind: "AgentAction",
        schemaId: "AgentAction",
        variant: "ask_user",
      },
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: "required_field_missing",
          path: "content",
          actual: { kind: "missing" },
          expected: { type: "string" },
          requiredFields: expect.arrayContaining(["type", "content"]),
        }),
        expect.objectContaining({
          code: "unknown_field",
          path: "question",
          allowedFields: expect.arrayContaining(["type", "content", "usedRefs", "suggestedQuestions", "activitySummary"]),
        }),
      ]),
    });
    expect(JSON.stringify(feedback)).not.toContain("question 改成 content");
  });

  it("projects type, enum and literal errors without runtime repair prose", () => {
    const fixtureSchema = z.object({
      type: z.literal("fixture"),
      mode: z.enum(["read", "list"]),
      count: z.number().int().min(1),
    }).strict();
    const input = { type: "wrong", mode: "delete", count: "many" };
    const parsed = fixtureSchema.safeParse(input);
    expect(parsed.success).toBe(false);

    const feedback = parsed.success ? undefined : projectSchemaValidationFeedback({
      target: { kind: "ToolInput", schemaId: "fixture.input", toolName: "fixtureTool" },
      schema: fixtureSchema,
      issues: parsed.error.issues,
      value: input,
    });

    expect(feedback).toMatchObject({
      target: {
        kind: "ToolInput",
        schemaId: "fixture.input",
        toolName: "fixtureTool",
      },
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_literal",
          path: "type",
          allowedValues: ["fixture"],
          actual: { type: "string", value: "wrong" },
        }),
        expect.objectContaining({
          code: "invalid_enum_value",
          path: "mode",
          allowedValues: ["read", "list"],
          actual: { type: "string", value: "delete" },
        }),
        expect.objectContaining({
          code: "invalid_type",
          path: "count",
          expected: { type: "number" },
          actual: { type: "string", value: "many" },
        }),
      ]),
    });
  });

  it("projects discriminator failures with allowed action variants", () => {
    const action = { type: "answered", content: "旧 action" };
    const parsed = AgentActionSchema.safeParse(action);
    expect(parsed.success).toBe(false);

    const feedback = parsed.success ? undefined : projectSchemaValidationFeedback({
      target: { kind: "AgentAction", schemaId: "AgentAction" },
      schema: AgentActionSchema,
      issues: parsed.error.issues,
      value: action,
    });

    expect(feedback).toMatchObject({
      discriminator: {
        path: "type",
        value: "answered",
        allowedValues: expect.arrayContaining(["tool_call", "final_answer", "ask_user"]),
      },
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_discriminator",
          path: "type",
          allowedValues: expect.arrayContaining(["tool_call", "final_answer", "ask_user"]),
        }),
      ]),
    });
  });

  it("projects terminal usedRefs discriminator failures with allowed ref variants", () => {
    const action = {
      type: "final_answer",
      content: "基于本轮查询结果回答。",
      usedRefs: [
        {
          id: "tr_fixture",
          resourceType: "tool_result",
        },
      ],
    };
    const parsed = AgentActionSchema.safeParse(action);
    expect(parsed.success).toBe(false);

    const feedback = parsed.success ? undefined : projectSchemaValidationFeedback({
      target: { kind: "AgentAction", schemaId: "AgentAction", variant: "final_answer" },
      schema: AgentActionSchema,
      issues: parsed.error.issues,
      value: action,
    });

    expect(feedback).toMatchObject({
      type: "schema_validation_failed",
      target: {
        kind: "AgentAction",
        schemaId: "AgentAction",
        variant: "final_answer",
      },
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_discriminator",
          path: "usedRefs[0].type",
          allowedValues: expect.arrayContaining(["tool_result", "resource"]),
          actual: { kind: "missing" },
        }),
      ]),
    });
    expect(JSON.stringify(feedback)).not.toContain("resourceType 改成 type");
  });

  it("redacts sensitive actual values and never includes full object payloads", () => {
    const fixtureSchema = z.object({
      id: z.string(),
    }).strict();
    const input = {
      id: "safe-id",
      apiKey: "sk-secretInternalValue123456",
      payload: {
        secret: "secretInternalValue",
        nested: { value: "should not be serialized as a full payload" },
      },
    };
    const parsed = fixtureSchema.safeParse(input);
    expect(parsed.success).toBe(false);

    const feedback = parsed.success ? undefined : projectSchemaValidationFeedback({
      target: { kind: "ToolInput", schemaId: "redactionFixture.input", toolName: "redactionFixture" },
      schema: fixtureSchema,
      issues: parsed.error.issues,
      value: input,
    });
    const serialized = JSON.stringify(feedback);

    expect(feedback).toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: "unknown_field",
          path: "apiKey",
          actual: { type: "string", value: "[redacted]" },
        }),
        expect.objectContaining({
          code: "unknown_field",
          path: "payload",
          actual: { type: "object", keys: expect.any(Array) },
        }),
      ]),
    });
    expect(serialized).not.toContain("sk-secretInternalValue123456");
    expect(serialized).not.toContain("should not be serialized as a full payload");
  });
});
