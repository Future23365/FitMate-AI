#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import nextEnv from "@next/env";
import { z } from "zod";

import exercisesData from "../data/exercises.zh.json" with { type: "json" };
import { exerciseExecutionTaxonomySchema } from "../lib/shared/exercises/execution-taxonomy.ts";

const { loadEnvConfig } = nextEnv;
const projectDir = fileURLToPath(new URL("..", import.meta.url));
const defaultBackfillPath = path.join(projectDir, "data/exercise-execution-taxonomy.backfill.jsonl");
const backfillSource = "codex-exercise-execution-taxonomy-analysis-2026-06-14";

const confidenceValues = ["high", "medium", "low"];

/** backfillRecordSchema 约束离线数据补丁，脚本只把通过校验的稳定 taxonomy 写入数据库。 */
export const backfillRecordSchema = z
  .object({
    exerciseId: z.string().min(1),
    requiresExternalEquipment: z.boolean().nullable(),
    requiredEquipmentTags: z.array(z.string()),
    supportRequirementTags: z.array(z.string()),
    setupComplexity: z.string(),
    impactLevel: z.string().nullable(),
    noiseLevel: z.string().nullable(),
    confidence: z.enum(confidenceValues),
    evidence: z.string().min(1),
    source: z.literal(backfillSource),
  })
  .superRefine((record, ctx) => {
    const taxonomy = pickTaxonomy(record);
    const parsed = exerciseExecutionTaxonomySchema.safeParse(taxonomy);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ ...issue, path: issue.path });
      }
    }
  });

/** analyzeExerciseExecutionTaxonomyRecord 将动作源数据投影成可审查的 execution taxonomy 补丁记录。 */
export function analyzeExerciseExecutionTaxonomyRecord(exercise) {
  const text = buildSearchText(exercise);
  const requiredEquipmentTags = inferRequiredEquipmentTags(exercise, text);
  const supportRequirementTags = inferSupportRequirementTags(exercise, text, requiredEquipmentTags);
  const setupComplexity = inferSetupComplexity(requiredEquipmentTags, supportRequirementTags);
  const impactLevel = inferImpactLevel(exercise, text);
  const noiseLevel = inferNoiseLevel(exercise, text, requiredEquipmentTags, supportRequirementTags, impactLevel);
  const requiresExternalEquipment = requiredEquipmentTags.length > 0;
  const confidence = inferConfidence(exercise, text, requiredEquipmentTags, supportRequirementTags);

  return backfillRecordSchema.parse({
    exerciseId: exercise.id,
    requiresExternalEquipment,
    requiredEquipmentTags,
    supportRequirementTags,
    setupComplexity,
    impactLevel,
    noiseLevel,
    confidence,
    evidence: buildEvidence(exercise, requiredEquipmentTags, supportRequirementTags, setupComplexity, impactLevel, noiseLevel),
    source: backfillSource,
  });
}

/** generateBackfillRecords 生成完整补丁文件内容，保持排序与 seed 动作源一致便于人工 diff。 */
export function generateBackfillRecords(exercises = exercisesData) {
  return exercises.map(analyzeExerciseExecutionTaxonomyRecord);
}

/** stringifyBackfillRecords 输出 JSONL，方便生产环境逐行解析和定位坏数据。 */
export function stringifyBackfillRecords(records) {
  return records.map((record) => JSON.stringify(record)).join("\n") + "\n";
}

/** parseBackfillJsonl 读取并校验补丁文件，拒绝重复 id 和非法 taxonomy。 */
export function parseBackfillJsonl(content) {
  const records = [];
  const seenIds = new Set();

  for (const [index, line] of content.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const parsedJson = JSON.parse(trimmed);
    const record = backfillRecordSchema.parse(parsedJson);

    if (seenIds.has(record.exerciseId)) {
      throw new Error(`Duplicate exerciseId in backfill file: ${record.exerciseId} at line ${index + 1}.`);
    }

    seenIds.add(record.exerciseId);
    records.push(record);
  }

  return records;
}

