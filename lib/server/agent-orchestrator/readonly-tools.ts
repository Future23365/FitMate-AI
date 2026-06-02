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
  type ExerciseCandidateSetEvidence,
  type ExerciseSearchInput,
  type ExerciseSearchResult,
} from "@/lib/server/exercises/exercise-service";
import { summarizeArtifactCandidatesForModel, summarizeArtifactPayloadForModel, summarizeExerciseCandidatesForModel, summarizeExerciseForModel } from "@/lib/server/ai/tools/summaries";
import { conversationArtifactKindSchema } from "@/lib/shared/conversation-artifacts/schema";
import { exerciseAllowedSectionSchema, type Exercise } from "@/lib/shared/exercises/types";
import { toUtcISOString } from "@/lib/shared/time/utc-date-time";
import {
  userMemoryKindSchema,
  userMemorySourceSchema,
  userMemoryStatusSchema,
  userMemorySubjectTypeSchema,
} from "@/lib/shared/user-feedback-memory/schema";
import {
  createAgentToolRegistry,
  type AgentToolDefinition,
  type AgentToolExecutionContext,
  type AgentToolExecutionResult,
} from "./tool-registry";
import {
  agentToolCapabilityContractSchema,
  type AgentToolCapabilityContract,
  type AgentToolError,
  type AgentToolResultRecord,
  type AgentToolResultFulfillment,
  type UserMemorySnapshot,
} from "./contracts";

const summaryMaxChars = 300;
const defaultSearchArtifactsLimit = 6;
const defaultSearchExercisesLimit = 8;
const defaultNoEquipmentHomeRequirement = "no_equipment";

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

export const resolveArtifactReferenceAgentToolInputSchema = z.object({
  operation: z.literal("resolve_artifact_reference"),
  referenceKind: z.enum(["latest", "previous", "recent_saved", "recent_generated", "explicit_filters"]).default("latest"),
  sessionScope: z.enum(["current_session", "current_user"]).default("current_session"),
  kind: conversationArtifactKindSchema.optional(),
  targetGoal: z.string().trim().max(120).optional(),
  equipmentRequired: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  equipmentAvoided: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  sessionMinutes: z.number().int().min(5).max(240).optional(),
  requireUnique: z.boolean().default(true),
  limit: z.number().int().min(1).max(8).default(4),
}).strict();

export const getArtifactPayloadAgentToolInputSchema = z.object({
  artifactId: z.string().trim().min(1).max(120),
  allowedArtifactIds: z.array(z.string().trim().min(1).max(120)).max(24).optional(),
});

export const getExerciseByIdAgentToolInputSchema = z.object({
  exerciseId: z.string().trim().min(1).max(120),
});

const searchExerciseFiltersSchema = z.object({
  bodyRegions: z.array(z.enum(exerciseBodyRegionValues)).max(4).optional(),
  allowedSections: z.array(exerciseAllowedSectionSchema).max(3).optional(),
  targetMuscles: z.array(z.string().trim().min(1).max(60)).max(16).optional(),
  equipment: z.object({
    in: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
    notIn: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  }).strict().optional(),
  homeRequirements: z.array(z.string().trim().min(1).max(60)).max(8).optional(),
  levels: z.array(z.string().trim().min(1).max(60)).max(4).optional(),
  difficulty: z.array(z.string().trim().min(1).max(60)).max(4).optional(),
  riskTagsNotIn: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  goalTags: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  movementPatterns: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  intensityRoles: z.array(z.string().trim().min(1).max(60)).max(8).optional(),
  visibility: z.enum(["all", "published"]).optional(),
}).strict();

const searchExerciseResultRequirementsSchema = z.object({
  minCandidates: z.number().int().min(1).max(100).optional(),
  // sectionCoverage 是按目标 section 局部声明的结果要求，不能强制模型填满所有 section。
  sectionCoverage: z.partialRecord(exerciseAllowedSectionSchema, z.object({
    min: z.number().int().min(1).max(40),
  }).strict()).optional(),
  mustBeUsableFor: z.enum(["answer", "routine", "plan", "patch"]).optional(),
  requireProof: z.boolean().optional(),
  requireUnique: z.boolean().optional(),
}).strict();

const searchExerciseSoftPreferencesSchema = z.object({
  preferredEquipment: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  preferredMuscles: z.array(z.string().trim().min(1).max(60)).max(16).optional(),
  preferredDifficulty: z.array(z.string().trim().min(1).max(60)).max(4).optional(),
}).strict();

const searchExerciseProjectionSchema = z.object({
  fields: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  maxCandidatesForModel: z.number().int().min(1).max(24).optional(),
}).strict();

