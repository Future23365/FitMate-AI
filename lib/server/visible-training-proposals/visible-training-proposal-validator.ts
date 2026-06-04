import { z } from "zod";

import {
  TerminalOutputValidatorRegistry,
  type TerminalOutputValidator,
  type TerminalOutputValidationContext,
  type TerminalOutputValidationResult,
} from "@/lib/server/agent-core/terminal-output-validator";
import type { JsonValue, ToolResult, VisibleOutputEnvelope } from "@/lib/server/agent-core/contracts";
import { exerciseAllowedSectionSchema, type ExerciseAllowedSection } from "@/lib/shared/exercises/types";

import {
  visibleTrainingProposalFactResourceType,
  visibleTrainingProposalOutputType,
  visibleTrainingProposalPayloadSchema,
  visibleTrainingProposalSchemaVersion,
  type VisibleTrainingProposalPayload,
} from "./visible-training-proposal-contract";

const sourceExerciseSchema = z.object({
  exerciseId: z.string().trim().min(1),
  section: exerciseAllowedSectionSchema.optional(),
  allowedSections: z.array(exerciseAllowedSectionSchema).optional(),
  nameZh: z.string().optional(),
  nameEn: z.string().optional(),
  equipmentZh: z.string().nullable().optional(),
  primaryMusclesZh: z.array(z.string()).optional(),
  imageUrl: z.string().nullable().optional(),
}).passthrough();

const groupedSearchOutputSchema = z.object({
  groups: z.record(
    z.string(),
    z.object({
      exercises: z.array(sourceExerciseSchema),
    }).passthrough(),
  ),
}).passthrough();

const visibleFactOutputSchema = z.object({
  status: z.literal("succeeded"),
  fact: z.object({
    proposal: visibleTrainingProposalPayloadSchema,
    exerciseDetails: z.array(sourceExerciseSchema).optional(),
  }).passthrough(),
}).passthrough();

const visibleFactResourceSummarySchema = z.object({
  exerciseItems: z.array(sourceExerciseSchema),
}).passthrough();

type ExerciseSource = {
  exerciseId: string;
  sections: Set<ExerciseAllowedSection>;
  allowedSections: Set<ExerciseAllowedSection>;
};

/** createVisibleTrainingProposalValidator 校验训练方案 payload 的结构、证据来源和 section 边界。 */
export function createVisibleTrainingProposalValidator(): TerminalOutputValidator {
  return {
    outputType: visibleTrainingProposalOutputType,
    schemaVersions: [visibleTrainingProposalSchemaVersion],
    validate: validateVisibleTrainingProposalOutput,
  };
}

/** createProductionTerminalOutputValidatorRegistry 装配生产聊天允许的用户可见结构化输出 validator。 */
export function createProductionTerminalOutputValidatorRegistry() {
  const registry = new TerminalOutputValidatorRegistry();
  registry.register(createVisibleTrainingProposalValidator());
  return registry;
}

