import type { ZodTypeAny } from "zod";

import type { JsonValue } from "./contracts";

type SchemaRepairTargetKind =
  | "AgentAction"
  | "ToolInput"
  | "VisibleOutputEnvelope"
  | "DomainValidation";

export type SchemaRepairTarget = {
  kind: SchemaRepairTargetKind;
  schemaId?: string;
  toolName?: string;
  outputType?: string;
  variant?: string;
};

type SchemaIssueLike = {
  code?: unknown;
  path?: unknown;
  message?: unknown;
  expected?: unknown;
  keys?: unknown;
  values?: unknown;
  errors?: unknown;
  discriminator?: unknown;
  options?: unknown;
  minimum?: unknown;
  maximum?: unknown;
  inclusive?: unknown;
  format?: unknown;
};

type ProjectSchemaValidationFeedbackInput = {
  target: SchemaRepairTarget;
  schema?: ZodTypeAny;
  issues: readonly unknown[];
  value?: unknown;
  maxErrors?: number;
};

type ProjectDomainValidationFeedbackInput = {
  target: SchemaRepairTarget;
  details?: JsonValue;
  fallbackCode?: string;
};

const plannerOwnedReferenceFields = new Set([
  "usedRefs",
  "usedToolResultIds",
  "usedResourceRefs",
  "consumes",
  "resourceId",
  "toolResultId",
  "factRef",
  "messageId",
  "resource",
]);

/** projectSchemaValidationFeedback 把 Zod/schema issue 投影为模型可见的脱敏字段事实。 */
export function projectSchemaValidationFeedback(input: ProjectSchemaValidationFeedbackInput): JsonValue {
  const flattened = flattenSchemaIssues(input.issues);
  const errors = flattened.flatMap((issue) => projectIssue(issue, input.schema, input.value))
    .filter(dedupeProjectedError)
    .slice(0, input.maxErrors ?? 12);
  const discriminator = projectDiscriminator(flattened, input.value);
  const target = {
    ...input.target,
    ...(input.target.variant ? {} : inferVariant(input.value)),
  };

  return compactUndefined({
    type: "schema_validation_failed",
    target,
    discriminator,
    errors,
  });
}

/** projectDomainValidationFeedback 把业务 validator details 包成确定性 facts，不携带下一步建议。 */
export function projectDomainValidationFeedback(input: ProjectDomainValidationFeedbackInput): JsonValue {
  return compactUndefined({
    type: "domain_validation_failed",
    target: input.target,
    facts: [normalizeDomainFact(input.details, input.fallbackCode)],
  });
}

function projectIssue(issue: SchemaIssueLike, schema: ZodTypeAny | undefined, value: unknown): JsonValue[] {
  if (issue.code === "unrecognized_keys" && Array.isArray(issue.keys)) {
    return issue.keys.map((key) => {
      const path = [...normalizePath(issue.path), String(key)];
      const parentPath = normalizePath(issue.path);
      const objectMeta = getObjectFieldMeta(schema, parentPath, value);
      return compactUndefined({
        code: "unknown_field",
        path: pathToString(path),
        actual: summarizeActual(readPath(value, path), path),
        allowedFields: objectMeta.allowedFields,
        requiredFields: objectMeta.requiredFields,
        repair: createUnknownFieldRepair(String(key)),
      });
    });
  }

  const path = normalizePath(issue.path);
  const actual = readPath(value, path);
  const objectMeta = getObjectFieldMeta(schema, path.slice(0, -1), value);
  const code = normalizeIssueCode(issue, actual.exists);
  const expected = summarizeExpected(issue);
  const allowedValues = summarizeAllowedValues(issue);

  return [compactUndefined({
    code,
    path: pathToString(path),
    expected,
    actual: summarizeActual(actual, path),
    allowedFields: issue.code === "unrecognized_keys" ? objectMeta.allowedFields : undefined,
    requiredFields: code === "required_field_missing" ? objectMeta.requiredFields : undefined,
    allowedValues,
  })];
}

function createUnknownFieldRepair(field: string): string | undefined {
  if (!plannerOwnedReferenceFields.has(field)) {
    return undefined;
  }

  return "该字段不属于当前 Planner 可见合同，请删除；tool result、ResourceStore、历史事实引用和 terminal provenance 由服务端内部维护，模型只输出合法 action 字段和业务结构。";
}

function normalizeIssueCode(issue: SchemaIssueLike, actualExists: boolean) {
  switch (issue.code) {
    case "invalid_type":
      return actualExists ? "invalid_type" : "required_field_missing";
    case "invalid_value": {
      const values = Array.isArray(issue.values) ? issue.values : [];
      return values.length === 1 ? "invalid_literal" : "invalid_enum_value";
    }
    case "invalid_union":
      return issue.discriminator || issue.message === "Invalid discriminator value." ? "invalid_discriminator" : "invalid_union_variant";
    case "unrecognized_keys":
      return "unknown_field";
    case "too_small":
      return "too_small";
    case "too_big":
      return "too_big";
    case "invalid_format":
      return "invalid_format";
    default:
      return "custom_schema_violation";
  }
}