/** summarizeBackfillRecords 汇总补丁分布，用于 dry-run 和人工抽检。 */
export function summarizeBackfillRecords(records) {
  return {
    total: records.length,
    requiresExternalEquipment: countBy(records, (record) => String(record.requiresExternalEquipment)),
    requiredEquipmentTags: countTags(records, (record) => record.requiredEquipmentTags),
    supportRequirementTags: countTags(records, (record) => record.supportRequirementTags),
    setupComplexity: countBy(records, (record) => record.setupComplexity),
    impactLevel: countBy(records, (record) => record.impactLevel ?? "null"),
    noiseLevel: countBy(records, (record) => record.noiseLevel ?? "null"),
    confidence: countBy(records, (record) => record.confidence),
  };
}

function inferRequiredEquipmentTags(exercise, text) {
  const tags = new Set();
  const shouldInferFromText = exercise.equipment === "body only" || exercise.equipment === "other";

  switch (exercise.equipment) {
    case "barbell":
      tags.add("barbell");
      break;
    case "dumbbell":
      tags.add("dumbbell");
      break;
    case "cable":
      tags.add("cable");
      break;
    case "machine":
      tags.add("machine");
      break;
    case "kettlebells":
      tags.add("kettlebell");
      break;
    case "bands":
      tags.add("resistance_band");
      break;
    case "medicine ball":
      tags.add("medicine_ball");
      break;
    case "exercise ball":
      tags.add("stability_ball");
      break;
    case "foam roll":
      tags.add("foam_roller");
      break;
    case "e-z curl bar":
      tags.add("ez_bar");
      break;
  }

  if (shouldInferFromText && matchesAny(text, [/哑铃|dumbbell/])) tags.add("dumbbell");
  if (shouldInferFromText && matchesAny(text, [/杠铃片|负重片|\bplates?\b/])) tags.add("barbell");
  if (matchesAny(text, [/弹力带|阻力带|弹力绳|resistance band|\bbands?\b/])) tags.add("resistance_band");
  if (shouldInferFromText && matchesAny(text, [/绳索器械|龙门架|滑轮|cable/])) tags.add("cable");
  if (shouldInferFromText && matchesAny(text, [/壶铃|kettlebell/])) tags.add("kettlebell");
  if (shouldInferFromText && matchesAny(text, [/药球|medicine ball/])) tags.add("medicine_ball");
  if (shouldInferFromText && matchesAny(text, [/泡沫轴|按摩滚筒|foam roll|foam roller/])) tags.add("foam_roller");
  if (shouldInferFromText && matchesAny(text, [/\bez\b|e-z curl/])) tags.add("ez_bar");
  if (shouldInferFromText && matchesAny(text, [/健身球|瑜伽球|稳定球|exercise ball|stability ball/])) tags.add("stability_ball");

  if (tags.size === 0 && shouldUseOtherEquipment(exercise, text)) {
    tags.add("other_equipment");
  }

  return sortByKnownOrder([...tags], [
    "dumbbell",
    "barbell",
    "resistance_band",
    "machine",
    "cable",
    "kettlebell",
    "medicine_ball",
    "foam_roller",
    "ez_bar",
    "stability_ball",
    "other_equipment",
  ]);
}

function shouldUseOtherEquipment(exercise, text) {
  if (exercise.equipment === "body only") {
    return matchesAny(text, [/毛巾|towel/]);
  }

  if (matchesAny(text, [
    /健腹轮|ab roller/,
    /战绳|粗绳|battling ropes?/,
    /雪橇|sled/,
    /阿特拉斯石|atlas stone|石头/,
    /平衡板|balance board/,
    /车轴|axle/,
    /沙袋|重袋|heavy bag/,
    /链条|chain/,
    /吊带|悬挂吊带|straps?/,
    /轮胎|tire/,
    /圆木|log lift/,
    /酒桶|keg/,
    /马戏团铃|circus bell/,
    /农夫行走|farmers walk/,
    /毛巾|towel/,
    /扫帚杆|健身棒|broomstick|stick/,
    /皮带|腰带|带子|belt/,
    /滚轴|roller/,
    /重物|负重|\bweights?\b/,
  ])) {
    return true;
  }

  if (exercise.equipment !== "other") {
    return false;
  }

  if (exercise.homeRequirement === "small_equipment" && !needsGymFixture(text)) {
    return true;
  }

  if (["strongman", "olympic_weightlifting"].includes(exercise.category)) {
    return true;
  }

  return false;
}

