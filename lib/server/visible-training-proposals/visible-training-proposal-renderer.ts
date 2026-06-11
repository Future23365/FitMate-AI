import {
  VisibleOutputRendererRegistry,
  type VisibleOutputRenderer,
} from "@/lib/server/visible-outputs/visible-output-renderer";
import type {
  VisibleOutputEnvelope,
  VisibleOutputRendererRunResult,
} from "@/lib/server/visible-outputs/contracts";

import {
  toJsonValue,
  visibleTrainingProposalOutputType,
  visibleTrainingProposalPayloadSchema,
  type VisibleTrainingExerciseItem,
} from "./visible-training-proposal-contract";
import {
  visibleTrainingProposalValidationMetadataSchema,
  type VisibleTrainingProposalCanonicalExercise,
} from "./visible-training-proposal-exercise-facts";

/** createVisibleTrainingProposalRenderer 把已校验训练方案投影为用户可见 visible_output 事件。 */
export function createVisibleTrainingProposalRenderer(): VisibleOutputRenderer {
  return {
    outputType: visibleTrainingProposalOutputType,
    render: (output, context) => renderVisibleTrainingProposalOutput(output, context.result, context.outputIndex),
  };
}

/** createProductionVisibleOutputRendererRegistry 装配生产聊天允许的结构化输出 renderer。 */
export function createProductionVisibleOutputRendererRegistry() {
  const registry = new VisibleOutputRendererRegistry();
  registry.register(createVisibleTrainingProposalRenderer());
  return registry;
}

/** renderVisibleTrainingProposalOutput 使用 validator 元数据补齐动作详情，不读取 tool raw output。 */
export function renderVisibleTrainingProposalOutput(
  output: VisibleOutputEnvelope,
  result: VisibleOutputRendererRunResult,
  outputIndex: number,
) {
  const parsed = visibleTrainingProposalPayloadSchema.safeParse(output.payload);
  if (!parsed.success) {
    return [];
  }

  const detailMap = collectValidatedExerciseDetails(result, outputIndex);
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
  detailMap: Map<string, VisibleTrainingProposalCanonicalExercise>,
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
          primaryMusclesZh: detail.primaryMusclesZh,
          allowedSections: detail.allowedSections,
          imageUrl: detail.imageUrl,
        }
      : undefined,
  };
}

function collectValidatedExerciseDetails(result: VisibleOutputRendererRunResult, outputIndex: number) {
  const metadata = result.terminalOutputValidation?.outputs.find((output) => (
    output.index === outputIndex && output.outputType === visibleTrainingProposalOutputType
  ))?.metadata;
  const parsed = visibleTrainingProposalValidationMetadataSchema.safeParse(metadata);
  const details = new Map<string, VisibleTrainingProposalCanonicalExercise>();

  if (!parsed.success) {
    return details;
  }

  for (const exercise of parsed.data.exerciseDetails) {
    details.set(exercise.exerciseId, exercise);
  }

  return details;
}
