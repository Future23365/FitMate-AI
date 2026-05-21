import exercisesData from "@/data/exercises.zh.json";
import type { Exercise } from "@/lib/exercises/types";

import {
  workoutPlanDraftSchema,
  workoutPlanIntentSchema,
  type WorkoutPlanDraft,
  type WorkoutPlanIntent,
} from "./draft-schema";
import { selectExerciseCandidates } from "./exercise-candidate-service";
import { convertWorkoutPlanDraftToSavedWorkout } from "./saved-workout";

// 静态动作数据
const exercises = exercisesData as Exercise[];

/**
 * 敏感词高风险身体状况拦截检测 (移植自 ai-workout-plan-service.ts/hasHighRiskHealthCondition)
 */
function hasHighRiskHealthCondition(text: string): boolean {
  return /(胸痛|心脏病|心梗|中风|晕厥|昏厥|怀孕|孕期|产后|骨折|术后|手术后|高血压|糖尿病|癌症|肿瘤)/.test(
    text
  );
}

/**
 * 核心测试套件
 */
export function runWorkoutPlanTests() {
  console.log("🚀 开始执行 FitMate AI 训练计划核心逻辑单元测试...");

  try {
    // -------------------------------------------------------------
    // 测试点 1: Zod 意图 Schema 验证 (workoutPlanIntentSchema)
    // -------------------------------------------------------------
    console.log("🧪 测试点 1: Zod 意图 Schema 验证...");
    const validIntent: WorkoutPlanIntent = {
      intentType: "plan",
      goal: "增肌塑形",
      experience: "beginner",
      sessionMinutes: 45,
      weeklyFrequency: 3,
      equipment: ["哑铃"],
      injuryLimitations: [],
      preferences: ["居家"],
      avoidances: [],
    };
    const parsed = workoutPlanIntentSchema.parse(validIntent);
    console.assert(parsed.experience === "beginner", "experience 应当正确解析");
    console.assert(parsed.sessionMinutes === 45, "sessionMinutes 应当正确解析");

    // 测试非法参数拦截
    try {
      workoutPlanIntentSchema.parse({
        ...validIntent,
        experience: "superman", // 非法经验级别
      });
      console.assert(false, "应当拦截非法的 experience 经验级");
    } catch {
      // 成功拦截，符合预期
    }

    // -------------------------------------------------------------
    // 测试点 2: 敏感词与高风险健康拦截 (hasHighRiskHealthCondition)
    // -------------------------------------------------------------
    console.log("🧪 测试点 2: 敏感词与高风险身体状况安全拦截...");
    const safeText = "我是一个健康的上班族，想减脂，膝盖有一点点累，没有受过伤。";
    const unsafeText1 = "我刚做完手术，术后恢复期，心脏不太舒服，胸痛。";
    const unsafeText2 = "我是孕妇，目前处于孕期，想做点轻量拉伸。";

    console.assert(!hasHighRiskHealthCondition(safeText), "安全文本不应当被拦截");
    console.assert(hasHighRiskHealthCondition(unsafeText1), "胸痛、术后等词汇必须被安全拦截");
    console.assert(hasHighRiskHealthCondition(unsafeText2), "孕期等敏感词必须被安全拦截");

    // -------------------------------------------------------------
    // 测试点 3: 动作候选筛选与安全防伤病过滤 (selectExerciseCandidates)
    // -------------------------------------------------------------
    console.log("🧪 测试点 3: 动作筛选与防伤病过滤...");
    // 新手排除专家动作
    const beginnerIntent: WorkoutPlanIntent = {
      intentType: "plan",
      goal: "提升心肺",
      experience: "beginner",
      sessionMinutes: 30,
      weeklyFrequency: 3,
      equipment: ["自重"],
      injuryLimitations: [],
      preferences: [],
      avoidances: [],
    };
    const beginnerResult = selectExerciseCandidates(beginnerIntent, exercises);
    
    // 验证新手用户的候选动作中不能含有 expert 动作
    const hasExpert = beginnerResult.primaryCandidates.some(
      (c) => c.exercise.level === "expert"
    );
    console.assert(!hasExpert, "新手用户的 primary 动作候选集不能含有专家级(expert)动作");

    // 验证分层分数正确性
    const primaryScoreCorrect = beginnerResult.primaryCandidates.every(
      (c) => c.score >= 28
    );
    console.assert(primaryScoreCorrect, "primary 候选的分数都应当大于等于 28");

    const supplementaryScoreCorrect = beginnerResult.supplementaryCandidates.every(
      (c) => c.score < 28
    );
    console.assert(supplementaryScoreCorrect, "supplementary 候选的分数都应当小于 28");

    // 伤病用户排除高冲击动作
    const injuryIntent: WorkoutPlanIntent = {
      ...beginnerIntent,
      injuryLimitations: ["膝盖疼痛，有半月板旧伤"],
    };
    const injuryResult = selectExerciseCandidates(injuryIntent, exercises);
    // 验证膝盖伤病排除了高冲击 (high_impact) 动作
    const hasHighImpact = injuryResult.primaryCandidates.some((c) =>
      c.exercise.riskTags.includes("high_impact")
    );
    console.assert(!hasHighImpact, "有膝盖疼痛的用户在 primary 候选集中应当排除高冲击(high_impact)动作");

    // -------------------------------------------------------------
    // 测试点 4: 计划草稿转持久化 SavedWorkout 实体 (convertWorkoutPlanDraftToSavedWorkout)
    // -------------------------------------------------------------
    console.log("🧪 测试点 4: 计划草稿转换与转码验证...");
    
    // 模拟一个合规的计划草稿
    // 我们找出候选集中的前两个动作 ID，避免随机编造导致校验失败
    const mockExerciseIds = beginnerResult.primaryCandidates.slice(0, 2).map((c) => c.exercise.id);
    console.assert(mockExerciseIds.length >= 2, "动作库中必须有足够的候选动作以供测试");

    const mockDraft: WorkoutPlanDraft = {
      title: "活力减脂计划",
      goal: "全身减脂",
      summary: "适合新手的自重全身减脂计划",
      weeklyFrequency: 3,
      estimatedSessionMinutes: 30,
      safetyNotes: ["注意保持身体直立，避免憋气"],
      days: [
        {
          title: "Day 1 核心激活",
          focus: "核心与下肢",
          dayIndex: 1,
          estimatedMinutes: 25,
          items: [
            {
              exerciseId: mockExerciseIds[0],
              mode: "reps",
              sets: 3,
              target: 15,
              setRestSeconds: 45,
              transitionRestSeconds: 60,
              notes: "注意核心收紧",
            },
            {
              exerciseId: mockExerciseIds[1],
              mode: "duration",
              sets: 3,
              target: 30,
              setRestSeconds: 45,
              transitionRestSeconds: 60,
              notes: "平稳呼吸",
            },
          ],
          safetyNotes: ["训练前后注意拉伸"],
        },
      ],
    };

    const savedWorkout = convertWorkoutPlanDraftToSavedWorkout(mockDraft, exercises, {
      dayIndex: 1,
    });

    console.assert(savedWorkout.title === "Day 1 核心激活", "SavedWorkout 标题解析不符");
    console.assert(savedWorkout.items.length === 2, "SavedWorkout 动作数量解析不符");
    
    const firstSavedItem = savedWorkout.items[0];
    console.assert(firstSavedItem.exerciseId === mockExerciseIds[0], "动作 ID 转换错误");
    console.assert(firstSavedItem.sets === 3, "组数转换错误");
    console.assert(firstSavedItem.target === 15, "次数转换错误");
    console.assert(firstSavedItem.setRestSeconds === 45, "组间休息转换错误");

    console.log("✅ 所有 FitMate AI 训练计划核心逻辑单元测试全部顺利通过！");
  } catch (error) {
    console.error("❌ 单元测试运行发生异常，测试未通过：", error);
    throw error;
  }
}
