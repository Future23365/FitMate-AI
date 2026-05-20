import fs from "node:fs";

const filePath = process.argv[2] ?? "data/processed/exercises.zh.json";

const nameOverrides = {
  "Floor_Glute-Ham_Raise": "地面臀腿抬举",
  Floor_Press: "地板卧推",
  Floor_Press_with_Chains: "链条地板卧推",
  Flutter_Kicks: "仰卧交替打腿",
  "Foot-SMR": "足底自我筋膜放松",
  Forward_Drag_with_Press: "前向拖拽推举",
  Frankenstein_Squat: "弗兰肯斯坦深蹲",
  Iron_Cross: "铁十字",
  Iron_Crosses_stretch: "铁十字拉伸",
  Isometric_Chest_Squeezes: "胸部等长挤压",
  "Isometric_Neck_Exercise_-_Front_And_Back": "颈部前后等长训练",
  JM_Press: "JM 卧推",
  "Janda_Sit-Up": "扬达仰卧起坐",
  Kettlebell_Pirate_Ships: "壶铃海盗船",
  Kettlebell_Pistol_Squat: "壶铃手枪深蹲",
  Leverage_Shoulder_Press: "器械肩推",
  Preacher_Curl: "牧师凳弯举",
  Preacher_Hammer_Dumbbell_Curl: "牧师凳哑铃锤式弯举",
  Svend_Press: "斯文德推举",
  Tate_Press: "泰特推举",
  Toe_Touchers: "仰卧触脚尖",
  Torso_Rotation: "躯干旋转",
  Trail_Running_Walking: "越野跑步/步行",
  Trap_Bar_Deadlift: "六角杠硬拉",
  Tricep_Dumbbell_Kickback: "哑铃肱三头肌后踢",
  Tricep_Side_Stretch: "肱三头肌侧向拉伸",
  Triceps_Overhead_Extension_with_Rope: "绳索过头肱三头肌伸展",
  Triceps_Pushdown: "绳索肱三头肌下压",
};

const textReplacements = [
  [/\bFloor Glute-Ham\b/g, "地面臀腿"],
  [/\bFloor\b/g, "地板"],
  [/\bFlutter Kicks\b/g, "仰卧交替打腿"],
  [/\bForward Drag with\b/g, "前向拖拽"],
  [/\bFrankenstein\b/g, "弗兰肯斯坦"],
  [/\bIron Crosses?(\s*\(stretch\))?\b/g, "铁十字拉伸"],
  [/\bIsometric Chest Squeezes\b/g, "胸部等长挤压"],
  [/\bIsometric Neck Exercise - Front And Back\b/g, "颈部前后等长训练"],
  [/\bKettlebell\b/g, "壶铃"],
  [/\bLeverage\b/g, "器械"],
  [/\bPreacher Hammer\b/g, "牧师凳锤式"],
  [/\bPreacher\b/g, "牧师凳"],
  [/\bToe Touchers\b/g, "仰卧触脚尖"],
  [/\bTorso Rotation\b/g, "躯干旋转"],
  [/\bTrail Running\/Walking\b/g, "越野跑步/步行"],
  [/\bTrap Bar Deadlift\b/g, "六角杠硬拉"],
  [/\bTricep\b/g, "肱三头肌"],
  [/\bTriceps\b/g, "肱三头肌"],
  [/\bKickback\b/g, "后踢"],
  [/\bPushdown\b/g, "下压"],
  [/\bOverhead\b/g, "过头"],
  [/\bwith Rope\b/g, "绳索"],
  [/\bZercher\b/g, "泽奇尔"],
  [/\bEZ Curl\b/g, "EZ 弯杆"],
  [/\b1RM\b/g, "一次最大重量"],
];

const exercises = JSON.parse(fs.readFileSync(filePath, "utf8"));

for (const exercise of exercises) {
  if (nameOverrides[exercise.id]) {
    exercise.nameZh = nameOverrides[exercise.id];
  } else {
    exercise.nameZh = normalizeText(exercise.nameZh);
  }

  exercise.instructionsZh = exercise.instructionsZh.map(normalizeText);
}

fs.writeFileSync(filePath, `${JSON.stringify(exercises, null, 2)}\n`);

const strictEnglishLeft = exercises.filter((exercise) =>
  [exercise.nameZh, ...exercise.instructionsZh].some(hasStrictEnglish),
);

console.log(
  JSON.stringify(
    {
      output: filePath,
      total: exercises.length,
      strictEnglishLeft: strictEnglishLeft.length,
      strictEnglishLeftIds: strictEnglishLeft.map((exercise) => exercise.id),
    },
    null,
    2,
  ),
);

function normalizeText(text) {
  let normalized = text;

  for (const [pattern, replacement] of textReplacements) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized.replace(/\s+/g, " ").trim();
}

function hasStrictEnglish(text) {
  const allowed = new Set(["EZ", "Bosu", "SMR", "PVC", "JM"]);
  const matches = text.match(/[A-Za-z]{2,}/g) ?? [];

  return matches.some((match) => !allowed.has(match));
}
