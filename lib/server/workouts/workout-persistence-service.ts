import "server-only";

import type { Prisma } from "@prisma/client";

import { getPrismaClient } from "@/lib/server/db/prisma";
import { getCurrentUser } from "@/lib/server/users/current-user";
import type { SavedWorkout, ScheduledWorkout, ScheduleStatus, WorkoutItem } from "@/lib/shared/workouts/composition";
import {
  clampLoopRounds,
  defaultTrainingLoopRestSeconds,
  estimateWorkoutCalories,
  estimateWorkoutMinutes,
  getWorkoutLoopConfig,
  normalizeSavedWorkout,
  normalizeWorkoutItem,
  placeholderWorkoutImage,
} from "@/lib/shared/workouts/composition";
import { savedWorkoutSchema, scheduledWorkoutSchema, scheduleStatusSchema } from "@/lib/shared/workouts/persistence-schema";

type WorkoutPlanWithItems = Prisma.WorkoutPlanGetPayload<{
  include: {
    days: {
      include: {
        items: {
          include: { exercise: true };
          orderBy: { sortOrder: "asc" };
        };
      };
      orderBy: { dayIndex: "asc" };
    };
  };
}>;

type WorkoutSessionWithPlan = Prisma.WorkoutSessionGetPayload<{
  include: {
    workoutPlan: {
      include: {
        days: {
          include: {
            items: {
              include: { exercise: true };
              orderBy: { sortOrder: "asc" };
            };
          };
          orderBy: { dayIndex: "asc" };
        };
      };
    };
  };
}>;

export async function listSavedWorkouts() {
  const prisma = getPrismaClient();
  const user = await getCurrentUser();
  const plans = await prisma.workoutPlan.findMany({
    where: { userId: user.id, status: { not: "archived" } },
    include: workoutPlanInclude,
    orderBy: { updatedAt: "desc" },
  });

  return plans.map(mapWorkoutPlanToSavedWorkout);
}

export async function getSavedWorkoutById(id: string) {
  const prisma = getPrismaClient();
  const user = await getCurrentUser();
  const plan = await prisma.workoutPlan.findFirst({
    where: { id, userId: user.id, status: { not: "archived" } },
    include: workoutPlanInclude,
  });

  return plan ? mapWorkoutPlanToSavedWorkout(plan) : null;
}

export async function saveWorkout(rawWorkout: SavedWorkout) {
  const parsedWorkout = normalizeSavedWorkout(savedWorkoutSchema.parse(rawWorkout));
  const prisma = getPrismaClient();
  const user = await getCurrentUser();
  const loopConfig = getWorkoutLoopConfig(parsedWorkout);
  const estimatedMinutes = estimateWorkoutMinutes(parsedWorkout.items, loopConfig);
  const existingPlan = await prisma.workoutPlan.findUnique({
    where: { id: parsedWorkout.id },
    select: { userId: true },
  });

  if (existingPlan && existingPlan.userId !== user.id) {
    throw new Error("Workout plan belongs to another user.");
  }

  return prisma.$transaction(async (tx) => {
    const plan = await tx.workoutPlan.upsert({
      where: { id: parsedWorkout.id },
      update: {
        title: parsedWorkout.title,
        goal: "custom_workout",
        weeklyFrequency: 1,
        estimatedSessionMinutes: estimatedMinutes,
        status: "active",
        source: "manual",
        trainingLoopRounds: loopConfig.trainingLoopRounds,
        trainingLoopRestSeconds: loopConfig.trainingLoopRestSeconds,
      },
      create: {
        id: parsedWorkout.id,
        userId: user.id,
        title: parsedWorkout.title,
        goal: "custom_workout",
        weeklyFrequency: 1,
        estimatedSessionMinutes: estimatedMinutes,
        status: "active",
        source: "manual",
        trainingLoopRounds: loopConfig.trainingLoopRounds,
        trainingLoopRestSeconds: loopConfig.trainingLoopRestSeconds,
      },
      select: { id: true },
    });

    await tx.workoutPlanDay.deleteMany({ where: { workoutPlanId: plan.id } });
    await tx.workoutPlanDay.create({
      data: {
        workoutPlanId: plan.id,
        dayIndex: 1,
        title: parsedWorkout.title,
        focus: "自定义编排",
        estimatedMinutes,
        items: {
          create: parsedWorkout.items.map((item, index) => {
            const normalizedItem = normalizeWorkoutItem(item);

            return {
              exerciseId: normalizedItem.exerciseId,
              mode: normalizedItem.mode,
              target: normalizedItem.target,
              sets: normalizedItem.sets,
              setRestSeconds: normalizedItem.setRestSeconds,
              transitionRestSeconds: normalizedItem.transitionRestSeconds,
              section: normalizedItem.section,
              sortOrder: index + 1,
            };
          }),
        },
      },
    });

    const savedPlan = await tx.workoutPlan.findFirstOrThrow({
      where: { id: plan.id, userId: user.id },
      include: workoutPlanInclude,
    });

    return mapWorkoutPlanToSavedWorkout(savedPlan);
  });
}

