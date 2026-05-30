import { describe, expect, it } from "vitest";

import {
  buildPlanStrategyFromChatIntent,
  expandDomainPlan,
} from "@/lib/server/workout-plans/domain-plan-engine";

import {
  createWorkoutPlanDraft,
  createWorkoutPlanIntent,
  createWorkoutRoutineDraft,
} from "./fixtures/domain";

describe("DomainPlanEngine", () => {
  it("expands a referenced routine into a three-week schedule preview", () => {
    const strategy = buildPlanStrategyFromChatIntent({
      intent: createWorkoutPlanIntent({
        intentType: "plan",
        weeklyFrequency: 3,
        sessionMinutes: 30,
      }),
      latestUserMessage: "三周都练这个，一周三练",
      referenceResolution: {
        status: "resolved",
        artifactId: "artifact-routine-1",
        artifactKind: "routine",
        confidence: "high",
        reason: "命中最近 routine",
        candidates: [],
      },
    });

    const result = expandDomainPlan({
      strategy,
      sourceArtifact: {
        artifactId: "artifact-routine-1",
        kind: "routine",
        payload: createWorkoutRoutineDraft(),
      },
    });

    expect(result).toMatchObject({
      ok: true,
      strategy: {
        horizonDays: 21,
        weeklyFrequency: 3,
        strategy: "repeat_same_routine_with_progression",
        progressionPolicy: "volume_small_increase",
      },
    });

    if (!result.ok) {
      return;
    }

    expect(result.draft.days).toHaveLength(21);
    expect(result.draft.trainingDayCount).toBe(9);
    expect(result.draft.restDayCount).toBe(12);
    expect(result.draft.schedulePreview).toHaveLength(21);
    expect(result.draft.schedulePreview?.filter((day) => day.isTrainingDay)).toHaveLength(9);
  });

  it("uses conservative intensity for four sessions per week without increasing volume", () => {
    const strategy = buildPlanStrategyFromChatIntent({
      intent: createWorkoutPlanIntent({
        intentType: "plan",
        weeklyFrequency: 4,
        sessionMinutes: 30,
      }),
      latestUserMessage: "改成一周四练但别太累",
      referenceResolution: {
        status: "resolved",
        artifactId: "artifact-plan-1",
        artifactKind: "plan",
        confidence: "high",
        reason: "命中最近 plan",
        candidates: [],
      },
    });

    const result = expandDomainPlan({
      strategy,
      sourceArtifact: {
        artifactId: "artifact-plan-1",
        kind: "plan",
        payload: createWorkoutPlanDraft(),
      },
    });

    expect(result).toMatchObject({
      ok: true,
      strategy: {
        weeklyFrequency: 4,
        intensityBias: "conservative",
        progressionPolicy: "none",
      },
    });

    if (!result.ok) {
      return;
    }

    expect(result.draft.trainingDayCount).toBe(12);
    expect(result.draft.progression).toContain("优先控制疲劳");
    expect(result.draft.days.find((day) => !day.isRestDay)?.safetyNotes[0]).toContain("保守强度");
  });

  it("alternates the first two source plan training days for AB strategy", () => {
    const firstDay = createWorkoutPlanDraft().days[0];
    const secondDay = {
      ...firstDay,
      title: "Day 2 背部训练",
      focus: "背部",
      cycleDayIndex: 2,
    };
    const strategy = buildPlanStrategyFromChatIntent({
      intent: createWorkoutPlanIntent({
        intentType: "plan",
        weeklyFrequency: 2,
      }),
      latestUserMessage: "按 AB 交替练三周",
      referenceResolution: {
        status: "resolved",
        artifactId: "artifact-plan-2",
        artifactKind: "plan",
        confidence: "high",
        reason: "命中最近 plan",
        candidates: [],
      },
    });

    const result = expandDomainPlan({
      strategy,
      sourceArtifact: {
        artifactId: "artifact-plan-2",
        kind: "plan",
        payload: createWorkoutPlanDraft({
          cycleLengthDays: 2,
          trainingDayCount: 2,
          restDayCount: 0,
          days: [firstDay, secondDay],
        }),
      },
    });

    expect(result).toMatchObject({
      ok: true,
      strategy: {
        strategy: "alternating_ab",
      },
    });

    if (!result.ok) {
      return;
    }

    const trainingTitles = result.draft.days.filter((day) => !day.isRestDay).map((day) => day.title);
    expect(trainingTitles[0]).toContain("Day 1");
    expect(trainingTitles[1]).toContain("Day 2");
    expect(trainingTitles[2]).toContain("Day 1");
  });
});
