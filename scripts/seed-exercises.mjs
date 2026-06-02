import exercisesData from "../data/exercises.zh.json" with { type: "json" };
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://fitmate:fitmate@localhost:5432/fitmate?schema=public";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function toExerciseRecord(exercise) {
  const metadata = normalizeExerciseMetadata(exercise);
  const embeddingText = buildExerciseEmbeddingText(exercise, metadata);

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
    allowedSections: metadata.allowedSections,
    intensityRole: metadata.intensityRole,
    movementPattern: metadata.movementPattern,
    difficulty: metadata.difficulty,
    riskTags: metadata.riskTags,
    contraindications: metadata.contraindications,
    regressionExerciseIds: metadata.regressionExerciseIds,
    progressionExerciseIds: metadata.progressionExerciseIds,
    substitutionGroupId: metadata.substitutionGroupId,
    goalTags: exercise.goalTags ?? [],
    embeddingText,
    embedding: createSearchEmbedding(embeddingText),
    reviewStatus: exercise.reviewStatus ?? "machine_translated",
    isPublished: exercise.isPublished ?? true,
  };
}

// Seed 阶段为旧动作 JSON 批量补齐训练阶段和替代元数据，避免初始化库出现不可校验动作。
function normalizeExerciseMetadata(exercise) {
  const text = normalizeText([
    exercise.id,
    exercise.nameEn,
    exercise.nameZh,
    exercise.category,
    exercise.categoryZh,
    exercise.level,
    exercise.force,
    exercise.mechanic,
    exercise.equipment,
    exercise.equipmentZh,
    ...(exercise.primaryMuscles ?? []),
    ...(exercise.primaryMusclesZh ?? []),
    ...(exercise.secondaryMuscles ?? []),
    ...(exercise.secondaryMusclesZh ?? []),
    ...(exercise.goalTags ?? []),
    ...(exercise.riskTags ?? []),
  ].filter(Boolean).join(" "));
  const isStretch = /拉伸|伸展|放松|stretch|stretching|mobility/.test(text);
  const isWarmup = /热身|激活|动态|warmup|warm-up|activation|dynamic|开合跳|jumpingjack|跑步|running|步行|walk|跳绳|rope|单车|bike|treadmill/.test(text);
  const highWarmupRisk = /高冲击|high_impact|高风险|high_risk|奥林匹克|olympic|大力士|strongman|力量举|powerlifting|advanced|expert/.test(text);
  const allowedSections = [];

  if (exercise.allowedSections?.length) {
    allowedSections.push(...exercise.allowedSections);
  } else {
    if (isWarmup && !highWarmupRisk) allowedSections.push("warmup");
    if (!isStretch) allowedSections.push("training");
    if (isStretch) allowedSections.push("stretch");
    if (allowedSections.length === 0) allowedSections.push("training");
  }

  const movementPattern = exercise.movementPattern ?? inferMovementPattern(text);

  return {
    allowedSections,
    intensityRole: exercise.intensityRole ?? inferIntensityRole(text),
    movementPattern,
    difficulty: exercise.difficulty ?? inferDifficulty(exercise.level),
    riskTags: exercise.riskTags ?? [],
    contraindications: exercise.contraindications ?? inferContraindications(text),
    regressionExerciseIds: exercise.regressionExerciseIds ?? [],
    progressionExerciseIds: exercise.progressionExerciseIds ?? [],
    substitutionGroupId:
      exercise.substitutionGroupId ??
      `${movementPattern}:${normalizeText(exercise.primaryMuscles?.[0] ?? exercise.primaryMusclesZh?.[0] ?? "general") || "general"}`,
  };
}

function inferIntensityRole(text) {
  if (/拉伸|伸展|stretch|stretching/.test(text)) return "recovery";
  if (/热身|激活|warmup|activation|dynamic/.test(text)) return "activation";
  if (/有氧|cardio|跑步|running|步行|walk|跳绳|rope|单车|bike/.test(text)) return "cardio";
  if (/增强式|爆发|power|plyometric|jump/.test(text)) return "power";
  return "strength";
}

