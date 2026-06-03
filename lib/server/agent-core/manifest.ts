import { z, type ZodTypeAny } from "zod";

import type { JsonValue, Tool, ToolExample, ToolManifest } from "./contracts";

const SENSITIVE_KEY_PATTERN = /(secret|token|password|authorization|cookie|handler|database|payload)/i;

/** zodSchemaToJsonSchema 生成 Planner 可见 JSON Schema，保留嵌套 object/array/record/union/enum/required。 */
export function zodSchemaToJsonSchema(schema: ZodTypeAny): JsonValue {
  const jsonSchema = z.toJSONSchema(schema);
  return sanitizeJsonValue(jsonSchema as JsonValue);
}

/** toolToManifest 将服务端 Tool 合同压缩成安全 manifest，不暴露 handler 或内部对象。 */
export function toolToManifest(tool: Tool): ToolManifest {
  const manifest: ToolManifest = {
    name: tool.name,
    version: tool.version,
    description: tool.description,
    whenToUse: tool.whenToUse,
    whenNotToUse: tool.whenNotToUse,
    inputJsonSchema: zodSchemaToJsonSchema(tool.inputSchema),
    outputJsonSchema: zodSchemaToJsonSchema(tool.outputSchema),
    policyHint: {
      sideEffect: tool.policy.sideEffect,
      riskLevel: tool.policy.riskLevel,
      confirmation: tool.policy.confirmation,
    },
  };

  if (tool.resourceContract) {
    manifest.resourceContract = tool.resourceContract;
  }

  if (tool.examples?.length) {
    manifest.examples = tool.examples.map(sanitizeExample);
  }

  return manifest;
}

/** sanitizeJsonValue 移除 manifest/example 中明显敏感键，保持输出只含可序列化安全值。 */
export function sanitizeJsonValue(value: JsonValue, depth = 0): JsonValue {
  if (depth > 12) {
    return "[depth-limit]";
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item, depth + 1));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_KEY_PATTERN.test(key))
        .map(([key, child]) => [key, sanitizeJsonValue(child, depth + 1)]),
    );
  }

  return value;
}

function sanitizeExample(example: ToolExample): ToolExample {
  return {
    description: example.description,
    input: sanitizeJsonValue(example.input),
  };
}
