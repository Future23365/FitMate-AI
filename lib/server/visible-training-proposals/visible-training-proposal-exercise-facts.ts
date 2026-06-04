import "server-only";

import { z } from "zod";

import type { JsonValue } from "@/lib/server/agent-core/contracts";
import { getExerciseRecordsByIds } from "@/lib/server/exercises/exercise-repository";
import {
  exerciseAllowedSectionSchema,
  type ExerciseAllowedSection,
} from "@/lib/shared/exercises/types";

import type { VisibleTrainingExerciseItem } from "./visible-training-proposal-contract";

export const visibleTrainingProposalCanonicalExerciseSchema = z.object({
  exerciseId: z.string().trim().min(1),
  nameZh: z.string(),
  nameEn: z.string(),
  equipmentZh: z.string().nullable(),
  primaryMusclesZh: z.array(z.string()),
  allowedSections: z.array(exerciseAllowedSectionSchema),
  imageUrl: z.string().nullable(),
}).strict();

export const visibleTrainingProposalValidationMetadataSchema = z.object({
  exerciseDetails: z.array(visibleTrainingProposalCanonicalExerciseSchema),
}).strict();

export type VisibleTrainingProposalCanonicalExercise = z.infer<typeof visibleTrainingProposalCanonicalExerciseSchema>;

type ExerciseFactRecord = {
  id: string;
  nameZh: string;
  nameEn: string;
  equipmentZh: string | null;
  primaryMusclesZh: string[];
  allowedSections: ExerciseAllowedSection[];
  imageUrls: string[];
  isPublished: boolean;
};

export type VisibleTrainingProposalExerciseFactLoader = (
  exerciseIds: readonly string[],
) => Promise<readonly ExerciseFactRecord[]>;

export type VisibleTrainingProposalExerciseFactValidationResult =
  | {
      ok: true;
      exerciseDetails: VisibleTrainingProposalCanonicalExercise[];
    }
  | {
      ok: false;
      code: "database_unconfigured" | "exercise_missing" | "exercise_unpublished" | "section_not_allowed";
      message: string;
      details: JsonValue;
    };

/** validateVisibleTrainingProposalExerciseFacts 用数据库动作事实校验最终可见训练方案的 exerciseId 和 section。 */
export async function validateVisibleTrainingProposalExerciseFacts(input: {
  exerciseItems: readonly Pick<VisibleTrainingExerciseItem, "exerciseId" | "section">[];
  loadExerciseRecordsByIds?: VisibleTrainingProposalExerciseFactLoader;
}): Promise<VisibleTrainingProposalExerciseFactValidationResult> {
  const uniqueExerciseIds = collectUniqueExerciseIds(input.exerciseItems);
  const loadExerciseRecordsByIds = input.loadExerciseRecordsByIds ?? loadExerciseFactsFromRepository;

  let records: readonly ExerciseFactRecord[];
  try {
    records = await loadExerciseRecordsByIds(uniqueExerciseIds);
  } catch (error) {
    return {
      ok: false,
      code: "database_unconfigured",
      message: "visibleTrainingProposal 动作事实校验无法读取数据库。",
      details: {
        exerciseIds: uniqueExerciseIds,
        cause: error instanceof Error ? error.message : "Unknown exercise fact loading failure.",
      },
    };
  }

  const recordsById = new Map(records.map((record) => [record.id, record]));
  const missingExerciseIds = uniqueExerciseIds.filter((exerciseId) => !recordsById.has(exerciseId));
  if (missingExerciseIds.length > 0) {
    return {
      ok: false,
      code: "exercise_missing",
      message: "visibleTrainingProposal 引用了数据库不存在的动作。",
      details: { exerciseIds: missingExerciseIds },
    };
  }

  const unpublishedExerciseIds = records
    .filter((record) => !record.isPublished)
    .map((record) => record.id);
  if (unpublishedExerciseIds.length > 0) {
    return {
      ok: false,
      code: "exercise_unpublished",
      message: "visibleTrainingProposal 引用了当前不可用于用户可见训练方案的动作。",
      details: { exerciseIds: unpublishedExerciseIds },
    };
  }

  for (const [index, item] of input.exerciseItems.entries()) {
    const record = recordsById.get(item.exerciseId);
    if (record && !record.allowedSections.includes(item.section)) {
      return {
        ok: false,
        code: "section_not_allowed",
        message: "visibleTrainingProposal 动作项 section 超出数据库允许边界。",
        details: {
          index,
          path: `payload.exerciseItems[${index}].section`,
          exerciseId: item.exerciseId,
          section: item.section,
          allowedSections: record.allowedSections,
        },
      };
    }
  }

  return {
    ok: true,
    exerciseDetails: uniqueExerciseIds.flatMap((exerciseId) => {
      const record = recordsById.get(exerciseId);
      return record ? [toCanonicalExercise(record)] : [];
    }),
  };
}

function collectUniqueExerciseIds(items: readonly Pick<VisibleTrainingExerciseItem, "exerciseId">[]) {
  return [...new Set(items.map((item) => item.exerciseId.trim()).filter(Boolean))];
}

async function loadExerciseFactsFromRepository(exerciseIds: readonly string[]) {
  return getExerciseRecordsByIds(exerciseIds);
}

function toCanonicalExercise(record: ExerciseFactRecord): VisibleTrainingProposalCanonicalExercise {
  return {
    exerciseId: record.id,
    nameZh: record.nameZh,
    nameEn: record.nameEn,
    equipmentZh: record.equipmentZh,
    primaryMusclesZh: record.primaryMusclesZh,
    allowedSections: record.allowedSections,
    imageUrl: record.imageUrls[0] ?? null,
  };
}
