import { z } from "zod";

import { exerciseRecommendationCardSchema } from "@/lib/shared/exercise-recommendations/schema";
import {
  workoutPlanDraftSchema,
  workoutRoutineDraftSchema,
} from "@/lib/shared/workout-plans/draft-schema";

export const conversationArtifactPayloadSchemaVersion = 1;

export const conversationArtifactKindSchema = z.enum([
  "exercise_recommendation",
  "routine",
  "plan",
]);
export const conversationArtifactScopeSchema = z.enum(["chat"]);
export const conversationArtifactStatusSchema = z.enum([
  "active",
  "superseded",
  "archived",
]);
export const conversationArtifactSourceEntityKindSchema = z.enum([
  "workout_routine",
  "workout_schedule",
]);

export const conversationArtifactPayloadByKindSchema = {
  exercise_recommendation: exerciseRecommendationCardSchema,
  routine: workoutRoutineDraftSchema,
  plan: workoutPlanDraftSchema,
} as const;

export const conversationArtifactPayloadSchema = z.union([
  exerciseRecommendationCardSchema,
  workoutRoutineDraftSchema,
  workoutPlanDraftSchema,
]);

export const artifactIndexSchema = z.object({
  artifactId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  kind: conversationArtifactKindSchema,
  scope: conversationArtifactScopeSchema.default("chat"),
  status: conversationArtifactStatusSchema.default("active"),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(500).optional(),
  exerciseIds: z.array(z.string().trim().min(1)).default([]),
  goals: z.array(z.string().trim().min(1)).default([]),
  muscles: z.array(z.string().trim().min(1)).default([]),
  equipment: z.array(z.string().trim().min(1)).default([]),
  sessionMinutes: z.number().int().min(0).optional(),
  weeklyFrequency: z.number().int().min(1).max(7).optional(),
  trainingDayCount: z.number().int().min(0).optional(),
  sourceMessageId: z.string().trim().min(1).optional(),
});

export const conversationArtifactSchema = z.object({
  id: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  messageId: z.string().trim().min(1).optional(),
  kind: conversationArtifactKindSchema,
  scope: conversationArtifactScopeSchema.default("chat"),
  payloadSchemaVersion: z.literal(conversationArtifactPayloadSchemaVersion),
  payload: conversationArtifactPayloadSchema,
  status: conversationArtifactStatusSchema.default("active"),
  revision: z.number().int().min(1).default(1),
  revisionOfArtifactId: z.string().trim().min(1).optional(),
  sourceEntityKind: conversationArtifactSourceEntityKindSchema.optional(),
  sourceEntityId: z.string().trim().min(1).optional(),
});

export type ConversationArtifactKind = z.infer<typeof conversationArtifactKindSchema>;
export type ConversationArtifactScope = z.infer<typeof conversationArtifactScopeSchema>;
export type ConversationArtifactStatus = z.infer<typeof conversationArtifactStatusSchema>;
export type ConversationArtifactSourceEntityKind = z.infer<typeof conversationArtifactSourceEntityKindSchema>;
export type ConversationArtifactPayload = z.infer<typeof conversationArtifactPayloadSchema>;
export type ArtifactIndex = z.infer<typeof artifactIndexSchema>;
export type ConversationArtifact = z.infer<typeof conversationArtifactSchema>;

// 统一读取入口按 kind 和 schema version 分发，避免调用方直接信任 Json payload。
export function parseConversationArtifactPayload(
  kind: ConversationArtifactKind,
  payloadSchemaVersion: number,
  payload: unknown,
) {
  if (payloadSchemaVersion !== conversationArtifactPayloadSchemaVersion) {
    throw new Error(`Unsupported conversation artifact payload schema version: ${payloadSchemaVersion}`);
  }

  return conversationArtifactPayloadByKindSchema[kind].parse(payload);
}
