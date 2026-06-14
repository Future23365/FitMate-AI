import { describe, expect, it } from "vitest";

import {
  mergeRecommendationItemWithExercise,
  resolveRecommendationItemImageState,
  shouldHydrateRecommendationItem,
} from "@/features/exercises/lib/exercise-recommendation-display";
import type { ExerciseRecommendationItem } from "@/lib/shared/exercise-recommendations/schema";

import { createExercise } from "./fixtures/domain";

describe("ExerciseRecommendationCard display hydration", () => {
  it("uses database exercise facts to replace fallback names and missing images", () => {
    const item = createRecommendationItem({
      exerciseId: "Leg_Pull-In",
      nameZh: "Leg_Pull-In",
      imageUrl: undefined,
    });
    const exercise = createExercise({
      id: "Leg_Pull-In",
      nameEn: "Leg Pull-In",
      nameZh: "仰卧举腿",
      categoryZh: "核心",
      levelZh: "新手",
      equipmentZh: "自重",
      primaryMusclesZh: ["腹肌"],
      secondaryMusclesZh: ["髋屈肌"],
      imageUrls: ["/api/exercise-images/Leg_Pull-In/0.jpg"],
    });

    expect(mergeRecommendationItemWithExercise(item, exercise)).toMatchObject({
      exerciseId: "Leg_Pull-In",
      nameZh: "仰卧举腿",
      nameEn: "Leg Pull-In",
      categoryZh: "核心",
      levelZh: "新手",
      equipmentZh: "自重",
      primaryMusclesZh: ["腹肌"],
      secondaryMusclesZh: ["髋屈肌"],
      imageUrl: "/api/exercise-images/Leg_Pull-In/0.jpg",
    });
  });

  it("keeps the original recommendation item when no exercise detail is available", () => {
    const item = createRecommendationItem({ exerciseId: "unknown", nameZh: "unknown" });

    expect(mergeRecommendationItemWithExercise(item, undefined)).toEqual(item);
  });

  it("does not treat the old SVG placeholder as the recommendation image fallback", () => {
    const item = createRecommendationItem({
      exerciseId: "Leg_Pull-In",
      imageUrl: undefined,
      nameZh: "Leg_Pull-In",
    });

    expect(resolveRecommendationItemImageState(item, new Set())).toBe("loading");
    expect(resolveRecommendationItemImageState(item, new Set([item.exerciseId]))).toBe("unavailable");
  });

  it("hydrates recommendation items when the first render only has an unlabeled difficulty", () => {
    const item = createRecommendationItem({
      imageUrl: "/api/exercise-images/push-up/0.jpg",
      levelZh: "未标注",
    });

    expect(shouldHydrateRecommendationItem(item)).toBe(true);
  });
});

function createRecommendationItem(overrides: Partial<ExerciseRecommendationItem> = {}): ExerciseRecommendationItem {
  return {
    exerciseId: overrides.exerciseId ?? "push-up",
    nameZh: overrides.nameZh ?? "俯卧撑",
    nameEn: overrides.nameEn ?? "Push Up",
    categoryZh: overrides.categoryZh ?? "训练",
    levelZh: overrides.levelZh ?? "未标注",
    equipmentZh: overrides.equipmentZh ?? "未标注器械",
    primaryMusclesZh: overrides.primaryMusclesZh ?? ["综合"],
    secondaryMusclesZh: overrides.secondaryMusclesZh ?? [],
    imageUrl: overrides.imageUrl,
    reasons: overrides.reasons ?? ["适合当前训练条件。"],
  };
}