function inferSupportRequirementTags(exercise, text, requiredEquipmentTags) {
  const tags = new Set();

  switch (exercise.homeRequirement) {
    case "floor":
      tags.add("floor_or_mat");
      break;
    case "support":
      tags.add("chair_or_wall");
      break;
    case "gym_equipment":
      tags.add("gym_fixture");
      break;
    case "partner":
      tags.add("partner");
      break;
    case "outdoor":
      tags.add("outdoor_space");
      break;
    case "none":
      tags.add("none");
      break;
  }

  if (needsPartner(text)) tags.add("partner");
  if (needsOutdoorSpace(exercise, text)) tags.add("outdoor_space");
  if (needsGymFixture(text)) tags.add("gym_fixture");
  if (needsHomeSupport(text) && !tags.has("gym_fixture")) tags.add("chair_or_wall");
  if (needsFloorOrMat(text)) tags.add("floor_or_mat");

  if (tags.has("none") && tags.size > 1) {
    tags.delete("none");
  }

  if (tags.size === 0 && requiredEquipmentTags.length === 0) {
    tags.add("none");
  } else if (tags.size === 0) {
    tags.add("none");
  }

  return sortByKnownOrder([...tags], [
    "none",
    "floor_or_mat",
    "chair_or_wall",
    "gym_fixture",
    "partner",
    "outdoor_space",
  ]);
}

function inferSetupComplexity(requiredEquipmentTags, supportRequirementTags) {
  if (supportRequirementTags.includes("outdoor_space")) return "outdoor";
  if (supportRequirementTags.includes("partner")) return "partner";
  if (supportRequirementTags.includes("gym_fixture")) return "gym_fixture";
  if (requiredEquipmentTags.length > 0) return "small_equipment";
  if (supportRequirementTags.includes("chair_or_wall")) return "home_support";
  if (supportRequirementTags.includes("floor_or_mat")) return "floor_or_mat";
  return "zero_setup";
}

function inferImpactLevel(exercise, text) {
  if (matchesAny(text, [
    /跳|跃|冲刺|跑步|快步|跨栏|弹跳|落地|下坡|jump|hop|bound|sprint|running|plyometric|depth jump/,
  ])) {
    return "high";
  }

  if (["plyometrics"].includes(exercise.category)) {
    return "high";
  }

  if (matchesAny(text, [/投掷|抛|摔|爆发|抓举|挺举|高翻|摆动|throw|slam|snatch|clean|jerk|swing/])) {
    return "medium";
  }

  if (["cardio", "strongman", "olympic_weightlifting"].includes(exercise.category)) {
    return "medium";
  }

  return "low";
}

function inferNoiseLevel(exercise, text, requiredEquipmentTags, supportRequirementTags, impactLevel) {
  if (
    impactLevel === "high" ||
    matchesAny(text, [
      /跳|跃|冲刺|跑步|落地|投掷|抛|摔|战绳|雪橇|阿特拉斯石|轮胎|圆木|drop|jump|hop|sprint|running|throw|slam|battle rope|sled/,
    ])
  ) {
    return "loud";
  }

  if (exercise.category === "stretching" && requiredEquipmentTags.length === 0 && !supportRequirementTags.includes("gym_fixture")) {
    return "quiet";
  }

  if (requiredEquipmentTags.length === 0 && supportRequirementTags.every((tag) => ["none", "floor_or_mat", "chair_or_wall"].includes(tag))) {
    return "quiet";
  }

  return "normal";
}

