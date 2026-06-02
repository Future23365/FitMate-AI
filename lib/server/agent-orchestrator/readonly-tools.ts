import "server-only";

import { createHash } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import {
  getActiveArtifactPayload,
  listRecentArtifacts,
  searchArtifactsDetailed,
  type ActiveArtifactPayloadSuccess,
  type ArtifactPayloadFailure,
} from "@/lib/server/conversation-artifacts/artifact-service";
import { getPrismaClient } from "@/lib/server/db/prisma";
import {
  exerciseBodyRegionValues,
  getExerciseById,
  searchExercises,
  type ExerciseSearchInput,
  type ExerciseSearchResult,
} from "@/lib/server/exercises/exercise-service";
import { summarizeArtifactCandidatesForModel, summarizeArtifactPayloadForModel, summarizeExerciseCandidatesForModel, summarizeExerciseForModel } from "@/lib/server/ai/tools/summaries";
import { conversationArtifactKindSchema } from "@/lib/shared/conversation-artifacts/schema";
import { exerciseAllowedSectionSchema, type Exercise } from "@/lib/shared/exercises/types";
import { toUtcISOString } from "@/lib/shared/time/utc-date-time";
import {
  createAgentToolRegistry,
  type AgentToolDefinition,
  type AgentToolExecutionContext,
  type AgentToolExecutionResult,
} from "./tool-registry";
import type { AgentToolError, UserMemorySnapshot } from "./contracts";

const summaryMaxChars = 300;
const defaultSearchArtifactsLimit = 6;
const defaultSearchExercisesLimit = 8;

type UserMemoryClient = Pick<PrismaClient, "userProfile" | "userMemory">;

export const listRecentArtifactsAgentToolInputSchema = z.object({
  sessionScope: z.enum(["current_session", "current_user"]).default("current_session"),
  kind: conversationArtifactKindSchema.optional(),
  limit: z.number().int().min(1).max(12).default(defaultSearchArtifactsLimit),
});

export const searchArtifactsAgentToolInputSchema = z.object({
  query: z.string().trim().max(240).optional(),
  candidateUse: z.enum(["answer_only", "edit_plan", "patch", "regenerate"]).default("answer_only"),
  sessionScope: z.enum(["current_session", "current_user"]).default("current_session"),
  kind: conversationArtifactKindSchema.optional(),
  targetGoal: z.string().trim().max(120).optional(),
  equipmentRequired: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  equipmentAvoided: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  sessionMinutes: z.number().int().min(5).max(240).optional(),
  limit: z.number().int().min(1).max(12).default(defaultSearchArtifactsLimit),
});

export const getArtifactPayloadAgentToolInputSchema = z.object({
  artifactId: z.string().trim().min(1).max(120),
  allowedArtifactIds: z.array(z.string().trim().min(1).max(120)).max(24).optional(),
});

export const getExerciseByIdAgentToolInputSchema = z.object({
  exerciseId: z.string().trim().min(1).max(120),
});

export const searchExercisesAgentToolInputSchema = z.object({
  query: z.string().trim().max(240).optional(),
  candidateUse: z.enum(["answer_only", "recommendation", "routine", "plan", "patch"]).default("answer_only"),
  limit: z.number().int().min(1).max(24).default(defaultSearchExercisesLimit),
  visibility: z.enum(["all", "published"]).default("published"),
  allowedSections: z.array(exerciseAllowedSectionSchema).max(3).optional(),
  bodyRegions: z.array(z.enum(exerciseBodyRegionValues)).max(4).optional(),
  goal: z.string().trim().max(120).optional(),
  targetMuscles: z.array(z.string().trim().min(1).max(60)).max(16).optional(),
  equipmentRequired: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  equipmentAvoided: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  equipment: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  location: z.string().trim().max(80).optional(),
  level: z.string().trim().max(60).optional(),
  sessionMinutes: z.number().int().min(5).max(240).optional(),
  preferences: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  avoidances: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  excludedRiskTags: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  injuryLimitations: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
});

export const getUserMemoryAgentToolInputSchema = z.object({
  includePending: z.boolean().default(false),
  limit: z.number().int().min(1).max(24).default(12),
});