function summarizeExpected(issue: SchemaIssueLike): JsonValue | undefined {
  const expected: Record<string, JsonValue> = {};

  if (typeof issue.expected === "string") {
    expected.type = issue.expected;
  }

  const allowedValues = summarizeAllowedValues(issue);
  if (allowedValues) {
    expected.allowedValues = allowedValues;
  }

  if (typeof issue.minimum === "number") {
    expected.minimum = issue.minimum;
  }

  if (typeof issue.maximum === "number") {
    expected.maximum = issue.maximum;
  }

  if (typeof issue.format === "string") {
    expected.format = issue.format;
  }

  return Object.keys(expected).length > 0 ? expected : undefined;
}

function summarizeAllowedValues(issue: SchemaIssueLike): JsonValue[] | undefined {
  if (Array.isArray(issue.values)) {
    return issue.values.map(toSafeJsonValue).filter(isDefinedJsonValue);
  }

  if (Array.isArray(issue.options)) {
    return issue.options.map(toSafeJsonValue).filter(isDefinedJsonValue);
  }

  return undefined;
}

function summarizeActual(actual: { exists: boolean; value?: unknown }, path: string[] = []): JsonValue {
  if (!actual.exists) {
    return { kind: "missing" };
  }

  const value = actual.value;
  if (value === null) {
    return { type: "null" };
  }

  if (typeof value === "string") {
    const safeValue = isSensitivePath(path) || isSensitiveString(value)
      ? "[redacted]"
      : value;
    return {
      type: "string",
      value: safeValue.length > 80 ? `${safeValue.slice(0, 80)}...[truncated]` : safeValue,
    };
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? { type: "number", value } : { type: "number" };
  }

  if (typeof value === "boolean") {
    return { type: "boolean", value };
  }

  if (Array.isArray(value)) {
    return { type: "array", length: value.length };
  }

  if (value && typeof value === "object") {
    return { type: "object", keys: Object.keys(value).slice(0, 12).map(redactSensitiveKey) };
  }

  return { type: typeof value };
}

function projectDiscriminator(issues: SchemaIssueLike[], value: unknown): JsonValue | undefined {
  const discriminatorIssue = issues.find((issue) => issue.discriminator || issue.code === "invalid_union");
  if (!discriminatorIssue) {
    return undefined;
  }

  const path = normalizePath(discriminatorIssue.path);
  const actual = readPath(value, path);
  const discriminator = typeof discriminatorIssue.discriminator === "string"
    ? discriminatorIssue.discriminator
    : (path[path.length - 1] ?? "type");

  return compactUndefined({
    path: path.length ? pathToString(path) : discriminator,
    value: actual.exists ? toSafeJsonValue(actual.value) : undefined,
    allowedValues: summarizeAllowedValues(discriminatorIssue),
  });
}

function inferVariant(value: unknown): { variant?: string } {
  if (value && typeof value === "object" && !Array.isArray(value) && typeof (value as { type?: unknown }).type === "string") {
    return { variant: (value as { type: string }).type };
  }

  return {};
}

function flattenSchemaIssues(issues: readonly unknown[]): SchemaIssueLike[] {
  const flattened: SchemaIssueLike[] = [];

  for (const rawIssue of issues) {
    if (!isIssueLike(rawIssue)) {
      continue;
    }

    if (Array.isArray(rawIssue.errors) && rawIssue.errors.length > 0) {
      for (const branch of rawIssue.errors) {
        if (Array.isArray(branch)) {
          flattened.push(...flattenSchemaIssues(branch));
        }
      }
      continue;
    }

    flattened.push(rawIssue);
  }

  return flattened;
}

function normalizeDomainFact(details: JsonValue | undefined, fallbackCode?: string): JsonValue {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return compactUndefined({
      code: fallbackCode ?? "domain_validation_failed",
      actual: details,
    });
  }

  const source = details as Record<string, JsonValue>;
  return compactUndefined({
    code: typeof source.code === "string" ? source.code : (fallbackCode ?? "domain_validation_failed"),
    ...source,
  });
}

function getObjectFieldMeta(
  schema: ZodTypeAny | undefined,
  objectPath: string[],
  value: unknown,
): { allowedFields?: string[]; requiredFields?: string[] } {
  const objectSchema = getSchemaAtPath(schema, objectPath, value);
  const def = getDef(unwrapSchema(objectSchema));
  if (!def || def.type !== "object" || !def.shape) {
    return {};
  }

  const shape = getShape(def.shape);
  const allowedFields = Object.keys(shape);
  const requiredFields = allowedFields.filter((field) => !isOptionalSchema(shape[field]));

  return {
    allowedFields,
    requiredFields,
  };
}

