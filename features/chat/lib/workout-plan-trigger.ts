export type WorkoutPlanTrigger = {
  intent: unknown;
  rawBlock: string;
};

export type ExerciseRecommendationTrigger = {
  intent: unknown;
  rawBlock: string;
};

export type SuggestedQuestionTrigger = {
  suggestedQuestions: string[];
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

export function extractSuggestedQuestionTrigger(content: string): SuggestedQuestionTrigger | null {
  const regex = /```json\s*([\s\S]*?)\s*```/g;

  for (const match of content.matchAll(regex)) {
    if (!match[1]) {
      continue;
    }

    try {
      const parsed = JSON.parse(match[1]) as { type?: unknown; suggestedQuestions?: unknown };
      if (parsed.type !== "suggested_question_trigger") {
        continue;
      }

      const suggestedQuestions = Array.isArray(parsed.suggestedQuestions)
        ? parsed.suggestedQuestions
            .filter((question): question is string => typeof question === "string")
            .map((question) => question.trim())
            .filter(Boolean)
            .slice(0, 3)
        : [];

      if (suggestedQuestions.length === 0) {
        return null;
      }

      return {
        suggestedQuestions,
        rawBlock: match[0],
      };
    } catch (error) {
      console.error("Failed to parse suggested question trigger JSON:", error);
    }
  }

  return null;
}