export type ListRecentArtifactsAgentToolInput = z.infer<typeof listRecentArtifactsAgentToolInputSchema>;
export type SearchArtifactsAgentToolInput = z.infer<typeof searchArtifactsAgentToolInputSchema>;
export type GetArtifactPayloadAgentToolInput = z.infer<typeof getArtifactPayloadAgentToolInputSchema>;
export type GetExerciseByIdAgentToolInput = z.infer<typeof getExerciseByIdAgentToolInputSchema>;
export type SearchExercisesAgentToolInput = z.infer<typeof searchExercisesAgentToolInputSchema>;
export type GetUserMemoryAgentToolInput = z.infer<typeof getUserMemoryAgentToolInputSchema>;

export type AgentArtifactSearchOutput = Awaited<ReturnType<typeof searchArtifactsDetailed>> & {
  candidateSetId: string;
};

export type AgentExerciseSearchOutput = ExerciseSearchResult & {
  candidateSetId: string;
  candidateUse: SearchExercisesAgentToolInput["candidateUse"];
};

export type AgentArtifactPayloadOutput = ActiveArtifactPayloadSuccess & {
  artifactPayloadId: string;
};

export type AgentExerciseByIdOutput = {
  exercise: Exercise;
};

export type AgentRecentArtifactsOutput = {
  candidateSetId: string;
  artifacts: Awaited<ReturnType<typeof listRecentArtifacts>>;
};

export type AgentReadonlyToolName =
  | "listRecentArtifacts"
  | "searchArtifacts"
  | "getArtifactPayload"
  | "getExerciseById"
  | "searchExercises"
  | "getUserMemory";

// 只读 Agent tools 是 Tool-first 主链读取事实的白名单，不产生 artifact、patch 或回复承诺。
export function createReadonlyAgentToolDefinitions(): AgentToolDefinition<unknown, unknown>[] {
  return [
    createListRecentArtifactsTool(),
    createSearchArtifactsTool(),
    createGetArtifactPayloadTool(),
    createGetExerciseByIdTool(),
    createSearchExercisesTool(),
    createGetUserMemoryTool(),
  ] as AgentToolDefinition<unknown, unknown>[];
}

// createReadonlyAgentToolRegistry 暴露 Phase 2 的统一 Agent registry，暂不注册可持久化写工具。
export function createReadonlyAgentToolRegistry() {
  return createAgentToolRegistry(createReadonlyAgentToolDefinitions());
}

function createListRecentArtifactsTool(): AgentToolDefinition<ListRecentArtifactsAgentToolInput, AgentRecentArtifactsOutput> {
  return {
    name: "listRecentArtifacts",
    description: "列出当前用户可访问的最近 ConversationArtifact 轻量摘要。",
    accessLevel: "read",
    inputSchema: listRecentArtifactsAgentToolInputSchema,
    dependencies: [],
    getIdempotencyKey: createIdempotencyKey,
    summarizeOutput(output) {
      return {
        candidateSetId: output.candidateSetId,
        artifacts: output.artifacts.map((artifact) => ({
          artifactId: artifact.artifactId,
          kind: artifact.kind,
          title: artifact.title,
          summary: truncateText(artifact.summary),
          exerciseIds: artifact.exerciseIds.slice(0, 12),
          updatedAt: artifact.updatedAt,
        })),
      };
    },
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute(input, context) {
      const parsedInput = listRecentArtifactsAgentToolInputSchema.parse(input);
      try {
        const artifacts = await listRecentArtifacts({
          userId: context.userId,
          sessionId: context.sessionId,
          sessionScope: parsedInput.sessionScope,
          kind: parsedInput.kind,
          limit: parsedInput.limit,
        });
        const candidateSetId = createStructuredResultId(context, "candidate_set", "listRecentArtifacts", parsedInput);
        const output = { candidateSetId, artifacts };
        const summary = this.summarizeOutput(output);

        if (artifacts.length === 0) {
          return createFailure("not_found", "No recent artifacts found.", { candidateSetId, filters: parsedInput });
        }

        return createSuccess(context, "listRecentArtifacts", parsedInput, output, summary, summary);
      } catch (error) {
        return createFailure("tool_execution_failed", "Failed to list recent artifacts.", error);
      }
    },
  };
}

