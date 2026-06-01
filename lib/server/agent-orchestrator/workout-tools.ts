import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import {
  createConversationArtifactRevision,
} from "@/lib/server/conversation-artifacts/artifact-service";
import { listAllExercises } from "@/lib/server/exercises/exercise-service";
import { isExerciseAllowedInSection } from "@/lib/shared/exercises/metadata";
import type { Exercise } from "@/lib/shared/exercises/types";
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
  title: z.string().trim().min(1).max(100).optional(),
  sourceEditPlanId: z.string().trim().min(1).optional(),
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
  }),
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

export const validateRoutineDraftAgentToolInputSchema = z.object({
  draftId: z.string().trim().min(1),
  candidateSetId: z.string().trim().min(1),
  candidateExerciseIds: z.array(z.string().trim().min(1)).min(1).max(120),
  intent: agentRoutineIntentSchema,
  draft: workoutRoutineDraftSchema,
});

export const validatePlanDraftAgentToolInputSchema = z.object({
  draftId: z.string().trim().min(1),
  candidateSetId: z.string().trim().min(1),
  candidateExerciseIds: z.array(z.string().trim().min(1)).min(1).max(160),
  intent: workoutPlanIntentSchema.extend({ intentType: z.literal("plan").default("plan") }),
  draft: workoutPlanDraftSchema,
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

export const saveConversationArtifactRevisionAgentToolInputSchema = z.object({
  sourceArtifactId: z.string().trim().min(1),
  payload: conversationArtifactPayloadSchema,
  candidateSetId: z.string().trim().min(1),
  validationId: z.string().trim().min(1),
  policyDecisionId: z.string().trim().min(1),
  confirmationId: z.string().trim().min(1).optional(),
  draftId: z.string().trim().min(1).optional(),
  patchId: z.string().trim().min(1).optional(),
  validationPassed: z.literal(true),
  policyAllowed: z.literal(true),
  responseMessageId: z.string().trim().min(1).optional(),
}).superRefine((input, ctx) => {
  if (!input.draftId && !input.patchId) {
    ctx.addIssue({
      code: "custom",
      message: "保存 revision 必须引用 draftId 或 patchId。",
      path: ["draftId"],
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
      draft: WorkoutRoutineDraft;
      validation: WorkoutPlanValidationResult;
      recovery: WorkoutPlanValidationRecovery;
    }
  | {
      draftKind: "plan";
      draftId: string;
      candidateSetId: string;
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
};

export type AgentArtifactRevisionOutput = {
  revisionId: string;
  artifactId: string;
  sourceArtifactId: string;
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
    description: "使用结构化 intent 和候选集合生成单次 routine 草稿，并执行服务端校验。",
    accessLevel: "generate",
    inputSchema: generateRoutineDraftAgentToolInputSchema,
    dependencies: [
      { kind: "candidate_set", required: true, description: "必须引用当前 run 的动作候选集合。" },
    ],
    getIdempotencyKey: createIdempotencyKey,
    summarizeOutput: summarizeDraftOutput,
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute(input, context) {
      const parsedInput = generateRoutineDraftAgentToolInputSchema.parse(input);
      try {
        const exercises = await listAllExercises();
        const draft = buildRoutineDraftFromCandidates(parsedInput.intent, parsedInput.candidateExerciseIds, exercises, parsedInput.title);
        const validation = validateWorkoutRoutineDraft(draft, parsedInput.intent, {
          exercises,
          candidateExerciseIds: parsedInput.candidateExerciseIds,
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
          draft,
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
    description: "使用 DomainPlanEngine 从结构化策略和来源 artifact 展开长期 plan 草稿。",
    accessLevel: "generate",
    inputSchema: generatePlanDraftAgentToolInputSchema,
    dependencies: [
      { kind: "candidate_set", required: true, description: "必须引用当前 run 的动作候选集合。" },
      { kind: "artifact_payload", required: true, description: "必须引用真实 artifact payload 作为 plan 展开来源。" },
    ],
    getIdempotencyKey: createIdempotencyKey,
    summarizeOutput: summarizeDraftOutput,
    summarizeTrace(result) {
      return result.ok ? result.traceSummary : result.error;
    },
    async execute(input, context) {
      const parsedInput = generatePlanDraftAgentToolInputSchema.parse(input);
      try {
        const expanded = expandDomainPlan({
          strategy: parsedInput.strategy,
          sourceArtifact: parsedInput.sourceArtifact,
        });

        if (!expanded.ok) {
          return createFailure("validation_failed", expanded.message, {
            code: expanded.code,
            strategy: expanded.strategy,
          });
        }

        const exercises = await listAllExercises();
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
      const exercises = await listAllExercises();
      const validation = validateWorkoutRoutineDraft(parsedInput.draft, parsedInput.intent, {
        exercises,
        candidateExerciseIds: parsedInput.candidateExerciseIds,
      });
      const output = {
        ...validation,
        validationId: createStructuredResultId(context, "validation", "validateRoutineDraft", parsedInput),
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
      const exercises = await listAllExercises();
      const validation = validateWorkoutPlanDraft(parsedInput.draft, parsedInput.intent, {
        exercises,
        candidateExerciseIds: parsedInput.candidateExerciseIds,
      });
      const output = {
        ...validation,
        validationId: createStructuredResultId(context, "validation", "validatePlanDraft", parsedInput),
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
      };
      const summary = this.summarizeOutput(output);

      return createSuccess(context, "evaluatePolicy", parsedInput, output, summary, summary);
    },
  };
}

function createSaveConversationArtifactRevisionTool(): AgentToolDefinition<z.infer<typeof saveConversationArtifactRevisionAgentToolInputSchema>, AgentArtifactRevisionOutput> {
  return {
    name: "saveConversationArtifactRevision",
    description: "保存已通过 Validator 和 Policy 的 ConversationArtifact revision。",
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
        const revision = await createConversationArtifactRevision({
          userId: context.userId,
          sourceArtifactId: parsedInput.sourceArtifactId,
          messageId: parsedInput.responseMessageId,
          payload: parsedInput.payload,
        });

        if (!revision.ok) {
          return createFailure("persistence_failed", revision.message, revision);
        }

        const payloadSummary = summarizeArtifactPayload(parsedInput.payload);
        const output: AgentArtifactRevisionOutput = {
          revisionId: revision.artifact.id,
          artifactId: revision.artifact.id,
          sourceArtifactId: parsedInput.sourceArtifactId,
          candidateSetId: parsedInput.candidateSetId,
          validationId: parsedInput.validationId,
          policyDecisionId: parsedInput.policyDecisionId,
          draftId: parsedInput.draftId,
          patchId: parsedInput.patchId,
          title: payloadSummary.title,
          summary: payloadSummary.summary,
        };
        const summary = this.summarizeOutput(output);

        return createSuccess(context, "saveConversationArtifactRevision", parsedInput, output, summary, summary);
      } catch (error) {
        return createFailure("persistence_failed", "Failed to save conversation artifact revision.", error);
      }
    },
  };
}

function buildRoutineDraftFromCandidates(
  intent: WorkoutPlanIntent,
  candidateExerciseIds: string[],
  exercises: Exercise[],
  title: string | undefined,
): WorkoutRoutineDraft {
  const candidateSet = new Set(candidateExerciseIds);
  const candidates = exercises.filter((exercise) => candidateSet.has(exercise.id));
  const sections = (["warmup", "training", "stretch"] as const).map((section) => {
    const sectionExercise = pickExerciseForSection(candidates, section);
    if (!sectionExercise) {
      throw new Error(`candidate_set_missing_${section}`);
    }

    return {
      section,
      title: formatSectionTitle(section),
      items: [buildRoutineItem(sectionExercise, section, intent)],
    };
  });

  return workoutRoutineDraftSchema.parse({
    kind: "routine",
    title: title ?? `${intent.goal}单次训练`,
    goal: intent.goal,
    summary: `基于 ${candidateExerciseIds.length} 个受控候选动作生成，展示或保存前仍需 Validator 与 Policy 结果。`,
    estimatedSessionMinutes: intent.sessionMinutes,
    trainingLoopRounds: intent.experience === "beginner" ? 2 : 3,
    trainingLoopRestSeconds: intent.experience === "beginner" ? 90 : 75,
    sections,
    safetyNotes: [
      "动作均来自当前候选集合；如出现疼痛或明显不适，请停止并调整。",
    ],
  });
}

function pickExerciseForSection(exercises: Exercise[], section: WorkoutRoutineSection) {
  return exercises.find((exercise) => isExerciseAllowedInSection(exercise, section)) ?? exercises[0];
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
): AgentToolExecutionResult<never> {
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