function inferConfidence(exercise, text, requiredEquipmentTags, supportRequirementTags) {
  if (exercise.equipment === "other" && requiredEquipmentTags.includes("other_equipment")) {
    return "medium";
  }

  if (exercise.equipment === "body only" && requiredEquipmentTags.length > 0) {
    return "medium";
  }

  if (supportRequirementTags.includes("partner") && !needsPartner(text)) {
    return "medium";
  }

  return "high";
}

function buildEvidence(exercise, requiredEquipmentTags, supportRequirementTags, setupComplexity, impactLevel, noiseLevel) {
  const equipmentText = requiredEquipmentTags.length > 0 ? `器械=${requiredEquipmentTags.join(",")}` : "无外部训练器械";
  const supportText = `支撑/场地=${supportRequirementTags.join(",")}`;
  const sourceText = [
    `旧字段 equipment=${exercise.equipment ?? "null"}/${exercise.equipmentZh ?? "null"}`,
    `homeRequirement=${exercise.homeRequirement}/${exercise.homeRequirementZh}`,
    `category=${exercise.category ?? "null"}`,
  ].join("；");

  return `${sourceText}；结合动作名和说明判断为 ${equipmentText}，${supportText}，setupComplexity=${setupComplexity}，impactLevel=${impactLevel}，noiseLevel=${noiseLevel}。`;
}

