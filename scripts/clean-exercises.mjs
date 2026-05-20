import fs from "node:fs";
import path from "node:path";

const SOURCE = "yuhonas/free-exercise-db";
const SOURCE_URL = "https://github.com/yuhonas/free-exercise-db";
const IMAGE_BASE_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";

const inputPath = process.argv[2] ?? "data/exercises.json";
const outputPath = process.argv[3] ?? "data/processed/exercises.zh.json";

const forceMap = {
  pull: "拉",
  push: "推",
  static: "静态",
};

const levelMap = {
  beginner: "初级",
  intermediate: "中级",
  expert: "高级",
};

const mechanicMap = {
  compound: "复合动作",
  isolation: "孤立动作",
};

const equipmentMap = {
  bands: "弹力带",
  barbell: "杠铃",
  "body only": "自重",
  cable: "绳索器械",
  dumbbell: "哑铃",
  "e-z curl bar": "EZ 曲杆",
  "exercise ball": "健身球",
  "foam roll": "泡沫轴",
  kettlebells: "壶铃",
  machine: "固定器械",
  "medicine ball": "药球",
  other: "其他",
};

const categoryMap = {
  cardio: "有氧训练",
  "olympic weightlifting": "奥林匹克举重",
  plyometrics: "增强式训练",
  powerlifting: "力量举",
  strength: "力量训练",
  stretching: "拉伸",
  strongman: "大力士训练",
};

const muscleMap = {
  abdominals: "腹肌",
  abductors: "髋外展肌群",
  adductors: "髋内收肌群",
  biceps: "肱二头肌",
  calves: "小腿",
  chest: "胸部",
  forearms: "前臂",
  glutes: "臀部",
  hamstrings: "腘绳肌",
  lats: "背阔肌",
  "lower back": "下背部",
  "middle back": "中背部",
  neck: "颈部",
  quadriceps: "股四头肌",
  shoulders: "肩部",
  traps: "斜方肌",
  triceps: "肱三头肌",
};

const nameMap = {
  "3/4 Sit-Up": "四分之三仰卧起坐",
  "90/90 Hamstring": "90/90 腘绳肌拉伸",
  "Ab Crunch Machine": "器械卷腹",
  "Ab Roller": "健腹轮",
  "Adductor": "髋内收训练",
  "Air Bike": "空中自行车卷腹",
  "Alternate Hammer Curl": "交替锤式弯举",
  "Alternate Incline Dumbbell Curl": "上斜哑铃交替弯举",
  "Barbell Bench Press - Medium Grip": "杠铃卧推（中握距）",
  "Barbell Curl": "杠铃弯举",
  "Barbell Deadlift": "杠铃硬拉",
  "Barbell Full Squat": "杠铃深蹲",
  "Bodyweight Squat": "自重深蹲",
  "Burpee": "波比跳",
  "Cable Crunch": "绳索卷腹",
  "Chin-Up": "反握引体向上",
  "Crunches": "卷腹",
  "Dumbbell Bench Press": "哑铃卧推",
  "Dumbbell Shoulder Press": "哑铃肩推",
  "Front Barbell Squat": "杠铃前蹲",
  "Hammer Curls": "锤式弯举",
  "Hanging Leg Raise": "悬垂举腿",
  "Incline Dumbbell Press": "上斜哑铃卧推",
  "Leg Press": "腿举",
  "Pullups": "引体向上",
  "Pushups": "俯卧撑",
  "Seated Cable Rows": "坐姿绳索划船",
  "Side Plank": "侧平板支撑",
  "Sit-Up": "仰卧起坐",
  "Squat": "深蹲",
};

