import type { ExerciseRecommendationItem } from "@/lib/shared/exercise-recommendations/schema";
import type { Exercise, ExerciseListItem } from "@/lib/shared/exercises/types";

function normalizePreviewImages(imageUrls: Array<string | null | undefined>) {
  return imageUrls.flatMap((imageUrl) => {
    const normalizedImageUrl = imageUrl?.trim();

    return normalizedImageUrl ? [normalizedImageUrl] : [];
  });
}

// createExercisePreviewFromListItem 将动作列表 DTO 投影成详情抽屉的即时预览数据，完整详情返回后可直接替换。
export function createExercisePreviewFromListItem(item: ExerciseListItem): Exercise {
  return {
    id: item.id,
    source: "list",
    sourceUrl: "",
    sourceId: item.id,
    license: "",
    nameEn: item.nameEn,
    nameZh: item.nameZh,
    category: item.category,
    categoryZh: item.categoryZh,
    level: item.level,
    levelZh: item.levelZh,
    force: item.force,
    forceZh: item.forceZh,
    mechanic: item.mechanic,
    mechanicZh: item.mechanicZh,
    equipment: item.equipment,
    equipmentZh: item.equipmentZh,
    homeRequirement: item.homeRequirement,
    homeRequirementZh: item.homeRequirementZh,
    requiresExternalEquipment: item.requiresExternalEquipment,
    requiredEquipmentTags: item.requiredEquipmentTags,
    supportRequirementTags: item.supportRequirementTags,
    setupComplexity: item.setupComplexity,
    impactLevel: item.impactLevel,
    noiseLevel: item.noiseLevel,
    primaryMuscles: item.primaryMuscles,
    primaryMusclesZh: item.primaryMusclesZh,
    secondaryMuscles: [],
    secondaryMusclesZh: [],
    instructionsEn: [],
    instructionsZh: [],
    images: [],
    imageUrls: normalizePreviewImages(item.imageUrls),
    allowedSections: item.allowedSections,
    intensityRole: item.intensityRole,
    movementPattern: item.movementPattern,
    difficulty: item.difficulty,
    riskTags: item.riskTags,
    contraindications: [],
    regressionExerciseIds: [],
    progressionExerciseIds: [],
    substitutionGroupId: null,
    goalTags: item.goalTags,
    reviewStatus: item.reviewStatus,
    isPublished: item.isPublished,
  };
}

// createExercisePreviewFromRecommendationItem 复用聊天推荐卡片已有信息，避免详情接口返回前出现空抽屉。
export function createExercisePreviewFromRecommendationItem(item: ExerciseRecommendationItem): Exercise {
  return {
    id: item.exerciseId,
    source: "recommendation",
    sourceUrl: "",
    sourceId: item.exerciseId,
    license: "",
    nameEn: item.nameEn ?? item.exerciseId,
    nameZh: item.nameZh,
    category: null,
    categoryZh: item.categoryZh,
    level: null,
    levelZh: item.levelZh,
    force: null,
    forceZh: null,
    mechanic: null,
    mechanicZh: null,
    equipment: null,
    equipmentZh: item.equipmentZh,
    homeRequirement: "unknown",
    homeRequirementZh: "未标注",
    requiresExternalEquipment: null,
    requiredEquipmentTags: [],
    supportRequirementTags: [],
    setupComplexity: "unknown",
    impactLevel: null,
    noiseLevel: null,
    primaryMuscles: [],
    primaryMusclesZh: item.primaryMusclesZh,
    secondaryMuscles: [],
    secondaryMusclesZh: item.secondaryMusclesZh,
    instructionsEn: [],
    instructionsZh: item.reasons,
    images: [],
    imageUrls: normalizePreviewImages([item.imageUrl]),
    allowedSections: ["training"],
    intensityRole: "strength",
    movementPattern: "other",
    difficulty: "beginner",
    riskTags: [],
    contraindications: [],
    regressionExerciseIds: [],
    progressionExerciseIds: [],
    substitutionGroupId: null,
    goalTags: [],
    reviewStatus: "fallback",
    isPublished: true,
  };
}