function buildSearchText(exercise) {
  return [
    exercise.id,
    exercise.nameEn,
    exercise.nameZh,
    exercise.category,
    exercise.categoryZh,
    exercise.equipment,
    exercise.equipmentZh,
    exercise.homeRequirement,
    exercise.homeRequirementZh,
    ...(exercise.primaryMuscles ?? []),
    ...(exercise.primaryMusclesZh ?? []),
    ...(exercise.secondaryMuscles ?? []),
    ...(exercise.secondaryMusclesZh ?? []),
    ...(exercise.instructionsEn ?? []),
    ...(exercise.instructionsZh ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function needsFloorOrMat(text) {
  return matchesAny(text, [
    /地板|地面|瑜伽垫|训练垫|仰卧|俯卧|躺|跪|四肢着地|平板|卷腹|俯卧撑|臀桥|sit-up|crunch|floor|mat|lying|supine|prone|kneel|plank|push-up|pushup|bridge/,
  ]);
}

function needsHomeSupport(text) {
  return matchesAny(text, [
    /椅子|墙|墙面|台阶|箱子|跳箱|长椅|凳|平台|门框|\bchair\b|\bwall\b|\bbox(es)?\b|\bbench(es)?\b|\bplatforms?\b/,
  ]);
}

function needsGymFixture(text) {
  return matchesAny(text, [
    /单杠|双杠|平行杠|引体向上杆|吊环|深蹲架|史密斯机|训练机|机器|高位下拉机|卧推凳|平板凳|下斜板|超级伸展凳|牧师凳|架子|横杆|杠铃杆放置|\bparallel bars?\b|\bpull-?up bars?\b|\bchin-?up bars?\b|\brings?\b|\bsquat racks?\b|\bsmith machines?\b|\bbenches?\b|\bmachines?\b|\bhyperextension bench(es)?\b/,
  ]);
}

function needsPartner(text) {
  return matchesAny(text, [/搭档|同伴|保护者|partner|spotter/]);
}

function needsOutdoorSpace(exercise, text) {
  return exercise.homeRequirement === "outdoor" || matchesAny(text, [/户外|跑道|小径|越野|trail|outdoor/]);
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function sortByKnownOrder(values, order) {
  const rank = new Map(order.map((value, index) => [value, index]));
  return values.sort((left, right) => (rank.get(left) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right) ?? Number.MAX_SAFE_INTEGER));
}

function countBy(records, getKey) {
  return Object.fromEntries(
    [...records.reduce((map, record) => map.set(getKey(record), (map.get(getKey(record)) ?? 0) + 1), new Map())].sort(),
  );
}

function countTags(records, getTags) {
  const map = new Map();

  for (const record of records) {
    for (const tag of getTags(record)) {
      map.set(tag, (map.get(tag) ?? 0) + 1);
    }
  }

  return Object.fromEntries([...map].sort());
}

function pickTaxonomy(record) {
  return {
    requiresExternalEquipment: record.requiresExternalEquipment,
    requiredEquipmentTags: record.requiredEquipmentTags,
    supportRequirementTags: record.supportRequirementTags,
    setupComplexity: record.setupComplexity,
    impactLevel: record.impactLevel,
    noiseLevel: record.noiseLevel,
  };
}

function isUnknownTaxonomy(record) {
  return (
    record.requiresExternalEquipment === null &&
    record.requiredEquipmentTags.length === 0 &&
    record.supportRequirementTags.length === 0 &&
    record.setupComplexity === "unknown" &&
    record.impactLevel === null &&
    record.noiseLevel === null
  );
}

async function readBackfillRecords(filePath) {
  return parseBackfillJsonl(await readFile(filePath, "utf8"));
}

async function writeGeneratedBackfill(filePath) {
  const records = generateBackfillRecords();
  await writeFile(filePath, stringifyBackfillRecords(records), "utf8");
  return records;
}

async function applyBackfill(options) {
  loadEnvConfig(projectDir);

  const records = await readBackfillRecords(options.backfillPath);
  const selectedRecords = records.filter((record) => options.onlyIds.size === 0 || options.onlyIds.has(record.exerciseId));
  const limitedRecords = options.limit === null ? selectedRecords : selectedRecords.slice(0, options.limit);
  const connectionString = process.env.DATABASE_URL ?? "postgresql://fitmate:fitmate@localhost:5432/fitmate?schema=public";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const existingRecords = await prisma.exercise.findMany({
      where: { id: { in: limitedRecords.map((record) => record.exerciseId) } },
      select: {
        id: true,
        requiresExternalEquipment: true,
        requiredEquipmentTags: true,
        supportRequirementTags: true,
        setupComplexity: true,
        impactLevel: true,
        noiseLevel: true,
      },
    });
    const existingById = new Map(existingRecords.map((record) => [record.id, record]));
    const missingRecords = limitedRecords.filter((record) => !existingById.has(record.exerciseId));
    const candidateRecords = limitedRecords.filter((record) => {
      const existing = existingById.get(record.exerciseId);
      return existing && (options.allowOverwrite || isUnknownTaxonomy(existing));
    });
    const skippedExistingRecords = limitedRecords.filter((record) => {
      const existing = existingById.get(record.exerciseId);
      return existing && !options.allowOverwrite && !isUnknownTaxonomy(existing);
    });

    printApplySummary({
      mode: options.apply ? "apply" : "dry-run",
      records,
      selectedRecords,
      limitedRecords,
      candidateRecords,
      skippedExistingRecords,
      missingRecords,
    });

    if (!options.apply || candidateRecords.length === 0) {
      return;
    }

    await prisma.$transaction(
      candidateRecords.map((record) =>
        prisma.exercise.update({
          where: { id: record.exerciseId },
          data: pickTaxonomy(record),
        }),
      ),
    );

    console.log(`Applied ${candidateRecords.length} exercise execution taxonomy updates.`);
  } finally {
    await prisma.$disconnect();
  }
}

function printApplySummary(input) {
  console.log(
    JSON.stringify(
      {
        mode: input.mode,
        backfillRecordCount: input.records.length,
        selectedRecordCount: input.selectedRecords.length,
        limitedRecordCount: input.limitedRecords.length,
        updateCandidateCount: input.candidateRecords.length,
        skippedExistingCount: input.skippedExistingRecords.length,
        missingExerciseCount: input.missingRecords.length,
        missingExerciseIds: input.missingRecords.map((record) => record.exerciseId).slice(0, 20),
      },
      null,
      2,
    ),
  );
}

function parseArgs(args) {
  const options = {
    generate: false,
    validate: false,
    apply: false,
    allowOverwrite: false,
    backfillPath: defaultBackfillPath,
    limit: null,
    onlyIds: new Set(),
    help: false,
  };
  const errors = [];

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];

    if (value === "--help" || value === "-h") {
      options.help = true;
      continue;
    }

    if (value === "--generate") {
      options.generate = true;
      continue;
    }

    if (value === "--validate") {
      options.validate = true;
      continue;
    }

    if (value === "--apply") {
      options.apply = true;
      continue;
    }

    if (value === "--allow-overwrite") {
      options.allowOverwrite = true;
      continue;
    }

    if (value === "--backfill") {
      const nextValue = args[index + 1];
      if (!nextValue) {
        errors.push("--backfill 缺少文件路径。");
      } else {
        options.backfillPath = path.resolve(projectDir, nextValue);
        index += 1;
      }
      continue;
    }

    if (value.startsWith("--backfill=")) {
      options.backfillPath = path.resolve(projectDir, value.slice("--backfill=".length));
      continue;
    }

    if (value === "--limit") {
      const nextValue = args[index + 1];
      if (!nextValue) {
        errors.push("--limit 缺少数量。");
      } else {
        options.limit = parsePositiveInteger(nextValue, "--limit", errors);
        index += 1;
      }
      continue;
    }

    if (value.startsWith("--limit=")) {
      options.limit = parsePositiveInteger(value.slice("--limit=".length), "--limit", errors);
      continue;
    }

    if (value === "--only") {
      const nextValue = args[index + 1];
      if (!nextValue) {
        errors.push("--only 缺少 exercise id。");
      } else {
        addOnlyIds(options.onlyIds, nextValue);
        index += 1;
      }
      continue;
    }

    if (value.startsWith("--only=")) {
      addOnlyIds(options.onlyIds, value.slice("--only=".length));
      continue;
    }

    errors.push(`未知参数：${value}`);
  }

  return { options, errors };
}

