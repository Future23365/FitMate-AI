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
  return extractTrigger(content, "workout_plan_trigger");
}

export function extractWorkoutRoutineTrigger(content: string): WorkoutRoutineTrigger | null {
  return extractTrigger(content, "workout_routine_trigger");
}

export function extractExerciseRecommendationTrigger(
  content: string,
): ExerciseRecommendationTrigger | null {
  return extractTrigger(content, "exercise_recommendation_trigger");
}

export function extractSuggestedReplyTrigger(content: string): SuggestedReplyTrigger | null {
  for (const block of collectJsonBlocks(content)) {
    try {
      const parsed = JSON.parse(block.jsonText) as {
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
        rawBlock: block.rawBlock,
      };
    } catch (error) {
      console.error("Failed to parse suggested reply trigger JSON:", error);
    }
  }

  return null;
}

function extractTrigger<T extends WorkoutPlanTrigger | WorkoutRoutineTrigger | ExerciseRecommendationTrigger>(
  content: string,
  type: "exercise_recommendation_trigger" | "workout_plan_trigger" | "workout_routine_trigger",
): T | null {
  for (const block of collectJsonBlocks(content)) {
    if (!block.jsonText.includes(`"type"`) || !block.jsonText.includes(type)) {
      continue;
    }

    try {
      const parsed = JSON.parse(block.jsonText) as { type?: unknown; intent?: unknown };

      if (parsed.type !== type) {
        continue;
      }

      return {
        intent: parsed.intent,
        rawBlock: block.rawBlock,
      } as T;
    } catch (error) {
      console.error("Failed to parse trigger JSON:", error);
    }
  }

  return null;
}

function collectJsonBlocks(content: string) {
  const blocks: Array<{ jsonText: string; rawBlock: string }> = [];
  const fencedRegex = /```json\s*([\s\S]*?)\s*```/g;

  for (const match of content.matchAll(fencedRegex)) {
    if (match[1]) {
      blocks.push({
        jsonText: match[1].trim(),
        rawBlock: match[0],
      });
    }
  }

  for (const rawBlock of collectBalancedJsonObjects(content)) {
    if (!blocks.some((block) => block.jsonText === rawBlock)) {
      blocks.push({
        jsonText: rawBlock,
        rawBlock,
      });
    }
  }

  return blocks;
}

function collectBalancedJsonObjects(content: string) {
  const blocks: string[] = [];

  for (let start = content.indexOf("{"); start >= 0; start = content.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (let index = start; index < content.length; index += 1) {
      const char = content[index];

      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === "\\") {
        isEscaped = true;
        continue;
      }

      if (char === "\"") {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === "{") {
        depth += 1;
      }

      if (char === "}") {
        depth -= 1;
      }

      if (depth === 0) {
        blocks.push(content.slice(start, index + 1));
        break;
      }
    }
  }

  return blocks;
}
