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
  "patch_confirmation",
  "legacy",
]);

// AssistantSuggestion 是聊天前端唯一可见建议协议，message 必须能直接作为下一轮用户消息发送。
export const assistantSuggestionSchema = z.object({
  label: z.string().trim().min(1).max(40),
  message: z.string().trim().min(1).max(160),
  kind: assistantSuggestionKindSchema,
  blocking: z.boolean(),
  source: assistantSuggestionSourceSchema,
});

export const assistantSuggestionListSchema = z.array(assistantSuggestionSchema).max(3).default([]);

export type AssistantSuggestionKind = z.infer<typeof assistantSuggestionKindSchema>;
export type AssistantSuggestionSource = z.infer<typeof assistantSuggestionSourceSchema>;
export type AssistantSuggestion = z.infer<typeof assistantSuggestionSchema>;
