import exercisesData from "../data/exercises.zh.json" with { type: "json" };
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function toExerciseRecord(exercise) {
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
    primaryMuscles: exercise.primaryMuscles ?? [],
    primaryMusclesZh: exercise.primaryMusclesZh ?? [],
    secondaryMuscles: exercise.secondaryMuscles ?? [],
    secondaryMusclesZh: exercise.secondaryMusclesZh ?? [],
    instructionsEn: exercise.instructionsEn ?? [],
    instructionsZh: exercise.instructionsZh ?? [],
    images: exercise.images ?? [],
    imageUrls: exercise.imageUrls ?? [],
    riskTags: exercise.riskTags ?? [],
    goalTags: exercise.goalTags ?? [],
    reviewStatus: exercise.reviewStatus ?? "machine_translated",
    isPublished: exercise.isPublished ?? false,
  };
}

async function main() {
  for (const exercise of exercisesData) {
    const data = toExerciseRecord(exercise);

    await prisma.exercise.upsert({
      where: { id: data.id },
      update: data,
      create: data,
    });
  }

  console.log(`Seeded ${exercisesData.length} exercises.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
