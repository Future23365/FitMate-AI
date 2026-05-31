import type { ApiChatMessage, ChatConversation } from "@/features/chat/types";
import type { Exercise } from "@/lib/shared/exercises/types";
import type { FitnessConversationContext } from "@/lib/shared/chat/fitness-conversation-context";
import type {
  WorkoutPlanDraft,
  WorkoutPlanIntent,
  WorkoutRoutineDraft,
} from "@/lib/shared/workout-plans/draft-schema";
import type { WorkoutRoutine, WorkoutSchedule, WorkoutItem } from "@/lib/shared/workouts/composition";

export function createExercise(overrides: Partial<Exercise> = {}): Exercise {
  const id = overrides.id ?? "push-up";
  const allowedSections = overrides.allowedSections ?? inferFixtureAllowedSections({
    id,
    nameEn: overrides.nameEn ?? "Push Up",
    nameZh: overrides.nameZh ?? "俯卧撑",
    category: overrides.category ?? "strength",
    categoryZh: overrides.categoryZh ?? "力量",
    goalTags: overrides.goalTags ?? ["strength", "home_friendly", "beginner_friendly"],
    riskTags: overrides.riskTags ?? [],
  });
  const defaultIntensityRole = allowedSections.includes("stretch")
    ? "recovery"
    : allowedSections.includes("warmup")
      ? "activation"
      : "strength";
  const defaultMovementPattern = allowedSections.includes("stretch") ? "stretch" : "push";

  return {
    id,
    source: overrides.source ?? "fixture",
    sourceUrl: overrides.sourceUrl ?? "",
    sourceId: overrides.sourceId ?? id,
    license: overrides.license ?? "test",
    nameEn: overrides.nameEn ?? "Push Up",
    nameZh: overrides.nameZh ?? "俯卧撑",
    category: overrides.category ?? "strength",
    categoryZh: overrides.categoryZh ?? "力量",
    level: overrides.level ?? "beginner",
    levelZh: overrides.levelZh ?? "新手",
    force: overrides.force ?? "push",
    forceZh: overrides.forceZh ?? "推",
    mechanic: overrides.mechanic ?? "compound",
    mechanicZh: overrides.mechanicZh ?? "复合",
    equipment: overrides.equipment ?? "bodyweight",
    equipmentZh: overrides.equipmentZh ?? "自重",
    homeRequirement: overrides.homeRequirement ?? "no_equipment",
    homeRequirementZh: overrides.homeRequirementZh ?? "无器械",
    primaryMuscles: overrides.primaryMuscles ?? ["chest"],
    primaryMusclesZh: overrides.primaryMusclesZh ?? ["胸部"],
    secondaryMuscles: overrides.secondaryMuscles ?? ["triceps"],
    secondaryMusclesZh: overrides.secondaryMusclesZh ?? ["肱三头肌"],
    instructionsEn: overrides.instructionsEn ?? ["Keep your core tight."],
    instructionsZh: overrides.instructionsZh ?? ["保持核心收紧。"],
    images: overrides.images ?? ["/fixture.png"],
    imageUrls: overrides.imageUrls ?? ["/fixture.png"],
    allowedSections,
    intensityRole: overrides.intensityRole ?? defaultIntensityRole,
    movementPattern: overrides.movementPattern ?? defaultMovementPattern,
    difficulty: overrides.difficulty ?? "beginner",
    riskTags: overrides.riskTags ?? [],
    contraindications: overrides.contraindications ?? [],
    regressionExerciseIds: overrides.regressionExerciseIds ?? [],
    progressionExerciseIds: overrides.progressionExerciseIds ?? [],
    substitutionGroupId: overrides.substitutionGroupId ?? "push:chest",
    goalTags: overrides.goalTags ?? ["strength", "home_friendly", "beginner_friendly"],
    reviewStatus: overrides.reviewStatus ?? "human_reviewed",
    isPublished: overrides.isPublished ?? true,
  };
}

