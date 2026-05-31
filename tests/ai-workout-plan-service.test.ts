import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createExercise,
  createWorkoutPlanDraft,
  createWorkoutPlanIntent,
  createWorkoutRoutineDraft,
} from "./fixtures/domain";

const exerciseServiceMocks = vi.hoisted(() => ({
  listAllExercises: vi.fn(),
  searchExercisesInMemory: vi.fn((exercises: Array<{ id: string }>, input: { query?: string } = {}) => ({
    candidates: exercises,
    diagnostics: {
      query: input.query,
      filters: {},
      recalledCount: exercises.length,
      filteredCount: 0,
      rerank: exercises.map((exercise) => ({
        exerciseId: exercise.id,
        score: {
          textScore: 0,
          vectorScore: 0,
          businessScore: 0,
          totalScore: 0,
          reasons: [],
        },
      })),
      finalExerciseIds: exercises.map((exercise) => exercise.id),
      failureReasons: [],
    },
  })),
}));
const serverRequestMocks = vi.hoisted(() => ({
  serverRequest: vi.fn(),
}));
const artifactServiceMocks = vi.hoisted(() => ({
  getActiveArtifactPayloadForCurrentUser: vi.fn(),
}));

vi.mock("@/lib/server/exercises/exercise-service", () => exerciseServiceMocks);
vi.mock("@/lib/server/http/server-request", () => serverRequestMocks);
vi.mock("@/lib/server/conversation-artifacts/artifact-service", () => artifactServiceMocks);

const { aiWorkoutPlanRequestSchema, generateAiWorkoutPlanDraft } = await import(
  "@/lib/server/workout-plans/ai-workout-plan-service"
);

