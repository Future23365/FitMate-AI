import { describe, expect, it } from "vitest";

import type { ToolResult, VisibleOutputEnvelope } from "@/lib/server/agent-core/contracts";
import { ResourceStore } from "@/lib/server/agent-core/resource-store";
import { validateVisibleTrainingProposalOutput } from "@/lib/server/visible-training-proposals/visible-training-proposal-validator";

describe("visible training proposal validator", () => {
  it("accepts exercise_selection when every exerciseId comes from a satisfied grouped search result", () => {
    expect(validateVisibleTrainingProposalOutput(
      createEnvelope({
        kind: "exercise_selection",
        exerciseItems: [
          { exerciseId: "push-up", section: "training", order: 1 },
        ],
      }),
      {
        action: {
          type: "final_answer",
          content: "可以参考俯卧撑。",
        },
        toolResults: [createSearchToolResult()],
      },
    )).toEqual({ ok: true });
  });

  it("rejects exercise ids that were not visible in satisfied search or visible proposal facts", () => {
    expect(validateVisibleTrainingProposalOutput(
      createEnvelope({
        kind: "exercise_selection",
        exerciseItems: [
          { exerciseId: "missing-exercise", section: "training", order: 1 },
        ],
      }),
      {
        action: {
          type: "final_answer",
          content: "可以参考这个动作。",
        },
        toolResults: [createSearchToolResult()],
      },
    )).toMatchObject({
      ok: false,
      message: expect.stringContaining("exerciseId 未被本轮 satisfied searchExerciseResources"),
    });
  });

  it("rejects exercise ids that only appear in recent metadata summaries before read/import", () => {
    expect(validateVisibleTrainingProposalOutput(
      createEnvelope({
        kind: "exercise_selection",
        exerciseItems: [
          { exerciseId: "squat", section: "training", order: 1 },
        ],
      }),
      {
        action: {
          type: "final_answer",
          content: "沿用上一轮深蹲。",
        },
        toolResults: [],
        run: {
          runId: "run-visible-metadata-only",
          actor: { userId: "user-1", sessionId: "conversation-1" },
          userInput: "把上一轮动作编排一下",
          metadata: {
            recentVisibleTrainingProposals: [createRecentVisibleTrainingProposalSummary()],
          },
        },
      },
    )).toMatchObject({
      ok: false,
      message: expect.stringContaining("visible_training_proposal_fact 支持"),
    });
  });

  it("accepts exercise ids after a visible proposal fact is imported into the current run", () => {
    expect(validateVisibleTrainingProposalOutput(
      createEnvelope({
        kind: "exercise_selection",
        exerciseItems: [
          { exerciseId: "squat", section: "training", order: 1 },
        ],
      }),
      {
        action: {
          type: "final_answer",
          content: "沿用上一轮深蹲。",
        },
        toolResults: [createVisibleFactToolResult()],
        run: {
          runId: "run-visible-imported",
          actor: { userId: "user-1", sessionId: "conversation-1" },
          userInput: "把上一轮动作编排一下",
          metadata: {
            recentVisibleTrainingProposals: [createRecentVisibleTrainingProposalSummary()],
          },
        },
      },
    )).toEqual({ ok: true });
  });

  it("accepts exercise ids from consumable visible proposal fact resources", () => {
    const resourceStore = new ResourceStore("run-visible-resource");
    resourceStore.register({
      resourceType: "visible_training_proposal_fact",
      role: "consumable",
      schemaVersion: "1",
      sourceToolResultId: "tr_read_visible_fact",
      summary: createRecentVisibleTrainingProposalSummary(),
    });

    expect(validateVisibleTrainingProposalOutput(
      createEnvelope({
        kind: "exercise_selection",
        exerciseItems: [
          { exerciseId: "squat", section: "training", order: 1 },
        ],
      }),
      {
        action: {
          type: "final_answer",
          content: "沿用上一轮深蹲。",
        },
        toolResults: [],
        resourceStore,
      },
    )).toEqual({ ok: true });
  });

  it("rejects legacy id fields before accepting any payload shape", () => {
    expect(validateVisibleTrainingProposalOutput(
      createEnvelope({
        kind: "exercise_selection",
        exerciseItems: [
          { id: "push-up", section: "training", order: 1 },
        ],
      }),
      {
        action: {
          type: "final_answer",
          content: "可以参考俯卧撑。",
        },
        toolResults: [createSearchToolResult()],
      },
    )).toMatchObject({
      ok: false,
      message: expect.stringContaining("必须使用 exerciseId"),
    });
  });

  it("rejects routine payloads without prescriptions", () => {
    expect(validateVisibleTrainingProposalOutput(
      createEnvelope({
        kind: "routine",
        exerciseItems: [
          { exerciseId: "jumping-jack", section: "warmup", order: 1 },
          { exerciseId: "push-up", section: "training", order: 1 },
          { exerciseId: "chest-stretch", section: "stretch", order: 1 },
        ],
      }),
      {
        action: {
          type: "final_answer",
          content: "这是一套训练。",
        },
        toolResults: [createSearchToolResult()],
      },
    )).toMatchObject({
      ok: false,
      message: "visibleTrainingProposal payload 不符合 schema。",
    });
  });

  it("rejects plan payloads with incomplete schedule coverage", () => {
    expect(validateVisibleTrainingProposalOutput(
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
      {
        action: {
          type: "final_answer",
          content: "这是一套计划。",
        },
        toolResults: [createSearchToolResult()],
      },
    )).toMatchObject({
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

function createSearchToolResult(): ToolResult {
  return {
    ok: true,
    toolResultId: "tr_search",
    toolName: "searchExerciseResources",
    toolVersion: "0.4.0",
    toolCallId: "tc_search",
    idempotencyKey: "idem_search",
    normalizedInputHash: "hash_search",
    startedAt: "2026-06-04T00:00:00.000Z",
    completedAt: "2026-06-04T00:00:00.000Z",
    output: {
      status: "succeeded",
      groups: {
        warmup: {
          exercises: [
            { exerciseId: "jumping-jack", allowedSections: ["warmup"] },
          ],
        },
        training: {
          exercises: [
            { exerciseId: "push-up", allowedSections: ["training"] },
          ],
        },
        stretch: {
          exercises: [
            { exerciseId: "chest-stretch", allowedSections: ["stretch"] },
          ],
        },
      },
    },
    projection: {
      model: {},
      user: {},
    },
    fulfillment: {
      satisfied: true,
      summary: "fixture search result",
    },
  };
}

function createVisibleFactToolResult(): ToolResult {
  return {
    ok: true,
    toolResultId: "tr_read_visible_fact",
    toolName: "inspectVisibleTrainingProposals",
    toolVersion: "0.2.0",
    toolCallId: "tc_read_visible_fact",
    idempotencyKey: "idem_read_visible_fact",
    normalizedInputHash: "hash_read_visible_fact",
    startedAt: "2026-06-04T00:00:00.000Z",
    completedAt: "2026-06-04T00:00:00.000Z",
    output: {
      status: "succeeded",
      operation: "read_recent",
      fact: {
        proposal: {
          kind: "exercise_selection",
          exerciseItems: [
            { exerciseId: "squat", section: "training", order: 1 },
          ],
        },
        exerciseDetails: [
          { exerciseId: "squat", allowedSections: ["training"] },
        ],
      },
    },
    projection: {
      model: {},
      user: {},
    },
    fulfillment: {
      satisfied: true,
      summary: "fixture visible fact result",
    },
  };
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