export async function deleteSavedWorkout(id: string) {
  const prisma = getPrismaClient();
  const user = await getCurrentUser();
  await prisma.workoutPlan.deleteMany({ where: { id, userId: user.id } });
}

export async function listScheduledWorkouts() {
  const prisma = getPrismaClient();
  const user = await getCurrentUser();
  const sessions = await prisma.workoutSession.findMany({
    where: { userId: user.id, status: { not: "cancelled" } },
    include: workoutSessionInclude,
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
  });

  return sessions.map(mapWorkoutSessionToScheduledWorkout).filter(Boolean) as ScheduledWorkout[];
}

export async function getScheduledWorkoutById(id: string) {
  const prisma = getPrismaClient();
  const user = await getCurrentUser();
  const session = await prisma.workoutSession.findFirst({
    where: { id, userId: user.id, status: { not: "cancelled" } },
    include: workoutSessionInclude,
  });

  return session ? mapWorkoutSessionToScheduledWorkout(session) : null;
}

export async function createScheduledWorkout(rawSchedule: ScheduledWorkout) {
  const parsedSchedule = scheduledWorkoutSchema.parse(rawSchedule);
  const prisma = getPrismaClient();
  const user = await getCurrentUser();

  if (parsedSchedule.status === "rest") {
    const session = await prisma.workoutSession.create({
      data: {
        id: parsedSchedule.id,
        userId: user.id,
        scheduledFor: parseDateKey(parsedSchedule.date),
        status: "rest",
        feedback: {
          kind: "rest_day",
          title: parsedSchedule.title,
          minutes: parsedSchedule.minutes,
          calories: parsedSchedule.calories,
        },
      },
      include: workoutSessionInclude,
    });

    return mapWorkoutSessionToScheduledWorkout(session);
  }

  const plan = await prisma.workoutPlan.findFirst({
    where: { id: parsedSchedule.planId, userId: user.id, status: { not: "archived" } },
    include: workoutPlanInclude,
  });

  if (!plan) {
    throw new Error(`Workout plan not found: ${parsedSchedule.planId}`);
  }

  const savedWorkout = mapWorkoutPlanToSavedWorkout(plan);
  const loopConfig = getWorkoutLoopConfig(savedWorkout);
  const session = await prisma.workoutSession.create({
    data: {
      id: parsedSchedule.id,
      userId: user.id,
      workoutPlanId: plan.id,
      scheduledFor: parseDateKey(parsedSchedule.date),
      status: mapScheduleStatusToSessionStatus(parsedSchedule.status),
      durationSeconds: Math.max(0, parsedSchedule.minutes) * 60,
      feedback: {
        sourcePlanTitle: parsedSchedule.sourcePlanTitle,
        minutes: estimateWorkoutMinutes(savedWorkout.items, {
          minimumMinutes: 15,
          ...loopConfig,
        }),
        calories: estimateWorkoutCalories(savedWorkout.items, {
          minimumCalories: 80,
          ...loopConfig,
        }),
      },
    },
    include: workoutSessionInclude,
  });

  return mapWorkoutSessionToScheduledWorkout(session);
}

export async function updateScheduledWorkoutStatus(id: string, rawStatus: ScheduleStatus) {
  const status = scheduleStatusSchema.parse(rawStatus);
  const prisma = getPrismaClient();
  const user = await getCurrentUser();
  const session = await prisma.workoutSession.update({
    where: { id, userId: user.id },
    data: {
      status: mapScheduleStatusToSessionStatus(status),
      startedAt: status === "completed" ? new Date() : undefined,
      endedAt: status === "completed" ? new Date() : undefined,
    },
    include: workoutSessionInclude,
  });

  return mapWorkoutSessionToScheduledWorkout(session);
}

export async function deleteScheduledWorkout(id: string) {
  const prisma = getPrismaClient();
  const user = await getCurrentUser();
  await prisma.workoutSession.updateMany({
    where: { id, userId: user.id },
    data: { status: "cancelled" },
  });
}

