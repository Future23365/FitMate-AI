import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import {
  createConversationArtifactRevision,
  createOrUpdateConversationArtifact,
  getActiveArtifactPayload,
} from "@/lib/server/conversation-artifacts/artifact-service";
import { listAllExercises } from "@/lib/server/exercises/exercise-service";
import { isExerciseAllowedInSection, normalizeExerciseMetadata } from "@/lib/shared/exercises/metadata";
import type { Exercise } from "@/lib/shared/exercises/types";
import { exerciseRecommendationCardSchema } from "@/lib/shared/exercise-recommendations/schema";
import { evaluateArtifactPolicy, evaluateWorkoutPatchPolicy } from "@/lib/server/policy-confirmation/policy-engine";
import { expandDomainPlan } from "@/lib/server/workout-plans/domain-plan-engine";
import {
  validateWorkoutPlanDraft,
  validateWorkoutRoutineDraft,
  type WorkoutPlanValidationResult,
} from "@/lib/server/workout-plans/workout-plan-validation-service";
import {
  classifyWorkoutPlanValidationFailure,
  type WorkoutPlanValidationRecovery,
} from "@/lib/server/workout-plans/workout-plan-validation-recovery-service";
import { planStrategySchema } from "@/lib/shared/workout-plans/plan-strategy-schema";
import {
  workoutPlanDraftSchema,
  workoutPlanIntentSchema,
  workoutRoutineDraftSchema,
  workoutRoutineSectionSchema,
  type WorkoutPlanDraft,
  type WorkoutPlanIntent,
  type WorkoutRoutineDraft,
  type WorkoutRoutineSection,
} from "@/lib/shared/workout-plans/draft-schema";
import {
  conversationArtifactKindSchema,
  conversationArtifactPayloadSchema,
} from "@/lib/shared/conversation-artifacts/schema";
import { policyCheckResultSchema } from "@/lib/shared/policy-confirmation/schema";
import { workoutPatchSchema, type WorkoutPatch } from "@/lib/shared/workout-patches/schema";
import {
  createAgentToolRegistry,
  type AgentToolDefinition,
  type AgentToolExecutionContext,
  type AgentToolExecutionResult,
} from "./tool-registry";
import {
  assistantSuggestionSchema,
  workoutEditPlanSchema,
  type AgentToolError,
  type WorkoutEditPlan,
} from "./contracts";
import { createReadonlyAgentToolDefinitions } from "./readonly-tools";

const defaultCandidatePreviewLimit = 12;
const phaseChangeId = "replace-chat-orchestrator-with-tool-first-agent";

// Agent routine 工具复用 WorkoutPlanIntent，但单次编排不应因缺少长期计划字段而中断。
const agentRoutineIntentSchema = z.preprocess(
  applyRoutineIntentContractDefaults,
  workoutPlanIntentSchema.extend({ intentType: z.literal("routine").default("routine") }),
);

export const proposeWorkoutEditPlanAgentToolInputSchema = workoutEditPlanSchema.omit({
  editPlanId: true,
}).extend({
  allowedArtifactPayloadIds: z.array(z.string().trim().min(1)).max(24).default([]),
});

export const generateRoutineDraftAgentToolInputSchema = z.object({
  intent: agentRoutineIntentSchema,
  candidateSetId: z.string().trim().min(1),
  candidateExerciseIds: z.array(z.string().trim().min(1)).min(1).max(80),
  sourceArtifactId: z.string().trim().min(1).optional(),
  requiredExerciseIds: z.array(z.string().trim().min(1)).min(1).max(80).optional(),
  title: z.string().trim().min(1).max(100).optional(),
  sourceEditPlanId: z.string().trim().min(1).optional(),
}).superRefine((input, ctx) => {
  if (input.sourceArtifactId && !input.requiredExerciseIds) {
    ctx.addIssue({
      code: "custom",
      message: "绑定 sourceArtifactId 生成 routine 时必须提供 requiredExerciseIds。",
      path: ["requiredExerciseIds"],
    });
  }
  if (input.requiredExerciseIds && !input.sourceArtifactId) {
    ctx.addIssue({
      code: "custom",
      message: "requiredExerciseIds 必须绑定 sourceArtifactId。",
      path: ["sourceArtifactId"],
    });
  }
});

export const generatePlanDraftAgentToolInputSchema = z.object({
  intent: workoutPlanIntentSchema.extend({ intentType: z.literal("plan").default("plan") }),
  candidateSetId: z.string().trim().min(1),
  candidateExerciseIds: z.array(z.string().trim().min(1)).min(1).max(120),
  strategy: planStrategySchema,
  sourceArtifact: z.object({
    artifactId: z.string().trim().min(1),
    kind: conversationArtifactKindSchema.extract(["routine", "plan"]),
    payload: conversationArtifactPayloadSchema,
  }).optional(),
  sourceEditPlanId: z.string().trim().min(1).optional(),
});

export const proposeWorkoutPatchAgentToolInputSchema = z.object({
  editPlan: workoutEditPlanSchema,
  candidateSetId: z.string().trim().min(1),
  candidateExerciseIds: z.array(z.string().trim().min(1)).min(1).max(120),
  patch: workoutPatchSchema,
});

export const askClarificationAgentToolInputSchema = z.object({
  question: z.string().trim().min(1).max(700),
  blockingReasons: z.array(z.string().trim().min(1).max(240)).max(8).default([]),
  assistantSuggestions: z.array(assistantSuggestionSchema).max(4).default([]),
});

// Validation 工具只接收资源引用；完整 draft 必须来自本轮服务端 tool result。
export const validateRoutineDraftAgentToolInputSchema = z.object({
  draftId: z.string().trim().min(1),
  candidateSetId: z.string().trim().min(1),
  candidateExerciseIds: z.array(z.string().trim().min(1)).min(1).max(120).optional(),
  intent: agentRoutineIntentSchema,
});

export const validatePlanDraftAgentToolInputSchema = z.object({
  draftId: z.string().trim().min(1),
  candidateSetId: z.string().trim().min(1),
  candidateExerciseIds: z.array(z.string().trim().min(1)).min(1).max(160),
  intent: workoutPlanIntentSchema.extend({ intentType: z.literal("plan").default("plan") }),
});

export const validateWorkoutPatchAgentToolInputSchema = z.object({
  patchId: z.string().trim().min(1),
  candidateSetId: z.string().trim().min(1),
  candidateExerciseIds: z.array(z.string().trim().min(1)).min(1).max(120),
  patch: workoutPatchSchema,
});

export const evaluatePolicyAgentToolInputSchema = z.discriminatedUnion("policyTarget", [
  z.object({
    policyTarget: z.literal("workout_patch"),
    patchId: z.string().trim().min(1),
    patch: workoutPatchSchema,
  }),
  z.object({
    policyTarget: z.literal("new_artifact"),
    artifactKind: conversationArtifactKindSchema.extract(["routine", "plan"]),
    draftId: z.string().trim().min(1),
  }),
  z.object({
    policyTarget: z.literal("artifact_revision"),
    sourceArtifactId: z.string().trim().min(1),
    artifactPayloadId: z.string().trim().min(1).optional(),
    draftId: z.string().trim().min(1).optional(),
    patchId: z.string().trim().min(1).optional(),
  }).superRefine((input, ctx) => {
    if (!input.draftId && !input.patchId) {
      ctx.addIssue({
        code: "custom",
        message: "artifact revision policy 必须引用 draftId 或 patchId。",
        path: ["draftId"],
      });
    }
  }),
]);

// optionalAgentInputField 将模型显式输出的 null 视为 absence；必填字段仍由外层 Schema 严格校验。
function optionalAgentInputField<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => value === null ? undefined : value, schema.optional());
}

