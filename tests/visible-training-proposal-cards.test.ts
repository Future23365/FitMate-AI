import { describe, expect, it } from "vitest";

import { adaptVisibleTrainingProposalToRichCard } from "@/features/chat/lib/visible-training-proposal-cards";
import type { ChatVisibleOutput } from "@/features/chat/types";
import { workoutPlanDraftSchema, workoutRoutineDraftSchema } from "@/lib/shared/workout-plans/draft-schema";

describe("visible training proposal rich card adapter", () => {
  it("adapts exercise_selection payload facts into an ExerciseRecommendationCard view", () => {
    const card = adaptVisibleTrainingProposalToRichCard(createVisibleOutput({
      kind: "exercise_selection",
      exerciseItems: [
        { exerciseId: "push-up", section: "training", order: 2 },
        { exerciseId: "squat", section: "training", order: 1 },
      ],
    }, {
      sections: [
        {
          section: "training",
          items: [
            createContentItem("push-up", {
              nameZh: "俯卧撑",
              equipmentZh: "自重",
              primaryMusclesZh: ["胸部"],
              imageUrl: "/push-up.png",
            }),
            createContentItem("squat", {
              nameZh: "深蹲",
              equipmentZh: "自重",
              primaryMusclesZh: ["腿部"],
              imageUrl: "/squat.png",
            }),
          ],
        },
      ],
    }));

    expect(card).toMatchObject({
      kind: "exerciseRecommendation",
      card: {
        title: "推荐训练动作",
        goal: "推荐 2 个训练动作",
        summary: "共 2 个训练动作，主要覆盖腿部、胸部，器械需求：自重。",
        items: [
          { exerciseId: "squat", nameZh: "深蹲", primaryMusclesZh: ["腿部"] },
          { exerciseId: "push-up", nameZh: "俯卧撑", primaryMusclesZh: ["胸部"] },
        ],
      },
    });
    expect(JSON.stringify(card)).not.toContain("exercise_selection");
  });

  it("keeps all 12 returned exercise_selection items visible in the recommendation card", () => {
    const card = adaptVisibleTrainingProposalToRichCard(createVisibleOutput({
      kind: "exercise_selection",
      exerciseItems: Array.from({ length: 12 }, (_, index) => ({
        exerciseId: `exercise-${index + 1}`,
        section: "training",
        order: index + 1,
      })),
    }));

    expect(card?.kind).toBe("exerciseRecommendation");
    if (card?.kind !== "exerciseRecommendation") {
      throw new Error("Expected exercise recommendation rich card");
    }

    expect(card.card.items).toHaveLength(12);
    expect(card.card.items.at(-1)?.exerciseId).toBe("exercise-12");
  });

  it("adapts routine payload facts into a three-section WorkoutRoutineDraft", () => {
    const card = adaptVisibleTrainingProposalToRichCard(createVisibleOutput({
      kind: "routine",
      exerciseItems: createRoutineItems(),
    }));

    expect(card?.kind).toBe("routine");
    if (card?.kind !== "routine") {
      throw new Error("Expected routine rich card");
    }

    expect(workoutRoutineDraftSchema.safeParse(card.draft).success).toBe(true);
    expect(card.draft.goal).toBe("完成 3 个动作的本次训练");
    expect(card.draft.summary).toBe("包含热身、主训练和拉伸，共 3 个动作，预估 6 分钟。");
    expect(card.draft.sections.map((section) => section.section)).toEqual([
      "warmup",
      "training",
      "stretch",
    ]);
    expect(card.draft.sections[1].items[0]).toMatchObject({
      exerciseId: "push-up",
      mode: "reps",
      sets: 3,
      target: 12,
      section: "training",
    });
  });

  it("adapts plan payload facts into a cycle draft that reuses routine sections for training days", () => {
    const card = adaptVisibleTrainingProposalToRichCard(createVisibleOutput({
      kind: "plan",
      exerciseItems: createRoutineItems(),
      schedule: {
        cycleLengthDays: 3,
        assignments: [
          { cycleDayIndex: 1, type: "training" },
          { cycleDayIndex: 2, type: "rest" },
          { cycleDayIndex: 3, type: "training" },
        ],
      },
    }));

    expect(card?.kind).toBe("plan");
    if (card?.kind !== "plan") {
      throw new Error("Expected plan rich card");
    }

    expect(workoutPlanDraftSchema.safeParse(card.draft).success).toBe(true);
    expect(card.draft.trainingDayCount).toBe(2);
    expect(card.draft.restDayCount).toBe(1);
    expect(card.draft.goal).toBe("完成 2 个训练日的周期计划");
    expect(card.draft.summary).toBe("3 天周期，训练 2 天、休息 1 天，单次训练预估 6 分钟。");
    expect(card.draft.days[0].sections).toEqual(card.draft.days[2].sections);
    expect(card.draft.days[1]).toMatchObject({
      cycleDayIndex: 2,
      isRestDay: true,
      sections: [],
      recoveryNotes: ["安排低强度活动、补水并保证睡眠。"],
    });
  });
});

function createVisibleOutput(
  payload: Record<string, unknown>,
  content: Record<string, unknown> = {},
): ChatVisibleOutput {
  return {
    outputType: "visibleTrainingProposal",
    schemaVersion: "1",
    payload,
    content,
  };
}

function createContentItem(exerciseId: string, exercise: Record<string, unknown>) {
  return {
    exerciseId,
    section: "training",
    order: 1,
    exercise: {
      exerciseId,
      ...exercise,
    },
  };
}

function createRoutineItems() {
  return [
    {
      exerciseId: "warmup",
      section: "warmup",
      order: 1,
      prescription: {
        mode: "duration",
        sets: 1,
        target: 45,
        setRestSeconds: 0,
        transitionRestSeconds: 20,
      },
    },
    {
      exerciseId: "push-up",
      section: "training",
      order: 1,
      prescription: {
        mode: "reps",
        sets: 3,
        target: 12,
        setRestSeconds: 45,
        transitionRestSeconds: 30,
      },
    },
    {
      exerciseId: "stretch",
      section: "stretch",
      order: 1,
      prescription: {
        mode: "duration",
        sets: 1,
        target: 40,
        setRestSeconds: 0,
        transitionRestSeconds: 0,
      },
    },
  ];
}
