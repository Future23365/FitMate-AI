import "server-only";

import { z } from "zod";

/** langChainFinalResponseToolName 是 LangChain 结构化终态工具的稳定名称，不代表业务 tool。 */
export const langChainFinalResponseToolName = "fitmate_final_response";

type LangChainJsonSchemaObject = {
  title?: string;
  description?: string;
  type: "object";
  additionalProperties?: boolean;
  required?: string[];
  properties?: Record<string, unknown>;
};

const trimmedNonEmptyStringSchema = z.string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1));

/** LangChainFinalResponseSchema 校验生产聊天成功终态，保证正文和建议提问分离。 */
export const LangChainFinalResponseSchema = z.object({
  content: trimmedNonEmptyStringSchema,
  suggestedQuestions: z.array(trimmedNonEmptyStringSchema).max(3).optional().default([]),
}).strict();

export type LangChainFinalResponse = z.infer<typeof LangChainFinalResponseSchema>;

/** langChainFinalResponseJsonSchema 是传给 LangChain responseFormat 的模型可见结构化输出形状。 */
export const langChainFinalResponseJsonSchema: LangChainJsonSchemaObject = {
  title: langChainFinalResponseToolName,
  description: "FitMate 聊天成功终态。content 是用户可见正文；suggestedQuestions 是可点击的下一轮用户消息。",
  type: "object",
  additionalProperties: false,
  required: ["content"],
  properties: {
    content: {
      type: "string",
      minLength: 1,
      description: "用户可见正文。使用中文，简洁可执行，不使用独立的 --- 或等价 Markdown horizontal rule 分隔线。",
    },
    suggestedQuestions: {
      type: "array",
      maxItems: 3,
      description: "可选的建议提问。每条都是用户点击后可直接发送的完整用户消息，最多 3 条；没有自然下一步时省略。",
      items: {
        type: "string",
        minLength: 1,
      },
    },
  },
};

/** parseLangChainFinalResponse 只做结构清洗和数量边界，不推断建议文本语义。 */
export function parseLangChainFinalResponse(value: unknown) {
  return LangChainFinalResponseSchema.safeParse(value);
}
