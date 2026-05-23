export type WorkoutPlanTrigger = {
  intent: unknown;
  rawBlock: string;
};

export type WorkoutRoutineTrigger = {
  intent: unknown;
  rawBlock: string;
};

export type ExerciseRecommendationTrigger = {
  intent: unknown;
  rawBlock: string;
};

export type SuggestedReplyTrigger = {
  suggestedReplies: string[];
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

export function extractWorkoutRoutineTrigger(content: string): WorkoutRoutineTrigger | null {
  const regex = /```json\s*(\{[\s\S]*?"type"\s*:\s*"workout_routine_trigger"[\s\S]*?\})\s*```/;
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
    console.error("Failed to parse routine trigger JSON:", error);
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

export function extractSuggestedReplyTrigger(content: string): SuggestedReplyTrigger | null {
  const regex = /```json\s*([\s\S]*?)\s*```/g;

  for (const match of content.matchAll(regex)) {
    if (!match[1]) {
      continue;
    }

    try {
      const parsed = JSON.parse(match[1]) as {
        type?: unknown;
        suggestedReplies?: unknown;
        suggestedQuestions?: unknown;
      };
      if (parsed.type !== "suggested_reply_trigger" && parsed.type !== "suggested_question_trigger") {
        continue;
      }

      const rawReplies = Array.isArray(parsed.suggestedReplies)
        ? parsed.suggestedReplies
        : parsed.suggestedQuestions;
      const suggestedReplies = Array.isArray(rawReplies)
        ? rawReplies
            .filter((reply): reply is string => typeof reply === "string")
            .map((reply) => reply.trim())
            .filter(Boolean)
            .slice(0, 3)
        : [];

      if (suggestedReplies.length === 0) {
        return null;
      }

      return {
        suggestedReplies,
        rawBlock: match[0],
      };
    } catch (error) {
      console.error("Failed to parse suggested reply trigger JSON:", error);
    }
  }

  return null;
}