export function validateVisibleTrainingProposalOutput(
  output: VisibleOutputEnvelope,
  context: TerminalOutputValidationContext,
): TerminalOutputValidationResult {
  const legacyIdPath = findLegacyIdField(output.payload);
  if (legacyIdPath) {
    return {
      ok: false,
      message: "visibleTrainingProposal 动作项必须使用 exerciseId，不能输出 id。",
      details: { path: legacyIdPath },
    };
  }

  const parsed = visibleTrainingProposalPayloadSchema.safeParse(output.payload);
  if (!parsed.success) {
    return {
      ok: false,
      message: "visibleTrainingProposal payload 不符合 schema。",
      details: {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    };
  }

  return validateExerciseSources(parsed.data, collectExerciseSources(context));
}

/** collectVisibleTrainingExerciseSources 为 renderer 和 fact bridge 提供同一套受控动作来源摘要。 */
export function collectVisibleTrainingExerciseSources(context: {
  toolResults: ToolResult[];
  run?: TerminalOutputValidationContext["run"];
  resourceStore?: TerminalOutputValidationContext["resourceStore"];
}) {
  return collectExerciseSources(context);
}

function validateExerciseSources(
  payload: VisibleTrainingProposalPayload,
  sources: Map<string, ExerciseSource>,
): TerminalOutputValidationResult {
  for (const [index, item] of payload.exerciseItems.entries()) {
    const source = sources.get(item.exerciseId);
    if (!source) {
      return {
        ok: false,
        message: `visibleTrainingProposal.exerciseItems[${index}].exerciseId 未被本轮 satisfied searchExerciseResources 结果或 visible_training_proposal_fact 支持。`,
        details: {
          exerciseId: item.exerciseId,
          supportedExerciseIds: [...sources.keys()],
        },
      };
    }

    if (!source.sections.has(item.section) && !source.allowedSections.has(item.section)) {
      return {
        ok: false,
        message: `visibleTrainingProposal.exerciseItems[${index}].section 超出该动作的受控 section 边界。`,
        details: {
          exerciseId: item.exerciseId,
          section: item.section,
          sourceSections: [...source.sections],
          allowedSections: [...source.allowedSections],
        },
      };
    }
  }

  return { ok: true };
}

function collectExerciseSources(context: {
  toolResults: ToolResult[];
  run?: TerminalOutputValidationContext["run"];
  resourceStore?: TerminalOutputValidationContext["resourceStore"];
}) {
  const sources = new Map<string, ExerciseSource>();

  for (const result of context.toolResults) {
    if (!result.ok || !result.fulfillment.satisfied) {
      continue;
    }

    if (result.toolName === "searchExerciseResources") {
      collectSearchExerciseSources(sources, result.output);
      continue;
    }

    if (result.toolName === "readRecentVisibleTrainingProposal") {
      collectVisibleFactOutputSources(sources, result.output);
    }
  }

  for (const resource of context.resourceStore?.list({
    role: "consumable",
    resourceType: visibleTrainingProposalFactResourceType,
  }) ?? []) {
    const parsed = visibleFactResourceSummarySchema.safeParse(resource.summary);
    if (!parsed.success) {
      continue;
    }
    for (const item of parsed.data.exerciseItems) {
      addSource(sources, item.exerciseId, {
        section: item.section,
        allowedSections: item.allowedSections,
      });
    }
  }

  const recentFacts = context.run?.metadata?.recentVisibleTrainingProposals;
  if (Array.isArray(recentFacts)) {
    for (const fact of recentFacts) {
      const parsed = visibleFactResourceSummarySchema.safeParse(fact);
      if (!parsed.success) {
        continue;
      }
      for (const item of parsed.data.exerciseItems) {
        addSource(sources, item.exerciseId, {
          section: item.section,
          allowedSections: item.allowedSections,
        });
      }
    }
  }

  return sources;
}

function collectSearchExerciseSources(sources: Map<string, ExerciseSource>, output: unknown) {
  const parsed = groupedSearchOutputSchema.safeParse(output);
  if (!parsed.success) {
    return;
  }

  for (const [section, group] of Object.entries(parsed.data.groups)) {
    for (const exercise of group.exercises) {
      addSource(sources, exercise.exerciseId, {
        section: section as ExerciseAllowedSection,
        allowedSections: exercise.allowedSections,
      });
    }
  }
}

function collectVisibleFactOutputSources(sources: Map<string, ExerciseSource>, output: unknown) {
  const parsed = visibleFactOutputSchema.safeParse(output);
  if (!parsed.success) {
    return;
  }

  for (const item of parsed.data.fact.proposal.exerciseItems) {
    addSource(sources, item.exerciseId, {
      section: item.section,
      allowedSections: parsed.data.fact.exerciseDetails
        ?.find((exercise) => exercise.exerciseId === item.exerciseId)
        ?.allowedSections,
    });
  }
}

function addSource(
  sources: Map<string, ExerciseSource>,
  exerciseId: string,
  input: { section?: ExerciseAllowedSection; allowedSections?: ExerciseAllowedSection[] },
) {
  const current = sources.get(exerciseId) ?? {
    exerciseId,
    sections: new Set<ExerciseAllowedSection>(),
    allowedSections: new Set<ExerciseAllowedSection>(),
  };

  if (input.section) {
    current.sections.add(input.section);
  }
  for (const section of input.allowedSections ?? []) {
    current.allowedSections.add(section);
  }

  sources.set(exerciseId, current);
}

function findLegacyIdField(payload: JsonValue) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const exerciseItems = (payload as Record<string, JsonValue>).exerciseItems;
  if (!Array.isArray(exerciseItems)) {
    return null;
  }

  for (const [index, item] of exerciseItems.entries()) {
    if (item && typeof item === "object" && !Array.isArray(item) && "id" in item) {
      return `payload.exerciseItems[${index}].id`;
    }
  }

  return null;
}
