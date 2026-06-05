import type { ExerciseAllowedSection } from "@/lib/shared/exercises/types";

import type { VisibleTrainingExerciseItem, VisibleTrainingProposalPayload } from "./visible-training-proposal-contract";

export const visibleTrainingCompositionSections = ["warmup", "training", "stretch"] as const;

export type VisibleTrainingCompositionSection = (typeof visibleTrainingCompositionSections)[number];

export type VisibleTrainingResourceCoverage = {
  sectionSummary: Record<VisibleTrainingCompositionSection, number>;
  availableSections: VisibleTrainingCompositionSection[];
  missingSectionsForRoutineOrPlan: VisibleTrainingCompositionSection[];
  supportsOutputKinds: Array<VisibleTrainingProposalPayload["kind"]>;
};

/** summarizeVisibleTrainingResourceCoverage 描述当前可见训练事实能覆盖哪些 section 和输出强度。 */
export function summarizeVisibleTrainingResourceCoverage(input: {
  exerciseItems: readonly Pick<VisibleTrainingExerciseItem, "section">[];
  hasSchedule?: boolean;
}): VisibleTrainingResourceCoverage {
  const sectionSummary = summarizeVisibleTrainingSections(input.exerciseItems);
  const availableSections = visibleTrainingCompositionSections.filter((section) => sectionSummary[section] > 0);
  const missingSectionsForRoutineOrPlan = visibleTrainingCompositionSections.filter((section) => sectionSummary[section] === 0);
  const supportsOutputKinds: Array<VisibleTrainingProposalPayload["kind"]> = [];

  if (sectionSummary.training > 0) {
    supportsOutputKinds.push("exercise_selection");
  }
  if (missingSectionsForRoutineOrPlan.length === 0) {
    supportsOutputKinds.push("routine");
    if (input.hasSchedule) {
      supportsOutputKinds.push("plan");
    }
  }

  return {
    sectionSummary,
    availableSections,
    missingSectionsForRoutineOrPlan,
    supportsOutputKinds,
  };
}

/** summarizeVisibleTrainingSections 统一 warmup/training/stretch 的计数口径，供 observation 和 validator 复用。 */
export function summarizeVisibleTrainingSections(
  items: readonly Pick<VisibleTrainingExerciseItem, "section">[],
): Record<VisibleTrainingCompositionSection, number> {
  return items.reduce(
    (counts, item) => {
      if (isVisibleTrainingCompositionSection(item.section)) {
        counts[item.section] += 1;
      }
      return counts;
    },
    { warmup: 0, training: 0, stretch: 0 },
  );
}

export function isVisibleTrainingCompositionSection(value: unknown): value is VisibleTrainingCompositionSection {
  return typeof value === "string" && visibleTrainingCompositionSections.includes(value as VisibleTrainingCompositionSection);
}
