import type { ApiChatMessage, ChatConversation } from "@/features/chat/types";
import type { Exercise } from "@/lib/shared/exercises/types";
import type { FitnessConversationContext } from "@/lib/shared/chat/fitness-conversation-context";
import type { WorkoutPlanDraft, WorkoutPlanIntent } from "@/lib/shared/workout-plans/draft-schema";
import type { WorkoutRoutine, WorkoutSchedule, WorkoutItem } from "@/lib/shared/workouts/composition";

export function createExercise(overrides: Partial<Exercise> = {}): Exercise {
  const id = overrides.id ?? "push-up";

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
    riskTags: overrides.riskTags ?? [],
    goalTags: overrides.goalTags ?? ["strength", "home_friendly", "beginner_friendly"],
    reviewStatus: overrides.reviewStatus ?? "human_reviewed",
    isPublished: overrides.isPublished ?? true,
  };
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
  return {
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
}

export function createWorkoutPlanDraft(overrides: Partial<WorkoutPlanDraft> = {}): WorkoutPlanDraft {
  const exerciseId = overrides.days?.[0]?.items[0]?.exerciseId ?? "push-up";

  return {
    title: overrides.title ?? "居家胸肌训练",
    goal: overrides.goal ?? "胸肌训练",
    summary: overrides.summary ?? "适合新手的居家训练。",
    weeklyFrequency: overrides.weeklyFrequency ?? 1,
    estimatedSessionMinutes: overrides.estimatedSessionMinutes ?? 30,
    safetyNotes: overrides.safetyNotes ?? ["如有疼痛请停止训练。"],
    days: overrides.days ?? [
      {
        title: "Day 1 胸肌激活",
        focus: "胸部与核心",
        dayIndex: 1,
        estimatedMinutes: 20,
        safetyNotes: ["保持动作稳定。"],
        items: [
          {
            exerciseId,
            mode: "reps",
            sets: 3,
            target: 12,
            setRestSeconds: 45,
            transitionRestSeconds: 60,
            notes: "保持身体成一直线。",
          },
        ],
      },
    ],
  };
}

export function createWorkoutRoutine(overrides: Partial<WorkoutRoutine> = {}): WorkoutRoutine {
  return {
    id: overrides.id ?? "workout-routine-1",
    title: overrides.title ?? "居家训练",
    updatedAt: overrides.updatedAt ?? "2026-05-25 10:00",
    items: overrides.items ?? [createWorkoutItem()],
    trainingLoopRounds: overrides.trainingLoopRounds ?? 1,
    trainingLoopRestSeconds: overrides.trainingLoopRestSeconds ?? 90,
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
    conversationContext: overrides.conversationContext ?? createConversationContext(),
    plans: overrides.plans,
    exerciseRecommendations: overrides.exerciseRecommendations,
  };
}