export const searchExercisesAgentToolInputSchema = z.object({
  operation: z.literal("build_exercise_candidate_set").optional(),
  query: z.string().trim().max(240).optional(),
  candidateUse: z.enum(["answer_only", "recommendation", "routine", "plan", "patch"]).default("answer_only"),
  limit: z.number().int().min(1).max(24).default(defaultSearchExercisesLimit),
  visibility: z.enum(["all", "published"]).default("published"),
  filters: searchExerciseFiltersSchema.optional(),
  resultRequirements: searchExerciseResultRequirementsSchema.optional(),
  softPreferences: searchExerciseSoftPreferencesSchema.optional(),
  projection: searchExerciseProjectionSchema.optional(),
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

const queryUserMemoryFiltersSchema = z.object({
  kind: z.array(userMemoryKindSchema).max(8).optional(),
  subjectType: z.array(userMemorySubjectTypeSchema).max(8).optional(),
  status: z.array(userMemoryStatusSchema).max(4).optional(),
  confirmed: z.boolean().optional(),
  source: z.array(userMemorySourceSchema).max(4).optional(),
}).strict();

export const queryUserMemoryAgentToolInputSchema = z.object({
  operation: z.literal("query_user_memory"),
  filters: queryUserMemoryFiltersSchema.default({}),
  limit: z.number().int().min(1).max(24).default(12),
  projection: z.object({
    includeValue: z.boolean().default(false),
    fields: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  }).strict().default({ includeValue: false }),
}).strict();

export type ListRecentArtifactsAgentToolInput = z.infer<typeof listRecentArtifactsAgentToolInputSchema>;
export type SearchArtifactsAgentToolInput = z.infer<typeof searchArtifactsAgentToolInputSchema>;
export type ResolveArtifactReferenceAgentToolInput = z.infer<typeof resolveArtifactReferenceAgentToolInputSchema>;
export type GetArtifactPayloadAgentToolInput = z.infer<typeof getArtifactPayloadAgentToolInputSchema>;
export type GetExerciseByIdAgentToolInput = z.infer<typeof getExerciseByIdAgentToolInputSchema>;
export type SearchExercisesAgentToolInput = z.infer<typeof searchExercisesAgentToolInputSchema>;
export type GetUserMemoryAgentToolInput = z.infer<typeof getUserMemoryAgentToolInputSchema>;
export type QueryUserMemoryAgentToolInput = z.infer<typeof queryUserMemoryAgentToolInputSchema>;

export type AgentArtifactSearchOutput = Awaited<ReturnType<typeof searchArtifactsDetailed>> & {
  candidateSetId: string;
};

export type AgentArtifactReferenceResolutionOutput = {
  artifactReferenceId: string;
  artifactId?: string;
  candidates: AgentArtifactSearchOutput["candidates"];
  evidence: {
    operation: "resolve_artifact_reference";
    matchedConstraints: Record<string, unknown>;
    requireUnique: boolean;
    candidateCount: number;
  };
  diagnostics: AgentArtifactSearchOutput["diagnostics"] & {
    ambiguousCandidateIds?: string[];
    unsupportedReference?: boolean;
  };
};

export type AgentExerciseSearchOutput = ExerciseSearchResult & {
  candidateSetId: string;
  candidateUse: SearchExercisesAgentToolInput["candidateUse"];
  satisfied: boolean;
  candidateSetStatus: "satisfied" | "partial";
  candidateSetEvidence: ExerciseCandidateSetEvidence;
  unmetResultRequirements: string[];
  resultRequirementProof: ExerciseSearchResult["diagnostics"]["resultRequirementProof"];
  recoveryOptions: Array<{ label: string; message: string }>;
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

export type AgentUserMemoryQueryOutput = {
  memoryQueryId: string;
  matchedMemories: Array<{
    memoryId: string;
    kind: string;
    subjectType: string;
    subjectId?: string;
    subjectLabel?: string;
    status: string;
    source: string;
    confirmed: boolean;
    updatedAt?: string;
    value?: unknown;
  }>;
  matchedFilters: QueryUserMemoryAgentToolInput["filters"];
  coverageDiagnostics: {
    matchedCount: number;
    limit: number;
    unverifiable: boolean;
    snapshotFreshness?: string;
  };
};

export type AgentReadonlyToolName =
  | "listRecentArtifacts"
  | "searchArtifacts"
  | "resolveArtifactReference"
  | "getArtifactPayload"
  | "getExerciseById"
  | "searchExercises"
  | "getUserMemory"
  | "queryUserMemory";

const rawReadonlyToolCapabilityContracts = {
  listRecentArtifacts: {
    operationKind: "list",
    supportedOperations: ["list_recent_artifacts"],
    inputContract: {
      requiredFields: [],
      optionalFields: ["sessionScope", "kind", "limit"],
      acceptedFilters: ["sessionScope", "kind", "limit"],
      acceptedEnums: {
        sessionScope: ["current_session", "current_user"],
        kind: ["routine", "plan", "exercise_recommendation"],
      },
      hardConstraintFields: ["sessionScope", "kind"],
      projectionFields: ["limit"],
    },
    executionContract: {
      reads: ["ConversationArtifact", "ArtifactIndex"],
      writes: [],
      mustNotRead: ["artifact payload", "user natural language"],
      strictness: "exact",
    },
    refusesWhen: ["no recent artifacts exist for the requested scope"],
    produces: ["candidate_set"],
    evidence: ["candidateSetId", "artifact summaries", "session scope"],
    failureCodes: ["not_found", "tool_execution_failed"],
    unsupportedOperations: ["semantic artifact reference resolution", "payload read"],
  },
  searchArtifacts: {
    operationKind: "structured_search",
    supportedOperations: ["search_artifact_candidates"],
    inputContract: {
      requiredFields: [],
      optionalFields: ["query", "candidateUse", "sessionScope", "kind", "targetGoal", "equipmentRequired", "equipmentAvoided", "sessionMinutes", "limit"],
      acceptedFilters: ["sessionScope", "kind", "targetGoal", "equipmentRequired", "equipmentAvoided", "sessionMinutes"],
      acceptedEnums: {
        candidateUse: ["answer_only", "edit_plan", "patch", "regenerate"],
        sessionScope: ["current_session", "current_user"],
      },
      hardConstraintFields: ["sessionScope", "kind", "targetGoal", "equipmentRequired", "equipmentAvoided", "sessionMinutes"],
      softPreferenceFields: ["query"],
      projectionFields: ["limit"],
    },
    executionContract: {
      reads: ["ArtifactIndex"],
      writes: [],
      mustNotRead: ["artifact payload"],
      strictness: "hard_filter",
    },
    refusesWhen: ["executable candidateUse lacks structured filters", "no artifact candidate found", "reference result would be ambiguous"],
    produces: ["candidate_set"],
    evidence: ["candidateSetId", "artifact search diagnostics", "finalCandidateIds"],
    failureCodes: ["missing_required_parameter", "not_found", "ambiguous_resource", "tool_execution_failed"],
    unsupportedOperations: ["unique reference resolution", "payload read", "saving artifacts"],
  },
  resolveArtifactReference: {
    operationKind: "reference_resolution",
    supportedOperations: ["resolve_artifact_reference"],
    inputContract: {
      requiredFields: ["operation"],
      optionalFields: ["referenceKind", "sessionScope", "kind", "targetGoal", "equipmentRequired", "equipmentAvoided", "sessionMinutes", "requireUnique", "limit"],
      acceptedFilters: ["referenceKind", "sessionScope", "kind", "targetGoal", "equipmentRequired", "equipmentAvoided", "sessionMinutes"],
      acceptedEnums: {
        operation: ["resolve_artifact_reference"],
        referenceKind: ["latest", "previous", "recent_saved", "recent_generated", "explicit_filters"],
        sessionScope: ["current_session", "current_user"],
      },
      hardConstraintFields: ["referenceKind", "sessionScope", "kind", "targetGoal", "equipmentRequired", "equipmentAvoided", "sessionMinutes", "requireUnique"],
      resultRequirementFields: ["requireUnique"],
      projectionFields: ["limit"],
    },
    executionContract: {
      reads: ["ArtifactIndex"],
      writes: [],
      mustNotRead: ["artifact payload", "user natural language"],
      strictness: "hard_filter",
    },
    refusesWhen: ["reference cannot be expressed by structured filters", "no candidate found", "multiple candidates match while requireUnique=true"],
    produces: ["artifact_reference"],
    evidence: ["artifactReferenceId", "matchedConstraints", "candidate ids", "ambiguity diagnostics"],
    failureCodes: ["unsupported_operation", "not_found", "ambiguous_resource", "tool_execution_failed"],
    unsupportedOperations: ["payload read", "implicit semantic selection"],
  },
  getArtifactPayload: {
    operationKind: "exact_read",
    supportedOperations: ["read_artifact_payload"],
    inputContract: {
      requiredFields: ["artifactId"],
      optionalFields: ["allowedArtifactIds"],
      resourceRefs: ["artifactId", "allowedArtifactIds"],
      hardConstraintFields: ["artifactId", "allowedArtifactIds"],
    },
    executionContract: {
      reads: ["ConversationArtifact"],
      writes: [],
      mustNotRead: ["ArtifactIndex semantic search"],
      strictness: "exact",
    },
    refusesWhen: ["artifactId is inaccessible", "artifactId is outside allowedArtifactIds", "payload is invalid"],
    produces: ["artifact_payload"],
    evidence: ["artifactPayloadId", "requestedArtifactId", "activeArtifactId", "revisionResolution"],
    failureCodes: ["forbidden", "not_found", "validation_failed", "tool_execution_failed"],
    unsupportedOperations: ["artifact search", "reference resolution"],
  },
  getExerciseById: {
    operationKind: "exact_read",
    supportedOperations: ["read_exercise_by_id"],
    inputContract: {
      requiredFields: ["exerciseId"],
      optionalFields: [],
      resourceRefs: ["exerciseId"],
      hardConstraintFields: ["exerciseId"],
    },
    executionContract: {
      reads: ["Exercise"],
      writes: [],
      mustNotRead: ["natural language query"],
      strictness: "exact",
    },
    refusesWhen: ["exerciseId does not exist"],
    produces: ["exercise_detail"],
    evidence: ["exerciseId", "exercise summary"],
    failureCodes: ["not_found", "tool_execution_failed"],
    unsupportedOperations: ["exercise search", "candidate set generation"],
  },
  searchExercises: {
    operationKind: "structured_search",
    supportedOperations: ["build_exercise_candidate_set"],
    inputContract: {
      requiredFields: ["operation for executable candidateUse", "filters for executable candidateUse", "resultRequirements for routine/plan/patch"],
      optionalFields: ["candidateUse", "filters", "resultRequirements", "softPreferences", "projection", "query", "limit", "legacy structured fields"],
      acceptedFilters: ["bodyRegions", "allowedSections", "targetMuscles", "equipment.in", "equipment.notIn", "homeRequirements", "levels", "difficulty", "riskTagsNotIn", "goalTags", "movementPatterns", "intensityRoles", "visibility"],
      acceptedEnums: {
        operation: ["build_exercise_candidate_set"],
        candidateUse: ["answer_only", "recommendation", "routine", "plan", "patch"],
        bodyRegions: ["upper_body", "lower_body", "core", "full_body"],
        allowedSections: ["warmup", "training", "stretch"],
        visibility: ["all", "published"],
      },
      hardConstraintFields: ["filters.bodyRegions", "filters.allowedSections", "filters.targetMuscles", "filters.equipment", "filters.homeRequirements", "filters.levels", "filters.difficulty", "filters.riskTagsNotIn", "filters.goalTags", "filters.movementPatterns", "filters.intensityRoles", "filters.visibility"],
      softPreferenceFields: ["query", "softPreferences"],
      resultRequirementFields: ["minCandidates", "sectionCoverage", "mustBeUsableFor", "requireProof", "requireUnique"],
      projectionFields: ["projection", "limit"],
    },
    executionContract: {
      reads: ["Exercise"],
      writes: [],
      mustNotRead: ["latest user message", "conversationSummary"],
      strictness: "hard_filter",
    },
    refusesWhen: ["executable candidateUse lacks operation", "executable candidateUse lacks structured filters", "routine/plan/patch lacks resultRequirements", "invalid facet", "insufficient candidates", "result requirement unmet"],
    produces: ["candidate_set"],
    evidence: ["candidateSetId", "normalizedQueryInput", "appliedFilters", "constraintProof", "resultRequirementProof", "satisfied"],
    failureCodes: ["missing_required_parameter", "invalid_parameter", "insufficient_candidates", "result_requirement_unmet", "tool_execution_failed"],
    unsupportedOperations: ["using query as hard constraint", "auto-relaxing hard filters", "generating routine", "expressing default no-equipment only in free text"],
  },
  getUserMemory: {
    operationKind: "memory_snapshot",
    supportedOperations: ["read_user_memory_snapshot"],
    inputContract: {
      requiredFields: [],
      optionalFields: ["includePending", "limit"],
      acceptedFilters: ["includePending", "limit"],
      hardConstraintFields: ["includePending"],
      projectionFields: ["limit"],
    },
    executionContract: {
      reads: ["UserProfile", "UserMemory"],
      writes: [],
      mustNotRead: ["natural language query"],
      strictness: "exact",
    },
    refusesWhen: ["memory snapshot cannot prove a structured memory query"],
    produces: ["memory_snapshot"],
    evidence: ["snapshotId", "snapshot counts", "updatedAt"],
    failureCodes: ["unsupported_operation", "tool_execution_failed"],
    unsupportedOperations: ["precise memory query by kind/subject/status/source"],
  },
  queryUserMemory: {
    operationKind: "memory_query",
    supportedOperations: ["query_user_memory"],
    inputContract: {
      requiredFields: ["operation"],
      optionalFields: ["filters", "limit", "projection"],
      acceptedFilters: ["kind", "subjectType", "status", "confirmed", "source"],
      acceptedEnums: {
        operation: ["query_user_memory"],
        kind: ["explicit_preference", "exercise_feedback", "constraint", "temporary_context", "injury_or_pain_signal", "training_behavior"],
        subjectType: ["exercise", "body_part", "goal", "equipment", "schedule", "health", "general"],
        status: ["active", "pending_confirmation", "dismissed", "expired"],
        source: ["chat", "workout_result", "profile", "system"],
      },
      hardConstraintFields: ["filters.kind", "filters.subjectType", "filters.status", "filters.confirmed", "filters.source"],
      projectionFields: ["projection", "limit"],
    },
    executionContract: {
      reads: ["UserMemory"],
      writes: [],
      mustNotRead: ["UserProfile snapshot as proof"],
      strictness: "hard_filter",
    },
    refusesWhen: ["query filters cannot prove coverage", "no memory matches the requested filters"],
    produces: ["memory_query_result"],
    evidence: ["memoryQueryId", "matchedFilters", "coverageDiagnostics", "matched memory ids"],
    failureCodes: ["not_found", "unverifiable_result", "tool_execution_failed"],
    unsupportedOperations: ["querying arbitrary natural language memory text"],
  },
};

const readonlyToolCapabilityContracts = Object.fromEntries(
  Object.entries(rawReadonlyToolCapabilityContracts).map(([toolName, contract]) => [
    toolName,
    agentToolCapabilityContractSchema.parse(contract),
  ]),
) as Record<AgentReadonlyToolName, AgentToolCapabilityContract>;

// 只读 Agent tools 是 Tool-first 主链读取事实的白名单，不产生 artifact、patch 或回复承诺。
export function createReadonlyAgentToolDefinitions(): AgentToolDefinition<unknown, unknown>[] {
  return [
    createListRecentArtifactsTool(),
    createSearchArtifactsTool(),
    createResolveArtifactReferenceTool(),
    createGetArtifactPayloadTool(),
    createGetExerciseByIdTool(),
    createSearchExercisesTool(),
    createGetUserMemoryTool(),
    createQueryUserMemoryTool(),
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
    capabilityContract: readonlyToolCapabilityContracts.listRecentArtifacts,
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
    capabilityContract: readonlyToolCapabilityContracts.searchArtifacts,
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

function createResolveArtifactReferenceTool(): AgentToolDefinition<ResolveArtifactReferenceAgentToolInput, AgentArtifactReferenceResolutionOutput> {
  return {
    name: "resolveArtifactReference",
    description: "按结构化引用条件解析唯一 ConversationArtifact；结果不唯一时返回歧义，不静默选择。",
    accessLevel: "read",
    inputSchema: resolveArtifactReferenceAgentToolInputSchema,
    dependencies: [],
    capabilityContract: readonlyToolCapabilityContracts.resolveArtifactReference,
    getIdempotencyKey: createIdempotencyKey,
    summarizeOutput(output) {
      return {
        artifactReferenceId: output.artifactReferenceId,
        artifactId: output.artifactId,
        candidates: summarizeArtifactCandidatesForModel(output.candidates, summaryMaxChars),
        evidence: output.evidence,
        diagnostics: output.diagnostics,
      };
    },
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute(input, context) {
      const parsedInput = resolveArtifactReferenceAgentToolInputSchema.parse(input);
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
          limit: parsedInput.limit,
        });
        const artifactReferenceId = createStructuredResultId(context, "artifact_reference", "resolveArtifactReference", parsedInput);
        const output: AgentArtifactReferenceResolutionOutput = {
          artifactReferenceId,
          artifactId: result.candidates.length === 1 ? result.candidates[0]?.artifactId : undefined,
          candidates: result.candidates,
          evidence: {
            operation: "resolve_artifact_reference",
            matchedConstraints: {
              referenceKind: parsedInput.referenceKind,
              sessionScope: parsedInput.sessionScope,
              kind: parsedInput.kind,
              targetGoal: parsedInput.targetGoal,
              equipmentRequired: parsedInput.equipmentRequired,
              equipmentAvoided: parsedInput.equipmentAvoided,
              sessionMinutes: parsedInput.sessionMinutes,
            },
            requireUnique: parsedInput.requireUnique,
            candidateCount: result.candidates.length,
          },
          diagnostics: {
            ...result.diagnostics,
            ambiguousCandidateIds: result.candidates.length > 1 ? result.candidates.map((candidate) => candidate.artifactId) : undefined,
          },
        };
        const summary = this.summarizeOutput(output);

        if (result.candidates.length === 0) {
          return createFailure("not_found", "No artifact matched the structured reference.", {
            artifactReferenceId,
            diagnostics: output.diagnostics,
          }, true);
        }

        if (parsedInput.requireUnique && result.candidates.length !== 1) {
          return createFailure("ambiguous_resource", "Artifact reference matched multiple candidates.", {
            artifactReferenceId,
            ambiguousCandidateIds: result.candidates.map((candidate) => candidate.artifactId),
            diagnostics: output.diagnostics,
          }, true);
        }

        return createSuccess(context, "resolveArtifactReference", parsedInput, output, summary, summary, {
          producedResources: output.artifactId ? [{ type: "artifact_reference", id: artifactReferenceId }] : [],
          appliedHardConstraints: output.evidence.matchedConstraints,
          evidence: output.evidence,
          diagnostics: output.diagnostics,
        });
      } catch (error) {
        return createFailure("tool_execution_failed", "Failed to resolve artifact reference.", error);
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
    capabilityContract: readonlyToolCapabilityContracts.getArtifactPayload,
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
    capabilityContract: readonlyToolCapabilityContracts.getExerciseById,
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
      "执行型 candidateUse=recommendation/routine/plan/patch 且没有明确可用器械、居家条件或已确认器械事实时，必须把默认无器械写入 filters.homeRequirements=[\"no_equipment\"]；不能只在回复文本里说无器械。",
      "如果工具返回 retryable unknown facet 诊断，应基于 suggestedTargetMuscles/suggestedEquipment 重新检索后再决定 blocked。",
      "用户要求安排一套、单次训练、训练编排或带目标时长的训练流程时，candidateUse 必须是 routine；候选成功后必须继续调用 generateRoutineDraft，不能以 answered 自由文本输出训练编排。",
      "routine 中用户只表达可用器械时，默认只作为 training 主训练边界；warmup/stretch 默认允许无器械或自重受控补充，除非用户明确要求全程同器械。",
      "candidateUse=recommendation 只用于推荐单个动作或候选动作列表，不能表示已生成完整训练编排。",
    ].join(" "),
    accessLevel: "read",
    inputSchema: searchExercisesAgentToolInputSchema,
    dependencies: [],
    capabilityContract: readonlyToolCapabilityContracts.searchExercises,
    getIdempotencyKey: createIdempotencyKey,
    summarizeOutput(output) {
      return {
        candidateSetId: output.candidateSetId,
        candidateUse: output.candidateUse,
        candidateSetStatus: output.candidateSetStatus,
        satisfied: output.satisfied,
        candidates: summarizeExerciseCandidatesForModel(output.candidates, summaryMaxChars),
        unmetResultRequirements: output.unmetResultRequirements,
        resultRequirementProof: output.resultRequirementProof,
        recoveryOptions: output.recoveryOptions,
        diagnostics: output.diagnostics,
      };
    },
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute(input, context) {
      const parsed = searchExercisesAgentToolInputSchema.safeParse(input);
      if (!parsed.success) {
        return createFailure("invalid_parameter", "searchExercises input contains invalid fields or enum values.", {
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        }, true);
      }
      const parsedInput = parsed.data;
      if (requiresStructuredExecutableCandidateSet(parsedInput) && !hasStructuredExerciseFilters(parsedInput)) {
        return createFailure("missing_required_parameter", "Executable exercise candidate sets require structured filters, not a bare query.", {
          candidateUse: parsedInput.candidateUse,
          missing: ["filters"],
        }, true);
      }
      if (requiresStructuredExecutableCandidateSet(parsedInput) && parsedInput.operation !== "build_exercise_candidate_set") {
        return createFailure("missing_required_parameter", "Executable exercise candidate sets require operation=build_exercise_candidate_set.", {
          candidateUse: parsedInput.candidateUse,
          operation: parsedInput.operation,
          missing: ["operation"],
        }, true);
      }
      if (requiresRoutineResultRequirements(parsedInput) && !hasResultRequirements(parsedInput)) {
        return createFailure("missing_required_parameter", "Routine, plan and patch candidate sets require resultRequirements.", {
          candidateUse: parsedInput.candidateUse,
          missing: ["resultRequirements"],
        }, true);
      }

      try {
        const normalizedInput = normalizeAgentSearchExercisesInput(parsedInput, context);
        const result = await searchExercises(normalizedInput);
        const invalidFilters = result.diagnostics.invalidFilters ?? [];
        if (invalidFilters.length > 0) {
          return createFailure("invalid_parameter", "searchExercises received invalid structured filters.", {
            candidateSetId: createStructuredResultId(context, "candidate_set", "searchExercises", normalizedInput),
            invalidFilters,
            diagnostics: result.diagnostics,
          }, true);
        }

        const recoveredResult = parsedInput.candidateUse === "answer_only" && result.candidates.length === 0
          ? await recoverSearchExercisesFromDiagnostics(parsedInput, result)
          : null;
        const finalResult = recoveredResult ?? result;
        const candidateSetId = createStructuredResultId(context, "candidate_set", "searchExercises", normalizedInput);
        const candidateSetEvidence = createExerciseCandidateSetEvidence(finalResult);
        const output = {
          ...finalResult,
          candidateSetId,
          candidateUse: parsedInput.candidateUse,
          satisfied: candidateSetEvidence.satisfied,
          candidateSetStatus: candidateSetEvidence.satisfied ? "satisfied" as const : "partial" as const,
          candidateSetEvidence,
          unmetResultRequirements: finalResult.diagnostics.unmetResultRequirements ?? [],
          resultRequirementProof: finalResult.diagnostics.resultRequirementProof ?? {},
          recoveryOptions: createExerciseSearchRecoveryOptions(finalResult),
        };
        const summary = this.summarizeOutput(output);

        if (finalResult.candidates.length === 0) {
          const unmetResultRequirements = finalResult.diagnostics.unmetResultRequirements ?? [];
          const failureCode = unmetResultRequirements.includes("insufficient_candidates")
            ? "insufficient_candidates"
            : "not_found";
          return createFailure(failureCode, "No exercise candidates found.", {
            candidateSetId,
            failureReasons: finalResult.diagnostics.failureReasons ?? [],
            diagnostics: finalResult.diagnostics,
          }, finalResult.diagnostics.retryable);
        }

        if (candidateSetEvidence.satisfied === false) {
          return createSuccess(context, "searchExercises", normalizedInput, output, summary, summary, {
            satisfied: false,
            producedResources: [],
            appliedHardConstraints: finalResult.diagnostics.appliedFilters,
            unmetResultRequirements: finalResult.diagnostics.unmetResultRequirements ?? [],
            evidence: candidateSetEvidence,
            diagnostics: {
              queryMode: finalResult.diagnostics.queryMode,
              finalExerciseIds: finalResult.diagnostics.finalExerciseIds,
              failureReasons: finalResult.diagnostics.failureReasons,
              unmetResultRequirements: finalResult.diagnostics.unmetResultRequirements,
              resultRequirementProof: finalResult.diagnostics.resultRequirementProof,
              controlledSupplementalCandidates: finalResult.diagnostics.controlledSupplementalCandidates,
            },
          });
        }

        return createSuccess(context, "searchExercises", normalizedInput, output, summary, summary, {
          producedResources: [{ type: "candidate_set", id: candidateSetId }],
          appliedHardConstraints: finalResult.diagnostics.appliedFilters,
          evidence: candidateSetEvidence,
          diagnostics: {
            queryMode: finalResult.diagnostics.queryMode,
            finalExerciseIds: finalResult.diagnostics.finalExerciseIds,
            failureReasons: finalResult.diagnostics.failureReasons,
            unmetResultRequirements: finalResult.diagnostics.unmetResultRequirements,
          },
        });
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
    capabilityContract: readonlyToolCapabilityContracts.getUserMemory,
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

function createQueryUserMemoryTool(): AgentToolDefinition<QueryUserMemoryAgentToolInput, AgentUserMemoryQueryOutput> {
  return {
    name: "queryUserMemory",
    description: "按 kind、subjectType、status、confirmed、source 等结构化字段查询当前用户记忆，并返回覆盖诊断。",
    accessLevel: "read",
    inputSchema: queryUserMemoryAgentToolInputSchema,
    dependencies: [],
    capabilityContract: readonlyToolCapabilityContracts.queryUserMemory,
    getIdempotencyKey: createIdempotencyKey,
    summarizeOutput(output) {
      return {
        memoryQueryId: output.memoryQueryId,
        matchedFilters: output.matchedFilters,
        coverageDiagnostics: output.coverageDiagnostics,
        matchedMemories: output.matchedMemories.map((memory) => ({
          memoryId: memory.memoryId,
          kind: memory.kind,
          subjectType: memory.subjectType,
          subjectId: memory.subjectId,
          subjectLabel: memory.subjectLabel,
          status: memory.status,
          source: memory.source,
          confirmed: memory.confirmed,
          updatedAt: memory.updatedAt,
        })),
      };
    },
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute(input, context) {
      const parsedInput = queryUserMemoryAgentToolInputSchema.parse(input);
      try {
        const output = await queryAgentUserMemory({
          userId: context.userId,
          filters: parsedInput.filters,
          limit: parsedInput.limit,
          includeValue: parsedInput.projection.includeValue,
          memoryQueryId: createStructuredResultId(context, "memory_query", "queryUserMemory", parsedInput),
        });
        const summary = this.summarizeOutput(output);

        if (output.matchedMemories.length === 0) {
          return createFailure("unverifiable_result", "No user memory rows matched the structured query.", {
            memoryQueryId: output.memoryQueryId,
            matchedFilters: output.matchedFilters,
            coverageDiagnostics: output.coverageDiagnostics,
          }, true);
        }

        return createSuccess(context, "queryUserMemory", parsedInput, output, summary, summary, {
          producedResources: [{ type: "memory_query_result", id: output.memoryQueryId }],
          appliedHardConstraints: output.matchedFilters,
          evidence: {
            memoryQueryId: output.memoryQueryId,
            matchedMemoryIds: output.matchedMemories.map((memory) => memory.memoryId),
          },
          diagnostics: output.coverageDiagnostics,
        });
      } catch (error) {
        return createFailure("tool_execution_failed", "Failed to query user memory.", error);
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
  const equipment = uniqueStrings(
    memories
      .filter((memory) =>
        memory.subjectType === "equipment" &&
        !memory.requiresConfirmation &&
        memory.kind !== "constraint"
      )
      .map((memory) => memory.subjectLabel ?? memory.subjectId ?? undefined),
  ).slice(0, 24);
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
    equipment,
    updatedAt: updatedAt ? toUtcISOString(updatedAt) : undefined,
  };
}

// queryAgentUserMemory 是精确 memory query 工具的执行层，只消费结构化 filters，不把 snapshot 当作覆盖证明。
async function queryAgentUserMemory(input: {
  userId: string;
  filters: QueryUserMemoryAgentToolInput["filters"];
  limit: number;
  includeValue: boolean;
  memoryQueryId: string;
  client?: UserMemoryClient;
}): Promise<AgentUserMemoryQueryOutput> {
  const client = input.client ?? getPrismaClient();
  const now = new Date();
  const where: Record<string, unknown> = {
    userId: input.userId,
    status: input.filters.status?.length ? { in: input.filters.status } : "active",
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };

  if (input.filters.kind?.length) {
    where.kind = { in: input.filters.kind };
  }
  if (input.filters.subjectType?.length) {
    where.subjectType = { in: input.filters.subjectType };
  }
  if (input.filters.source?.length) {
    where.source = { in: input.filters.source };
  }
  if (input.filters.confirmed !== undefined) {
    where.requiresConfirmation = !input.filters.confirmed;
  }

  const rows = await client.userMemory.findMany({
    where,
    orderBy: [{ requiresConfirmation: "asc" }, { updatedAt: "desc" }],
    take: input.limit,
  });
  const latestMemoryUpdate = rows[0]?.updatedAt;

  return {
    memoryQueryId: input.memoryQueryId,
    matchedFilters: input.filters,
    matchedMemories: rows.map((memory) => ({
      memoryId: memory.id,
      kind: memory.kind,
      subjectType: memory.subjectType,
      subjectId: memory.subjectId ?? undefined,
      subjectLabel: memory.subjectLabel ?? undefined,
      status: memory.status,
      source: memory.source,
      confirmed: !memory.requiresConfirmation,
      updatedAt: memory.updatedAt ? toUtcISOString(memory.updatedAt) : undefined,
      value: input.includeValue ? memory.value : undefined,
    })),
    coverageDiagnostics: {
      matchedCount: rows.length,
      limit: input.limit,
      unverifiable: rows.length === 0,
      snapshotFreshness: latestMemoryUpdate ? toUtcISOString(latestMemoryUpdate) : undefined,
    },
  };
}

function createSuccess<Output>(
  context: AgentToolExecutionContext,
  toolName: AgentReadonlyToolName,
  input: unknown,
  output: Output,
  modelSummary: unknown,
  traceSummary: unknown,
  fulfillment?: Partial<AgentToolResultFulfillment>,
): AgentToolExecutionResult<Output> {
  return {
    ok: true,
    output,
    toolResultId: createStructuredResultId(context, "tool_result", toolName, input),
    modelSummary,
    traceSummary,
    fulfillment: createToolFulfillment(toolName, output, fulfillment),
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

function normalizeAgentSearchExercisesInput(
  input: SearchExercisesAgentToolInput,
  context?: AgentToolExecutionContext,
): ExerciseSearchInput {
  const normalizedAgentInput = applyDefaultNoEquipmentBoundary(input, context);

  return {
    operation: normalizedAgentInput.operation,
    query: normalizedAgentInput.query,
    candidateUse: normalizedAgentInput.candidateUse,
    limit: normalizedAgentInput.limit,
    visibility: normalizedAgentInput.filters?.visibility ?? normalizedAgentInput.visibility,
    filters: normalizedAgentInput.filters,
    resultRequirements: normalizedAgentInput.resultRequirements,
    softPreferences: normalizedAgentInput.softPreferences,
    projection: normalizedAgentInput.projection,
    allowedSections: normalizedAgentInput.filters?.allowedSections ?? normalizedAgentInput.allowedSections,
    bodyRegions: normalizedAgentInput.filters?.bodyRegions ?? normalizedAgentInput.bodyRegions,
    goal: normalizedAgentInput.goal,
    targetMuscles: normalizedAgentInput.filters?.targetMuscles ?? normalizedAgentInput.targetMuscles,
    equipmentRequired: normalizedAgentInput.filters?.equipment?.in ?? normalizedAgentInput.equipmentRequired ?? normalizedAgentInput.equipment,
    equipmentAvoided: normalizedAgentInput.filters?.equipment?.notIn ?? normalizedAgentInput.equipmentAvoided,
    homeRequirements: normalizedAgentInput.filters?.homeRequirements,
    levels: normalizedAgentInput.filters?.levels ?? (normalizedAgentInput.level ? [normalizedAgentInput.level] : undefined),
    difficulty: normalizedAgentInput.filters?.difficulty,
    riskTagsNotIn: normalizedAgentInput.filters?.riskTagsNotIn ?? normalizedAgentInput.excludedRiskTags,
    goalTags: normalizedAgentInput.filters?.goalTags,
    movementPatterns: normalizedAgentInput.filters?.movementPatterns,
    intensityRoles: normalizedAgentInput.filters?.intensityRoles,
    location: normalizedAgentInput.location,
    level: normalizedAgentInput.level,
    sessionMinutes: normalizedAgentInput.sessionMinutes,
    preferences: normalizedAgentInput.preferences,
    avoidances: normalizedAgentInput.avoidances,
    excludedRiskTags: normalizedAgentInput.excludedRiskTags,
    injuryLimitations: normalizedAgentInput.injuryLimitations,
  };
}

function applyDefaultNoEquipmentBoundary(
  input: SearchExercisesAgentToolInput,
  context?: AgentToolExecutionContext,
): SearchExercisesAgentToolInput {
  if (input.candidateUse === "answer_only" || hasExplicitAvailableEquipmentBoundary(input, context)) {
    return input;
  }

  const filters = input.filters ?? {};
  const homeRequirements = mergeUniqueStrings([
    ...(filters.homeRequirements ?? []),
    defaultNoEquipmentHomeRequirement,
  ]);

  return {
    ...input,
    filters: {
      ...filters,
      homeRequirements,
    },
  };
}

// 默认无器械只读取结构化工具输入、记忆快照和已登记 tool result，不读取用户原文。
function hasExplicitAvailableEquipmentBoundary(
  input: SearchExercisesAgentToolInput,
  context?: AgentToolExecutionContext,
) {
  return Boolean(
    hasPositiveEquipmentInput(input) ||
    input.filters?.homeRequirements?.length ||
    hasPositiveEquipmentInContextPackage(context) ||
    hasPositiveEquipmentInToolResults(context?.toolResults ?? []),
  );
}

function hasPositiveEquipmentInput(input: SearchExercisesAgentToolInput) {
  return Boolean(
    input.filters?.equipment?.in?.length ||
    input.equipmentRequired?.length ||
    input.equipment?.length,
  );
}

function hasPositiveEquipmentInContextPackage(context?: AgentToolExecutionContext) {
  return Boolean(
    context?.contextPackage?.memorySnapshot?.equipment?.some((item) => !isNoEquipmentBoundaryText(item)),
  );
}

function hasPositiveEquipmentInToolResults(toolResults: AgentToolResultRecord[]) {
  return toolResults.some((result) => {
    if (result.toolName === "getUserMemory" && isRecord(result.output)) {
      return readStringArrayFromUnknown(result.output.equipment).some((item) => !isNoEquipmentBoundaryText(item));
    }

    if (result.toolName === "queryUserMemory" && isRecord(result.output)) {
      return readPositiveEquipmentMemoryMatches(result.output.matchedMemories).length > 0;
    }

    if (result.toolName !== "searchExercises" || !isRecord(result.output)) {
      return false;
    }

    const evidence = isRecord(result.output.candidateSetEvidence) ? result.output.candidateSetEvidence : undefined;
    const appliedFilters = isRecord(evidence?.appliedFilters) ? evidence.appliedFilters : undefined;

    return readStringArrayFromUnknown(appliedFilters?.equipmentRequired).some((item) => !isNoEquipmentBoundaryText(item)) ||
      readStringArrayFromUnknown(appliedFilters?.homeRequirements)
        .some((value) => !isNoEquipmentBoundaryText(value));
  });
}

function readPositiveEquipmentMemoryMatches(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item) => {
    if (!isRecord(item)) {
      return false;
    }
    return item.subjectType === "equipment" &&
      item.kind !== "constraint" &&
      item.confirmed === true &&
      typeof item.subjectLabel === "string" &&
      item.subjectLabel.trim().length > 0 &&
      !isNoEquipmentBoundaryText(item.subjectLabel);
  });
}

function readStringArrayFromUnknown(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function isNoEquipmentBoundaryText(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
  return ["noequipment", "bodyweight", "none", "自重", "无器械", "徒手"].some((marker) => normalized.includes(marker));
}

function createExerciseCandidateSetEvidence(result: ExerciseSearchResult): AgentExerciseSearchOutput["candidateSetEvidence"] {
  return {
    normalizedQueryInput: result.diagnostics.normalizedQueryInput ?? {
      candidateUse: "answer_only",
      filters: {},
      resultRequirements: {},
      softPreferences: {},
      projection: {},
    },
    appliedFilters: result.diagnostics.appliedFilters ?? {},
    invalidFilters: result.diagnostics.invalidFilters ?? [],
    constraintProof: result.diagnostics.constraintProof ?? [],
    resultRequirementProof: result.diagnostics.resultRequirementProof ?? {},
    diagnostics: {
      queryMode: result.diagnostics.queryMode ?? "none",
      failureReasons: result.diagnostics.failureReasons ?? [],
      unmetResultRequirements: result.diagnostics.unmetResultRequirements ?? [],
      finalExerciseIds: result.diagnostics.finalExerciseIds ?? result.candidates.map((exercise) => exercise.id),
    },
    satisfied: result.diagnostics.satisfied ?? result.candidates.length > 0,
    exerciseIds: result.diagnostics.finalExerciseIds ?? result.candidates.map((exercise) => exercise.id),
    controlledSupplementalCandidates: result.diagnostics.controlledSupplementalCandidates ?? [],
  };
}

function createExerciseSearchRecoveryOptions(result: ExerciseSearchResult) {
  const unmet = result.diagnostics.unmetResultRequirements ?? [];
  const options: Array<{ label: string; message: string }> = [];

  if (unmet.some((item) => item.includes("sectionCoverage.warmup") || item.includes("sectionCoverage.stretch"))) {
    options.push({
      label: "允许无器械补齐",
      message: "可以用无器械热身和拉伸补足这套训练。",
    });
  }

  if (unmet.length > 0) {
    options.push({
      label: "调整条件重查",
      message: "我可以放宽 section 或器械条件后重新筛选候选动作。",
    });
  }

  if (options.length === 0 && result.candidates.length > 0) {
    options.push({
      label: "继续澄清",
      message: "请确认是否接受当前候选集合的限制，我再继续生成训练。",
    });
  }

  return options.slice(0, 3);
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

function createToolFulfillment(
  toolName: AgentReadonlyToolName,
  output: unknown,
  override: Partial<AgentToolResultFulfillment> = {},
): AgentToolResultFulfillment {
  const contract = readonlyToolCapabilityContracts[toolName];
  const producedResources = override.producedResources ?? inferProducedResources(output);

  return {
    operationKind: contract.operationKind,
    operation: override.operation ?? contract.supportedOperations[0],
    satisfied: override.satisfied ?? true,
    producedResources,
    appliedHardConstraints: override.appliedHardConstraints ?? {},
    unmetResultRequirements: override.unmetResultRequirements ?? [],
    evidence: override.evidence ?? inferFulfillmentEvidence(output),
    diagnostics: override.diagnostics ?? {},
  };
}

function inferProducedResources(output: unknown): AgentToolResultFulfillment["producedResources"] {
  const record = isRecord(output) ? output : {};
  const resources: AgentToolResultFulfillment["producedResources"] = [];

  pushResource(resources, "candidate_set", record.candidateSetId);
  pushResource(resources, "artifact_payload", record.artifactPayloadId);
  pushResource(resources, "artifact_reference", record.artifactReferenceId);
  pushResource(resources, "memory_query_result", record.memoryQueryId);
  pushResource(resources, "memory_snapshot", record.snapshotId);

  if (isRecord(record.exercise) && typeof record.exercise.id === "string") {
    pushResource(resources, "exercise_detail", record.exercise.id);
  }

  return resources;
}

function pushResource(
  resources: AgentToolResultFulfillment["producedResources"],
  type: string,
  value: unknown,
) {
  if (typeof value === "string" && value.trim()) {
    resources.push({ type, id: value });
  }
}

function inferFulfillmentEvidence(output: unknown) {
  if (!isRecord(output)) {
    return {};
  }

  return compactObject({
    candidateSetId: output.candidateSetId,
    artifactPayloadId: output.artifactPayloadId,
    artifactReferenceId: output.artifactReferenceId,
    memoryQueryId: output.memoryQueryId,
    snapshotId: output.snapshotId,
    candidateSetEvidence: output.candidateSetEvidence,
    evidence: output.evidence,
  });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compactObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as Partial<T>;
}

function requiresStructuredExecutableCandidateSet(input: SearchExercisesAgentToolInput) {
  return input.candidateUse !== "answer_only";
}

function requiresStructuredExecutableArtifactSet(input: SearchArtifactsAgentToolInput) {
  return input.candidateUse !== "answer_only";
}

function hasStructuredExerciseFilters(input: SearchExercisesAgentToolInput) {
  const filters = input.filters;
  return Boolean(
    filters?.bodyRegions?.length ||
    filters?.allowedSections?.length ||
    filters?.targetMuscles?.length ||
    filters?.equipment?.in?.length ||
    filters?.equipment?.notIn?.length ||
    filters?.homeRequirements?.length ||
    filters?.levels?.length ||
    filters?.difficulty?.length ||
    filters?.riskTagsNotIn?.length ||
    filters?.goalTags?.length ||
    filters?.movementPatterns?.length ||
    filters?.intensityRoles?.length ||
    filters?.visibility ||
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

function requiresRoutineResultRequirements(input: SearchExercisesAgentToolInput) {
  return input.candidateUse === "routine" || input.candidateUse === "plan" || input.candidateUse === "patch";
}

function hasResultRequirements(input: SearchExercisesAgentToolInput) {
  const requirements = input.resultRequirements;
  return Boolean(
    requirements?.minCandidates ||
    requirements?.mustBeUsableFor ||
    requirements?.requireProof ||
    requirements?.requireUnique ||
    Object.keys(requirements?.sectionCoverage ?? {}).length > 0,
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
