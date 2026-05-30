import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://fitmate:fitmate@localhost:5432/fitmate?schema=public";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const [exercises, artifactIndexes] = await Promise.all([
    prisma.exercise.findMany(),
    prisma.artifactIndex.findMany(),
  ]);

  for (const exercise of exercises) {
    const embeddingText = buildEmbeddingText([
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
      ...exercise.primaryMusclesZh,
      ...exercise.primaryMuscles,
      ...exercise.secondaryMusclesZh,
      ...exercise.secondaryMuscles,
      ...exercise.goalTags,
      ...exercise.riskTags,
      ...exercise.allowedSections,
      exercise.intensityRole,
      exercise.movementPattern,
      exercise.difficulty,
      ...exercise.contraindications,
      ...exercise.instructionsZh.slice(0, 3),
    ]);

    await prisma.exercise.update({
      where: { id: exercise.id },
      data: {
        embeddingText,
        embedding: createSearchEmbedding(embeddingText),
      },
    });
  }

  for (const index of artifactIndexes) {
    const embeddingText = buildEmbeddingText([
      index.kind,
      index.title,
      index.summary,
      ...index.goals,
      ...index.muscles,
      ...index.equipment,
      ...index.exerciseIds,
      index.sessionMinutes,
      index.weeklyFrequency,
      index.trainingDayCount,
    ]);

    await prisma.artifactIndex.update({
      where: { id: index.id },
      data: {
        embeddingText,
        embedding: createSearchEmbedding(embeddingText),
      },
    });
  }

  console.log(`Refreshed ${exercises.length} exercises and ${artifactIndexes.length} artifact indexes.`);
}

function buildEmbeddingText(parts) {
  return uniqueStrings(parts.map((part) => (typeof part === "number" ? String(part) : part))).join(" | ");
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
  const normalized = value.toLowerCase().replace(/\s+/g, "");
  const terms = new Set();

  for (const rawTerm of value
    .toLowerCase()
    .split(/[\s,，。.!！？、;；:：/|()（）【】\[\]{}"'“”‘’+-]+/)
    .map((term) => term.trim().toLowerCase().replace(/\s+/g, ""))
    .filter(Boolean)) {
    terms.add(rawTerm);

    for (let size = 2; size <= Math.min(4, rawTerm.length); size += 1) {
      for (let index = 0; index <= rawTerm.length - size; index += 1) {
        terms.add(rawTerm.slice(index, index + size));
      }
    }
  }

  for (const [pattern, additions] of semanticSearchSynonyms) {
    if (pattern.test(normalized)) {
      additions.forEach((term) => terms.add(term));
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

const semanticSearchSynonyms = [
  [/拜拜肉|手臂后侧|蝴蝶袖/, ["肱三头肌", "三头肌", "手臂", "triceps"]],
  [/核心不稳|核心弱|腰腹不稳|稳定性/, ["核心", "腹部", "抗旋转", "core", "anti_rotation"]],
  [/圆肩|含胸|驼背|肩胛/, ["肩部", "背部", "肩胛稳定", "posture", "pull"]],
  [/练胸|胸肌|胸部/, ["胸肌", "胸部", "chest", "push"]],
  [/练腿|腿部|下肢/, ["腿部", "下肢", "股四头肌", "squat", "lunge"]],
];

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