export const saveConversationArtifactRevisionAgentToolInputSchema = z.object({
  sourceArtifactId: optionalAgentInputField(z.string().trim().min(1)),
  artifactKind: optionalAgentInputField(conversationArtifactKindSchema.extract(["routine", "plan"])),
  payload: optionalAgentInputField(conversationArtifactPayloadSchema),
  candidateSetId: z.string().trim().min(1),
  validationId: z.string().trim().min(1),
  policyDecisionId: z.string().trim().min(1),
  confirmationId: optionalAgentInputField(z.string().trim().min(1)),
  draftId: optionalAgentInputField(z.string().trim().min(1)),
  patchId: optionalAgentInputField(z.string().trim().min(1)),
  validationPassed: z.literal(true),
  policyAllowed: z.literal(true),
  responseMessageId: optionalAgentInputField(z.string().trim().min(1)),
}).superRefine((input, ctx) => {
  if (!input.draftId && !input.patchId) {
    ctx.addIssue({
      code: "custom",
      message: "保存 revision 必须引用 draftId 或 patchId。",
      path: ["draftId"],
    });
  }
  if (!input.draftId && !input.payload) {
    ctx.addIssue({
      code: "custom",
      message: "Patch revision 保存必须提交 payload。",
      path: ["payload"],
    });
  }
  if (!input.sourceArtifactId && !input.artifactKind) {
    ctx.addIssue({
      code: "custom",
      message: "首次创建 artifact 必须提供 artifactKind。",
      path: ["artifactKind"],
    });
  }
  if (!input.sourceArtifactId && input.patchId) {
    ctx.addIssue({
      code: "custom",
      message: "Patch 保存必须引用 sourceArtifactId。",
      path: ["sourceArtifactId"],
    });
  }
});

export type GenerateRoutineDraftAgentToolInput = z.infer<typeof generateRoutineDraftAgentToolInputSchema>;
export type GeneratePlanDraftAgentToolInput = z.infer<typeof generatePlanDraftAgentToolInputSchema>;
export type ProposeWorkoutPatchAgentToolInput = z.infer<typeof proposeWorkoutPatchAgentToolInputSchema>;

export type AgentWorkoutDraftOutput =
  | {
      draftKind: "routine";
      draftId: string;
      candidateSetId: string;
      candidateExerciseIds: string[];
      sourceArtifactId?: string;
      activeSourceArtifactId?: string;
      sourceArtifactRevisionResolution?: {
        status: "direct" | "resolved_to_active";
        requestedArtifactId: string;
        activeArtifactId: string;
      };
      requiredExerciseIds?: string[];
      draft: WorkoutRoutineDraft;
      validation: WorkoutPlanValidationResult;
      recovery: WorkoutPlanValidationRecovery;
    }
  | {
      draftKind: "plan";
      draftId: string;
      candidateSetId: string;
      candidateExerciseIds: string[];
      draft: WorkoutPlanDraft;
      validation: WorkoutPlanValidationResult;
      recovery: WorkoutPlanValidationRecovery;
    };

export type AgentWorkoutPatchOutput = {
  patchId: string;
  candidateSetId: string;
  editPlanId: string;
  patch: WorkoutPatch;
};

export type AgentPolicyEvaluationOutput = {
  policyDecisionId: string;
  policy: z.infer<typeof policyCheckResultSchema>;
  sourceArtifactId?: string;
  artifactKind?: "routine" | "plan";
  draftId?: string;
  patchId?: string;
};

export type AgentArtifactRevisionOutput = {
  revisionId: string;
  artifactId: string;
  sourceArtifactId?: string;
  artifactKind: "routine" | "plan";
  candidateSetId: string;
  validationId: string;
  policyDecisionId: string;
  draftId?: string;
  patchId?: string;
  title?: string;
  summary?: string;
};

export type AgentWorkoutToolName =
  | "proposeWorkoutEditPlan"
  | "generateRoutineDraft"
  | "generatePlanDraft"
  | "proposeWorkoutPatch"
  | "askClarification"
  | "validateRoutineDraft"
  | "validatePlanDraft"
  | "validateWorkoutPatch"
  | "evaluatePolicy"
  | "saveConversationArtifactRevision";

// Phase 3 tools 把训练生成、Patch、校验、Policy 和 revision 保存接入统一 registry，但不切换聊天主链。
export function createWorkoutAgentToolDefinitions(): AgentToolDefinition<unknown, unknown>[] {
  return [
    createProposeWorkoutEditPlanTool(),
    createGenerateRoutineDraftTool(),
    createGeneratePlanDraftTool(),
    createProposeWorkoutPatchTool(),
    createAskClarificationTool(),
    createValidateRoutineDraftTool(),
    createValidatePlanDraftTool(),
    createValidateWorkoutPatchTool(),
    createEvaluatePolicyTool(),
    createSaveConversationArtifactRevisionTool(),
  ] as AgentToolDefinition<unknown, unknown>[];
}

