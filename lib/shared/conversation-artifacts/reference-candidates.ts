import { z } from "zod";

import { conversationArtifactKindSchema } from "@/lib/shared/conversation-artifacts/schema";
import { utcDateTimeStringSchema } from "@/lib/shared/time/utc-date-time";

// artifactReferenceCandidateSchema 描述 Agent artifact 搜索返回给模型的轻量候选摘要。
export const artifactReferenceCandidateSchema = z.object({
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

// ArtifactReferenceCandidate 是 artifact 检索工具的候选摘要类型，不包含完整 payload。
export type ArtifactReferenceCandidate = z.infer<typeof artifactReferenceCandidateSchema>;
