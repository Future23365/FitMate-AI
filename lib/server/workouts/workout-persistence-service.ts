import "server-only";

import type { Prisma } from "@prisma/client";

import { linkArtifactSourceEntityFromMessage } from "@/lib/server/conversation-artifacts/artifact-service";
import { getPrismaClient } from "@/lib/server/db/prisma";
import { getCurrentUser } from "@/lib/server/users/current-user";
import type { CurrentUser } from "@/lib/server/users/current-user";
import type {
  WorkoutItem,
  WorkoutRoutine,
  WorkoutSchedule,
  WorkoutScheduleStatus,
  WorkoutSessionResult,
} from "@/lib/shared/workouts/composition";
import { workoutCompletionFeedbackSchema } from "@/lib/shared/user-feedback-memory/schema";
import {
  defaultTrainingLoopRestSeconds,
  estimateWorkoutCalories,
  estimateWorkoutMinutes,
  getWorkoutTimingConfig,
  normalizeWorkoutItem,
  normalizeWorkoutRoutine,
  placeholderWorkoutImage,
} from "@/lib/shared/workouts/composition";
import {
  workoutRoutineSchema,
  workoutScheduleSchema,
  workoutScheduleStatusSchema,
  workoutSessionResultInputSchema,
} from "@/lib/shared/workouts/persistence-schema";

type WorkoutRoutineWithItems = Prisma.WorkoutRoutineGetPayload<{
  include: typeof workoutRoutineInclude;
}>;

type WorkoutScheduleWithRoutine = Prisma.WorkoutScheduleGetPayload<{
  include: typeof workoutScheduleInclude;
}>;

type WorkoutSessionResultRecord = Prisma.WorkoutSessionResultGetPayload<Record<string, never>>;

// Routine 查询只返回当前用户未归档的可复用动作编排。
export async function listWorkoutRoutines(currentUser?: CurrentUser) {
  const prisma = getPrismaClient();
  const user = await getCurrentUser(currentUser);
  const routines = await prisma.workoutRoutine.findMany({
    where: { userId: user.id, status: "active" },
    include: workoutRoutineInclude,
    orderBy: { updatedAt: "desc" },
  });

  return routines.map(mapWorkoutRoutineRecord);
}

// Routine 详情用于编排编辑和训练日历选择，始终带 userId 隔离。
export async function getWorkoutRoutineById(id: string, currentUser?: CurrentUser) {
  const prisma = getPrismaClient();
  const user = await getCurrentUser(currentUser);
  const routine = await prisma.workoutRoutine.findFirst({
    where: { id, userId: user.id, status: "active" },
    include: workoutRoutineInclude,
  });

  return routine ? mapWorkoutRoutineRecord(routine) : null;
}