describe("AI workout plan orchestration boundaries", () => {
  beforeEach(() => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    exerciseServiceMocks.listAllExercises.mockResolvedValue([]);
    exerciseServiceMocks.searchExercisesInMemory.mockClear();
    serverRequestMocks.serverRequest.mockReset();
    artifactServiceMocks.getActiveArtifactPayloadForCurrentUser.mockReset();
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
            choices: [{ message: { content: JSON.stringify(createThirtyMinuteRoutineDraft()) } }],
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
      draft: { kind: "routine", trainingLoopRounds: 2 },
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
    const pushUpModelExercise = routineModelPayload.primaryExercises.find(
      (exercise: { exerciseId: string }) => exercise.exerciseId === "push-up",
    );
    expect(pushUpModelExercise).toMatchObject({
      exerciseId: "push-up",
      nameZh: "俯卧撑",
      candidateSource: "primary",
      matchingReasons: expect.arrayContaining([expect.any(String)]),
      targetMusclesZh: expect.arrayContaining(["胸部"]),
    });
    expect(pushUpModelExercise).not.toHaveProperty("score");
    expect(pushUpModelExercise).not.toHaveProperty("source");
    expect(pushUpModelExercise).not.toHaveProperty("imageUrl");
    expect(pushUpModelExercise).not.toHaveProperty("imageUrls");
    expect(pushUpModelExercise).not.toHaveProperty("images");
    expect(pushUpModelExercise).not.toHaveProperty("nameEn");
    expect(pushUpModelExercise).not.toHaveProperty("levelZh");
    expect(pushUpModelExercise).not.toHaveProperty("allowedSections");
    expect(pushUpModelExercise).not.toHaveProperty("movementPattern");
    expect(pushUpModelExercise).not.toHaveProperty("difficulty");
    expect(routineModelPayload.primaryExercises.length).toBeLessThanOrEqual(16);
    expect(routineModelPayload.trainingExercises.length).toBeLessThanOrEqual(16);
  });

  it("accepts referenced dynamic joint actions in warmup without validation repair", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    exerciseServiceMocks.listAllExercises.mockResolvedValue(createJointMobilityExercises());
    serverRequestMocks.serverRequest.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(createJointWarmupRoutineDraft()) } }],
        }),
      ),
    );

    const result = await generateAiWorkoutPlanDraft({
      latestUserMessage: "30分钟，练这个",
      conversationSummary: "用户刚才选中了膝关节和手腕活动动作，想生成单次训练。",
      intent: createWorkoutPlanIntent({
        intentType: "routine",
        goal: "灵活性恢复",
        sessionMinutes: 30,
        weeklyFrequency: 1,
        preferences: ["居家训练"],
      }),
    });

    expect(result).toMatchObject({
      ok: true,
      kind: "routine",
      validation: {
        valid: true,
        warnings: expect.arrayContaining([
          expect.objectContaining({
            code: "section_exercise_mismatch",
            exerciseId: "Knee_Circles",
            section: "warmup",
            metadataSections: ["stretch"],
          }),
          expect.objectContaining({
            code: "section_exercise_mismatch",
            exerciseId: "Wrist_Circles",
            section: "warmup",
            metadataSections: ["stretch"],
          }),
        ]),
      },
    });
    expect(serverRequestMocks.serverRequest).toHaveBeenCalledTimes(1);
  });

  it("uses DomainPlanEngine for referenced multi-week routine plans without draft generation model call", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    exerciseServiceMocks.listAllExercises.mockResolvedValue(createModelExercises());
    artifactServiceMocks.getActiveArtifactPayloadForCurrentUser.mockResolvedValue({
      ok: true,
      artifactId: "artifact-routine-active",
      kind: "routine",
      payload: createWorkoutRoutineDraft(),
      requestedArtifactId: "artifact-routine-old",
      revisionResolution: {
        status: "resolved_to_active",
        requestedArtifactId: "artifact-routine-old",
        activeArtifactId: "artifact-routine-active",
      },
    });

    const result = await generateAiWorkoutPlanDraft({
      latestUserMessage: "三周都练这个，一周三练",
      conversationSummary: "用户想复用刚才那套训练。",
      intent: createWorkoutPlanIntent({
        intentType: "plan",
        goal: "胸肌训练",
        sessionMinutes: 30,
        weeklyFrequency: 3,
      }),
      referenceResolution: {
        status: "resolved",
        artifactId: "artifact-routine-old",
        artifactKind: "routine",
        confidence: "high",
        reason: "命中最近 routine",
        candidates: [],
      },
    });

    expect(result).toMatchObject({
      ok: true,
      kind: "plan",
      draft: {
        cycleLengthDays: 21,
        trainingDayCount: 9,
        planStrategy: {
          strategy: "repeat_same_routine_with_progression",
        },
      },
    });
    expect(artifactServiceMocks.getActiveArtifactPayloadForCurrentUser).toHaveBeenCalledWith({
      artifactId: "artifact-routine-old",
    });
    expect(serverRequestMocks.serverRequest).not.toHaveBeenCalled();
  });

  it("repairs a session_too_long routine once and returns the repaired draft", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    exerciseServiceMocks.listAllExercises.mockResolvedValue(createModelExercises());
    const longDraft = createWorkoutRoutineDraft({
      estimatedSessionMinutes: 30,
      trainingLoopRounds: 12,
      trainingLoopRestSeconds: 120,
      sections: [
        createWorkoutRoutineDraft().sections[0],
        {
          section: "training",
          title: "过长主训练",
          items: [
            {
              exerciseId: "push-up",
              section: "training",
              mode: "duration",
              sets: 8,
              target: 600,
              setRestSeconds: 120,
              transitionRestSeconds: 60,
            },
          ],
        },
        createWorkoutRoutineDraft().sections[2],
      ],
    });
    const repairedDraft = createThirtyMinuteRoutineDraft();
    serverRequestMocks.serverRequest
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(longDraft) } }] })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(repairedDraft) } }] })),
      );

    const result = await generateAiWorkoutPlanDraft({
      latestUserMessage: "今天在家自重练胸 30 分钟",
      conversationSummary: "用户想在家自重练胸。",
      intent: createWorkoutPlanIntent({
        intentType: "routine",
        goal: "胸肌训练",
        sessionMinutes: 30,
        weeklyFrequency: 1,
      }),
    });

    expect(result).toMatchObject({
      ok: true,
      kind: "routine",
      draft: {
        trainingLoopRounds: 2,
      },
    });
    expect(serverRequestMocks.serverRequest).toHaveBeenCalledTimes(2);
    const repairRequestBody = serverRequestMocks.serverRequest.mock.calls[1][1].body;
    const repairPayload = JSON.parse(repairRequestBody.messages[1].content);
    expect(repairRequestBody.messages[0].content).toContain("必须把训练压缩到用户目标时长附近");
    expect(repairPayload).toMatchObject({
      recovery: {
        recoverable: true,
        primaryIssueCode: "session_too_long",
      },
      validation: {
        errors: [expect.objectContaining({ code: "session_too_long" })],
      },
      originalDraft: {
        trainingLoopRounds: 12,
      },
    });
  });

  it("repairs a session_too_short routine by asking the model to add training volume", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    exerciseServiceMocks.listAllExercises.mockResolvedValue(createModelExercises());
    const shortDraft = createWorkoutRoutineDraft({
      estimatedSessionMinutes: 30,
      trainingLoopRounds: 1,
      trainingLoopRestSeconds: 45,
    });
    const repairedDraft = createWorkoutRoutineDraft({
      estimatedSessionMinutes: 30,
      trainingLoopRounds: 2,
      trainingLoopRestSeconds: 45,
      sections: [
        createWorkoutRoutineDraft().sections[0],
        {
          section: "training",
          title: "补足主训练",
          items: [
            {
              exerciseId: "push-up",
              section: "training",
              mode: "duration",
              sets: 3,
              target: 180,
              setRestSeconds: 60,
              transitionRestSeconds: 60,
            },
          ],
        },
        createWorkoutRoutineDraft().sections[2],
      ],
    });
    serverRequestMocks.serverRequest
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(shortDraft) } }] })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(repairedDraft) } }] })),
      );

    const result = await generateAiWorkoutPlanDraft({
      latestUserMessage: "今天在家自重练胸 30 分钟",
      conversationSummary: "用户想在家自重练胸。",
      intent: createWorkoutPlanIntent({
        intentType: "routine",
        goal: "胸肌训练",
        sessionMinutes: 30,
        weeklyFrequency: 1,
      }),
    });

    expect(result).toMatchObject({
      ok: true,
      kind: "routine",
      draft: {
        trainingLoopRounds: 2,
      },
    });
    expect(serverRequestMocks.serverRequest).toHaveBeenCalledTimes(2);
    const repairRequestBody = serverRequestMocks.serverRequest.mock.calls[1][1].body;
    const repairPayload = JSON.parse(repairRequestBody.messages[1].content);
    expect(repairRequestBody.messages[0].content).toContain("必须把训练补足到用户目标时长附近");
    expect(repairRequestBody.messages[0].content).toContain("禁止只修改 estimatedSessionMinutes");
    expect(repairPayload).toMatchObject({
      recovery: {
        recoverable: true,
        primaryIssueCode: "session_too_short",
      },
      validation: {
        errors: [expect.objectContaining({ code: "session_too_short" })],
      },
      originalDraft: {
        trainingLoopRounds: 1,
      },
    });
  });

  it("returns recoverable guidance when automatic repair still fails validation", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    exerciseServiceMocks.listAllExercises.mockResolvedValue(createModelExercises());
    const longDraft = createWorkoutRoutineDraft({
      estimatedSessionMinutes: 30,
      trainingLoopRounds: 12,
      trainingLoopRestSeconds: 120,
      sections: [
        createWorkoutRoutineDraft().sections[0],
        {
          section: "training",
          title: "过长主训练",
          items: [
            {
              exerciseId: "push-up",
              section: "training",
              mode: "duration",
              sets: 8,
              target: 600,
              setRestSeconds: 120,
              transitionRestSeconds: 60,
            },
          ],
        },
        createWorkoutRoutineDraft().sections[2],
      ],
    });
    serverRequestMocks.serverRequest
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(longDraft) } }] })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(longDraft) } }] })),
      );

    const result = await generateAiWorkoutPlanDraft({
      latestUserMessage: "今天在家自重练胸 30 分钟",
      conversationSummary: "用户想在家自重练胸。",
      intent: createWorkoutPlanIntent({
        intentType: "routine",
        goal: "胸肌训练",
        sessionMinutes: 30,
        weeklyFrequency: 1,
      }),
    });

    expect(result).toMatchObject({
      ok: false,
      code: "plan_validation_failed",
      recoverable: true,
      guidanceMessage: expect.stringContaining("压缩到 30 分钟"),
      suggestedReplies: expect.arrayContaining(["压缩到 30 分钟", "减少动作数量", "降低每个动作组数"]),
      validation: {
        errors: [expect.objectContaining({ code: "session_too_long" })],
      },
    });
    expect(result).not.toHaveProperty("draft");
  });
});