const instructionPhraseMap = [
  ["Lie down on the floor", "躺在地面上"],
  ["secure your feet", "固定双脚"],
  ["Your legs should be bent at the knees", "双腿屈膝"],
  ["Place your hands behind or to the side of your head", "双手放在头后或头部两侧"],
  ["This will be your starting position", "这是起始姿势"],
  ["starting position", "起始姿势"],
  ["Flex your hips and spine", "屈髋并弯曲脊柱"],
  ["raise your torso toward your knees", "将躯干抬向膝盖方向"],
  ["Reverse the motion", "反向还原动作"],
  ["Repeat for the recommended amount of repetitions", "按建议次数重复动作"],
  ["Keep your back straight", "保持背部挺直"],
  ["Keep your chest up", "保持挺胸"],
  ["Keep your head up", "保持抬头"],
  ["Breathe out", "呼气"],
  ["Breathe in", "吸气"],
  ["Pause briefly", "短暂停留"],
  ["slowly", "缓慢地"],
  ["contract", "收缩"],
  ["lower", "下放"],
  ["raise", "抬起"],
  ["return", "回到"],
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function nullable(value) {
  return value === undefined || value === null || value === "" ? null : value;
}

function mapValue(map, value) {
  const normalized = nullable(value);
  return normalized === null ? null : map[normalized] ?? normalized;
}

function mapArray(map, values) {
  return (values ?? []).map((value) => mapValue(map, value)).filter(Boolean);
}

function inferNameZh(name) {
  if (nameMap[name]) return nameMap[name];
  return name
    .replace(/\bBarbell\b/g, "杠铃")
    .replace(/\bDumbbell\b/g, "哑铃")
    .replace(/\bCable\b/g, "绳索")
    .replace(/\bMachine\b/g, "器械")
    .replace(/\bSeated\b/g, "坐姿")
    .replace(/\bStanding\b/g, "站姿")
    .replace(/\bIncline\b/g, "上斜")
    .replace(/\bDecline\b/g, "下斜")
    .replace(/\bBench\b/g, "卧推凳")
    .replace(/\bPress\b/g, "推举")
    .replace(/\bCurl\b/g, "弯举")
    .replace(/\bRow\b/g, "划船")
    .replace(/\bSquat\b/g, "深蹲")
    .replace(/\bLunge\b/g, "弓步")
    .replace(/\bRaise\b/g, "抬举")
    .replace(/\bExtension\b/g, "伸展")
    .replace(/\bStretch\b/g, "拉伸")
    .trim();
}

function translateInstruction(instruction) {
  let result = instruction;
  for (const [source, target] of instructionPhraseMap) {
    result = result.replaceAll(source, target);
  }

  return result === instruction ? `待翻译：${instruction}` : result;
}

function inferRiskTags(exercise) {
  const tags = new Set();
  const name = exercise.name.toLowerCase();
  const category = nullable(exercise.category);
  const primary = new Set(exercise.primaryMuscles ?? []);
  const secondary = new Set(exercise.secondaryMuscles ?? []);
  const muscles = new Set([...primary, ...secondary]);

  if (category === "plyometrics" || category === "olympic weightlifting") {
    tags.add("high_impact");
  }

  if (category === "powerlifting" || name.includes("deadlift") || name.includes("squat")) {
    tags.add("spine_load");
  }

  if (muscles.has("lower back")) {
    tags.add("lower_back_attention");
  }

  if (name.includes("lunge") || name.includes("jump") || name.includes("squat")) {
    tags.add("knee_attention");
  }

  if (name.includes("behind neck") || muscles.has("shoulders")) {
    tags.add("shoulder_attention");
  }

  return [...tags].sort();
}

function inferGoalTags(exercise) {
  const tags = new Set();
  const category = nullable(exercise.category);
  const level = nullable(exercise.level);
  const equipment = nullable(exercise.equipment);

  if (category === "strength" || category === "powerlifting") tags.add("strength");
  if (category === "cardio") tags.add("cardio");
  if (category === "stretching") tags.add("mobility");
  if (category === "plyometrics") tags.add("power");
  if (equipment === "body only") tags.add("home_friendly");
  if (level === "beginner") tags.add("beginner_friendly");

  return [...tags].sort();
}

function cleanExercise(exercise) {
  const images = exercise.images ?? [];

  return {
    id: exercise.id,
    source: SOURCE,
    sourceUrl: SOURCE_URL,
    sourceId: exercise.id,
    license: "Unlicense",
    nameEn: exercise.name,
    nameZh: inferNameZh(exercise.name),
    category: nullable(exercise.category),
    categoryZh: mapValue(categoryMap, exercise.category),
    level: nullable(exercise.level),
    levelZh: mapValue(levelMap, exercise.level),
    force: nullable(exercise.force),
    forceZh: mapValue(forceMap, exercise.force),
    mechanic: nullable(exercise.mechanic),
    mechanicZh: mapValue(mechanicMap, exercise.mechanic),
    equipment: nullable(exercise.equipment),
    equipmentZh: mapValue(equipmentMap, exercise.equipment),
    primaryMuscles: exercise.primaryMuscles ?? [],
    primaryMusclesZh: mapArray(muscleMap, exercise.primaryMuscles),
    secondaryMuscles: exercise.secondaryMuscles ?? [],
    secondaryMusclesZh: mapArray(muscleMap, exercise.secondaryMuscles),
    instructionsEn: exercise.instructions ?? [],
    instructionsZh: (exercise.instructions ?? []).map(translateInstruction),
    images,
    imageUrls: images.map((image) => `${IMAGE_BASE_URL}/${image}`),
    riskTags: inferRiskTags(exercise),
    goalTags: inferGoalTags(exercise),
    reviewStatus: "machine_assisted",
    isPublished: false,
  };
}

const sourceExercises = readJson(inputPath);

if (!Array.isArray(sourceExercises)) {
  throw new Error(`Expected an array in ${inputPath}`);
}

const cleanedExercises = sourceExercises.map(cleanExercise);
writeJson(outputPath, cleanedExercises);

const stats = {
  input: inputPath,
  output: outputPath,
  count: cleanedExercises.length,
  unpublished: cleanedExercises.filter((exercise) => !exercise.isPublished).length,
  instructionsNeedReview: cleanedExercises.reduce(
    (total, exercise) =>
      total +
      exercise.instructionsZh.filter((instruction) => instruction.startsWith("待翻译：")).length,
    0,
  ),
};

console.log(JSON.stringify(stats, null, 2));