function createSearchArtifactsTool(): AgentToolDefinition<SearchArtifactsAgentToolInput, AgentArtifactSearchOutput> {
  return {
    name: "searchArtifacts",
    description: "检索当前用户可访问的 ConversationArtifact 候选摘要。",
    accessLevel: "read",
    inputSchema: searchArtifactsAgentToolInputSchema,
    dependencies: [],
    getIdempotencyKey: createIdempotencyKey,
    summarizeOutput(output) {
      return {
        candidateSetId: output.candidateSetId,
        candidates: summarizeArtifactCandidatesForModel(output.candidates, summaryMaxChars),
        diagnostics: output.diagnostics,
      };
    },
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute(input, context) {
      const parsedInput = searchArtifactsAgentToolInputSchema.parse(input);
      if (requiresStructuredExecutableArtifactSet(parsedInput) && !hasStructuredArtifactFilters(parsedInput)) {
        return createFailure("schema_validation_failed", "Executable artifact candidate sets require structured filters, not a bare query.", {
          candidateUse: parsedInput.candidateUse,
        });
      }

      try {
        const result = await searchArtifactsDetailed({
          userId: context.userId,
          sessionId: context.sessionId,
          sessionScope: parsedInput.sessionScope,
          kind: parsedInput.kind,
          targetGoal: parsedInput.targetGoal,
          equipmentRequired: parsedInput.equipmentRequired,
          equipmentAvoided: parsedInput.equipmentAvoided,
          sessionMinutes: parsedInput.sessionMinutes,
          query: parsedInput.query,
          limit: parsedInput.limit,
        });
        const candidateSetId = createStructuredResultId(context, "candidate_set", "searchArtifacts", parsedInput);
        const output = { ...result, candidateSetId };
        const summary = this.summarizeOutput(output);

        if (result.candidates.length === 0) {
          return createFailure("not_found", "No accessible artifact candidates found.", {
            candidateSetId,
            failureReasons: result.diagnostics.failureReasons,
          });
        }

        return createSuccess(context, "searchArtifacts", parsedInput, output, summary, summary);
      } catch (error) {
        return createFailure("tool_execution_failed", "Failed to search artifacts.", error);
      }
    },
  };
}

function createGetArtifactPayloadTool(): AgentToolDefinition<GetArtifactPayloadAgentToolInput, AgentArtifactPayloadOutput> {
  return {
    name: "getArtifactPayload",
    description: "读取当前用户可访问的 artifact payload，并返回可引用的 payload 结果 id。",
    accessLevel: "read",
    inputSchema: getArtifactPayloadAgentToolInputSchema,
    dependencies: [],
    getIdempotencyKey: createIdempotencyKey,
    summarizeOutput(output) {
      return {
        artifactPayloadId: output.artifactPayloadId,
        requestedArtifactId: output.requestedArtifactId,
        activeArtifactId: output.revisionResolution.activeArtifactId,
        revisionResolution: output.revisionResolution.status,
        payload: summarizeArtifactPayloadForModel({
          artifactId: output.artifactId,
          kind: output.kind,
          payload: output.payload,
          maxTextChars: summaryMaxChars,
        }),
      };
    },
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute(input, context) {
      const parsedInput = getArtifactPayloadAgentToolInputSchema.parse(input);
      if (parsedInput.allowedArtifactIds?.length && !parsedInput.allowedArtifactIds.includes(parsedInput.artifactId)) {
        return createFailure("forbidden", "Artifact is outside the allowed candidate boundary.", {
          artifactId: parsedInput.artifactId,
        });
      }

      try {
        const result = await getActiveArtifactPayload({
          userId: context.userId,
          artifactId: parsedInput.artifactId,
        });

        if (!result.ok) {
          return createFailure(mapArtifactPayloadFailureCode(result), result.message, result.detail);
        }

        const output = {
          ...result,
          artifactPayloadId: createStructuredResultId(context, "artifact_payload", "getArtifactPayload", parsedInput),
        };
        const summary = this.summarizeOutput(output);
        const traceSummary = {
          modelSummary: summary,
          requestedArtifactId: output.requestedArtifactId,
          activeArtifactId: output.revisionResolution.activeArtifactId,
          revisionResolution: output.revisionResolution,
        };

        return createSuccess(context, "getArtifactPayload", parsedInput, output, summary, traceSummary);
      } catch (error) {
        return createFailure("tool_execution_failed", "Failed to read artifact payload.", error);
      }
    },
  };
}