function createModelExercises() {
  return [
    createExercise({ id: "warmup", nameZh: "肩部动态热身", categoryZh: "热身", primaryMusclesZh: ["肩部"] }),
    createExercise({ id: "push-up", nameZh: "俯卧撑", primaryMusclesZh: ["胸部"], primaryMuscles: ["chest"] }),
    createExercise({ id: "wide-push-up", nameZh: "宽距俯卧撑", primaryMusclesZh: ["胸部"], primaryMuscles: ["chest"] }),
    createExercise({ id: "incline-push-up", nameZh: "上斜俯卧撑", primaryMusclesZh: ["胸部"], primaryMuscles: ["chest"] }),
    createExercise({ id: "knee-push-up", nameZh: "跪姿俯卧撑", primaryMusclesZh: ["胸部"], primaryMuscles: ["chest"] }),
    createExercise({ id: "stretch", nameZh: "胸肩拉伸", categoryZh: "拉伸", primaryMusclesZh: ["胸部"] }),
  ];
}

function createJointMobilityExercises() {
  return [
    createExercise({
      id: "Knee_Circles",
      nameZh: "膝关节环绕",
      categoryZh: "灵活性",
      primaryMusclesZh: ["股四头肌"],
      allowedSections: ["stretch"],
      intensityRole: "recovery",
      movementPattern: "rotation",
      goalTags: ["mobility"],
    }),
    createExercise({
      id: "Wrist_Circles",
      nameZh: "手腕环绕",
      categoryZh: "灵活性",
      primaryMusclesZh: ["前臂"],
      allowedSections: ["stretch"],
      intensityRole: "recovery",
      movementPattern: "rotation",
      goalTags: ["mobility"],
    }),
    createExercise({ id: "push-up", nameZh: "俯卧撑", primaryMusclesZh: ["胸部"], primaryMuscles: ["chest"] }),
    createExercise({
      id: "stretch",
      nameZh: "全身放松拉伸",
      categoryZh: "拉伸",
      primaryMusclesZh: ["胸部"],
      allowedSections: ["stretch"],
      intensityRole: "recovery",
      movementPattern: "stretch",
      goalTags: ["mobility"],
    }),
  ];
}

