import type { ExerciseRecommendationItem } from "@/lib/shared/exercise-recommendations/schema";
import type { Exercise } from "@/lib/shared/exercises/types";

export type RecommendationItemImageState = "available" | "loading" | "unavailable";

/** mergeRecommendationItemWithExercise 用数据库动作事实补齐推荐卡片首屏展示字段。 */
export function mergeRecommendationItemWithExercise(
  item: ExerciseRecommendationItem,
  exercise: Exercise | undefined,
): ExerciseRecommendationItem {
  if (!exercise) {
    return item;
  }

  return {
    ...item,
    nameZh: nonEmptyString(exercise.nameZh) ?? item.nameZh,
    nameEn: nonEmptyString(exercise.nameEn) ?? item.nameEn,
    categoryZh: nonEmptyString(exercise.categoryZh) ?? item.categoryZh,
    levelZh: nonEmptyString(exercise.levelZh) ?? item.levelZh,
    equipmentZh: nonEmptyString(exercise.equipmentZh) ?? item.equipmentZh,
    primaryMusclesZh: nonEmptyStringList(exercise.primaryMusclesZh, item.primaryMusclesZh),
    secondaryMusclesZh: nonEmptyStringList(exercise.secondaryMusclesZh, item.secondaryMusclesZh),
    imageUrl: firstExerciseImageUrl(exercise) ?? item.imageUrl,
  };
}

/** shouldHydrateRecommendationItem 判断推荐卡片是否缺少首屏展示所需的稳定动作事实。 */
export function shouldHydrateRecommendationItem(item: ExerciseRecommendationItem) {
  return (
    !nonEmptyString(item.imageUrl)
    || item.nameZh.trim() === item.exerciseId.trim()
    || isUnlabeledLevel(item.levelZh)
  );
}

/** resolveRecommendationItemImageState 区分推荐卡片图片加载中和真实无图状态。 */
export function resolveRecommendationItemImageState(
  item: ExerciseRecommendationItem,
  failedExerciseIds: Set<string>,
): RecommendationItemImageState {
  if (nonEmptyString(item.imageUrl)) {
    return "available";
  }

  return shouldHydrateRecommendationItem(item) && !failedExerciseIds.has(item.exerciseId)
    ? "loading"
    : "unavailable";
}

function firstExerciseImageUrl(exercise: Exercise) {
  return exercise.imageUrls.map(nonEmptyString).find(Boolean);
}

function nonEmptyString(value: string | null | undefined) {
  return value?.trim() || undefined;
}

function isUnlabeledLevel(value: string | null | undefined) {
  const normalized = nonEmptyString(value);

  return !normalized || normalized === "未标注" || normalized === "未标注难度";
}

function nonEmptyStringList(value: string[] | undefined, fallback: string[]) {
  const normalized = value?.map(nonEmptyString).filter((item): item is string => Boolean(item)) ?? [];

  return normalized.length > 0 ? normalized : fallback;
}