function getSchemaAtPath(schema: ZodTypeAny | undefined, path: string[], value: unknown): ZodTypeAny | undefined {
  let current = selectSchemaVariant(unwrapSchema(schema), value);
  let currentValue = value;

  for (const segment of path) {
    current = selectSchemaVariant(unwrapSchema(current), currentValue);
    const def = getDef(current);
    if (!def) {
      return undefined;
    }

    if (def.type === "object" && def.shape) {
      const shape = getShape(def.shape);
      current = shape[segment];
      currentValue = isRecord(currentValue) ? currentValue[segment] : undefined;
      continue;
    }

    if (def.type === "array") {
      current = def.element;
      const index = Number(segment);
      currentValue = Array.isArray(currentValue) && Number.isInteger(index) ? currentValue[index] : undefined;
      continue;
    }

    return undefined;
  }

  return selectSchemaVariant(unwrapSchema(current), currentValue);
}

function selectSchemaVariant(schema: ZodTypeAny | undefined, value: unknown): ZodTypeAny | undefined {
  const def = getDef(schema);
  if (!def || def.type !== "union" || !Array.isArray(def.options)) {
    return schema;
  }

  const discriminator = typeof def.discriminator === "string" ? def.discriminator : undefined;
  if (!discriminator || !isRecord(value)) {
    return schema;
  }

  const discriminatorValue = value[discriminator];
  return def.options.find((option: ZodTypeAny) => schemaLiteralValues(getObjectFieldSchema(option, discriminator)).includes(discriminatorValue as never))
    ?? schema;
}

function getObjectFieldSchema(schema: ZodTypeAny | undefined, field: string): ZodTypeAny | undefined {
  const def = getDef(unwrapSchema(schema));
  if (!def || def.type !== "object" || !def.shape) {
    return undefined;
  }

  return getShape(def.shape)[field];
}

function schemaLiteralValues(schema: ZodTypeAny | undefined): unknown[] {
  const def = getDef(unwrapSchema(schema));
  if (!def) {
    return [];
  }

  if (def.type === "literal" && Array.isArray(def.values)) {
    return def.values;
  }

  if (def.type === "enum" && isRecord(def.entries)) {
    return Object.values(def.entries);
  }

  return [];
}

function unwrapSchema(schema: ZodTypeAny | undefined): ZodTypeAny | undefined {
  let current = schema;
  while (current) {
    const def = getDef(current);
    if (!def || !["optional", "nullable", "default", "catch", "readonly"].includes(def.type)) {
      return current;
    }
    current = def.innerType;
  }
  return current;
}

function isOptionalSchema(schema: ZodTypeAny | undefined) {
  if (!schema) {
    return false;
  }
  if (typeof schema.isOptional === "function" && schema.isOptional()) {
    return true;
  }
  const def = getDef(schema);
  return Boolean(def && ["optional", "default", "catch"].includes(def.type));
}

function getDef(schema: ZodTypeAny | undefined): any {
  return schema ? ((schema as any).def ?? (schema as any)._def) : undefined;
}

function getShape(shape: unknown): Record<string, ZodTypeAny> {
  return typeof shape === "function" ? shape() : (shape as Record<string, ZodTypeAny>);
}

function normalizePath(path: unknown): string[] {
  return Array.isArray(path) ? path.map(String) : [];
}

function pathToString(path: string[]) {
  if (path.length === 0) {
    return "$";
  }

  return path.reduce((result, segment) => {
    if (/^\d+$/.test(segment)) {
      return `${result}[${segment}]`;
    }
    return result ? `${result}.${segment}` : segment;
  }, "");
}

function readPath(value: unknown, path: string[]): { exists: boolean; value?: unknown } {
  let current = value;

  for (const segment of path) {
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      const index = Number(segment);
      if (index < 0 || index >= current.length) {
        return { exists: false };
      }
      current = current[index];
      continue;
    }

    if (!isRecord(current) || !(segment in current)) {
      return { exists: false };
    }

    current = current[segment];
  }

  return { exists: true, value: current };
}

function toSafeJsonValue(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string") {
    return value.length > 120 ? `${value.slice(0, 120)}...[truncated]` : value;
  }

  if (Array.isArray(value)) {
    return value.map(toSafeJsonValue).filter(isDefinedJsonValue);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .slice(0, 12)
      .flatMap(([key, child]) => {
        const safeChild = toSafeJsonValue(child);
        return safeChild === undefined ? [] : [[key, safeChild] as const];
      });
    return Object.fromEntries(entries);
  }

  return undefined;
}

function compactUndefined(value: Record<string, JsonValue | undefined>): JsonValue {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined)) as JsonValue;
}

function dedupeProjectedError(error: JsonValue, index: number, errors: JsonValue[]) {
  return errors.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(error)) === index;
}

function isIssueLike(value: unknown): value is SchemaIssueLike {
  return Boolean(value && typeof value === "object");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isDefinedJsonValue(value: JsonValue | undefined): value is JsonValue {
  return value !== undefined;
}

function isSensitivePath(path: string[]) {
  return path.some((segment) => /secret|token|password|authorization|cookie|api[_-]?key|payload|output/i.test(segment));
}

function isSensitiveString(value: string) {
  return /api[_-]?key/i.test(value)
    || /\bsk-[A-Za-z0-9_-]{8,}\b/.test(value)
    || /\bBearer\s+[A-Za-z0-9._-]+\b/i.test(value);
}

function redactSensitiveKey(key: string) {
  return isSensitivePath([key]) ? "[redacted_key]" : key;
}
