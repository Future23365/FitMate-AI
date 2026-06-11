import "server-only";

import { z } from "zod";

const jsonSchemaObject = z.object({
  type: z.literal("object"),
  properties: z.record(z.string(), z.unknown()).default({}),
  required: z.array(z.string()).optional(),
  additionalProperties: z.boolean().optional(),
}).passthrough();

/** deepSeekFunctionToolSchema 约束 DeepSeek native tools 的最小 function 合同，provider strict 不能替代服务端 Zod 校验。 */
export const deepSeekFunctionToolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    description: z.string().min(1),
    parameters: jsonSchemaObject.optional(),
    strict: z.boolean().optional(),
  }).strict(),
}).strict();

/** deepSeekAssistantToolCallSchema 约束 DeepSeek 返回的 tool_calls 摘要，arguments 保持字符串直到 wrapper 执行前再解析校验。 */
export const deepSeekAssistantToolCallSchema = z.object({
  id: z.string().min(1),
  type: z.literal("function"),
  function: z.object({
    name: z.string().min(1),
    arguments: z.string(),
  }).strict(),
}).strict();

/** deepSeekToolMessageSchema 约束 tool result message 的回填格式，tool_call_id 必须来自 provider 返回的 tool call id。 */
export const deepSeekToolMessageSchema = z.object({
  role: z.literal("tool"),
  tool_call_id: z.string().min(1),
  content: z.string(),
}).strict();

/** deepSeekToolCallingAssistantMessageSchema 表达一次 assistant tool call 响应中项目需要追踪的最小 provider 事实。 */
export const deepSeekToolCallingAssistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: z.string().nullable().optional(),
  reasoning_content: z.string().nullable().optional(),
  tool_calls: z.array(deepSeekAssistantToolCallSchema).min(1),
}).strict();

export type DeepSeekFunctionTool = z.infer<typeof deepSeekFunctionToolSchema>;
export type DeepSeekAssistantToolCall = z.infer<typeof deepSeekAssistantToolCallSchema>;
export type DeepSeekToolMessage = z.infer<typeof deepSeekToolMessageSchema>;
export type DeepSeekToolCallingAssistantMessage = z.infer<typeof deepSeekToolCallingAssistantMessageSchema>;
