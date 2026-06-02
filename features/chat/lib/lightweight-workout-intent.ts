import type { WorkoutPlanIntent } from "@/lib/shared/workout-plans/draft-schema";

const workoutExperienceValues = new Set(["beginner", "intermediate", "advanced"]);
const workoutIntentTypes = new Set(["plan", "routine"]);

// readWorkoutPlanIntentLightweight 只保护聊天历史里的 recommendation intent 形状，不加载完整 Zod 训练计划 schema。
export function readWorkoutPlanIntentLightweight(intent: unknown): WorkoutPlanIntent | null {
  if (!isRecord(intent)) {
    return null;
  }

  const goal = readTrimmedString(intent.goal, 80);
  const experience = readEnum(intent.experience, workoutExperienceValues);
  const sessionMinutes = readIntInRange(intent.sessionMinutes, 10, 180);
  const weeklyFrequency = readIntInRange(intent.weeklyFrequency, 1, 7);

  if (!goal || !experience || sessionMinutes === null || weeklyFrequency === null) {
    return null;
  }

  const intentType = readEnum(intent.intentType, workoutIntentTypes) ?? "plan";
  const calendarHorizonDays = readIntInRange(intent.calendarHorizonDays, 1, 90);

  return {
    intentType: intentType as WorkoutPlanIntent["intentType"],
    goal,
    experience: experience as WorkoutPlanIntent["experience"],
    sessionMinutes,
    weeklyFrequency,
    ...(calendarHorizonDays === null ? {} : { calendarHorizonDays }),
    equipment: readStringArray(intent.equipment, 20),
    injuryLimitations: readStringArray(intent.injuryLimitations, 20),
    preferences: readStringArray(intent.preferences, 20),
    avoidances: readStringArray(intent.avoidances, 20),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTrimmedString(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

function readEnum(value: unknown, values: Set<string>) {
  return typeof value === "string" && values.has(value) ? value : null;
}

function readIntInRange(value: unknown, min: number, max: number) {
  if (value === undefined || value === null) {
    return null;
  }

  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
}

function readStringArray(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}
