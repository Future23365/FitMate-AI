import { describe, expect, it, vi } from "vitest";

import {
  extractExerciseRecommendationTrigger,
  extractSuggestedReplyTrigger,
  extractWorkoutPlanTrigger,
  extractWorkoutRoutineTrigger,
} from "@/features/chat/lib/workout-plan-trigger";

import { createWorkoutPlanIntent } from "./fixtures/domain";

describe("workout plan trigger parsing", () => {
  it("extracts fenced trigger JSON blocks", () => {
    const intent = createWorkoutPlanIntent({ intentType: "plan" });
    const planTrigger = extractWorkoutPlanTrigger(`说明\n\`\`\`json\n${JSON.stringify({
      type: "workout_plan_trigger",
      intent,
    })}\n\`\`\``);
    const routineTrigger = extractWorkoutRoutineTrigger(`\`\`\`json\n${JSON.stringify({
      type: "workout_routine_trigger",
      intent,
    })}\n\`\`\``);
    const recommendationTrigger = extractExerciseRecommendationTrigger(`\`\`\`json\n${JSON.stringify({
      type: "exercise_recommendation_trigger",
      intent,
    })}\n\`\`\``);

    expect(planTrigger?.intent).toEqual(intent);
    expect(routineTrigger?.intent).toEqual(intent);
    expect(recommendationTrigger?.intent).toEqual(intent);
  });

  it("extracts trigger JSON embedded in plain text", () => {
    const intent = createWorkoutPlanIntent({ intentType: "routine", goal: "核心训练" });
    const trigger = extractWorkoutRoutineTrigger(`可以。${JSON.stringify({
      type: "workout_routine_trigger",
      intent,
    })} 已准备`);

    expect(trigger?.intent).toEqual(intent);
  });

  it("ignores non-trigger text and invalid JSON without throwing", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(extractWorkoutPlanTrigger("普通回复，没有 trigger")).toBeNull();
    expect(extractWorkoutPlanTrigger("```json\n{\"type\":\"workout_plan_trigger\",\n```")).toBeNull();
    expect(extractExerciseRecommendationTrigger("```json\n{\"type\":\"workout_plan_trigger\"}\n```")).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("extracts suggested replies from reply or question trigger blocks", () => {
    expect(
      extractSuggestedReplyTrigger(`\`\`\`json\n${JSON.stringify({
        type: "suggested_reply_trigger",
        suggestedReplies: ["  30 分钟  ", "", "自重", "忽略第 4 个"],
      })}\n\`\`\``)?.suggestedReplies,
    ).toEqual(["30 分钟", "自重", "忽略第 4 个"]);
    expect(
      extractSuggestedReplyTrigger(`\`\`\`json\n${JSON.stringify({
        type: "suggested_question_trigger",
        suggestedQuestions: ["你每周练几次？"],
      })}\n\`\`\``)?.suggestedReplies,
    ).toEqual(["你每周练几次？"]);
  });
});