function applyRoutineIntentContractDefaults(value: unknown) {
  if (!isPlainObject(value)) {
    return value;
  }

  return {
    // routine intent 只需要单次编排上下文；缺失 experience 时采用保守 beginner 参数。
    experience: "beginner",
    // weeklyFrequency 属于长期计划合同字段，routine 链路保留默认值用于复用校验模型。
    weeklyFrequency: 1,
    ...value,
    intentType: "routine",
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// createToolFirstAgentToolRegistry 组合只读工具和 Phase 3 受控训练写入前置工具。
export function createToolFirstAgentToolRegistry() {
  return createAgentToolRegistry([
    ...createReadonlyAgentToolDefinitions(),
    ...createWorkoutAgentToolDefinitions(),
  ]);
}

function createProposeWorkoutEditPlanTool(): AgentToolDefinition<z.infer<typeof proposeWorkoutEditPlanAgentToolInputSchema>, WorkoutEditPlan> {
  return {
    name: "proposeWorkoutEditPlan",
    description: "基于已读取 artifact payload 和候选集合提出受控 WorkoutEditPlan。",
    accessLevel: "plan",
    inputSchema: proposeWorkoutEditPlanAgentToolInputSchema,
    dependencies: [
      { kind: "artifact_payload", required: true, description: "必须引用 getArtifactPayload 返回的 sourceArtifactPayloadId。" },
      { kind: "candidate_set", required: false, description: "Patch 或 regenerate 前可引用已查询候选集合。" },
    ],
    getIdempotencyKey: createIdempotencyKey,
    summarizeOutput: summarizeEditPlan,
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute(input, context) {
      const parsedInput = proposeWorkoutEditPlanAgentToolInputSchema.parse(input);
      if (
        parsedInput.allowedArtifactPayloadIds.length > 0 &&
        !parsedInput.allowedArtifactPayloadIds.includes(parsedInput.sourceArtifactPayloadId)
      ) {
        return createFailure("invalid_dependency", "Edit plan referenced an artifact payload outside the allowed boundary.", {
          sourceArtifactPayloadId: parsedInput.sourceArtifactPayloadId,
        });
      }

      const editPlan = workoutEditPlanSchema.parse({
        ...parsedInput,
        editPlanId: createStructuredResultId(context, "edit_plan", "proposeWorkoutEditPlan", parsedInput),
      });
      const summary = summarizeEditPlan(editPlan);

      return createSuccess(context, "proposeWorkoutEditPlan", parsedInput, editPlan, summary, summary);
    },
  };
}

function createGenerateRoutineDraftTool(): AgentToolDefinition<GenerateRoutineDraftAgentToolInput, AgentWorkoutDraftOutput> {
  return {
    name: "generateRoutineDraft",
    description: "使用结构化 intent 和候选集合生成单次 routine 草稿，并执行服务端校验。若基于已有 exercise_recommendation artifact 生成，必须传 sourceArtifactId 与来自该 artifact 的 requiredExerciseIds；服务端会保留全部 required 动作，只补齐缺失必要阶段。",
    accessLevel: "generate",
    inputSchema: generateRoutineDraftAgentToolInputSchema,
    dependencies: [
      { kind: "candidate_set", required: true, description: "必须引用当前 run 的动作候选集合。" },
      { kind: "artifact_payload", required: false, description: "基于已有推荐 artifact 生成时必须绑定可访问的推荐 artifact。" },
    ],
    getIdempotencyKey: createIdempotencyKey,
    summarizeOutput: summarizeDraftOutput,
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute(input, context) {
      const parsedInput = generateRoutineDraftAgentToolInputSchema.parse(input);
      try {
        const requiredBoundary = await resolveRoutineRequiredExerciseBoundary(parsedInput, context);

        if (!requiredBoundary.ok) {
          return requiredBoundary;
        }

        const exercises = await listAllExercises();
        const draftCandidateExerciseIds = requiredBoundary.requiredExerciseIds ?? parsedInput.candidateExerciseIds;
        const buildResult = buildRoutineDraftFromCandidates(parsedInput.intent, draftCandidateExerciseIds, exercises, parsedInput.title);
        const requiredCoverageError = validateRequiredRoutineExerciseCoverage(
          buildResult.candidateExerciseIds,
          requiredBoundary.requiredExerciseIds,
          parsedInput.sourceArtifactId,
        );

        if (requiredCoverageError) {
          return requiredCoverageError;
        }

        const validation = validateWorkoutRoutineDraft(buildResult.draft, parsedInput.intent, {
          exercises,
          candidateExerciseIds: buildResult.candidateExerciseIds,
        });
        const recovery = createValidationRecovery(validation, {
          targetSessionMinutes: parsedInput.intent.sessionMinutes,
        });

        if (!validation.valid) {
          return createFailure("validation_failed", "Generated routine draft did not pass Validator.", {
            errors: validation.errors,
            recovery,
            candidateSetId: parsedInput.candidateSetId,
          });
        }

        const output: AgentWorkoutDraftOutput = {
          draftKind: "routine",
          draftId: createStructuredResultId(context, "draft", "generateRoutineDraft", parsedInput),
          candidateSetId: parsedInput.candidateSetId,
          candidateExerciseIds: buildResult.candidateExerciseIds,
          sourceArtifactId: requiredBoundary.sourceArtifactId,
          activeSourceArtifactId: requiredBoundary.activeSourceArtifactId,
          sourceArtifactRevisionResolution: requiredBoundary.sourceArtifactRevisionResolution,
          requiredExerciseIds: requiredBoundary.requiredExerciseIds,
          draft: buildResult.draft,
          validation,
          recovery,
        };
        const summary = summarizeDraftOutput(output);

        return createSuccess(context, "generateRoutineDraft", parsedInput, output, summary, summary);
      } catch (error) {
        return createFailure("tool_execution_failed", "Failed to generate routine draft.", error);
      }
    },
  };
}

function createGeneratePlanDraftTool(): AgentToolDefinition<z.infer<typeof generatePlanDraftAgentToolInputSchema>, AgentWorkoutDraftOutput> {
  return {
    name: "generatePlanDraft",
    description: "使用 DomainPlanEngine 从结构化策略和来源 artifact 或本轮候选集合展开长期 plan 草稿。",
    accessLevel: "generate",
    inputSchema: generatePlanDraftAgentToolInputSchema,
    dependencies: [
      { kind: "candidate_set", required: true, description: "必须引用当前 run 的动作候选集合。" },
      { kind: "artifact_payload", required: false, description: "基于已有训练生成计划时应引用真实 artifact payload；首次生成可省略。" },
    ],
    getIdempotencyKey: createIdempotencyKey,
    summarizeOutput: summarizeDraftOutput,
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute(input, context) {
      const parsedInput = generatePlanDraftAgentToolInputSchema.parse(input);
      try {
        const exercises = await listAllExercises();
        const sourceArtifact = parsedInput.sourceArtifact ?? createSeedRoutineSourceArtifact({
          intent: parsedInput.intent,
          candidateSetId: parsedInput.candidateSetId,
          candidateExerciseIds: parsedInput.candidateExerciseIds,
          exercises,
        });
        const expanded = expandDomainPlan({
          strategy: parsedInput.strategy,
          sourceArtifact,
        });

        if (!expanded.ok) {
          return createFailure("validation_failed", expanded.message, {
            code: expanded.code,
            strategy: expanded.strategy,
          });
        }

        const validation = validateWorkoutPlanDraft(expanded.draft, parsedInput.intent, {
          exercises,
          candidateExerciseIds: parsedInput.candidateExerciseIds,
        });
        const recovery = createValidationRecovery(validation, {
          targetSessionMinutes: parsedInput.intent.sessionMinutes,
        });

        if (!validation.valid) {
          return createFailure("validation_failed", "Generated plan draft did not pass Validator.", {
            errors: validation.errors,
            recovery,
            candidateSetId: parsedInput.candidateSetId,
          });
        }

        const output: AgentWorkoutDraftOutput = {
          draftKind: "plan",
          draftId: createStructuredResultId(context, "draft", "generatePlanDraft", parsedInput),
          candidateSetId: parsedInput.candidateSetId,
          candidateExerciseIds: parsedInput.candidateExerciseIds,
          draft: expanded.draft,
          validation,
          recovery,
        };
        const summary = summarizeDraftOutput(output);

        return createSuccess(context, "generatePlanDraft", parsedInput, output, summary, summary);
      } catch (error) {
        return createFailure("tool_execution_failed", "Failed to generate plan draft.", error);
      }
    },
  };
}

function createProposeWorkoutPatchTool(): AgentToolDefinition<ProposeWorkoutPatchAgentToolInput, AgentWorkoutPatchOutput> {
  return {
    name: "proposeWorkoutPatch",
    description: "校验 WorkoutEditPlan 与候选集合后登记结构化 WorkoutPatch。",
    accessLevel: "plan",
    inputSchema: proposeWorkoutPatchAgentToolInputSchema,
    dependencies: [
      { kind: "workout_edit_plan", required: true, description: "Patch 必须引用已登记 WorkoutEditPlan。" },
      { kind: "candidate_set", required: true, description: "replacementExerciseId 必须来自当前候选集合。" },
    ],
    getIdempotencyKey: createIdempotencyKey,
    summarizeOutput: summarizePatchOutput,
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute(input, context) {
      const parsedInput = proposeWorkoutPatchAgentToolInputSchema.parse(input);
      const dependencyError = validatePatchDependencies(parsedInput);
      if (dependencyError) {
        return dependencyError;
      }

      const output: AgentWorkoutPatchOutput = {
        patchId: createStructuredResultId(context, "patch", "proposeWorkoutPatch", parsedInput),
        candidateSetId: parsedInput.candidateSetId,
        editPlanId: parsedInput.editPlan.editPlanId,
        patch: parsedInput.patch,
      };
      const summary = summarizePatchOutput(output);

      return createSuccess(context, "proposeWorkoutPatch", parsedInput, output, summary, summary);
    },
  };
}

function createAskClarificationTool(): AgentToolDefinition<z.infer<typeof askClarificationAgentToolInputSchema>, z.infer<typeof askClarificationAgentToolInputSchema>> {
  return {
    name: "askClarification",
    description: "在缺少目标 artifact、动作、候选集合或用户约束时返回澄清问题。",
    accessLevel: "clarify",
    inputSchema: askClarificationAgentToolInputSchema,
    dependencies: [],
    getIdempotencyKey: createIdempotencyKey,
    summarizeOutput(output) {
      return output;
    },
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute(input, context) {
      const output = askClarificationAgentToolInputSchema.parse(input);

      return createSuccess(context, "askClarification", output, output, output, output);
    },
  };
}

function createValidateRoutineDraftTool(): AgentToolDefinition<z.infer<typeof validateRoutineDraftAgentToolInputSchema>, WorkoutPlanValidationResult & { validationId: string; recovery: WorkoutPlanValidationRecovery }> {
  return {
    name: "validateRoutineDraft",
    description: "使用 Validator 校验 routine draft、candidateSetId 和动作库边界。",
    accessLevel: "validate",
    inputSchema: validateRoutineDraftAgentToolInputSchema,
    dependencies: [
      { kind: "draft", required: true, description: "必须引用已生成 routine draft。" },
      { kind: "candidate_set", required: true, description: "必须引用生成 draft 使用的候选集合。" },
    ],
    getIdempotencyKey: createIdempotencyKey,
    summarizeOutput: summarizeValidationOutput,
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute(input, context) {
      const parsedInput = validateRoutineDraftAgentToolInputSchema.parse(input);
      const draftResource = resolveRoutineDraftResource(context, parsedInput.draftId);

      if (!draftResource.ok) {
        return draftResource;
      }

      if (draftResource.output.candidateSetId !== parsedInput.candidateSetId) {
        return createFailure("invalid_dependency", "Routine draft candidateSetId does not match validation input.", {
          draftId: parsedInput.draftId,
          draftCandidateSetId: draftResource.output.candidateSetId,
          inputCandidateSetId: parsedInput.candidateSetId,
        });
      }

      const exercises = await listAllExercises();
      const validation = validateWorkoutRoutineDraft(draftResource.output.draft, parsedInput.intent, {
        exercises,
        candidateExerciseIds: draftResource.output.candidateExerciseIds,
      });
      const output = {
        ...validation,
        validationId: createStructuredResultId(context, "validation", "validateRoutineDraft", parsedInput),
        draftId: parsedInput.draftId,
        candidateSetId: parsedInput.candidateSetId,
        recovery: createValidationRecovery(validation, {
          targetSessionMinutes: parsedInput.intent.sessionMinutes,
        }),
      };
      const summary = summarizeValidationOutput(output);

      return createSuccess(context, "validateRoutineDraft", parsedInput, output, summary, summary);
    },
  };
}

function createValidatePlanDraftTool(): AgentToolDefinition<z.infer<typeof validatePlanDraftAgentToolInputSchema>, WorkoutPlanValidationResult & { validationId: string; recovery: WorkoutPlanValidationRecovery }> {
  return {
    name: "validatePlanDraft",
    description: "使用 Validator 校验 plan draft、candidateSetId 和动作库边界。",
    accessLevel: "validate",
    inputSchema: validatePlanDraftAgentToolInputSchema,
    dependencies: [
      { kind: "draft", required: true, description: "必须引用已生成 plan draft。" },
      { kind: "candidate_set", required: true, description: "必须引用生成 draft 使用的候选集合。" },
    ],
    getIdempotencyKey: createIdempotencyKey,
    summarizeOutput: summarizeValidationOutput,
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute(input, context) {
      const parsedInput = validatePlanDraftAgentToolInputSchema.parse(input);
      const draftResource = resolvePlanDraftResource(context, parsedInput.draftId);

      if (!draftResource.ok) {
        return draftResource;
      }

      if (draftResource.output.candidateSetId !== parsedInput.candidateSetId) {
        return createFailure("invalid_dependency", "Plan draft candidateSetId does not match validation input.", {
          draftId: parsedInput.draftId,
          draftCandidateSetId: draftResource.output.candidateSetId,
          inputCandidateSetId: parsedInput.candidateSetId,
        });
      }

      const exercises = await listAllExercises();
      const validation = validateWorkoutPlanDraft(draftResource.output.draft, parsedInput.intent, {
        exercises,
        candidateExerciseIds: draftResource.output.candidateExerciseIds,
      });
      const output = {
        ...validation,
        validationId: createStructuredResultId(context, "validation", "validatePlanDraft", parsedInput),
        draftId: parsedInput.draftId,
        candidateSetId: parsedInput.candidateSetId,
        recovery: createValidationRecovery(validation, {
          targetSessionMinutes: parsedInput.intent.sessionMinutes,
        }),
      };
      const summary = summarizeValidationOutput(output);

      return createSuccess(context, "validatePlanDraft", parsedInput, output, summary, summary);
    },
  };
}

function createValidateWorkoutPatchTool(): AgentToolDefinition<z.infer<typeof validateWorkoutPatchAgentToolInputSchema>, {
  validationId: string;
  valid: boolean;
  errors: string[];
  candidateSetId: string;
  patchId: string;
}> {
  return {
    name: "validateWorkoutPatch",
    description: "校验 WorkoutPatch schema、target 和 replacementExerciseId 候选集合边界。",
    accessLevel: "validate",
    inputSchema: validateWorkoutPatchAgentToolInputSchema,
    dependencies: [
      { kind: "patch", required: true, description: "必须引用已登记 Patch。" },
      { kind: "candidate_set", required: true, description: "replacementExerciseId 必须来自候选集合。" },
    ],
    getIdempotencyKey: createIdempotencyKey,
    summarizeOutput(output) {
      return output;
    },
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute(input, context) {
      const parsedInput = validateWorkoutPatchAgentToolInputSchema.parse(input);
      const errors = collectPatchCandidateErrors(parsedInput.patch, parsedInput.candidateExerciseIds);
      const output = {
        validationId: createStructuredResultId(context, "validation", "validateWorkoutPatch", parsedInput),
        valid: errors.length === 0,
        errors,
        candidateSetId: parsedInput.candidateSetId,
        patchId: parsedInput.patchId,
      };

      return createSuccess(context, "validateWorkoutPatch", parsedInput, output, output, output);
    },
  };
}

function createEvaluatePolicyTool(): AgentToolDefinition<z.infer<typeof evaluatePolicyAgentToolInputSchema>, AgentPolicyEvaluationOutput> {
  return {
    name: "evaluatePolicy",
    description: "对训练 Patch 或 artifact revision 写入前置执行 PolicyEngine，并返回 policyDecisionId。",
    accessLevel: "validate",
    inputSchema: evaluatePolicyAgentToolInputSchema,
    dependencies: [
      { kind: "patch", required: false, description: "Patch policy 必须引用已登记 Patch。" },
      { kind: "draft", required: false, description: "生成结果保存前可引用已登记 draft。" },
      { kind: "artifact_payload", required: false, description: "修订已有 artifact 时可引用已读取 payload。" },
    ],
    getIdempotencyKey: createIdempotencyKey,
    summarizeOutput(output) {
      return {
        policyDecisionId: output.policyDecisionId,
        allowed: output.policy.allowed,
        requiresConfirmation: output.policy.requiresConfirmation,
        safeScope: output.policy.safeScope,
        blockedReasons: output.policy.blockedReasons,
      };
    },
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute(input, context) {
      const parsedInput = evaluatePolicyAgentToolInputSchema.parse(input);
      const policy = parsedInput.policyTarget === "workout_patch"
        ? evaluateWorkoutPatchPolicy({
            userId: context.userId,
            patch: parsedInput.patch,
            targetIds: [parsedInput.patch.target.artifactId],
          })
        : parsedInput.policyTarget === "new_artifact"
          ? evaluateArtifactPolicy({
              userId: context.userId,
              artifact: {
                id: parsedInput.draftId,
                userId: context.userId,
                status: "active",
                revision: 1,
              },
            })
          : evaluateArtifactPolicy({
            userId: context.userId,
            artifact: {
              id: parsedInput.sourceArtifactId,
              userId: context.userId,
              status: "active",
              revision: 1,
            },
          });
      const output = {
        policyDecisionId: createStructuredResultId(context, "policy_decision", "evaluatePolicy", parsedInput),
        policy,
        sourceArtifactId: "sourceArtifactId" in parsedInput ? parsedInput.sourceArtifactId : undefined,
        artifactKind: "artifactKind" in parsedInput ? parsedInput.artifactKind : undefined,
        draftId: "draftId" in parsedInput ? parsedInput.draftId : undefined,
        patchId: "patchId" in parsedInput ? parsedInput.patchId : undefined,
      };
      const summary = this.summarizeOutput(output);

      return createSuccess(context, "evaluatePolicy", parsedInput, output, summary, summary);
    },
  };
}

function createSaveConversationArtifactRevisionTool(): AgentToolDefinition<z.infer<typeof saveConversationArtifactRevisionAgentToolInputSchema>, AgentArtifactRevisionOutput> {
  return {
    name: "saveConversationArtifactRevision",
    description: "保存已通过 Validator 和 Policy 的新 ConversationArtifact 或 artifact revision。",
    accessLevel: "write",
    inputSchema: saveConversationArtifactRevisionAgentToolInputSchema,
    dependencies: [
      { kind: "draft", required: false, description: "生成结果保存时必须引用 draftId。" },
      { kind: "patch", required: false, description: "Patch 结果保存时必须引用 patchId。" },
      { kind: "candidate_set", required: true, description: "必须引用生成或 Patch 使用的候选集合。" },
      { kind: "validation", required: true, description: "必须引用通过的 validationId。" },
      { kind: "policy_decision", required: true, description: "必须引用允许写入的 policyDecisionId。" },
      { kind: "confirmation", required: false, description: "高影响写入必须引用 confirmationId。" },
    ],
    domainCapability: {
      openspecChange: phaseChangeId,
      capabilityId: "conversation-artifact-revision-write",
      writableResources: ["ConversationArtifact"],
      fieldWhitelist: ["payload", "status", "revision", "revisionOfArtifactId", "messageId"],
      permissionScope: "current_user_current_session",
      confirmationPolicy: "policy_driven",
      persistenceService: "ConversationArtifactService.createConversationArtifactRevision",
      responseWriterSafeSummary: "只暴露 revisionId、artifactId、标题、摘要和必要 tool result id。",
    },
    getIdempotencyKey: createIdempotencyKey,
    summarizeOutput(output) {
      return output;
    },
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    summarizeForResponseWriter(output) {
      return {
        revisionId: output.revisionId,
        artifactId: output.artifactId,
        title: output.title,
        summary: output.summary,
      };
    },
    async execute(input, context) {
      const parsedInput = saveConversationArtifactRevisionAgentToolInputSchema.parse(input);
      try {
        const payloadResult = resolveArtifactRevisionPayload(context, parsedInput);

        if (!payloadResult.ok) {
          return payloadResult;
        }

        const payloadSummary = summarizeArtifactPayload(payloadResult.payload);
        const artifactKind = resolveArtifactKindForSave(parsedInput, payloadResult.payload);

        if (!artifactKind.ok) {
          return artifactKind;
        }

        let output: AgentArtifactRevisionOutput;

        if (parsedInput.sourceArtifactId) {
          const revision = await createConversationArtifactRevision({
            userId: context.userId,
            sourceArtifactId: parsedInput.sourceArtifactId,
            messageId: parsedInput.responseMessageId,
            payload: payloadResult.payload,
          });

          if (!revision.ok) {
            return createFailure("persistence_failed", revision.message, revision);
          }

          output = {
            revisionId: revision.artifact.id,
            artifactId: revision.artifact.id,
            sourceArtifactId: parsedInput.sourceArtifactId,
            artifactKind: artifactKind.kind,
            candidateSetId: parsedInput.candidateSetId,
            validationId: parsedInput.validationId,
            policyDecisionId: parsedInput.policyDecisionId,
            draftId: parsedInput.draftId,
            patchId: parsedInput.patchId,
            title: payloadSummary.title,
            summary: payloadSummary.summary,
          };
        } else {
          const artifact = await createOrUpdateConversationArtifact({
            userId: context.userId,
            sessionId: context.sessionId,
            messageId: parsedInput.responseMessageId,
            kind: artifactKind.kind,
            payload: payloadResult.payload,
          });

          output = {
            revisionId: artifact.id,
            artifactId: artifact.id,
            artifactKind: artifactKind.kind,
            candidateSetId: parsedInput.candidateSetId,
            validationId: parsedInput.validationId,
            policyDecisionId: parsedInput.policyDecisionId,
            draftId: parsedInput.draftId,
            patchId: parsedInput.patchId,
            title: payloadSummary.title,
            summary: payloadSummary.summary,
          };
        }
        const summary = this.summarizeOutput(output);

        return createSuccess(context, "saveConversationArtifactRevision", parsedInput, output, summary, summary);
      } catch (error) {
        return createFailure("persistence_failed", "Failed to save conversation artifact revision.", error);
      }
    },
  };
}

type SaveConversationArtifactRevisionAgentToolInput = z.infer<typeof saveConversationArtifactRevisionAgentToolInputSchema>;
type AgentToolFailure = {
  ok: false;
  error: AgentToolError;
  traceSummary?: unknown;
};
type AgentValidationResourceOutput = WorkoutPlanValidationResult & {
  validationId: string;
  recovery?: WorkoutPlanValidationRecovery;
  draftId?: string;
  candidateSetId?: string;
};

type RoutineRequiredExerciseBoundary =
  | {
      ok: true;
      sourceArtifactId?: string;
      activeSourceArtifactId?: string;
      sourceArtifactRevisionResolution?: {
        status: "direct" | "resolved_to_active";
        requestedArtifactId: string;
        activeArtifactId: string;
      };
      requiredExerciseIds?: string[];
    }
  | AgentToolFailure;

// Artifact-bound routine 生成只接受结构化 artifact 来源；这里不读取用户原文做语义判断。
async function resolveRoutineRequiredExerciseBoundary(
  input: GenerateRoutineDraftAgentToolInput,
  context: AgentToolExecutionContext,
): Promise<RoutineRequiredExerciseBoundary> {
  if (!input.sourceArtifactId && !input.requiredExerciseIds) {
    return { ok: true };
  }

  if (!input.sourceArtifactId || !input.requiredExerciseIds) {
    return createFailure("schema_validation_failed", "Artifact-bound routine generation requires both sourceArtifactId and requiredExerciseIds.", {
      sourceArtifactId: input.sourceArtifactId,
      requiredExerciseIds: input.requiredExerciseIds,
    });
  }

  const payloadResult = await getActiveArtifactPayload({
    userId: context.userId,
    artifactId: input.sourceArtifactId,
  });

  if (!payloadResult.ok) {
    return createFailure("forbidden", "Source artifact is not accessible for routine generation.", {
      sourceArtifactId: input.sourceArtifactId,
      failure: payloadResult,
    });
  }

  if (payloadResult.kind !== "exercise_recommendation") {
    return createFailure("invalid_dependency", "Artifact-bound routine generation requires an exercise_recommendation source artifact.", {
      sourceArtifactId: input.sourceArtifactId,
      artifactKind: payloadResult.kind,
    });
  }

  const recommendation = exerciseRecommendationCardSchema.parse(payloadResult.payload);
  const artifactExerciseIds = new Set(recommendation.items.map((item) => item.exerciseId));
  const requiredExerciseIds = uniqueStrings(input.requiredExerciseIds);
  const outsideArtifactIds = requiredExerciseIds.filter((exerciseId) => !artifactExerciseIds.has(exerciseId));

  if (outsideArtifactIds.length > 0) {
    return createFailure("invalid_dependency", "Required routine exercises must come from the source recommendation artifact.", {
      sourceArtifactId: input.sourceArtifactId,
      outsideArtifactIds,
      artifactExerciseIds: Array.from(artifactExerciseIds),
    });
  }

  return {
    ok: true,
    sourceArtifactId: input.sourceArtifactId,
    activeSourceArtifactId: payloadResult.revisionResolution.activeArtifactId,
    sourceArtifactRevisionResolution: payloadResult.revisionResolution,
    requiredExerciseIds,
  };
}

// 服务端只校验结构化 required id 是否被 draft 覆盖，不判断用户自然语言是否真正指向了该 artifact。
function validateRequiredRoutineExerciseCoverage(
  candidateExerciseIds: string[],
  requiredExerciseIds: string[] | undefined,
  sourceArtifactId: string | undefined,
): AgentToolFailure | null {
  if (!requiredExerciseIds || requiredExerciseIds.length === 0) {
    return null;
  }

  const candidateSet = new Set(candidateExerciseIds);
  const missingRequiredExerciseIds = requiredExerciseIds.filter((exerciseId) => !candidateSet.has(exerciseId));

  if (missingRequiredExerciseIds.length === 0) {
    return null;
  }

  return createFailure("invalid_dependency", "Routine draft did not preserve all required exercises from the source artifact.", {
    sourceArtifactId,
    missingRequiredExerciseIds,
  });
}

// Agent 后续工具只拿资源 id；完整 draft / validation / policy 必须从本轮服务端 tool result 中解析。
function resolveArtifactRevisionPayload(
  context: AgentToolExecutionContext,
  input: SaveConversationArtifactRevisionAgentToolInput,
): { ok: true; payload: z.infer<typeof conversationArtifactPayloadSchema> } | AgentToolFailure {
  let payload = input.payload;

  if (input.draftId) {
    const draftResource = resolveDraftResource(context, input.draftId);

    if (!draftResource.ok) {
      return draftResource;
    }

    if (draftResource.output.candidateSetId !== input.candidateSetId) {
      return createFailure("invalid_dependency", "Draft candidateSetId does not match artifact revision input.", {
        draftId: input.draftId,
        draftCandidateSetId: draftResource.output.candidateSetId,
        inputCandidateSetId: input.candidateSetId,
      });
    }

    payload = draftResource.output.draft;
  }

  if (!payload) {
    return createFailure("schema_validation_failed", "Artifact revision payload is required when no draftId can provide one.", {
      draftId: input.draftId,
      patchId: input.patchId,
    });
  }

  const validationResource = resolveValidationResource(context, input.validationId);

  if (!validationResource.ok) {
    return validationResource;
  }

  if (!validationResource.output.valid) {
    return createFailure("invalid_dependency", "Artifact revision cannot be saved with a failed validation result.", {
      validationId: input.validationId,
      errors: validationResource.output.errors.map((issue) => issue.code),
    });
  }

  if (validationResource.output.candidateSetId && validationResource.output.candidateSetId !== input.candidateSetId) {
    return createFailure("invalid_dependency", "Validation candidateSetId does not match artifact revision input.", {
      validationId: input.validationId,
      validationCandidateSetId: validationResource.output.candidateSetId,
      inputCandidateSetId: input.candidateSetId,
    });
  }

  if (input.draftId && validationResource.output.draftId && validationResource.output.draftId !== input.draftId) {
    return createFailure("invalid_dependency", "Validation draftId does not match artifact revision input.", {
      validationId: input.validationId,
      validationDraftId: validationResource.output.draftId,
      inputDraftId: input.draftId,
    });
  }

  const policyResource = resolvePolicyResource(context, input.policyDecisionId);

  if (!policyResource.ok) {
    return policyResource;
  }

  if (!policyResource.output.policy.allowed) {
    return createFailure("policy_blocked", "Policy decision does not allow artifact revision persistence.", {
      policyDecisionId: input.policyDecisionId,
      blockedReasons: policyResource.output.policy.blockedReasons,
    });
  }

  if (policyResource.output.sourceArtifactId && policyResource.output.sourceArtifactId !== input.sourceArtifactId) {
    return createFailure("invalid_dependency", "Policy sourceArtifactId does not match artifact revision input.", {
      policyDecisionId: input.policyDecisionId,
      policySourceArtifactId: policyResource.output.sourceArtifactId,
      inputSourceArtifactId: input.sourceArtifactId,
    });
  }

  if (input.draftId && policyResource.output.draftId && policyResource.output.draftId !== input.draftId) {
    return createFailure("invalid_dependency", "Policy draftId does not match artifact revision input.", {
      policyDecisionId: input.policyDecisionId,
      policyDraftId: policyResource.output.draftId,
      inputDraftId: input.draftId,
    });
  }

  return { ok: true, payload };
}

function resolveArtifactKindForSave(
  input: SaveConversationArtifactRevisionAgentToolInput,
  payload: z.infer<typeof conversationArtifactPayloadSchema>,
): { ok: true; kind: "routine" | "plan" } | AgentToolFailure {
  const payloadKind = "kind" in payload && (payload.kind === "routine" || payload.kind === "plan") ? payload.kind : undefined;
  const artifactKind = input.artifactKind ?? payloadKind;

  if (!artifactKind) {
    return createFailure("schema_validation_failed", "Artifact kind is required for non-routine and non-plan payloads.", {
      payloadKind,
    });
  }

  if (payloadKind && payloadKind !== artifactKind) {
    return createFailure("schema_validation_failed", "Artifact kind does not match payload kind.", {
      artifactKind,
      payloadKind,
    });
  }

  return { ok: true, kind: artifactKind };
}

function resolveRoutineDraftResource(
  context: AgentToolExecutionContext,
  draftId: string,
): { ok: true; output: Extract<AgentWorkoutDraftOutput, { draftKind: "routine" }> } | AgentToolFailure {
  const draftResource = resolveDraftResource(context, draftId);

  if (!draftResource.ok) {
    return draftResource;
  }

  if (draftResource.output.draftKind !== "routine") {
    return createFailure("invalid_dependency", "Referenced draft is not a routine draft.", {
      draftId,
      draftKind: draftResource.output.draftKind,
    });
  }

  return { ok: true, output: draftResource.output };
}

function resolvePlanDraftResource(
  context: AgentToolExecutionContext,
  draftId: string,
): { ok: true; output: Extract<AgentWorkoutDraftOutput, { draftKind: "plan" }> } | AgentToolFailure {
  const draftResource = resolveDraftResource(context, draftId);

  if (!draftResource.ok) {
    return draftResource;
  }

  if (draftResource.output.draftKind !== "plan") {
    return createFailure("invalid_dependency", "Referenced draft is not a plan draft.", {
      draftId,
      draftKind: draftResource.output.draftKind,
    });
  }

  return { ok: true, output: draftResource.output };
}

function resolveDraftResource(
  context: AgentToolExecutionContext,
  draftId: string,
): { ok: true; output: AgentWorkoutDraftOutput } | AgentToolFailure {
  const result = context.toolResults?.find((toolResult) => toolResult.draftId === draftId);

  if (!result) {
    return createFailure("invalid_dependency", "Referenced draftId was not produced in this Agent run.", { draftId });
  }

  if (!isAgentWorkoutDraftOutput(result.output) || result.output.draftId !== draftId) {
    return createFailure("invalid_dependency", "Referenced draftId does not resolve to a draft tool output.", {
      draftId,
      toolName: result.toolName,
    });
  }

  return { ok: true, output: result.output };
}

function resolveValidationResource(
  context: AgentToolExecutionContext,
  validationId: string,
): { ok: true; output: AgentValidationResourceOutput } | AgentToolFailure {
  const result = context.toolResults?.find((toolResult) => toolResult.validationId === validationId);

  if (!result) {
    return createFailure("invalid_dependency", "Referenced validationId was not produced in this Agent run.", { validationId });
  }

  if (!isValidationResourceOutput(result.output) || result.output.validationId !== validationId) {
    return createFailure("invalid_dependency", "Referenced validationId does not resolve to a validation tool output.", {
      validationId,
      toolName: result.toolName,
    });
  }

  return { ok: true, output: result.output };
}

function resolvePolicyResource(
  context: AgentToolExecutionContext,
  policyDecisionId: string,
): { ok: true; output: AgentPolicyEvaluationOutput } | AgentToolFailure {
  const result = context.toolResults?.find((toolResult) => toolResult.policyDecisionId === policyDecisionId);

  if (!result) {
    return createFailure("invalid_dependency", "Referenced policyDecisionId was not produced in this Agent run.", { policyDecisionId });
  }

  if (!isPolicyEvaluationOutput(result.output) || result.output.policyDecisionId !== policyDecisionId) {
    return createFailure("invalid_dependency", "Referenced policyDecisionId does not resolve to a policy tool output.", {
      policyDecisionId,
      toolName: result.toolName,
    });
  }

  return { ok: true, output: result.output };
}

function isAgentWorkoutDraftOutput(output: unknown): output is AgentWorkoutDraftOutput {
  if (!isRecord(output) || typeof output.draftId !== "string" || typeof output.candidateSetId !== "string" || !Array.isArray(output.candidateExerciseIds)) {
    return false;
  }

  if (output.draftKind === "routine") {
    return workoutRoutineDraftSchema.safeParse(output.draft).success;
  }

  if (output.draftKind === "plan") {
    return workoutPlanDraftSchema.safeParse(output.draft).success;
  }

  return false;
}

function isValidationResourceOutput(output: unknown): output is AgentValidationResourceOutput {
  if (!isRecord(output) || typeof output.validationId !== "string" || typeof output.valid !== "boolean") {
    return false;
  }

  return Array.isArray(output.errors) && Array.isArray(output.warnings) && Array.isArray(output.exerciseIds);
}

function isPolicyEvaluationOutput(output: unknown): output is AgentPolicyEvaluationOutput {
  if (!isRecord(output) || typeof output.policyDecisionId !== "string") {
    return false;
  }

  return policyCheckResultSchema.safeParse(output.policy).success;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createSeedRoutineSourceArtifact(input: {
  intent: WorkoutPlanIntent;
  candidateSetId: string;
  candidateExerciseIds: string[];
  exercises: Exercise[];
}): {
  artifactId: string;
  kind: "routine";
  payload: WorkoutRoutineDraft;
} {
  return {
    artifactId: `candidate_seed_${input.candidateSetId}`,
    kind: "routine",
    payload: scaleSeedRoutineDraftToSessionMinutes(
      buildRoutineDraftFromCandidates(
        { ...input.intent, intentType: "routine" },
        input.candidateExerciseIds,
        input.exercises,
        `${input.intent.goal}计划种子训练`,
      ).draft,
      input.intent.sessionMinutes,
    ),
  };
}

function scaleSeedRoutineDraftToSessionMinutes(
  draft: WorkoutRoutineDraft,
  sessionMinutes: number,
): WorkoutRoutineDraft {
  const warmupSeconds = Math.min(Math.max(Math.round(sessionMinutes * 60 * 0.12), 90), 240);
  const stretchSeconds = Math.min(Math.max(Math.round(sessionMinutes * 60 * 0.1), 90), 240);
  const trainingItems = draft.sections.find((section) => section.section === "training")?.items.length ?? 1;
  const trainingSets = sessionMinutes >= 45 ? 4 : 3;
  const trainingRestSeconds = sessionMinutes >= 30 ? 60 : 45;
  const transitionSeconds = 30;
  const nonTrainingSeconds = warmupSeconds + stretchSeconds + transitionSeconds * 2;
  const availableTrainingSeconds = Math.max(sessionMinutes * 60 - nonTrainingSeconds, trainingItems * trainingSets * 30);
  const targetSeconds = Math.min(600, Math.max(30, Math.round(availableTrainingSeconds / Math.max(1, trainingItems * trainingSets))));

  return workoutRoutineDraftSchema.parse({
    ...draft,
    sections: draft.sections.map((section) => {
      if (section.section === "warmup" || section.section === "stretch") {
        return {
          ...section,
          items: section.items.map((item) => ({
            ...item,
            mode: "duration" as const,
            sets: 1,
            target: section.section === "warmup" ? warmupSeconds : stretchSeconds,
            setRestSeconds: 0,
            transitionRestSeconds: section.section === "warmup" ? transitionSeconds : 0,
          })),
        };
      }

      return {
        ...section,
        items: section.items.map((item) => ({
          ...item,
          mode: "duration" as const,
          sets: trainingSets,
          target: targetSeconds,
          setRestSeconds: trainingRestSeconds,
          transitionRestSeconds: transitionSeconds,
        })),
      };
    }),
  });
}

function buildRoutineDraftFromCandidates(
  intent: WorkoutPlanIntent,
  candidateExerciseIds: string[],
  exercises: Exercise[],
  title: string | undefined,
): { draft: WorkoutRoutineDraft; candidateExerciseIds: string[] } {
  const routineBuckets = buildRoutineSectionBuckets(intent, candidateExerciseIds, exercises);
  const sections = (["warmup", "training", "stretch"] as const).map((section) => {
    const sectionExercises = routineBuckets.sections[section];

    return {
      section,
      title: formatSectionTitle(section),
      items: sectionExercises.map((exercise) => buildRoutineItem(exercise, section, intent)),
    };
  });

  return {
    draft: workoutRoutineDraftSchema.parse({
      kind: "routine",
      title: title ?? `${intent.goal}单次训练`,
      goal: intent.goal,
      summary: `基于 ${routineBuckets.candidateExerciseIds.length} 个受控候选动作生成，展示或保存前仍需 Validator 与 Policy 结果。`,
      estimatedSessionMinutes: intent.sessionMinutes,
      trainingLoopRounds: intent.experience === "beginner" ? 2 : 3,
      trainingLoopRestSeconds: intent.experience === "beginner" ? 90 : 75,
      sections,
      safetyNotes: [
        "动作均来自当前候选集合；如出现疼痛或明显不适，请停止并调整。",
      ],
    }),
    candidateExerciseIds: routineBuckets.candidateExerciseIds,
  };
}

// Routine 生成器以模型传入候选为必须保留集合，缺失阶段才从动作库做受控补齐。
function buildRoutineSectionBuckets(
  intent: WorkoutPlanIntent,
  candidateExerciseIds: string[],
  exercises: Exercise[],
) {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const uniqueCandidateIds = uniqueStrings(candidateExerciseIds);
  const selectedExerciseIds = new Set<string>();
  const sections: Record<WorkoutRoutineSection, Exercise[]> = {
    warmup: [],
    training: [],
    stretch: [],
  };

  for (const exerciseId of uniqueCandidateIds) {
    const exercise = exerciseById.get(exerciseId);

    if (!exercise) {
      throw new Error(`candidate_set_missing_exercise:${exerciseId}`);
    }

    const section = selectRoutineSectionForRequiredExercise(exercise);
    sections[section].push(exercise);
    selectedExerciseIds.add(exercise.id);
  }

  for (const section of ["warmup", "training", "stretch"] as const) {
    if (sections[section].length > 0) {
      continue;
    }

    const supplementalExercise = pickSupplementalExerciseForSection(exercises, selectedExerciseIds, section, intent);
    if (!supplementalExercise) {
      throw new Error(`candidate_set_missing_${section}`);
    }

    sections[section].push(supplementalExercise);
    selectedExerciseIds.add(supplementalExercise.id);
  }

  return {
    sections,
    candidateExerciseIds: Array.from(selectedExerciseIds),
  };
}

function selectRoutineSectionForRequiredExercise(exercise: Exercise): WorkoutRoutineSection {
  const metadata = normalizeExerciseMetadata(exercise);

  if (metadata.intensityRole === "recovery" && metadata.allowedSections.includes("stretch")) {
    return "stretch";
  }

  if (metadata.intensityRole === "activation" && metadata.allowedSections.includes("warmup")) {
    return "warmup";
  }

  if (metadata.allowedSections.includes("training")) {
    return "training";
  }

  if (metadata.allowedSections.includes("warmup")) {
    return "warmup";
  }

  if (metadata.allowedSections.includes("stretch")) {
    return "stretch";
  }

  return "training";
}

function pickSupplementalExerciseForSection(
  exercises: Exercise[],
  selectedExerciseIds: Set<string>,
  section: WorkoutRoutineSection,
  intent: WorkoutPlanIntent,
) {
  const eligibleExercises = exercises
    .filter((exercise) => !selectedExerciseIds.has(exercise.id))
    .filter((exercise) => isExerciseAllowedInSection(exercise, section));

  const equipmentMatched = eligibleExercises.find((exercise) => exerciseMatchesIntentEquipment(exercise, intent));
  return equipmentMatched ?? eligibleExercises[0];
}

function exerciseMatchesIntentEquipment(exercise: Exercise, intent: WorkoutPlanIntent) {
  if (intent.equipment.length === 0) {
    return true;
  }

  const exerciseEquipment = normalizeComparableText([
    exercise.equipment,
    exercise.equipmentZh,
  ].filter(Boolean).join(" "));

  return intent.equipment.some((equipment) => exerciseEquipment.includes(normalizeComparableText(equipment)));
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

function normalizeComparableText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function buildRoutineItem(exercise: Exercise, section: WorkoutRoutineSection, intent: WorkoutPlanIntent) {
  const durationSection = section !== "training";
  return {
    exerciseId: exercise.id,
    section,
    mode: durationSection ? "duration" as const : "reps" as const,
    sets: durationSection ? 1 : intent.experience === "beginner" ? 2 : 3,
    target: durationSection ? 45 : intent.experience === "beginner" ? 10 : 12,
    setRestSeconds: durationSection ? 0 : intent.experience === "beginner" ? 45 : 60,
    transitionRestSeconds: section === "stretch" ? 0 : 30,
    notes: section === "training" ? "保持动作质量，按需降低次数。" : "控制节奏，逐步进入状态。",
  };
}

function formatSectionTitle(section: WorkoutRoutineSection) {
  const labels: Record<WorkoutRoutineSection, string> = {
    warmup: "热身激活",
    training: "主训练",
    stretch: "拉伸放松",
  };

  return labels[section];
}

function validatePatchDependencies(input: ProposeWorkoutPatchAgentToolInput): AgentToolExecutionResult<never> | null {
  if (input.patch.target.artifactId !== input.editPlan.targetArtifactId) {
    return createFailure("invalid_dependency", "Patch target artifact does not match WorkoutEditPlan.", {
      patchTargetArtifactId: input.patch.target.artifactId,
      editPlanTargetArtifactId: input.editPlan.targetArtifactId,
    });
  }

  if (input.editPlan.requiredCandidateSetIds.length > 0 && !input.editPlan.requiredCandidateSetIds.includes(input.candidateSetId)) {
    return createFailure("candidate_set_mismatch", "Patch candidateSetId is not listed by WorkoutEditPlan.", {
      candidateSetId: input.candidateSetId,
      requiredCandidateSetIds: input.editPlan.requiredCandidateSetIds,
    });
  }

  const errors = collectPatchCandidateErrors(input.patch, input.candidateExerciseIds);
  if (errors.length > 0) {
    return createFailure("candidate_set_mismatch", "Patch references exercise ids outside the candidate set.", { errors });
  }

  return null;
}

function collectPatchCandidateErrors(patch: WorkoutPatch, candidateExerciseIds: string[]) {
  const candidateSet = new Set(candidateExerciseIds);
  const errors: string[] = [];

  for (const operation of patch.operations) {
    if ("replacementExerciseId" in operation && operation.replacementExerciseId && !candidateSet.has(operation.replacementExerciseId)) {
      errors.push(`replacementExerciseId:${operation.replacementExerciseId}:outside_candidate_set`);
    }
  }

  return errors;
}

function summarizeEditPlan(plan: WorkoutEditPlan) {
  return {
    editPlanId: plan.editPlanId,
    targetArtifactId: plan.targetArtifactId,
    sourceArtifactPayloadId: plan.sourceArtifactPayloadId,
    strategy: plan.strategy,
    scope: plan.scope,
    requiredCandidateSetIds: plan.requiredCandidateSetIds,
    changeCount: plan.changes.length,
    confirmationLevel: plan.confirmationLevel,
  };
}

function summarizeDraftOutput(output: AgentWorkoutDraftOutput) {
  return {
    draftKind: output.draftKind,
    draftId: output.draftId,
    candidateSetId: output.candidateSetId,
    sourceArtifactId: "sourceArtifactId" in output ? output.sourceArtifactId : undefined,
    activeSourceArtifactId: "activeSourceArtifactId" in output ? output.activeSourceArtifactId : undefined,
    sourceArtifactRevisionResolution: "sourceArtifactRevisionResolution" in output ? output.sourceArtifactRevisionResolution : undefined,
    requiredExerciseIds: "requiredExerciseIds" in output ? output.requiredExerciseIds?.slice(0, defaultCandidatePreviewLimit) : undefined,
    title: output.draft.title,
    valid: output.validation.valid,
    recovery: output.recovery,
    errorCount: output.validation.errors.length,
    warningCount: output.validation.warnings.length,
    exerciseIds: output.validation.exerciseIds.slice(0, defaultCandidatePreviewLimit),
  };
}

function summarizePatchOutput(output: AgentWorkoutPatchOutput) {
  return {
    patchId: output.patchId,
    candidateSetId: output.candidateSetId,
    editPlanId: output.editPlanId,
    targetArtifactId: output.patch.target.artifactId,
    operations: output.patch.operations.map((operation) => operation.operation),
  };
}

function summarizeValidationOutput(output: WorkoutPlanValidationResult & { validationId: string; recovery?: WorkoutPlanValidationRecovery }) {
  return {
    validationId: output.validationId,
    valid: output.valid,
    recovery: output.recovery,
    errors: output.errors.map((issue) => issue.code),
    warnings: output.warnings.map((issue) => issue.code),
    exerciseIds: output.exerciseIds.slice(0, defaultCandidatePreviewLimit),
  };
}

function createValidationRecovery(
  validation: WorkoutPlanValidationResult,
  options: { targetSessionMinutes?: number },
): WorkoutPlanValidationRecovery {
  if (validation.valid) {
    return {
      recoverable: false,
      guidanceMessage: "校验已通过，可以进入 Policy 或保存步骤。",
      suggestedReplies: [],
    };
  }

  return classifyWorkoutPlanValidationFailure(validation, options);
}

function summarizeArtifactPayload(payload: z.infer<typeof conversationArtifactPayloadSchema>) {
  if ("title" in payload) {
    return {
      title: payload.title,
      summary: "summary" in payload ? payload.summary : undefined,
    };
  }

  return {};
}

function createSuccess<Output>(
  context: AgentToolExecutionContext,
  toolName: AgentWorkoutToolName,
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

function createFailure(
  code: AgentToolError["code"],
  message: string,
  detail?: unknown,
): AgentToolFailure {
  return {
    ok: false,
    error: { code, message, detail, retryable: code === "tool_execution_failed" || code === "timeout" },
    traceSummary: { code, message, detail: detail instanceof Error ? detail.message : detail },
  };
}

function createIdempotencyKey<Input>(input: Input, context: AgentToolExecutionContext) {
  return createStructuredResultId(context, "idempotency", "agentWorkoutTool", input);
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
