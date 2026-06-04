import { describe, expect, it, vi } from "vitest";

import type { VisibleOutputEnvelope } from "@/lib/server/agent-core/contracts";
import { validateVisibleTrainingProposalOutput } from "@/lib/server/visible-training-proposals/visible-training-proposal-validator";
import type { VisibleTrainingProposalExerciseFactLoader } from "@/lib/server/visible-training-proposals/visible-training-proposal-exercise-facts";

type FixtureExerciseRecord = Awaited<ReturnType<VisibleTrainingProposalExerciseFactLoader>>[number];

describe("visible training proposal validator", () => {
  it("accepts exercise_selection when every exerciseId is valid in database facts without search tool results", async () => {
    await expect(validateVisibleTrainingProposalOutput(
      createEnvelope({
        kind: "exercise_selection",
        exerciseItems: [
          { exerciseId: "push-up", section: "training", order: 1 },
        ],
      }),
      createContext(),
      { loadExerciseRecordsByIds: createExerciseFactLoader() },
    )).resolves.toEqual({
      ok: true,
      metadata: {
        exerciseDetails: [
          expect.objectContaining({
            exerciseId: "push-up",
            nameZh: "俯卧撑",
            allowedSections: ["training"],
          }),
        ],
      },
    });
  });

  it("rejects exercise ids that do not exist in database facts", async () => {
    await expect(validateVisibleTrainingProposalOutput(
      createEnvelope({
        kind: "exercise_selection",
        exerciseItems: [
          { exerciseId: "missing-exercise", section: "training", order: 1 },
        ],
      }),
      createContext(),
      { loadExerciseRecordsByIds: createExerciseFactLoader() },
    )).resolves.toMatchObject({
      ok: false,
      message: "visibleTrainingProposal 引用了数据库不存在的动作。",
      details: {
        code: "exercise_missing",
        exerciseIds: ["missing-exercise"],
      },
    });
  });

  it("rejects exercise ids that only appear in recent metadata summaries before current database validation", async () => {
    await expect(validateVisibleTrainingProposalOutput(
      createEnvelope({
        kind: "exercise_selection",
        exerciseItems: [
          { exerciseId: "squat", section: "training", order: 1 },
        ],
      }),
      createContext({
        run: {
          runId: "run-visible-metadata-only",
          actor: { userId: "user-1", sessionId: "conversation-1" },
          userInput: "把上一轮动作编排一下",
          metadata: {
            recentVisibleTrainingProposals: [createRecentVisibleTrainingProposalSummary()],
          },
        },
      }),
      { loadExerciseRecordsByIds: async () => [] },
    )).resolves.toMatchObject({
      ok: false,
      details: {
        code: "exercise_missing",
        exerciseIds: ["squat"],
      },
    });
  });

  it("rejects unpublished exercise ids", async () => {
    await expect(validateVisibleTrainingProposalOutput(
      createEnvelope({
        kind: "exercise_selection",
        exerciseItems: [
          { exerciseId: "archived-push-up", section: "training", order: 1 },
        ],
      }),
      createContext(),
      { loadExerciseRecordsByIds: createExerciseFactLoader() },
    )).resolves.toMatchObject({
      ok: false,
      message: "visibleTrainingProposal 引用了当前不可用于用户可见训练方案的动作。",
      details: {
        code: "exercise_unpublished",
        exerciseIds: ["archived-push-up"],
      },
    });
  });

  it("rejects section values outside database allowedSections", async () => {
    await expect(validateVisibleTrainingProposalOutput(
      createEnvelope({
        kind: "exercise_selection",
        exerciseItems: [
          { exerciseId: "chest-stretch", section: "training", order: 1 },
        ],
      }),
      createContext(),
      { loadExerciseRecordsByIds: createExerciseFactLoader() },
    )).resolves.toMatchObject({
      ok: false,
      message: "visibleTrainingProposal 动作项 section 超出数据库允许边界。",
      details: {
        code: "section_not_allowed",
        exerciseId: "chest-stretch",
        section: "training",
        allowedSections: ["stretch"],
      },
    });
  });

  it("deduplicates repeated exerciseId before loading database facts", async () => {
    const loader = vi.fn(async (ids: readonly string[]) => ids.flatMap((id) => {
      const record = createExerciseRecord(id);
      return record ? [record] : [];
    }));

    await expect(validateVisibleTrainingProposalOutput(
      createEnvelope({
        kind: "exercise_selection",
        exerciseItems: [
          { exerciseId: "push-up", section: "training", order: 1 },
          { exerciseId: "push-up", section: "training", order: 2 },
        ],
      }),
      createContext(),
      { loadExerciseRecordsByIds: loader },
    )).resolves.toMatchObject({ ok: true });
    expect(loader).toHaveBeenCalledWith(["push-up"]);
  });

  it("returns structured database errors when exercise fact loading is unavailable", async () => {
    await expect(validateVisibleTrainingProposalOutput(
      createEnvelope({
        kind: "exercise_selection",
        exerciseItems: [
          { exerciseId: "push-up", section: "training", order: 1 },
        ],
      }),
      createContext(),
      { loadExerciseRecordsByIds: async () => { throw new Error("DATABASE_URL is required before reading exercises from PostgreSQL."); } },
    )).resolves.toMatchObject({
      ok: false,
      details: {
        code: "database_unconfigured",
        exerciseIds: ["push-up"],
      },
    });
  });

  it("rejects legacy id fields before accepting any payload shape", async () => {
    await expect(validateVisibleTrainingProposalOutput(
      createEnvelope({
        kind: "exercise_selection",
        exerciseItems: [
          { id: "push-up", section: "training", order: 1 },
        ],
      }),
      createContext(),
      { loadExerciseRecordsByIds: createExerciseFactLoader() },
    )).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("必须使用 exerciseId"),
    });
  });

  it("rejects routine payloads without prescriptions", async () => {
    await expect(validateVisibleTrainingProposalOutput(
      createEnvelope({
        kind: "routine",
        exerciseItems: [
          { exerciseId: "jumping-jack", section: "warmup", order: 1 },
          { exerciseId: "push-up", section: "training", order: 1 },
          { exerciseId: "chest-stretch", section: "stretch", order: 1 },
        ],
      }),
      createContext(),
      { loadExerciseRecordsByIds: createExerciseFactLoader() },
    )).resolves.toMatchObject({
      ok: false,
      message: "visibleTrainingProposal payload 不符合 schema。",
    });
  });

  it("rejects plan payloads with incomplete schedule coverage", async () => {
    await expect(validateVisibleTrainingProposalOutput(
      createEnvelope({
        kind: "plan",
        exerciseItems: [
          { exerciseId: "jumping-jack", section: "warmup", order: 1, prescription: createPrescription("reps", 20) },
          { exerciseId: "push-up", section: "training", order: 1, prescription: createPrescription("reps", 12) },
          { exerciseId: "chest-stretch", section: "stretch", order: 1, prescription: createPrescription("duration", 30) },
        ],
        schedule: {
          cycleLengthDays: 2,
          assignments: [
            { cycleDayIndex: 1, type: "training" },
          ],
        },
      }),
      createContext(),
      { loadExerciseRecordsByIds: createExerciseFactLoader() },
    )).resolves.toMatchObject({
      ok: false,
      message: "visibleTrainingProposal payload 不符合 schema。",
    });
  });
});

