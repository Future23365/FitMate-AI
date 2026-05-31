import { z } from "zod";

import { conversationArtifactKindSchema } from "@/lib/shared/conversation-artifacts/schema";
import { utcDateTimeStringSchema } from "@/lib/shared/time/utc-date-time";

export const referenceResolutionConfidenceSchema = z.enum(["high", "medium", "low"]);

export const referenceArtifactCandidateSchema = z.object({
  artifactId: z.string().trim().min(1),
  kind: conversationArtifactKindSchema,
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(500).optional(),
  exerciseIds: z.array(z.string().trim().min(1)).default([]),
  goals: z.array(z.string().trim().min(1)).default([]),
  muscles: z.array(z.string().trim().min(1)).default([]),
  equipment: z.array(z.string().trim().min(1)).default([]),
  sessionMinutes: z.number().int().min(0).optional(),
  weeklyFrequency: z.number().int().min(1).max(7).optional(),
  trainingDayCount: z.number().int().min(0).optional(),
  updatedAt: utcDateTimeStringSchema,
});

export const referenceResolutionSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("resolved"),
    artifactId: z.string().trim().min(1),
    artifactKind: conversationArtifactKindSchema,
    confidence: referenceResolutionConfidenceSchema.exclude(["low"]),
    reason: z.string().trim().min(1).max(500),
    candidates: z.array(referenceArtifactCandidateSchema).max(8).default([]),
  }),
  z.object({
    status: z.literal("ambiguous"),
    confidence: z.literal("low").default("low"),
    reason: z.string().trim().min(1).max(500),
    candidates: z.array(referenceArtifactCandidateSchema).min(1).max(8),
    clarificationQuestion: z.string().trim().min(1).max(500),
  }),
  z.object({
    status: z.literal("not_found"),
    confidence: z.literal("low").default("low"),
    reason: z.string().trim().min(1).max(500),
    candidates: z.array(referenceArtifactCandidateSchema).max(8).default([]),
  }),
]);

export const referenceResolutionInputSchema = z.object({
  latestUserMessage: z.string().trim().min(1).max(4000),
  sessionId: z.string().trim().min(1).max(120).optional(),
  recentArtifacts: z.array(referenceArtifactCandidateSchema).max(12).default([]),
});

export type ReferenceResolutionConfidence = z.infer<typeof referenceResolutionConfidenceSchema>;
export type ReferenceArtifactCandidate = z.infer<typeof referenceArtifactCandidateSchema>;
export type ReferenceResolution = z.infer<typeof referenceResolutionSchema>;
export type ReferenceResolutionInput = z.infer<typeof referenceResolutionInputSchema>;
