import { describe, expect, it } from "vitest";

import {
  buildPlanStrategyFromWorkoutIntent,
  expandDomainPlan,
  validatePlanDraftAgainstStrategy,
} from "@/lib/server/workout-plans/domain-plan-engine";

import {
  createWorkoutPlanDraft,
  createWorkoutPlanIntent,
  createWorkoutRoutineDraft,
} from "./fixtures/domain";

describe("DomainPlanEngine", () => {
  it("expands a referenced routine into a three-week schedule preview", () => {
    const strategy = buildPlanStrategyFromWorkoutIntent({
      intent: createWorkoutPlanIntent({
        intentType: "plan",
        weeklyFrequency: 3,
        sessionMinutes: 30,
      }),
      latestUserMessage: "三周都练这个，一周三练",
      sourceArtifact: {
        artifactId: "artifact-routine-1",
        kind: "routine",
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
    const strategy = buildPlanStrategyFromWorkoutIntent({
      intent: createWorkoutPlanIntent({
        intentType: "plan",
        weeklyFrequency: 4,
        sessionMinutes: 30,
      }),
      latestUserMessage: "改成一周四练但别太累",
      sourceArtifact: {
        artifactId: "artifact-plan-1",
        kind: "plan",
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
    const strategy = buildPlanStrategyFromWorkoutIntent({
      intent: createWorkoutPlanIntent({
        intentType: "plan",
        weeklyFrequency: 2,
      }),
      latestUserMessage: "按 AB 交替练三周",
      sourceArtifact: {
        artifactId: "artifact-plan-2",
        kind: "plan",
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

  it("keeps explicit resolved horizon separate from weekly frequency", () => {
    const strategy = buildPlanStrategyFromWorkoutIntent({
      intent: createWorkoutPlanIntent({
        intentType: "plan",
        calendarHorizonDays: 5,
        weeklyFrequency: 3,
      }),
      latestUserMessage: "未来 5 天一周三练",
      fieldSources: {
        calendarHorizonDays: "current_user_message",
        weeklyFrequency: "current_user_message",
      },
      sourceArtifact: {
        artifactId: "artifact-routine-5",
        kind: "routine",
      },
    });

    expect(strategy).toMatchObject({
      horizonDays: 5,
      weeklyFrequency: 3,
      fieldSources: {
        calendarHorizonDays: "current_user_message",
        weeklyFrequency: "current_user_message",
      },
    });
  });

  it("marks default plan horizon as a user-visible assumption", () => {
    const strategy = buildPlanStrategyFromWorkoutIntent({
      intent: createWorkoutPlanIntent({
        intentType: "plan",
        calendarHorizonDays: undefined,
        weeklyFrequency: 3,
      }),
      latestUserMessage: "按这个继续做成计划",
      fieldSources: {
        calendarHorizonDays: "default",
      },
      sourceArtifact: {
        artifactId: "artifact-routine-default",
        kind: "routine",
      },
    });

    expect(strategy.horizonDays).toBe(21);
    expect(strategy.defaultAssumptions).toContain("未明确计划周期时，默认按 21 天预览生成。");
  });

  it("rejects drafts that conflict with the resolved PlanStrategy horizon", () => {
    const strategy = buildPlanStrategyFromWorkoutIntent({
      intent: createWorkoutPlanIntent({
        intentType: "plan",
        calendarHorizonDays: 5,
        weeklyFrequency: 3,
      }),
      latestUserMessage: "未来 5 天每周 3 练",
      fieldSources: {
        calendarHorizonDays: "current_user_message",
        weeklyFrequency: "current_user_message",
      },
    });
    const draft = createWorkoutPlanDraft({
      cycleLengthDays: 21,
      calendarHorizonDays: 21,
      weeklyFrequency: 3,
    });

    expect(validatePlanDraftAgainstStrategy(draft, strategy)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        "cycleLengthDays=21 与 horizonDays=5 不一致",
        "calendarHorizonDays=21 与 horizonDays=5 不一致",
      ]),
    });
  });
});
