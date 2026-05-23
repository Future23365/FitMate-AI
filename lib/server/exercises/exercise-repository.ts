import "server-only";

import exercisesData from "@/data/exercises.zh.json";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/server/db/prisma";
import type { Exercise } from "@/lib/shared/exercises/types";

const staticExercises = exercisesData as Exercise[];

// The repository is the only place that knows whether exercises come from PostgreSQL or the local seed JSON.
export async function listExerciseRecords(): Promise<Exercise[]> {
  if (!isDatabaseConfigured()) {
    return staticExercises;
  }

  try {
    const prisma = getPrismaClient();
    const exercises = await prisma.exercise.findMany({
      orderBy: { nameZh: "asc" },
    });

    return exercises.map(mapExerciseRecord);
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw error;
    }

    console.warn("[exercise-repository] database_unavailable_using_static_seed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return staticExercises;
  }
}

export async function getExerciseRecordById(id: string): Promise<Exercise | null> {
  if (!isDatabaseConfigured()) {
    return staticExercises.find((exercise) => exercise.id === id) ?? null;
  }

  try {
    const prisma = getPrismaClient();
    const exercise = await prisma.exercise.findUnique({
      where: { id },
    });

    return exercise ? mapExerciseRecord(exercise) : null;
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw error;
    }

    console.warn("[exercise-repository] database_unavailable_using_static_seed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return staticExercises.find((exercise) => exercise.id === id) ?? null;
  }
}

function mapExerciseRecord(exercise: Exercise): Exercise {
  return {
    id: exercise.id,
    source: exercise.source,
    sourceUrl: exercise.sourceUrl,
    sourceId: exercise.sourceId,
    license: exercise.license,
    nameEn: exercise.nameEn,
    nameZh: exercise.nameZh,
    category: exercise.category,
    categoryZh: exercise.categoryZh,
    level: exercise.level,
    levelZh: exercise.levelZh,
    force: exercise.force,
    forceZh: exercise.forceZh,
    mechanic: exercise.mechanic,
    mechanicZh: exercise.mechanicZh,
    equipment: exercise.equipment,
    equipmentZh: exercise.equipmentZh,
    homeRequirement: exercise.homeRequirement,
    homeRequirementZh: exercise.homeRequirementZh,
    primaryMuscles: exercise.primaryMuscles,
    primaryMusclesZh: exercise.primaryMusclesZh,
    secondaryMuscles: exercise.secondaryMuscles,
    secondaryMusclesZh: exercise.secondaryMusclesZh,
    instructionsEn: exercise.instructionsEn,
    instructionsZh: exercise.instructionsZh,
    images: exercise.images,
    imageUrls: exercise.imageUrls,
    riskTags: exercise.riskTags,
    goalTags: exercise.goalTags,
    reviewStatus: exercise.reviewStatus,
    isPublished: exercise.isPublished,
  };
}