// 保存 routine 时先校验动作库 id，再整体替换 item 顺序，避免旧计划日中间层残留。
export async function saveWorkoutRoutine(rawRoutine: WorkoutRoutine, currentUser?: CurrentUser) {
  const parsedRoutine = normalizeWorkoutRoutine(workoutRoutineSchema.parse(rawRoutine));
  const prisma = getPrismaClient();
  const user = await getCurrentUser(currentUser);
  const timingConfig = getWorkoutTimingConfig(parsedRoutine);
  const estimatedMinutes = estimateWorkoutMinutes(parsedRoutine.items, timingConfig);
  const estimatedCalories = estimateWorkoutCalories(parsedRoutine.items, {
    minimumCalories: 0,
    ...timingConfig,
  });
  const existingRoutine = await prisma.workoutRoutine.findUnique({
    where: { id: parsedRoutine.id },
    select: { userId: true },
  });

  if (existingRoutine && existingRoutine.userId !== user.id) {
    throw new Error("Workout routine belongs to another user.");
  }

  await assertExerciseIdsExist(parsedRoutine.items.map((item) => item.exerciseId));

  return prisma.$transaction(async (tx) => {
    const routine = await tx.workoutRoutine.upsert({
      where: { id: parsedRoutine.id },
      update: {
        title: parsedRoutine.title,
        estimatedMinutes,
        estimatedCalories,
        status: "active",
        source: "manual",
        trainingLoopRounds: timingConfig.trainingLoopRounds,
        trainingLoopRestSeconds: timingConfig.trainingLoopRestSeconds,
        warmupToTrainingRestSeconds: timingConfig.warmupToTrainingRestSeconds,
        trainingToStretchRestSeconds: timingConfig.trainingToStretchRestSeconds,
      },
      create: {
        id: parsedRoutine.id,
        userId: user.id,
        title: parsedRoutine.title,
        estimatedMinutes,
        estimatedCalories,
        status: "active",
        source: "manual",
        trainingLoopRounds: timingConfig.trainingLoopRounds,
        trainingLoopRestSeconds: timingConfig.trainingLoopRestSeconds,
        warmupToTrainingRestSeconds: timingConfig.warmupToTrainingRestSeconds,
        trainingToStretchRestSeconds: timingConfig.trainingToStretchRestSeconds,
      },
      select: { id: true },
    });

    await tx.workoutRoutineItem.deleteMany({ where: { routineId: routine.id } });
    await tx.workoutRoutineItem.createMany({
      data: parsedRoutine.items.map((item, index) => {
        const normalizedItem = normalizeWorkoutItem(item);

        return {
          id: normalizedItem.id,
          routineId: routine.id,
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
    });

    const savedRoutine = await tx.workoutRoutine.findFirstOrThrow({
      where: { id: routine.id, userId: user.id },
      include: workoutRoutineInclude,
    });

    if (parsedRoutine.sourceChatMessageId) {
      await linkArtifactSourceEntityFromMessage(
        {
          userId: user.id,
          messageId: parsedRoutine.sourceChatMessageId,
          kind: parsedRoutine.sourceArtifactKind ?? "routine",
          sourceEntityKind: "workout_routine",
          sourceEntityId: routine.id,
        },
        tx,
      );
    }

    return mapWorkoutRoutineRecord(savedRoutine);
  });
}

// 归档 routine，保留已存在 schedule 的展示快照和历史 result。
export async function deleteWorkoutRoutine(id: string, currentUser?: CurrentUser) {
  const prisma = getPrismaClient();
  const user = await getCurrentUser(currentUser);
  await prisma.workoutRoutine.updateMany({
    where: { id, userId: user.id },
    data: { status: "archived" },
  });
}

// Schedule 查询返回日历可展示快照，以及训练执行需要的 routine items。
export async function listWorkoutSchedules(currentUser?: CurrentUser) {
  const prisma = getPrismaClient();
  const user = await getCurrentUser(currentUser);
  const schedules = await prisma.workoutSchedule.findMany({
    where: { userId: user.id, status: { not: "cancelled" } },
    include: workoutScheduleInclude,
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
  });

  return schedules.map(mapWorkoutScheduleRecord).filter(Boolean) as WorkoutSchedule[];
}

// Schedule 详情用于训练执行页按 scheduleId 加载当前安排。
export async function getWorkoutScheduleById(id: string, currentUser?: CurrentUser) {
  const prisma = getPrismaClient();
  const user = await getCurrentUser(currentUser);
  const schedule = await prisma.workoutSchedule.findFirst({
    where: { id, userId: user.id, status: { not: "cancelled" } },
    include: workoutScheduleInclude,
  });

  return schedule ? mapWorkoutScheduleRecord(schedule) : null;
}

// 创建日历安排时保存展示快照，休息日不创建空 routine。
export async function createWorkoutSchedule(rawSchedule: WorkoutSchedule, currentUser?: CurrentUser) {
  const parsedSchedule = workoutScheduleSchema.parse(rawSchedule);
  const prisma = getPrismaClient();
  const user = await getCurrentUser(currentUser);

  if (parsedSchedule.status === "rest") {
    const schedule = await prisma.$transaction(async (tx) => {
      const savedSchedule = await tx.workoutSchedule.create({
        data: {
          id: parsedSchedule.id,
          userId: user.id,
          scheduledFor: parseDateKey(parsedSchedule.date),
          status: "rest",
          titleSnapshot: parsedSchedule.title,
          estimatedMinutes: parsedSchedule.minutes,
          estimatedCalories: parsedSchedule.calories,
        },
        include: workoutScheduleInclude,
      });

      if (parsedSchedule.sourceChatMessageId) {
        await linkArtifactSourceEntityFromMessage(
          {
            userId: user.id,
            messageId: parsedSchedule.sourceChatMessageId,
            kind: parsedSchedule.sourceArtifactKind ?? "plan",
            sourceEntityKind: "workout_schedule",
            sourceEntityId: savedSchedule.id,
          },
          tx,
        );
      }

      return savedSchedule;
    });

    return mapWorkoutScheduleRecord(schedule);
  }

  if (!parsedSchedule.routineId) {
    throw new Error("Workout routine id is required for training schedule.");
  }

  const routine = await prisma.workoutRoutine.findFirst({
    where: { id: parsedSchedule.routineId, userId: user.id, status: "active" },
    include: workoutRoutineInclude,
  });

  if (!routine) {
    throw new Error(`Workout routine not found: ${parsedSchedule.routineId}`);
  }

  const workoutRoutine = mapWorkoutRoutineRecord(routine);
  const timingConfig = getWorkoutTimingConfig(workoutRoutine);
  const minutes = estimateWorkoutMinutes(workoutRoutine.items, {
    minimumMinutes: 15,
    ...timingConfig,
  });
  const calories = estimateWorkoutCalories(workoutRoutine.items, {
    minimumCalories: 80,
    ...timingConfig,
  });
  const schedule = await prisma.$transaction(async (tx) => {
    const savedSchedule = await tx.workoutSchedule.create({
      data: {
        id: parsedSchedule.id,
        userId: user.id,
        routineId: routine.id,
        scheduledFor: parseDateKey(parsedSchedule.date),
        status: parsedSchedule.status,
        titleSnapshot: workoutRoutine.title,
        estimatedMinutes: minutes,
        estimatedCalories: calories,
      },
      include: workoutScheduleInclude,
    });

    if (parsedSchedule.sourceChatMessageId) {
      await linkArtifactSourceEntityFromMessage(
        {
          userId: user.id,
          messageId: parsedSchedule.sourceChatMessageId,
          kind: parsedSchedule.sourceArtifactKind ?? "plan",
          sourceEntityKind: "workout_schedule",
          sourceEntityId: savedSchedule.id,
        },
        tx,
      );
    }

    return savedSchedule;
  });

  return mapWorkoutScheduleRecord(schedule);
}

// 更新 schedule 状态只作用于当前用户自己的日历安排。
export async function updateWorkoutScheduleStatus(
  id: string,
  rawStatus: WorkoutScheduleStatus,
  currentUser?: CurrentUser,
) {
  const status = workoutScheduleStatusSchema.parse(rawStatus);
  const prisma = getPrismaClient();
  const user = await getCurrentUser(currentUser);
  const schedule = await prisma.workoutSchedule.update({
    where: { id, userId: user.id },
    data: { status },
    include: workoutScheduleInclude,
  });

  return mapWorkoutScheduleRecord(schedule);
}

// 删除 schedule 使用取消状态，保留 result 与未来审计空间。
export async function deleteWorkoutSchedule(id: string, currentUser?: CurrentUser) {
  const prisma = getPrismaClient();
  const user = await getCurrentUser(currentUser);
  await prisma.workoutSchedule.updateMany({
    where: { id, userId: user.id },
    data: { status: "cancelled" },
  });
}

// 保存训练完成结果时在事务内维护 result 和 schedule completed 状态。
export async function saveWorkoutSessionResult(
  scheduleId: string,
  rawResult: unknown,
  currentUser?: CurrentUser,
) {
  const parsedResult = workoutSessionResultInputSchema.parse(rawResult);
  const prisma = getPrismaClient();
  const user = await getCurrentUser(currentUser);
  const schedule = await prisma.workoutSchedule.findFirst({
    where: { id: scheduleId, userId: user.id, status: { not: "cancelled" } },
    select: { id: true, routineId: true },
  });

  if (!schedule) {
    throw new Error(`Workout schedule not found: ${scheduleId}`);
  }
  const feedback = workoutCompletionFeedbackSchema.parse({
    completionRate: parsedResult.totalExerciseCount > 0
      ? parsedResult.completedExerciseCount / parsedResult.totalExerciseCount
      : 0,
    skippedExerciseIds: parsedResult.feedback?.skippedExerciseIds ?? [],
    actualDurationSeconds: parsedResult.durationSeconds,
    subjectiveFatigue: parsedResult.feedback?.subjectiveFatigue,
  });

  const result = await prisma.$transaction(async (tx) => {
    const savedResult = await tx.workoutSessionResult.upsert({
      where: { scheduleId },
      update: {
        routineId: schedule.routineId,
        startedAt: new Date(parsedResult.startedAt),
        endedAt: new Date(parsedResult.endedAt),
        durationSeconds: parsedResult.durationSeconds,
        completedStepCount: parsedResult.completedStepCount,
        totalStepCount: parsedResult.totalStepCount,
        completedExerciseCount: parsedResult.completedExerciseCount,
        totalExerciseCount: parsedResult.totalExerciseCount,
        estimatedCalories: parsedResult.estimatedCalories,
        actualCalories: parsedResult.actualCalories,
        status: parsedResult.status ?? "completed",
        feedback,
      },
      create: {
        userId: user.id,
        scheduleId,
        routineId: schedule.routineId,
        startedAt: new Date(parsedResult.startedAt),
        endedAt: new Date(parsedResult.endedAt),
        durationSeconds: parsedResult.durationSeconds,
        completedStepCount: parsedResult.completedStepCount,
        totalStepCount: parsedResult.totalStepCount,
        completedExerciseCount: parsedResult.completedExerciseCount,
        totalExerciseCount: parsedResult.totalExerciseCount,
        estimatedCalories: parsedResult.estimatedCalories,
        actualCalories: parsedResult.actualCalories,
        status: parsedResult.status ?? "completed",
        feedback,
      },
    });

    await tx.workoutSchedule.update({
      where: { id: scheduleId, userId: user.id },
      data: { status: "completed" },
    });

    return savedResult;
  });

  return mapWorkoutSessionResultRecord(result);
}

const workoutRoutineInclude = {
  items: {
    include: { exercise: true },
    orderBy: { sortOrder: "asc" },
  },
} satisfies Prisma.WorkoutRoutineInclude;

const workoutScheduleInclude = {
  routine: {
    include: workoutRoutineInclude,
  },
  result: true,
} satisfies Prisma.WorkoutScheduleInclude;

function mapWorkoutRoutineRecord(routine: WorkoutRoutineWithItems): WorkoutRoutine {
  return normalizeWorkoutRoutine({
    id: routine.id,
    title: routine.title,
    updatedAt: formatDateTime(routine.updatedAt),
    trainingLoopRounds: routine.trainingLoopRounds ?? undefined,
    trainingLoopRestSeconds: routine.trainingLoopRestSeconds ?? undefined,
    warmupToTrainingRestSeconds: routine.warmupToTrainingRestSeconds ?? undefined,
    trainingToStretchRestSeconds: routine.trainingToStretchRestSeconds ?? undefined,
    items: routine.items.map(mapWorkoutRoutineItemRecord),
  });
}

function mapWorkoutScheduleRecord(schedule: WorkoutScheduleWithRoutine): WorkoutSchedule | null {
  const date = toDateKey(schedule.scheduledFor);

  if (schedule.status === "rest") {
    return {
      id: schedule.id,
      date,
      title: schedule.titleSnapshot || "休息日",
      status: "rest",
      minutes: schedule.estimatedMinutes,
      calories: schedule.estimatedCalories,
      items: [],
    };
  }

  if (!schedule.routine) {
    return null;
  }

  const routine = mapWorkoutRoutineRecord(schedule.routine);
  const timingConfig = getWorkoutTimingConfig(routine);

  return {
    id: schedule.id,
    date,
    routineId: routine.id,
    title: schedule.titleSnapshot || routine.title,
    status: mapScheduleStatus(schedule.status),
    minutes: schedule.estimatedMinutes,
    calories: schedule.estimatedCalories,
    items: routine.items,
    trainingLoopRounds: timingConfig.trainingLoopRounds,
    trainingLoopRestSeconds: timingConfig.trainingLoopRestSeconds,
    warmupToTrainingRestSeconds: timingConfig.warmupToTrainingRestSeconds,
    trainingToStretchRestSeconds: timingConfig.trainingToStretchRestSeconds,
    sourceRoutineTitle: routine.title,
  };
}

function mapWorkoutSessionResultRecord(result: WorkoutSessionResultRecord): WorkoutSessionResult {
  return {
    id: result.id,
    scheduleId: result.scheduleId,
    routineId: result.routineId ?? undefined,
    startedAt: result.startedAt.toISOString(),
    endedAt: result.endedAt.toISOString(),
    durationSeconds: result.durationSeconds,
    completedStepCount: result.completedStepCount,
    totalStepCount: result.totalStepCount,
    completedExerciseCount: result.completedExerciseCount,
    totalExerciseCount: result.totalExerciseCount,
    estimatedCalories: result.estimatedCalories,
    actualCalories: result.actualCalories ?? undefined,
    status: result.status,
    feedback: workoutCompletionFeedbackSchema.safeParse(result.feedback).success
      ? workoutCompletionFeedbackSchema.parse(result.feedback)
      : undefined,
  };
}

function mapWorkoutRoutineItemRecord(item: WorkoutRoutineWithItems["items"][number]): WorkoutItem {
  const exercise = item.exercise;
  const imageUrls = exercise.imageUrls.length ? exercise.imageUrls : [placeholderWorkoutImage];

  return normalizeWorkoutItem({
    id: item.id,
    exerciseId: exercise.id,
    nameZh: exercise.nameZh,
    nameEn: exercise.nameEn,
    categoryZh: exercise.categoryZh || "训练",
    equipmentZh: exercise.equipmentZh || "未标注器械",
    musclesZh: exercise.primaryMusclesZh.length ? exercise.primaryMusclesZh : ["综合"],
    instructionsZh: exercise.instructionsZh,
    imageUrl: imageUrls[0],
    imageUrls,
    mode: item.mode === "duration" ? "duration" : "reps",
    target: item.target,
    sets: item.sets,
    setRestSeconds: item.setRestSeconds,
    transitionRestSeconds: item.transitionRestSeconds,
    section: item.section === "warmup" || item.section === "stretch" ? item.section : "training",
  });
}

async function assertExerciseIdsExist(exerciseIds: string[]) {
  const uniqueExerciseIds = Array.from(new Set(exerciseIds));

  if (!uniqueExerciseIds.length) {
    return;
  }

  const prisma = getPrismaClient();
  const exercises = await prisma.exercise.findMany({
    where: { id: { in: uniqueExerciseIds } },
    select: { id: true },
  });
  const existingIds = new Set(exercises.map((exercise) => exercise.id));
  const missingIds = uniqueExerciseIds.filter((id) => !existingIds.has(id));

  if (missingIds.length) {
    throw new Error(`Invalid exerciseId: ${missingIds.join(", ")}`);
  }
}

function mapScheduleStatus(status: string): WorkoutScheduleStatus {
  if (status === "cancelled" || status === "completed" || status === "missed" || status === "rest") {
    return status;
  }

  return "planned";
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