function inferFixtureAllowedSections(input: {
  id: string;
  nameEn: string;
  nameZh: string;
  category: string | null;
  categoryZh: string | null;
  goalTags: string[];
  riskTags: string[];
}): Exercise["allowedSections"] {
  const text = [
    input.id,
    input.nameEn,
    input.nameZh,
    input.category,
    input.categoryZh,
    ...input.goalTags,
    ...input.riskTags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, "");
  const sections: Exercise["allowedSections"] = [];
  const isStretch = /拉伸|伸展|stretch|mobility/.test(text);
  const isWarmup = /热身|激活|动态|warmup|activation|jumpingjack|开合跳/.test(text);

  if (isWarmup && !/high_impact|高冲击/.test(text)) {
    sections.push("warmup");
  }

  if (!isStretch) {
    sections.push("training");
  }

  if (isStretch) {
    sections.push("stretch");
  }

  return sections.length ? sections : ["training"];
}

export function createWorkoutItem(overrides: Partial<WorkoutItem> = {}): WorkoutItem {
  return {
    id: overrides.id ?? "push-up-item",
    exerciseId: overrides.exerciseId ?? "push-up",
    nameZh: overrides.nameZh ?? "俯卧撑",
    nameEn: overrides.nameEn ?? "Push Up",
    categoryZh: overrides.categoryZh ?? "力量",
    equipmentZh: overrides.equipmentZh ?? "自重",
    musclesZh: overrides.musclesZh ?? ["胸部"],
    instructionsZh: overrides.instructionsZh ?? ["保持核心收紧。"],
    imageUrl: overrides.imageUrl ?? "/fixture.png",
    imageUrls: overrides.imageUrls ?? ["/fixture.png"],
    mode: overrides.mode ?? "reps",
    target: overrides.target ?? 12,
    sets: overrides.sets ?? 2,
    setRestSeconds: overrides.setRestSeconds ?? 30,
    transitionRestSeconds: overrides.transitionRestSeconds ?? 20,
    restSeconds: overrides.restSeconds,
    section: overrides.section ?? "training",
  };
}

export function createWorkoutPlanIntent(overrides: Partial<WorkoutPlanIntent> = {}): WorkoutPlanIntent {
  const intent: WorkoutPlanIntent = {
    intentType: overrides.intentType ?? "routine",
    goal: overrides.goal ?? "胸肌训练",
    experience: overrides.experience ?? "beginner",
    sessionMinutes: overrides.sessionMinutes ?? 30,
    weeklyFrequency: overrides.weeklyFrequency ?? 1,
    equipment: overrides.equipment ?? ["自重"],
    injuryLimitations: overrides.injuryLimitations ?? [],
    preferences: overrides.preferences ?? ["居家训练"],
    avoidances: overrides.avoidances ?? [],
  };

  if (overrides.calendarHorizonDays !== undefined) {
    intent.calendarHorizonDays = overrides.calendarHorizonDays;
  }

  return intent;
}