function createEnvelope(payload: unknown): VisibleOutputEnvelope {
  return {
    outputType: "visibleTrainingProposal",
    schemaVersion: "1",
    payload: JSON.parse(JSON.stringify(payload)),
  };
}

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    action: {
      type: "final_answer" as const,
      content: "可以参考这个方案。",
    },
    toolResults: [],
    ...overrides,
  };
}

function createExerciseFactLoader(): VisibleTrainingProposalExerciseFactLoader {
  return async (ids) => ids.flatMap((id) => {
    const record = createExerciseRecord(id);
    return record ? [record] : [];
  });
}

function createExerciseRecord(id: string): FixtureExerciseRecord | undefined {
  const records: Record<string, FixtureExerciseRecord> = {
    "jumping-jack": {
      id,
      nameZh: "开合跳",
      nameEn: "Jumping Jack",
      equipmentZh: "自重",
      primaryMusclesZh: ["全身"],
      allowedSections: ["warmup"],
      imageUrls: [],
      isPublished: true,
    },
    "push-up": {
      id,
      nameZh: "俯卧撑",
      nameEn: "Push-Up",
      equipmentZh: "自重",
      primaryMusclesZh: ["胸大肌"],
      allowedSections: ["training"],
      imageUrls: ["https://example.test/push-up.jpg"],
      isPublished: true,
    },
    "archived-push-up": {
      id,
      nameZh: "旧版俯卧撑",
      nameEn: "Archived Push-Up",
      equipmentZh: "自重",
      primaryMusclesZh: ["胸大肌"],
      allowedSections: ["training"],
      imageUrls: [],
      isPublished: false,
    },
    squat: {
      id,
      nameZh: "深蹲",
      nameEn: "Squat",
      equipmentZh: "自重",
      primaryMusclesZh: ["股四头肌"],
      allowedSections: ["training"],
      imageUrls: [],
      isPublished: true,
    },
    "chest-stretch": {
      id,
      nameZh: "胸部拉伸",
      nameEn: "Chest Stretch",
      equipmentZh: "自重",
      primaryMusclesZh: ["胸大肌"],
      allowedSections: ["stretch"],
      imageUrls: [],
      isPublished: true,
    },
  };

  return records[id as keyof typeof records];
}

function createRecentVisibleTrainingProposalSummary() {
  return {
    factRef: "fact-previous",
    messageId: "assistant-previous",
    proposalKind: "exercise_selection",
    exerciseItems: [
      { exerciseId: "squat", section: "training", order: 1, allowedSections: ["training"] },
    ],
  };
}

function createPrescription(mode: "reps" | "duration", target: number) {
  return {
    mode,
    sets: 2,
    target,
    setRestSeconds: 45,
    transitionRestSeconds: 30,
  };
}