function createGetExerciseByIdTool(): AgentToolDefinition<GetExerciseByIdAgentToolInput, AgentExerciseByIdOutput> {
  return {
    name: "getExerciseById",
    description: "读取动作库中已存在动作的详情摘要。",
    accessLevel: "read",
    inputSchema: getExerciseByIdAgentToolInputSchema,
    dependencies: [],
    getIdempotencyKey: createIdempotencyKey,
    summarizeOutput(output) {
      return summarizeExerciseForModel(output.exercise, summaryMaxChars);
    },
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute(input, context) {
      const parsedInput = getExerciseByIdAgentToolInputSchema.parse(input);
      try {
        const exercise = await getExerciseById(parsedInput.exerciseId);

        if (!exercise) {
          return createFailure("not_found", "Exercise not found.", { exerciseId: parsedInput.exerciseId });
        }

        const output = { exercise };
        const summary = this.summarizeOutput(output);

        return createSuccess(context, "getExerciseById", parsedInput, output, summary, summary);
      } catch (error) {
        return createFailure("tool_execution_failed", "Failed to read exercise.", error);
      }
    },
  };
}

function createSearchExercisesTool(): AgentToolDefinition<SearchExercisesAgentToolInput, AgentExerciseSearchOutput> {
  return {
    name: "searchExercises",
    description: [
      "按受控条件检索动作库候选摘要。",
      "targetMuscles/equipment 必须使用动作库真实 facet；上肢、下肢、核心、全身等范围目标必须用 bodyRegions=upper_body/lower_body/core/full_body。",
      "优先传结构化字段：bodyRegions 可用 upper_body/lower_body/core/full_body；allowedSections 可用 warmup/training/stretch；level 可用 beginner/intermediate/expert；常用 equipment/equipmentRequired 示例：自重、bodyweight、无器械、弹力带、resistance_band、哑铃、dumbbell；下肢 targetMuscles 示例：臀部、股四头肌、腘绳肌、小腿、髋部。",
      "如果工具返回 retryable unknown facet 诊断，应基于 suggestedTargetMuscles/suggestedEquipment 重新检索后再决定 blocked。",
      "用户要求安排一套、单次训练、训练编排或带目标时长的训练流程时，candidateUse 必须是 routine；候选成功后必须继续调用 generateRoutineDraft，不能以 answered 自由文本输出训练编排。",
      "candidateUse=recommendation 只用于推荐单个动作或候选动作列表，不能表示已生成完整训练编排。",
    ].join(" "),
    accessLevel: "read",
    inputSchema: searchExercisesAgentToolInputSchema,
    dependencies: [],
    getIdempotencyKey: createIdempotencyKey,
    summarizeOutput(output) {
      return {
        candidateSetId: output.candidateSetId,
        candidateUse: output.candidateUse,
        candidates: summarizeExerciseCandidatesForModel(output.candidates, summaryMaxChars),
        diagnostics: output.diagnostics,
      };
    },
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute(input, context) {
      const parsedInput = searchExercisesAgentToolInputSchema.parse(input);
      if (requiresStructuredExecutableCandidateSet(parsedInput) && !hasStructuredExerciseFilters(parsedInput)) {
        return createFailure("schema_validation_failed", "Executable exercise candidate sets require structured filters, not a bare query.", {
          candidateUse: parsedInput.candidateUse,
        });
      }

      try {
        const result = await searchExercises(parsedInput);
        const recoveredResult = result.candidates.length === 0
          ? await recoverSearchExercisesFromDiagnostics(parsedInput, result)
          : null;
        const finalResult = recoveredResult ?? result;
        const candidateSetId = createStructuredResultId(context, "candidate_set", "searchExercises", parsedInput);
        const output = { ...finalResult, candidateSetId, candidateUse: parsedInput.candidateUse };
        const summary = this.summarizeOutput(output);

        if (finalResult.candidates.length === 0) {
          return createFailure("not_found", "No exercise candidates found.", {
            candidateSetId,
            failureReasons: finalResult.diagnostics.failureReasons,
            diagnostics: finalResult.diagnostics,
          }, finalResult.diagnostics.retryable);
        }

        return createSuccess(context, "searchExercises", parsedInput, output, summary, summary);
      } catch (error) {
        return createFailure("tool_execution_failed", "Failed to search exercises.", error);
      }
    },
  };
}

