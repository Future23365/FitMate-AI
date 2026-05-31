import "server-only";

import { z } from "zod";

import {
  getArtifactPayload,
  searchArtifactsDetailed,
  type ArtifactPayloadFailure,
  type ArtifactPayloadSuccess,
} from "@/lib/server/conversation-artifacts/artifact-service";
import { getExerciseById, searchExercises, type ExerciseSearchResult } from "@/lib/server/exercises/exercise-service";
import { conversationArtifactKindSchema } from "@/lib/shared/conversation-artifacts/schema";
import { exerciseAllowedSectionSchema } from "@/lib/shared/exercises/types";
import {
  defaultSearchArtifactsLimit,
  defaultSearchExercisesLimit,
} from "./config";
import {
  summarizeArtifactCandidatesForModel,
  summarizeArtifactPayloadForModel,
  summarizeExerciseCandidatesForModel,
  summarizeExerciseForModel,
} from "./summaries";
import type {
  ControlledReadTool,
  ControlledToolContext,
  ControlledToolResult,
  ReadonlyToolName,
} from "./types";

export const searchArtifactsToolInputSchema = z.object({
  query: z.string().trim().max(240).optional(),
  sessionScope: z.enum(["current_session", "current_user"]).default("current_session"),
  kind: conversationArtifactKindSchema.optional(),
  limit: z.number().int().min(1).max(12).default(defaultSearchArtifactsLimit),
});

export const getArtifactPayloadToolInputSchema = z.object({
  artifactId: z.string().trim().min(1).max(120),
});

export const getExerciseByIdToolInputSchema = z.object({
  exerciseId: z.string().trim().min(1).max(120),
});

export const searchExercisesToolInputSchema = z.object({
  query: z.string().trim().max(240).optional(),
  limit: z.number().int().min(1).max(24).default(defaultSearchExercisesLimit),
  visibility: z.enum(["all", "published"]).default("published"),
  allowedSections: z.array(exerciseAllowedSectionSchema).max(3).optional(),
  equipment: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  level: z.string().trim().max(60).optional(),
  excludedRiskTags: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  injuryLimitations: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
});

export type SearchArtifactsToolInput = z.infer<typeof searchArtifactsToolInputSchema>;
export type GetArtifactPayloadToolInput = z.infer<typeof getArtifactPayloadToolInputSchema>;
export type GetExerciseByIdToolInput = z.infer<typeof getExerciseByIdToolInputSchema>;
export type SearchExercisesToolInput = z.infer<typeof searchExercisesToolInputSchema>;

const searchArtifactsTool: ControlledReadTool<SearchArtifactsToolInput, Awaited<ReturnType<typeof searchArtifactsDetailed>>> = {
  name: "searchArtifacts",
  description: "检索当前用户可访问的训练 artifact 候选摘要。",
  inputSchema: searchArtifactsToolInputSchema,
  async execute(input, context) {
    const limit = Math.min(input.limit, context.budget.searchArtifactsMaxResults);
    const result = await searchArtifactsDetailed({
      userId: context.userId,
      sessionId: context.sessionId,
      sessionScope: input.sessionScope,
      kind: input.kind,
      query: input.query,
      limit,
    });
    const modelSummary = {
      candidates: summarizeArtifactCandidatesForModel(result.candidates, context.budget.maxFreeTextChars),
      diagnostics: result.diagnostics,
    };

    if (result.candidates.length === 0) {
      return {
        ok: false,
        error: {
          code: "not_found",
          message: "No accessible artifact candidates found.",
          detail: result.diagnostics.failureReasons,
        },
        traceSummary: modelSummary,
      };
    }

    return { ok: true, output: result, modelSummary, traceSummary: modelSummary };
  },
};

const getArtifactPayloadTool: ControlledReadTool<GetArtifactPayloadToolInput, ArtifactPayloadSuccess | ArtifactPayloadFailure> = {
  name: "getArtifactPayload",
  description: "读取当前用户可访问的 artifact payload，并返回稳定摘要。",
  inputSchema: getArtifactPayloadToolInputSchema,
  async execute(input, context) {
    if (context.allowedArtifactIds?.length && !context.allowedArtifactIds.includes(input.artifactId)) {
      return {
        ok: false,
        error: {
          code: "forbidden",
          message: "Artifact is outside the resolved reference boundary.",
        },
      };
    }

    const result = await getArtifactPayload({
      userId: context.userId,
      artifactId: input.artifactId,
    });

    if (!result.ok) {
      return {
        ok: false,
        error: {
          code: result.code,
          message: result.message,
          detail: result.detail,
        },
        traceSummary: { artifactId: input.artifactId, code: result.code },
      };
    }

    const modelSummary = summarizeArtifactPayloadForModel({
      artifactId: result.artifactId,
      kind: result.kind,
      payload: result.payload,
      maxTextChars: context.budget.maxFreeTextChars,
    });

    return { ok: true, output: result, modelSummary, traceSummary: modelSummary };
  },
};

const getExerciseByIdTool: ControlledReadTool<GetExerciseByIdToolInput, Awaited<ReturnType<typeof getExerciseById>>> = {
  name: "getExerciseById",
  description: "读取动作库中已存在动作的详情摘要。",
  inputSchema: getExerciseByIdToolInputSchema,
  async execute(input, context) {
    const exercise = await getExerciseById(input.exerciseId);

    if (!exercise) {
      return {
        ok: false,
        error: {
          code: "not_found",
          message: "Exercise not found.",
        },
      };
    }

    const modelSummary = summarizeExerciseForModel(exercise, context.budget.maxFreeTextChars);

    return { ok: true, output: exercise, modelSummary, traceSummary: modelSummary };
  },
};

const searchExercisesTool: ControlledReadTool<SearchExercisesToolInput, ExerciseSearchResult> = {
  name: "searchExercises",
  description: "按受控条件检索动作库候选摘要。",
  inputSchema: searchExercisesToolInputSchema,
  async execute(input, context) {
    const limit = Math.min(input.limit, context.budget.searchExercisesMaxResults);
    const result = await searchExercises({ ...input, limit });
    const modelSummary = {
      candidates: summarizeExerciseCandidatesForModel(result.candidates, context.budget.maxFreeTextChars),
      diagnostics: result.diagnostics,
    };

    if (result.candidates.length === 0) {
      return {
        ok: false,
        error: {
          code: "not_found",
          message: "No exercise candidates found.",
          detail: result.diagnostics.failureReasons,
        },
        traceSummary: modelSummary,
      };
    }

    return { ok: true, output: result, modelSummary, traceSummary: modelSummary };
  },
};

const readonlyToolRegistry = new Map<ReadonlyToolName, ControlledReadTool<unknown, unknown>>([
  [searchArtifactsTool.name, searchArtifactsTool as ControlledReadTool<unknown, unknown>],
  [getArtifactPayloadTool.name, getArtifactPayloadTool as ControlledReadTool<unknown, unknown>],
  [getExerciseByIdTool.name, getExerciseByIdTool as ControlledReadTool<unknown, unknown>],
  [searchExercisesTool.name, searchExercisesTool as ControlledReadTool<unknown, unknown>],
]);

// Registry 是 LLM 可见工具白名单，写类能力必须留在服务端确定性编排中。
export function getReadonlyToolRegistry() {
  return readonlyToolRegistry;
}

export function getReadonlyTool(name: string) {
  return readonlyToolRegistry.get(name as ReadonlyToolName);
}

export function listReadonlyToolDefinitions() {
  return Array.from(readonlyToolRegistry.values()).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputJsonSchemaHint: z.toJSONSchema(tool.inputSchema),
  }));
}
