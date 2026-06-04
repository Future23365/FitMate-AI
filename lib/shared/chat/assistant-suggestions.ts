import { z } from "zod";

export const assistantSuggestionKindSchema = z.enum([
  "clarification",
  "next_action",
  "adjustment",
  "retry",
  "confirmation",
]);

export const assistantSuggestionSourceSchema = z.enum([
  "intent",
  "exercise_recommendation",
  "workout_generation",
  "artifact_failure",
  "reference_resolution",
  "workout_patch",
  "patch_confirmation",
  "legacy",
]);

export const assistantSuggestionTargetOperationSchema = z.enum([
  "answer_followup",
  "clarify_request",
  "view_artifact",
  "adjust_artifact",
  "generate_from_recommendation",
  "generate_routine",
  "generate_plan",
  "retry_current_request",
  "unsupported_write",
  "save_artifact",
  "validate_and_save",
  "write_artifact",
]);

// AssistantSuggestion 是聊天前端唯一可见建议协议，message 必须能直接作为下一轮用户消息发送。
export const assistantSuggestionSchema = z.object({
  label: z.string().trim().min(1).max(40),
  message: z.string().trim().min(1).max(160),
  kind: assistantSuggestionKindSchema,
  blocking: z.boolean(),
  source: assistantSuggestionSourceSchema,
  // targetOperation 是服务端产品能力 gate 的结构化依据；前端只负责展示和发送 message。
  targetOperation: assistantSuggestionTargetOperationSchema.optional(),
});

export const assistantSuggestionListSchema = z.array(assistantSuggestionSchema).max(3).default([]);

export type AssistantSuggestionKind = z.infer<typeof assistantSuggestionKindSchema>;
export type AssistantSuggestionSource = z.infer<typeof assistantSuggestionSourceSchema>;
export type AssistantSuggestionTargetOperation = z.infer<typeof assistantSuggestionTargetOperationSchema>;
export type AssistantSuggestion = z.infer<typeof assistantSuggestionSchema>;