function createGetUserMemoryTool(): AgentToolDefinition<GetUserMemoryAgentToolInput, UserMemorySnapshot> {
  return {
    name: "getUserMemory",
    description: "读取当前用户的结构化记忆和画像摘要。",
    accessLevel: "read",
    inputSchema: getUserMemoryAgentToolInputSchema,
    dependencies: [],
    getIdempotencyKey: createIdempotencyKey,
    summarizeOutput(output) {
      return output;
    },
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute(input, context) {
      const parsedInput = getUserMemoryAgentToolInputSchema.parse(input);
      try {
        const output = await getAgentUserMemorySnapshot({
          userId: context.userId,
          includePending: parsedInput.includePending,
          limit: parsedInput.limit,
        });
        const summary = this.summarizeOutput(output);

        return createSuccess(context, "getUserMemory", parsedInput, output, summary, {
          snapshotId: output.snapshotId,
          facts: output.facts.length,
          preferences: output.preferences.length,
          avoidances: output.avoidances.length,
          updatedAt: output.updatedAt,
        });
      } catch (error) {
        return createFailure("tool_execution_failed", "Failed to read user memory.", error);
      }
    },
  };
}

// getAgentUserMemorySnapshot 只读用户画像和已确认记忆，供 Agent 主动查询事实上下文。
async function getAgentUserMemorySnapshot(input: {
  userId: string;
  includePending: boolean;
  limit: number;
  client?: UserMemoryClient;
}): Promise<UserMemorySnapshot> {
  const client = input.client ?? getPrismaClient();
  const now = new Date();
  const [profile, memories] = await Promise.all([
    client.userProfile.findUnique({ where: { userId: input.userId } }),
    client.userMemory.findMany({
      where: {
        userId: input.userId,
        status: input.includePending ? { in: ["active", "pending_confirmation"] } : "active",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ requiresConfirmation: "asc" }, { updatedAt: "desc" }],
      take: input.limit,
    }),
  ]);

  const facts = uniqueStrings([
    profile?.goal ? `goal:${profile.goal}` : undefined,
    profile?.experience ? `experience:${profile.experience}` : undefined,
    profile?.sessionMinutes ? `sessionMinutes:${profile.sessionMinutes}` : undefined,
    profile?.weeklyFrequency ? `weeklyFrequency:${profile.weeklyFrequency}` : undefined,
    ...memories
      .filter((memory) => memory.kind !== "explicit_preference" && memory.kind !== "constraint")
      .map(formatMemoryLabel),
  ]).slice(0, 24);
  const preferences = uniqueStrings([
    ...(profile?.preferences ?? []),
    ...memories.filter((memory) => memory.kind === "explicit_preference").map(formatMemoryLabel),
  ]).slice(0, 24);
  const avoidances = uniqueStrings([
    ...(profile?.avoidances ?? []),
    ...(profile?.injuryLimitations ?? []).map((item) => `injury:${item}`),
    ...memories.filter((memory) => memory.kind === "constraint").map(formatMemoryLabel),
  ]).slice(0, 24);
  const latestMemoryUpdate = memories[0]?.updatedAt;
  const updatedAt = latestMemoryUpdate ?? profile?.updatedAt;

  return {
    snapshotId: createUserMemorySnapshotId(input.userId, updatedAt),
    facts,
    preferences,
    avoidances,
    updatedAt: updatedAt ? toUtcISOString(updatedAt) : undefined,
  };
}

function createSuccess<Output>(
  context: AgentToolExecutionContext,
  toolName: AgentReadonlyToolName,
  input: unknown,
  output: Output,
  modelSummary: unknown,
  traceSummary: unknown,
): AgentToolExecutionResult<Output> {
  return {
    ok: true,
    output,
    toolResultId: createStructuredResultId(context, "tool_result", toolName, input),
    modelSummary,
    traceSummary,
  };
}

