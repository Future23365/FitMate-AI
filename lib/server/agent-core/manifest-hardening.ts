import { createHash } from "node:crypto";

import { stableStringify } from "./canonical-json";
import { AgentContractError, AGENT_ERROR_CODES } from "./errors";
import { redactJsonValue } from "./redaction";
import type {
  JsonValue,
  RegistrySnapshot,
  RegistrySnapshotTool,
  ToolManifest,
  ToolManifestLintIssue,
  ToolManifestLintResult,
} from "./contracts";

const REQUIRED_MANIFEST_FIELDS = [
  "name",
  "version",
  "description",
  "whenToUse",
  "whenNotToUse",
  "inputJsonSchema",
  "outputJsonSchema",
  "policyHint",
];

const SAFE_POLICY_VALUES = {
  sideEffect: ["read", "write"],
  riskLevel: ["low", "medium", "high"],
  confirmation: ["never", "required", "always", "dynamic"],
};

const MANIFEST_SENSITIVE_KEY_PATTERN = /(secret|token|password|authorization|cookie|api[_-]?key|handler|capabilit|database|payload)/i;
const INJECTION_EXAMPLE_PATTERN = /(ignore\s+policy|bypass|leak\s+secret|fake\s+confirmation|ndjson|unregistered\s+tool)/i;

/** createManifestHash 基于模型可见 manifest 的 canonical JSON 生成稳定 hash。 */
export function createManifestHash(manifests: ToolManifest[]): string {
  return createHash("sha256")
    .update(stableStringify(manifests.map(toHashableManifest)))
    .digest("hex");
}

/** createRegistrySnapshot 记录本次 run 的安全 tool contract 证据，不包含 handler 或内部对象。 */
export function createRegistrySnapshot(manifests: ToolManifest[], now = new Date()): RegistrySnapshot {
  const lintResults = lintToolManifests(manifests);
  const safeTools = manifests.map(toSnapshotTool);
  const manifestHash = createManifestHash(manifests);

  return {
    snapshotId: `rs_${manifestHash.slice(0, 16)}`,
    manifestHash,
    createdAt: now.toISOString(),
    tools: safeTools,
    lintResults,
  };
}

/** lintToolManifests 聚合每个 manifest 的启动期安全校验结果。 */
export function lintToolManifests(manifests: ToolManifest[]): ToolManifestLintResult[] {
  return manifests.map(lintToolManifest);
}

/** assertSafeToolManifests 阻止不安全 manifest 进入 Planner 可见上下文。 */
export function assertSafeToolManifests(manifests: ToolManifest[]) {
  const failed = lintToolManifests(manifests).filter((result) => !result.ok);
  if (failed.length === 0) {
    return;
  }

  throw new AgentContractError(
    AGENT_ERROR_CODES.INVALID_TOOL_DEFINITION,
    "Tool manifest failed production hardening lint.",
    {
      details: {
        failed,
      },
    },
  );
}

/** lintToolManifest 校验模型可见 manifest 是否完整、安全且保留关键 schema 结构。 */
export function lintToolManifest(manifest: ToolManifest): ToolManifestLintResult {
  const issues: ToolManifestLintIssue[] = [];
  const manifestRecord = manifest as unknown as Record<string, unknown>;

  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!(field in manifestRecord)) {
      issues.push({
        code: "missing_required_field",
        path: `$.${field}`,
        message: `Manifest is missing required field "${field}".`,
      });
    }
  }

  scanSensitiveFields(manifest, "$", issues);
  validatePolicyHint(manifest, issues);
  validateSchemaShape(manifest.inputJsonSchema, "$.inputJsonSchema", issues);
  validateSchemaShape(manifest.outputJsonSchema, "$.outputJsonSchema", issues);
  validateExamples(manifest, issues);

  return {
    toolName: typeof manifest.name === "string" ? manifest.name : "unknown-tool",
    ok: issues.length === 0,
    issues,
  };
}

function toHashableManifest(manifest: ToolManifest): ToolManifest {
  return redactJsonValue(manifest) as ToolManifest;
}

function toSnapshotTool(manifest: ToolManifest): RegistrySnapshotTool {
  return {
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    whenToUse: manifest.whenToUse,
    whenNotToUse: manifest.whenNotToUse,
    inputJsonSchema: redactJsonValue(manifest.inputJsonSchema),
    outputJsonSchema: redactJsonValue(manifest.outputJsonSchema),
    policyHint: manifest.policyHint,
    resourceContract: manifest.resourceContract,
    examples: manifest.examples?.map((example) => ({
      description: example.description,
      input: redactJsonValue(example.input),
    })),
  };
}

function scanSensitiveFields(value: unknown, path: string, issues: ToolManifestLintIssue[]) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSensitiveFields(item, `${path}[${index}]`, issues));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (MANIFEST_SENSITIVE_KEY_PATTERN.test(key)) {
      issues.push({
        code: "sensitive_field",
        path: childPath,
        message: `Manifest exposes sensitive field "${key}".`,
      });
    }
    scanSensitiveFields(child, childPath, issues);
  }
}

function validatePolicyHint(manifest: ToolManifest, issues: ToolManifestLintIssue[]) {
  const policy = manifest.policyHint as Record<string, unknown> | undefined;
  if (!policy) {
    return;
  }

  for (const [key, allowedValues] of Object.entries(SAFE_POLICY_VALUES)) {
    if (!allowedValues.includes(policy[key] as never)) {
      issues.push({
        code: "unsafe_policy_hint",
        path: `$.policyHint.${key}`,
        message: `Manifest policyHint.${key} is not a safe known value.`,
      });
    }
  }

  for (const key of Object.keys(policy)) {
    if (!(key in SAFE_POLICY_VALUES)) {
      issues.push({
        code: "unsafe_policy_hint",
        path: `$.policyHint.${key}`,
        message: `Manifest policyHint exposes unsupported field "${key}".`,
      });
    }
  }
}

function validateSchemaShape(schema: JsonValue | undefined, path: string, issues: ToolManifestLintIssue[]) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    issues.push({
      code: "schema_structure_missing",
      path,
      message: "Manifest schema must be a JSON object.",
    });
    return;
  }

  const record = schema as Record<string, JsonValue>;
  if (!("type" in record) && !("properties" in record) && !("anyOf" in record) && !("oneOf" in record)) {
    issues.push({
      code: "schema_structure_missing",
      path,
      message: "Manifest schema does not expose executable JSON Schema structure.",
    });
  }
}

function validateExamples(manifest: ToolManifest, issues: ToolManifestLintIssue[]) {
  if (!manifest.examples) {
    return;
  }

  if (manifest.examples.length > 3) {
    issues.push({
      code: "example_limit_exceeded",
      path: "$.examples",
      message: "Manifest examples exceed the production hardening limit.",
    });
  }

  manifest.examples.forEach((example, index) => {
    const serialized = stableStringify(example);
    if (INJECTION_EXAMPLE_PATTERN.test(serialized)) {
      issues.push({
        code: "unsafe_example",
        path: `$.examples[${index}]`,
        message: "Manifest example contains prompt-injection-like instructions.",
      });
    }
  });
}