export function createWorkoutPlanDraft(overrides: Partial<WorkoutPlanDraft> = {}): WorkoutPlanDraft {
  const exerciseId = overrides.days?.[0]?.sections?.[1]?.items[0]?.exerciseId ?? "push-up";
  const days = overrides.days ?? [
    {
      title: "Day 1 胸肌激活",
      focus: "胸部与核心",
      cycleDayIndex: 1,
      dayType: "strength" as const,
      isRestDay: false,
      estimatedMinutes: 20,
      recoveryNotes: [],
      safetyNotes: ["保持动作稳定。"],
      sections: [
        {
          section: "warmup" as const,
          title: "热身激活",
          items: [
            {
              exerciseId: "warmup",
              section: "warmup" as const,
              mode: "duration" as const,
              sets: 1,
              target: 45,
              setRestSeconds: 0,
              transitionRestSeconds: 20,
              notes: "逐步提升心率。",
            },
          ],
        },
        {
          section: "training" as const,
          title: "主训练",
          items: [
            {
              exerciseId,
              section: "training" as const,
              mode: "reps" as const,
              sets: 3,
              target: 12,
              setRestSeconds: 45,
              transitionRestSeconds: 60,
              notes: "保持身体成一直线。",
            },
          ],
        },
        {
          section: "stretch" as const,
          title: "拉伸放松",
          items: [
            {
              exerciseId: "stretch",
              section: "stretch" as const,
              mode: "duration" as const,
              sets: 1,
              target: 40,
              setRestSeconds: 0,
              transitionRestSeconds: 0,
              notes: "放松胸肩。",
            },
          ],
        },
      ],
    },
  ];
  const trainingDayCount = days.filter((day) => !day.isRestDay).length;
  const restDayCount = days.filter((day) => day.isRestDay).length;

  const draft: WorkoutPlanDraft = {
    kind: "plan",
    title: overrides.title ?? "居家胸肌训练",
    goal: overrides.goal ?? "胸肌训练",
    summary: overrides.summary ?? "适合新手的居家训练。",
    cycleLengthDays: overrides.cycleLengthDays ?? days.length,
    trainingDayCount: overrides.trainingDayCount ?? trainingDayCount,
    restDayCount: overrides.restDayCount ?? restDayCount,
    cycleRepeatable: overrides.cycleRepeatable ?? true,
    weeklyFrequency: overrides.weeklyFrequency ?? 1,
    estimatedSessionMinutes: overrides.estimatedSessionMinutes ?? 30,
    progression: overrides.progression ?? "先稳定完成动作，再逐步增加训练量。",
    recoveryStrategy: overrides.recoveryStrategy ?? "训练日之间安排低强度恢复。",
    schedulePattern: overrides.schedulePattern ?? days.map((day) => ({
      cycleDayIndex: day.cycleDayIndex,
      title: day.title,
      dayType: day.dayType,
      focus: day.focus,
      isRestDay: day.isRestDay,
    })),
    safetyNotes: overrides.safetyNotes ?? ["保持动作节奏稳定。"],
    days,
  };

  if (overrides.calendarHorizonDays !== undefined) {
    draft.calendarHorizonDays = overrides.calendarHorizonDays;
  }

  if (overrides.planStrategy !== undefined) {
    draft.planStrategy = overrides.planStrategy;
  }

  if (overrides.schedulePreview !== undefined) {
    draft.schedulePreview = overrides.schedulePreview;
  }

  return draft;
}

export function createWorkoutRoutineDraft(overrides: Partial<WorkoutRoutineDraft> = {}): WorkoutRoutineDraft {
  const sections = overrides.sections ?? [
    {
      section: "warmup" as const,
      title: "热身激活",
      items: [
        {
          exerciseId: "warmup",
          section: "warmup" as const,
          mode: "duration" as const,
          sets: 1,
          target: 45,
          setRestSeconds: 0,
          transitionRestSeconds: 20,
          notes: "逐步提升心率。",
        },
      ],
    },
    {
      section: "training" as const,
      title: "主训练",
      items: [
        {
          exerciseId: "push-up",
          section: "training" as const,
          mode: "reps" as const,
          sets: 3,
          target: 12,
          setRestSeconds: 45,
          transitionRestSeconds: 30,
          notes: "保持核心收紧。",
        },
      ],
    },
    {
      section: "stretch" as const,
      title: "拉伸放松",
      items: [
        {
          exerciseId: "stretch",
          section: "stretch" as const,
          mode: "duration" as const,
          sets: 1,
          target: 40,
          setRestSeconds: 0,
          transitionRestSeconds: 0,
          notes: "放松胸肩。",
        },
      ],
    },
  ];

  return {
    kind: "routine",
    title: overrides.title ?? "居家胸肌循环",
    goal: overrides.goal ?? "胸肌训练",
    summary: overrides.summary ?? "包含热身、主训练和拉伸的单次编排。",
    estimatedSessionMinutes: overrides.estimatedSessionMinutes ?? 12,
    trainingLoopRounds: overrides.trainingLoopRounds ?? 3,
    trainingLoopRestSeconds: overrides.trainingLoopRestSeconds ?? 90,
    sections,
    safetyNotes: overrides.safetyNotes ?? ["保持动作节奏稳定。"],
  };
}

