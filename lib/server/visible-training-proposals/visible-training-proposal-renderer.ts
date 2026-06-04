import { z } from "zod";

import {
  VisibleOutputRendererRegistry,
  type VisibleOutputRenderer,
} from "@/lib/server/agent-core/visible-output-renderer";
import type { AgentRunResult, JsonValue, ToolResult, VisibleOutputEnvelope } from "@/lib/server/agent-core/contracts";
import { exerciseAllowedSectionSchema, type ExerciseAllowedSection } from "@/lib/shared/exercises/types";

import {
  toJsonValue,
  visibleTrainingProposalFactResourceType,
  visibleTrainingProposalOutputType,
  visibleTrainingProposalPayloadSchema,
  type VisibleTrainingExerciseItem,
} from "./visible-training-proposal-contract";

const sourceExerciseDetailSchema = z.object({
  exerciseId: z.string().trim().min(1),
  nameZh: z.string().optional(),
  nameEn: z.string().optional(),
  equipmentZh: z.string().nullable().optional(),
  primaryMusclesZh: z.array(z.string()).optional(),
  allowedSections: z.array(exerciseAllowedSectionSchema).optional(),
  imageUrl: z.string().nullable().optional(),
}).passthrough();

const groupedSearchOutputSchema = z.object({
  groups: z.record(
    z.string(),
    z.object({
      exercises: z.array(sourceExerciseDetailSchema),
    }).passthrough(),
  ),
}).passthrough();

const visibleFactOutputSchema = z.object({
  status: z.literal("succeeded"),
  fact: z.object({
    proposal: visibleTrainingProposalPayloadSchema.optional(),
    exerciseDetails: z.array(sourceExerciseDetailSchema).optional(),
  }).passthrough(),
}).passthrough();

const visibleFactResourceSummarySchema = z.object({
  exerciseItems: z.array(sourceExerciseDetailSchema),
}).passthrough();

/** createVisibleTrainingProposalRenderer 把已校验训练方案投影为用户可见 visible_output 事件。 */
export function createVisibleTrainingProposalRenderer(): VisibleOutputRenderer {
  return {
    outputType: visibleTrainingProposalOutputType,
    render: (output, context) => renderVisibleTrainingProposalOutput(output, context.result),
  };
}

/** createProductionVisibleOutputRendererRegistry 装配生产聊天允许的结构化输出 renderer。 */
export function createProductionVisibleOutputRendererRegistry() {
  const registry = new VisibleOutputRendererRegistry();
  registry.register(createVisibleTrainingProposalRenderer());
  return registry;
}

function renderVisibleTrainingProposalOutput(output: VisibleOutputEnvelope, result: AgentRunResult) {
  const parsed = visibleTrainingProposalPayloadSchema.safeParse(output.payload);
  if (!parsed.success) {
    return [];
  }

  const detailMap = collectExerciseDetails(result);
  const payload = parsed.data;

  return [{
    type: "visible_output" as const,
    outputType: output.outputType,
    schemaVersion: output.schemaVersion,
    payload: toJsonValue(payload),
    content: toJsonValue({
      kind: payload.kind,
      sections: (["warmup", "training", "stretch"] as const)
        .map((section) => ({
          section,
          items: payload.exerciseItems
            .filter((item) => item.section === section)
            .sort((left, right) => left.order - right.order)
            .map((item) => renderExerciseItem(item, detailMap)),
        }))
        .filter((section) => section.items.length > 0),
      schedule: payload.schedule,
    }),
  }];
}

function renderExerciseItem(
  item: VisibleTrainingExerciseItem,
  detailMap: Map<string, z.infer<typeof sourceExerciseDetailSchema>>,
) {
  const detail = detailMap.get(item.exerciseId);

  return {
    exerciseId: item.exerciseId,
    section: item.section,
    order: item.order,
    prescription: item.prescription,
    exercise: detail
      ? {
          exerciseId: detail.exerciseId,
          nameZh: detail.nameZh,
          nameEn: detail.nameEn,
          equipmentZh: detail.equipmentZh,
          primaryMusclesZh: detail.primaryMusclesZh ?? [],
          allowedSections: detail.allowedSections ?? [],
          imageUrl: detail.imageUrl ?? null,
        }
      : undefined,
  };
}

function collectExerciseDetails(result: AgentRunResult) {
  const details = new Map<string, z.infer<typeof sourceExerciseDetailSchema>>();

  for (const toolResult of result.toolResults) {
    if (!toolResult.ok || !toolResult.fulfillment.satisfied) {
      continue;
    }

    collectToolResultDetails(details, toolResult);
  }

  for (const resource of result.traceEvents.flatMap((event) => (
    event.type === "resource_registered" && event.resource.resourceType === visibleTrainingProposalFactResourceType
      ? [event.summary]
      : []
  ))) {
    collectResourceDetails(details, resource);
  }

  return details;
}

function collectToolResultDetails(
  details: Map<string, z.infer<typeof sourceExerciseDetailSchema>>,
  toolResult: Extract<ToolResult, { ok: true }>,
) {
  if (toolResult.toolName === "searchExerciseResources") {
    const parsed = groupedSearchOutputSchema.safeParse(toolResult.output);
    if (!parsed.success) {
      return;
    }

    for (const [section, group] of Object.entries(parsed.data.groups)) {
      for (const exercise of group.exercises) {
        addDetail(details, {
          ...exercise,
          allowedSections: exercise.allowedSections?.length
            ? exercise.allowedSections
            : [section as ExerciseAllowedSection],
        });
      }
    }
    return;
  }

  if (toolResult.toolName === "readRecentVisibleTrainingProposal") {
    const parsed = visibleFactOutputSchema.safeParse(toolResult.output);
    if (!parsed.success) {
      return;
    }

    for (const exercise of parsed.data.fact.exerciseDetails ?? []) {
      addDetail(details, exercise);
    }
  }
}

function collectResourceDetails(
  details: Map<string, z.infer<typeof sourceExerciseDetailSchema>>,
  summary: JsonValue,
) {
  const parsed = visibleFactResourceSummarySchema.safeParse(summary);
  if (!parsed.success) {
    return;
  }

  for (const exercise of parsed.data.exerciseItems) {
    addDetail(details, exercise);
  }
}

function addDetail(
  details: Map<string, z.infer<typeof sourceExerciseDetailSchema>>,
  detail: z.infer<typeof sourceExerciseDetailSchema>,
) {
  details.set(detail.exerciseId, {
    ...details.get(detail.exerciseId),
    ...detail,
  });
}
