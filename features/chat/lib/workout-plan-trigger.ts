export type WorkoutPlanTrigger = {
  intent: unknown;
  rawBlock: string;
};

export type ExerciseRecommendationTrigger = {
  intent: unknown;
  rawBlock: string;
};

export function extractWorkoutPlanTrigger(content: string): WorkoutPlanTrigger | null {
  const regex = /```json\s*(\{[\s\S]*?"type"\s*:\s*"workout_plan_trigger"[\s\S]*?\})\s*```/;
  const match = content.match(regex);

  if (!match?.[1]) {
    return null;
  }

  try {
    const parsed = JSON.parse(match[1]) as { intent?: unknown };

    return {
      intent: parsed.intent,
      rawBlock: match[0],
    };
  } catch (error) {
    console.error("Failed to parse trigger JSON:", error);
    return null;
  }
}

export function extractExerciseRecommendationTrigger(
  content: string,
): ExerciseRecommendationTrigger | null {
  const regex =
    /```json\s*(\{[\s\S]*?"type"\s*:\s*"exercise_recommendation_trigger"[\s\S]*?\})\s*```/;
  const match = content.match(regex);

  if (!match?.[1]) {
    return null;
  }

  try {
    const parsed = JSON.parse(match[1]) as { intent?: unknown };

    return {
      intent: parsed.intent,
      rawBlock: match[0],
    };
  } catch (error) {
    console.error("Failed to parse exercise recommendation trigger JSON:", error);
    return null;
  }
}