export function createWorkoutRoutine(overrides: Partial<WorkoutRoutine> = {}): WorkoutRoutine {
  return {
    id: overrides.id ?? "workout-routine-1",
    title: overrides.title ?? "居家训练",
    updatedAt: overrides.updatedAt ?? "2026-05-25T10:00:00.000Z",
    items: overrides.items ?? [createWorkoutItem()],
    trainingLoopRounds: overrides.trainingLoopRounds ?? 1,
    trainingLoopRestSeconds: overrides.trainingLoopRestSeconds ?? 90,
    warmupToTrainingRestSeconds: overrides.warmupToTrainingRestSeconds ?? 60,
    trainingToStretchRestSeconds: overrides.trainingToStretchRestSeconds ?? 60,
  };
}

export function createWorkoutSchedule(overrides: Partial<WorkoutSchedule> = {}): WorkoutSchedule {
  return {
    id: overrides.id ?? "schedule-1",
    date: overrides.date ?? "2026-05-25",
    routineId: overrides.routineId ?? "workout-routine-1",
    title: overrides.title ?? "居家训练",
    status: overrides.status ?? "planned",
    minutes: overrides.minutes ?? 20,
    calories: overrides.calories ?? 120,
    items: overrides.items ?? [createWorkoutItem()],
    trainingLoopRounds: overrides.trainingLoopRounds ?? 1,
    trainingLoopRestSeconds: overrides.trainingLoopRestSeconds ?? 90,
    warmupToTrainingRestSeconds: overrides.warmupToTrainingRestSeconds ?? 60,
    trainingToStretchRestSeconds: overrides.trainingToStretchRestSeconds ?? 60,
    sourceRoutineTitle: overrides.sourceRoutineTitle,
  };
}

export function createApiChatMessages(): ApiChatMessage[] {
  return [{ role: "user", content: "今天在家自重练胸 30 分钟" }];
}

export function createConversationContext(
  overrides: Partial<FitnessConversationContext> = {},
): FitnessConversationContext {
  const currentIntent = overrides.currentIntent ?? createWorkoutPlanIntent();

  return {
    summary: overrides.summary ?? "用户想在家练胸肌。",
    currentIntent,
    knownFacts: overrides.knownFacts ?? {
      goal: currentIntent.goal,
      experience: currentIntent.experience,
      sessionMinutes: currentIntent.sessionMinutes,
      weeklyFrequency: currentIntent.weeklyFrequency,
      equipment: currentIntent.equipment,
      injuryLimitations: currentIntent.injuryLimitations,
      preferences: currentIntent.preferences,
      avoidances: currentIntent.avoidances,
    },
    unresolvedQuestions: overrides.unresolvedQuestions ?? [],
  };
}

export function createChatConversation(overrides: Partial<ChatConversation> = {}): ChatConversation {
  return {
    id: overrides.id ?? "conversation-1",
    title: overrides.title ?? "胸肌训练",
    updatedAt: overrides.updatedAt ?? "2026-05-25T00:00:00.000Z",
    messages: overrides.messages ?? [
      { id: "message-1", role: "user", content: "今天在家练胸" },
      { id: "message-2", role: "assistant", content: "可以。" },
    ],
    conversationSummary: overrides.conversationSummary ?? { summary: "用户想在家练胸肌。" },
    conversationContext: overrides.conversationContext ?? createConversationContext(),
    plans: overrides.plans,
    routines: overrides.routines,
    exerciseRecommendations: overrides.exerciseRecommendations,
    recommendationIntents: overrides.recommendationIntents,
  };
}