function createJointWarmupRoutineDraft() {
  return createThirtyMinuteRoutineDraft({
    warmupExerciseIds: ["Knee_Circles", "Wrist_Circles"],
    stretchExerciseId: "stretch",
  });
}

function createThirtyMinuteRoutineDraft(options: {
  warmupExerciseIds?: string[];
  stretchExerciseId?: string;
} = {}) {
  const warmupExerciseIds = options.warmupExerciseIds ?? ["warmup"];
  return createWorkoutRoutineDraft({
    estimatedSessionMinutes: 30,
    trainingLoopRounds: 2,
    trainingLoopRestSeconds: 45,
    sections: [
      {
        section: "warmup",
        title: "热身激活",
        items: warmupExerciseIds.map((exerciseId) => ({
          exerciseId,
          section: "warmup" as const,
          mode: "duration" as const,
          sets: 1,
          target: 45,
          setRestSeconds: 0,
          transitionRestSeconds: 20,
        })),
      },
      {
        section: "training",
        title: "主训练",
        items: [
          {
            exerciseId: "push-up",
            section: "training",
            mode: "duration",
            sets: 3,
            target: 180,
            setRestSeconds: 60,
            transitionRestSeconds: 60,
          },
        ],
      },
      {
        ...createWorkoutRoutineDraft().sections[2],
        items: createWorkoutRoutineDraft().sections[2].items.map((item) => ({
          ...item,
          exerciseId: options.stretchExerciseId ?? item.exerciseId,
        })),
      },
    ],
  });
}
