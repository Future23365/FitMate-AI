import fs from "node:fs";
import path from "node:path";

const envPath = ".env.local";
const inputPath = process.argv[2] ?? "data/processed/exercises.zh.json";
const outputPath = process.argv[3] ?? inputPath;
const batchSize = Number(process.env.TRANSLATE_BATCH_SIZE ?? 8);
const limit = Number(process.env.TRANSLATE_LIMIT ?? 0);
const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";

loadEnvFile(envPath);

const apiKey = process.env.DEEPSEEK_API_KEY;

if (!apiKey) {
  throw new Error("Missing DEEPSEEK_API_KEY environment variable.");
}

const exercises = readJson(inputPath);

if (!Array.isArray(exercises)) {
  throw new Error(`Expected an array in ${inputPath}`);
}

const candidates = exercises
  .map((exercise, index) => ({ exercise, index }))
  .filter(({ exercise }) => needsExerciseTranslation(exercise));

const selected = limit > 0 ? candidates.slice(0, limit) : candidates;

console.log(
  JSON.stringify(
    {
      input: inputPath,
      output: outputPath,
      model,
      batchSize,
      total: exercises.length,
      needTranslation: candidates.length,
      selected: selected.length,
    },
    null,
    2,
  ),
);

for (let offset = 0; offset < selected.length; offset += batchSize) {
  const batch = selected.slice(offset, offset + batchSize);
  const translated = await translateBatchWithFallback(batch.map(({ exercise }) => exercise));

  for (const item of translated) {
    const target = batch.find(({ exercise }) => exercise.id === item.id);

    if (!target) {
      throw new Error(`Unexpected translated exercise id: ${item.id}`);
    }

    exercises[target.index] = {
      ...target.exercise,
      nameZh: item.nameZh.trim(),
      instructionsZh: item.instructionsZh.map((instruction) => instruction.trim()),
      reviewStatus: "machine_translated",
    };
  }

  writeJson(outputPath, exercises);
  console.log(
    JSON.stringify({
      translated: Math.min(offset + batch.length, selected.length),
      remaining: selected.length - offset - batch.length,
    }),
  );
}

console.log(
  JSON.stringify(
    {
      output: outputPath,
      remaining: exercises.filter(needsExerciseTranslation).length,
    },
    null,
    2,
  ),
);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function needsExerciseTranslation(exercise) {
  return (
    hasEnglishLetters(exercise.nameZh) ||
    exercise.instructionsZh.some(
      (instruction) => instruction.startsWith("待翻译：") || hasEnglishLetters(instruction),
    )
  );
}

function hasEnglishLetters(value) {
  return /[A-Za-z]{2,}/.test(value ?? "");
}

async function translateBatch(batch) {
  const payload = batch.map((exercise) => ({
    id: exercise.id,
    nameEn: exercise.nameEn,
    currentNameZh: exercise.nameZh,
    categoryZh: exercise.categoryZh,
    equipmentZh: exercise.equipmentZh,
    primaryMusclesZh: exercise.primaryMusclesZh,
    secondaryMusclesZh: exercise.secondaryMusclesZh,
    instructionsEn: exercise.instructionsEn,
  }));

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "你是专业健身动作资料翻译员。",
            "把英文健身动作名称和步骤翻译成简体中文。",
            "要求：准确、自然、适合健身 App 展示；不要添加原文没有的信息；不要医疗诊断；不要保留英文整句。",
            "常见术语保持一致：rep=次数，set=组，starting position=起始姿势，contract=收缩，lower=下放，raise=抬起。",
            "只返回 JSON，不要 Markdown。",
            "JSON 结构必须是：{\"exercises\":[{\"id\":\"...\",\"nameZh\":\"...\",\"instructionsZh\":[\"...\"]}]}。",
            "每个 instructionsZh 的数组长度必须与输入 instructionsEn 完全一致。",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({ exercises: payload }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API request failed: ${response.status} ${errorText}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new Error("DeepSeek API returned an empty translation.");
  }

  const parsed = JSON.parse(content);

  if (!Array.isArray(parsed.exercises)) {
    throw new Error("Translation response must include exercises array.");
  }

  return parsed.exercises;
}

async function translateBatchWithFallback(batch) {
  let translated;

  try {
    translated = await translateBatch(batch);
  } catch (error) {
    if (batch.length === 1) {
      const exercise = batch[0];
      console.warn(
        JSON.stringify({
          warning: "Translation failed for single exercise. Keeping current text.",
          id: exercise.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );

      return [repairTranslationShape(exercise, { id: exercise.id, nameZh: exercise.nameZh })];
    }

    console.warn(
      JSON.stringify({
        warning: "Translation batch failed. Retrying one by one.",
        ids: batch.map((exercise) => exercise.id),
        error: error instanceof Error ? error.message : String(error),
      }),
    );

    const repaired = [];

    for (const exercise of batch) {
      const [item] = await translateBatchWithFallback([exercise]);
      repaired.push(item);
    }

    return repaired;
  }

  const invalid = findInvalidTranslations(batch, translated);

  if (invalid.length === 0) {
    return translated;
  }

  if (batch.length === 1) {
    const exercise = batch[0];
    const item = translated.find((entry) => entry.id === exercise.id);

    return [
      repairTranslationShape(exercise, item ?? { id: exercise.id, nameZh: exercise.nameZh }),
    ];
  }

  console.warn(
    JSON.stringify({
      warning: "Invalid translation shape. Retrying one by one.",
      ids: invalid,
    }),
  );

  const repaired = [];

  for (const exercise of batch) {
    const [item] = await translateBatchWithFallback([exercise]);
    repaired.push(item);
  }

  return repaired;
}

function findInvalidTranslations(sourceExercises, translatedExercises) {
  return sourceExercises
    .filter((exercise) => {
      const item = translatedExercises.find((entry) => entry.id === exercise.id);

      return (
        !item ||
        typeof item.nameZh !== "string" ||
        !Array.isArray(item.instructionsZh) ||
        item.instructionsZh.length !== exercise.instructionsEn.length
      );
    })
    .map((exercise) => exercise.id);
}

function repairTranslationShape(exercise, item) {
  const instructionsZh = Array.isArray(item.instructionsZh) ? item.instructionsZh : [];

  return {
    id: exercise.id,
    nameZh:
      typeof item.nameZh === "string" && item.nameZh.trim().length > 0
        ? item.nameZh
        : exercise.nameZh,
    instructionsZh: exercise.instructionsEn.map(
      (_instruction, index) => instructionsZh[index] ?? exercise.instructionsZh[index],
    ),
  };
}
