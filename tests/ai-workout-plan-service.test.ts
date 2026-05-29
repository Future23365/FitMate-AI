import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createExercise,
  createWorkoutPlanDraft,
  createWorkoutPlanIntent,
  createWorkoutRoutineDraft,
} from "./fixtures/domain";

const exerciseServiceMocks = vi.hoisted(() => ({
  listAllExercises: vi.fn(),
}));
const serverRequestMocks = vi.hoisted(() => ({
  serverRequest: vi.fn(),
}));

vi.mock("@/lib/server/exercises/exercise-service", () => exerciseServiceMocks);
vi.mock("@/lib/server/http/server-request", () => serverRequestMocks);

const { aiWorkoutPlanRequestSchema, generateAiWorkoutPlanDraft } = await import(
  "@/lib/server/workout-plans/ai-workout-plan-service"
);

describe("AI workout plan orchestration boundaries", () => {
  beforeEach(() => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    exerciseServiceMocks.listAllExercises.mockResolvedValue([]);
    serverRequestMocks.serverRequest.mockReset();
  });

  it("validates request schema and reports missing model configuration before external calls", async () => {
    expect(aiWorkoutPlanRequestSchema.safeParse({ latestUserMessage: "" }).success).toBe(false);

    const result = await generateAiWorkoutPlanDraft({
      latestUserMessage: "今天练胸",
      conversationSummary: "",
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
      latestUserMessage: "新手在家自重练胸",
      conversationSummary: "用户是新手，想在家自重练胸。",
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

  it("returns routine and plan drafts with explicit kind", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const modelExercises = [
      createExercise({ id: "warmup", nameZh: "肩部动态热身", categoryZh: "热身", primaryMusclesZh: ["肩部"] }),
      createExercise({ id: "push-up", nameZh: "俯卧撑", primaryMusclesZh: ["胸部"], primaryMuscles: ["chest"] }),
      createExercise({ id: "wide-push-up", nameZh: "宽距俯卧撑", primaryMusclesZh: ["胸部"], primaryMuscles: ["chest"] }),
      createExercise({ id: "incline-push-up", nameZh: "上斜俯卧撑", primaryMusclesZh: ["胸部"], primaryMuscles: ["chest"] }),
      createExercise({ id: "knee-push-up", nameZh: "跪姿俯卧撑", primaryMusclesZh: ["胸部"], primaryMuscles: ["chest"] }),
      createExercise({ id: "stretch", nameZh: "胸肩拉伸", categoryZh: "拉伸", primaryMusclesZh: ["胸部"] }),
    ];
    exerciseServiceMocks.listAllExercises.mockResolvedValue(modelExercises);
    serverRequestMocks.serverRequest
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(createWorkoutRoutineDraft()) } }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify(
                    createWorkoutPlanDraft({
                      weeklyFrequency: 1,
                    }),
                  ),
                },
              },
            ],
          }),
        ),
      );

    const routineResult = await generateAiWorkoutPlanDraft({
      latestUserMessage: "今天在家自重练胸 30 分钟",
      conversationSummary: "用户想在家自重练胸。",
      intent: createWorkoutPlanIntent({
        intentType: "routine",
        goal: "胸肌训练",
        sessionMinutes: 30,
        weeklyFrequency: 1,
      }),
    });
    const planResult = await generateAiWorkoutPlanDraft({
      latestUserMessage: "给我每周一次胸肌计划",
      conversationSummary: "用户想要胸肌训练计划。",
      intent: createWorkoutPlanIntent({
        intentType: "plan",
        goal: "胸肌训练",
        sessionMinutes: 30,
        weeklyFrequency: 1,
      }),
    });

    expect(routineResult).toMatchObject({
      ok: true,
      kind: "routine",
      draft: { kind: "routine", trainingLoopRounds: 3 },
    });
    expect(planResult).toMatchObject({
      ok: true,
      kind: "plan",
      draft: { weeklyFrequency: 1 },
    });

    const routineRequestBody = serverRequestMocks.serverRequest.mock.calls[0][1].body;
    const routineModelPayload = JSON.parse(routineRequestBody.messages[1].content);
    expect(routineRequestBody.messages).toHaveLength(2);
    expect(routineModelPayload).toMatchObject({
      conversationSummary: "用户想在家自重练胸。",
      latestUserMessage: "今天在家自重练胸 30 分钟",
      intent: expect.objectContaining({ intentType: "routine" }),
    });
    expect(routineModelPayload).not.toHaveProperty("recentMessages");
    expect(routineModelPayload).not.toHaveProperty("conversationContext");
  });
});