function inferMovementPattern(text) {
  if (/拉伸|stretch|mobility/.test(text)) return "stretch";
  if (/俯卧撑|卧推|推举|push|press/.test(text)) return "push";
  if (/划船|引体|下拉|pull|row|chin/.test(text)) return "pull";
  if (/深蹲|squat/.test(text)) return "squat";
  if (/硬拉|臀桥|hinge|deadlift|bridge/.test(text)) return "hinge";
  if (/弓步|lunge/.test(text)) return "lunge";
  if (/平板|卷腹|仰卧起坐|核心|腹肌|plank|crunch|sit-up|situp|core|abdominal/.test(text)) return "core";
  if (/跑步|步行|开合跳|jumpingjack|running|walk|gait/.test(text)) return "gait";
  if (/旋转|rotation|twist/.test(text)) return "rotation";
  return "other";
}

function inferDifficulty(level) {
  if (level === "intermediate") return "intermediate";
  if (level === "expert" || level === "advanced") return "advanced";
  return "beginner";
}

function inferContraindications(text) {
  const contraindications = [];
  if (/knee|膝|跳|jump|高冲击|high_impact|squat|lunge/.test(text)) contraindications.push("knee_pain");
  if (/shoulder|肩|press|推举|俯卧撑|push-up|pushup/.test(text)) contraindications.push("shoulder_pain");
  if (/back|腰|下背|硬拉|deadlift|sit-up|situp/.test(text)) contraindications.push("low_back_pain");
  return [...new Set(contraindications)];
}

function normalizeText(value) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

// Seed 写入动作索引用的本地 hashing embedding，与应用内 hybrid search 保持同一维度。
function buildExerciseEmbeddingText(exercise, metadata) {
  return uniqueStrings([
    exercise.id,
    exercise.nameZh,
    exercise.nameEn,
    exercise.categoryZh,
    exercise.category,
    exercise.levelZh,
    exercise.level,
    exercise.forceZh,
    exercise.force,
    exercise.mechanicZh,
    exercise.mechanic,
    exercise.equipmentZh,
    exercise.equipment,
    exercise.homeRequirementZh,
    exercise.homeRequirement,
    ...(exercise.primaryMusclesZh ?? []),
    ...(exercise.primaryMuscles ?? []),
    ...(exercise.secondaryMusclesZh ?? []),
    ...(exercise.secondaryMuscles ?? []),
    ...(exercise.goalTags ?? []),
    ...(exercise.riskTags ?? []),
    ...(metadata.allowedSections ?? []),
    metadata.intensityRole,
    metadata.movementPattern,
    metadata.difficulty,
    ...(metadata.contraindications ?? []),
    ...(exercise.instructionsZh ?? []).slice(0, 3),
  ]).join(" | ");
}

function createSearchEmbedding(text) {
  const dimensions = 48;
  const vector = Array.from({ length: dimensions }, () => 0);

  for (const term of expandSearchTerms(text)) {
    const weight = term.length >= 4 ? 1.4 : term.length >= 2 ? 1 : 0.5;
    const index = positiveHash(term) % dimensions;
    const sign = positiveHash(`${term}:sign`) % 2 === 0 ? 1 : -1;
    vector[index] += sign * weight;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value ** 2, 0));
  return norm === 0 ? vector : vector.map((value) => Number((value / norm).toFixed(6)));
}

function expandSearchTerms(value) {
  const terms = new Set();

  for (const rawTerm of value
    .toLowerCase()
    .split(/[\s,，。.!！？、;；:：/|()（）【】\[\]{}"'“”‘’+-]+/)
    .map(normalizeText)
    .filter(Boolean)) {
    terms.add(rawTerm);

    if (rawTerm.length <= 2) {
      continue;
    }

    for (let size = 2; size <= Math.min(4, rawTerm.length); size += 1) {
      for (let index = 0; index <= rawTerm.length - size; index += 1) {
        terms.add(rawTerm.slice(index, index + size));
      }
    }
  }

  return [...terms];
}

function positiveHash(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean))];
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