function parsePositiveInteger(value, label, errors) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    errors.push(`${label} 必须是正整数。`);
    return null;
  }
  return parsed;
}

function addOnlyIds(target, value) {
  for (const id of value.split(",").map((item) => item.trim()).filter(Boolean)) {
    target.add(id);
  }
}

function printHelp() {
  console.log(
    [
      "用法：node scripts/backfill-exercise-execution-taxonomy.mjs [--generate] [--validate] [--apply]",
      "",
      "默认读取 data/exercise-execution-taxonomy.backfill.jsonl 并执行 dry-run，不写数据库。",
      "",
      "常用参数：",
      "  --generate             从 data/exercises.zh.json 生成 JSONL 补丁文件",
      "  --validate             只校验 JSONL 补丁文件，不连接数据库",
      "  --apply                事务化写入本地 DATABASE_URL 指向的 Exercise 表",
      "  --allow-overwrite      允许覆盖已经补齐的 taxonomy 字段",
      "  --limit <n>            只处理前 n 条补丁记录",
      "  --only <id,id>         只处理指定 exercise id",
      "  --backfill <path>      指定 JSONL 补丁文件，默认 data/exercise-execution-taxonomy.backfill.jsonl",
    ].join("\n"),
  );
}

async function main() {
  const { options, errors } = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (options.generate) {
    const records = await writeGeneratedBackfill(options.backfillPath);
    console.log(`Generated ${records.length} records at ${path.relative(projectDir, options.backfillPath)}.`);
    console.log(JSON.stringify(summarizeBackfillRecords(records), null, 2));
    return;
  }

  if (!existsSync(options.backfillPath)) {
    throw new Error(`Backfill file does not exist: ${options.backfillPath}`);
  }

  const records = await readBackfillRecords(options.backfillPath);
  console.log(`Validated ${records.length} records from ${path.relative(projectDir, options.backfillPath)}.`);
  console.log(JSON.stringify(summarizeBackfillRecords(records), null, 2));

  if (options.validate) {
    return;
  }

  await applyBackfill(options);
}

function isCliEntryPoint() {
  if (!process.argv[1]) {
    return false;
  }

  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isCliEntryPoint()) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
