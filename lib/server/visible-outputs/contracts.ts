import { z } from "zod";

/** JsonValue 是可见输出、校验元数据、trace 摘要和 NDJSON 事件共享的安全 JSON 边界。 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(jsonValueSchema),
  z.record(z.string(), jsonValueSchema),
]));

/** JsonValueSchema 约束结构化可见输出只能携带可序列化、安全投影后的 JSON。 */
export const JsonValueSchema = jsonValueSchema;

/** VisibleOutputEnvelopeSchema 是所有用户可见结构化输出进入 validator 前的通用 envelope。 */
export const VisibleOutputEnvelopeSchema = z.object({
  outputType: z.string().trim().min(1).max(80).regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  schemaVersion: z.string().trim().min(1).max(24),
  payload: JsonValueSchema,
}).strict();

/** VisibleOutputEnvelope 不包含业务语义，只把 outputType、schemaVersion 和 payload 交给业务 validator。 */
export type VisibleOutputEnvelope = z.infer<typeof VisibleOutputEnvelopeSchema>;

/** VisibleOutputValidationSummary 保存 validator 产出的有限元数据，供 renderer 复用数据库校验事实。 */
export type VisibleOutputValidationSummary = {
  outputs: Array<{
    index: number;
    outputType: string;
    schemaVersion: string;
    metadata?: JsonValue;
  }>;
};

export type VisibleOutputValidationResourceRef = {
  resourceId?: string;
  resourceType?: string;
  role?: "consumable" | "diagnostic" | string;
  runId?: string;
  version?: string;
  schemaVersion?: string;
};

export type VisibleOutputValidationResourceInventory = {
  inventory(): Array<{ ref: VisibleOutputValidationResourceRef; summary: JsonValue }>;
};

/** VisibleOutputValidationContext 只提供 validator 所需的事实摘要，不暴露旧 runtime 或模型协议。 */
export type VisibleOutputValidationContext = {
  run?: {
    metadata?: Record<string, JsonValue>;
  };
  resourceStore?: VisibleOutputValidationResourceInventory;
};

export type VisibleOutputValidationResult =
  | { ok: true; metadata?: JsonValue }
  | { ok: false; message: string; details?: JsonValue };

/** VisibleOutputStreamEvent 是 renderer 允许产生的结构化输出 NDJSON 白名单子集。 */
export type VisibleOutputStreamEvent = {
  type: "visible_output";
  outputType: string;
  schemaVersion: string;
  payload: JsonValue;
  content?: JsonValue;
};

/** VisibleOutputRendererRunResult 是 renderer 读取校验元数据所需的最小运行结果视图。 */
export type VisibleOutputRendererRunResult = {
  terminalOutputValidation?: VisibleOutputValidationSummary;
};