const workoutPlanInclude = {
  days: {
    include: {
      items: {
        include: { exercise: true },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { dayIndex: "asc" },
  },
} satisfies Prisma.WorkoutPlanInclude;

const workoutSessionInclude = {
  workoutPlan: {
    include: workoutPlanInclude,
  },
} satisfies Prisma.WorkoutSessionInclude;

function mapWorkoutPlanToSavedWorkout(plan: WorkoutPlanWithItems): SavedWorkout {
  const primaryDay = plan.days[0];

  return normalizeSavedWorkout({
    id: plan.id,
    title: plan.title,
    savedAt: formatDateTime(plan.updatedAt),
    trainingLoopRounds: plan.trainingLoopRounds ?? undefined,
    trainingLoopRestSeconds: plan.trainingLoopRestSeconds ?? undefined,
    items: primaryDay?.items.map(mapWorkoutPlanItemToWorkoutItem) ?? [],
  });
}

function mapWorkoutSessionToScheduledWorkout(session: WorkoutSessionWithPlan): ScheduledWorkout | null {
  const status = mapSessionStatusToScheduleStatus(session.status);
  const date = session.scheduledFor ? toDateKey(session.scheduledFor) : toDateKey(session.createdAt);

  if (status === "rest") {
    return {
      id: session.id,
      date,
      planId: "rest",
      title: readFeedbackString(session.feedback, "title") ?? "休息日",
      status,
      minutes: readFeedbackNumber(session.feedback, "minutes") ?? 0,
      calories: readFeedbackNumber(session.feedback, "calories") ?? 0,
      items: [],
    };
  }

  if (!session.workoutPlan) {
    return null;
  }

  const savedWorkout = mapWorkoutPlanToSavedWorkout(session.workoutPlan);
  const loopConfig = getWorkoutLoopConfig(savedWorkout);
  const minutes =
    readFeedbackNumber(session.feedback, "minutes") ??
    estimateWorkoutMinutes(savedWorkout.items, {
      minimumMinutes: 15,
      ...loopConfig,
    });
  const calories =
    readFeedbackNumber(session.feedback, "calories") ??
    estimateWorkoutCalories(savedWorkout.items, {
      minimumCalories: 80,
      ...loopConfig,
    });

  return {
    id: session.id,
    date,
    planId: savedWorkout.id,
    title: savedWorkout.title,
    status,
    minutes,
    calories,
    items: savedWorkout.items,
    trainingLoopRounds: loopConfig.trainingLoopRounds,
    trainingLoopRestSeconds: loopConfig.trainingLoopRestSeconds,
    sourcePlanTitle: readFeedbackString(session.feedback, "sourcePlanTitle") ?? undefined,
  };
}

function mapWorkoutPlanItemToWorkoutItem(
  item: WorkoutPlanWithItems["days"][number]["items"][number],
): WorkoutItem {
  const exercise = item.exercise;

  return normalizeWorkoutItem({
    id: item.id,
    exerciseId: exercise.id,
    nameZh: exercise.nameZh,
    nameEn: exercise.nameEn,
    categoryZh: exercise.categoryZh || "训练",
    equipmentZh: exercise.equipmentZh || "未标注器械",
    musclesZh: exercise.primaryMusclesZh.length ? exercise.primaryMusclesZh : ["综合"],
    instructionsZh: exercise.instructionsZh,
    imageUrl: exercise.imageUrls[0] || placeholderWorkoutImage,
    mode: item.mode === "duration" ? "duration" : "reps",
    target: item.target,
    sets: item.sets,
    setRestSeconds: item.setRestSeconds,
    transitionRestSeconds: item.transitionRestSeconds,
    section: item.section === "warmup" || item.section === "stretch" ? item.section : "training",
  });
}

function mapScheduleStatusToSessionStatus(status: ScheduleStatus) {
  if (status === "rest") {
    return "rest";
  }

  return status;
}

function mapSessionStatusToScheduleStatus(status: string): ScheduleStatus {
  if (status === "completed" || status === "missed" || status === "rest") {
    return status;
  }

  return "planned";
}

function readFeedbackString(feedback: Prisma.JsonValue | null, key: string) {
  if (!feedback || typeof feedback !== "object" || Array.isArray(feedback)) {
    return null;
  }

  const value = (feedback as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function readFeedbackNumber(feedback: Prisma.JsonValue | null, key: string) {
  if (!feedback || typeof feedback !== "object" || Array.isArray(feedback)) {
    return null;
  }

  const value = (feedback as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseDateKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateTime(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}