// searchExercises 恢复只读取工具结构化 diagnostics，不读取用户原文，避免把服务端变成自然语言理解层。
async function recoverSearchExercisesFromDiagnostics(
  input: SearchExercisesAgentToolInput,
  result: ExerciseSearchResult,
): Promise<ExerciseSearchResult | null> {
  if (!result.diagnostics.retryable) {
    return null;
  }

  const recoveryInput: ExerciseSearchInput = {
    ...input,
    targetMuscles: mergeUniqueStrings([
      ...(input.targetMuscles ?? []).filter((muscle) => !result.diagnostics.unmatchedTargetMuscles.includes(muscle)),
      ...result.diagnostics.suggestedTargetMuscles,
    ]),
    equipment: mergeUniqueStrings([
      ...(input.equipment ?? []).filter((equipment) => !result.diagnostics.unmatchedEquipment.includes(equipment)),
      ...result.diagnostics.suggestedEquipment,
    ]),
    equipmentRequired: mergeUniqueStrings(
      (input.equipmentRequired ?? []).filter((equipment) => !result.diagnostics.unmatchedEquipment.includes(equipment)),
    ),
  };

  if (
    arraysEqual(input.targetMuscles ?? [], recoveryInput.targetMuscles ?? []) &&
    arraysEqual(input.equipment ?? [], recoveryInput.equipment ?? []) &&
    arraysEqual(input.equipmentRequired ?? [], recoveryInput.equipmentRequired ?? [])
  ) {
    return null;
  }

  const recovered = await searchExercises(recoveryInput);

  return {
    ...recovered,
    diagnostics: {
      ...recovered.diagnostics,
      recoveredFrom: result.diagnostics,
    },
  };
}

function createFailure(
  code: AgentToolError["code"],
  message: string,
  detail?: unknown,
  retryable = code === "tool_execution_failed" || code === "timeout",
): AgentToolExecutionResult<never> {
  return {
    ok: false,
    error: { code, message, detail, retryable },
    traceSummary: { code, message, detail: detail instanceof Error ? detail.message : detail },
  };
}

function createIdempotencyKey<Input>(input: Input, context: AgentToolExecutionContext) {
  return createStructuredResultId(context, "idempotency", "agentTool", input);
}

function createStructuredResultId(
  context: AgentToolExecutionContext,
  kind: string,
  toolName: string,
  input: unknown,
) {
  return `${kind}_${createHash("sha256")
    .update(JSON.stringify({ runId: context.runId, userId: context.userId, sessionId: context.sessionId, toolName, input }))
    .digest("hex")
    .slice(0, 24)}`;
}

function createUserMemorySnapshotId(userId: string, updatedAt?: Date | null) {
  return `user_memory_${createHash("sha256")
    .update(JSON.stringify({ userId, updatedAt: updatedAt?.toISOString() ?? null }))
    .digest("hex")
    .slice(0, 24)}`;
}

function mapArtifactPayloadFailureCode(result: ArtifactPayloadFailure): AgentToolError["code"] {
  return result.code === "not_found" ? "not_found" : "validation_failed";
}

function formatMemoryLabel(memory: {
  kind: string;
  subjectType: string;
  subjectId: string | null;
  subjectLabel: string | null;
  requiresConfirmation: boolean;
}) {
  const status = memory.requiresConfirmation ? "pending:" : "";
  return `${status}${memory.kind}:${memory.subjectLabel ?? memory.subjectId ?? memory.subjectType}`;
}

function truncateText(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  return value.length > summaryMaxChars ? `${value.slice(0, summaryMaxChars - 1)}…` : value;
}

function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
}

function mergeUniqueStrings(values: string[]) {
  const merged = uniqueStrings(values);

  return merged.length > 0 ? merged : undefined;
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function requiresStructuredExecutableCandidateSet(input: SearchExercisesAgentToolInput) {
  return input.candidateUse !== "answer_only";
}

function requiresStructuredExecutableArtifactSet(input: SearchArtifactsAgentToolInput) {
  return input.candidateUse !== "answer_only";
}

function hasStructuredExerciseFilters(input: SearchExercisesAgentToolInput) {
  return Boolean(
    input.goal ||
    input.targetMuscles?.length ||
    input.bodyRegions?.length ||
    input.equipmentRequired?.length ||
    input.equipmentAvoided?.length ||
    input.equipment?.length ||
    input.allowedSections?.length ||
    input.level ||
    input.sessionMinutes ||
    input.preferences?.length ||
    input.avoidances?.length ||
    input.injuryLimitations?.length,
  );
}

function hasStructuredArtifactFilters(input: SearchArtifactsAgentToolInput) {
  return Boolean(
    input.kind ||
    input.targetGoal ||
    input.equipmentRequired?.length ||
    input.equipmentAvoided?.length ||
    input.sessionMinutes,
  );
}
