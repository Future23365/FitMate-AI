import { beforeEach, describe, expect, it, vi } from "vitest";

import { createExercise, createWorkoutPlanIntent } from "./fixtures/domain";

const exerciseServiceMocks = vi.hoisted(() => ({
  listAllExercises: vi.fn(),
}));

vi.mock("@/lib/server/exercises/exercise-service", () => exerciseServiceMocks);

const { aiWorkoutPlanRequestSchema, generateAiWorkoutPlanDraft } = await import(
  "@/lib/server/workout-plans/ai-workout-plan-service"
);

describe("AI workout plan orchestration boundaries", () => {
  beforeEach(() => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    exerciseServiceMocks.listAllExercises.mockResolvedValue([]);
  });

  it("validates request schema and reports missing model configuration before external calls", async () => {
    expect(aiWorkoutPlanRequestSchema.safeParse({ messages: [] }).success).toBe(false);

    const result = await generateAiWorkoutPlanDraft({
      messages: [{ role: "user", content: "今天练胸" }],
      intent: createWorkoutPlanIntent(),
    });

    expect(result).toMatchObject({
      ok: false,
      code: "missing_api_key",
    });
    expect(exerciseServiceMocks.listAllExercises).not.toHaveBeenCalled();
  });

  it("returns candidate insufficiency without calling the model when filtered candidates are unusable", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    exerciseServiceMocks.listAllExercises.mockResolvedValue([
      createExercise({
        id: "expert-barbell",
        nameZh: "高阶杠铃抓举",
        level: "expert",
        levelZh: "专家",
        equipment: "barbell",
        equipmentZh: "杠铃",
        primaryMusclesZh: ["肩部"],
        primaryMuscles: ["shoulders"],
      }),
    ]);

    const result = await generateAiWorkoutPlanDraft({
      messages: [{ role: "user", content: "新手在家自重练胸" }],
      intent: createWorkoutPlanIntent({
        goal: "胸肌训练",
        equipment: ["自重"],
      }),
      parentTraceId: "trace-1",
    });

    expect(result).toMatchObject({
      ok: false,
      code: "candidate_actions_insufficient",
      intent: { goal: "胸肌训练" },
    });
  });
});
