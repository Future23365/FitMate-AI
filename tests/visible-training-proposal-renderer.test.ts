import { describe, expect, it } from "vitest";

import type { AgentRunResult } from "@/lib/server/agent-core/contracts";
import { renderAgentResponseEvents } from "@/lib/server/agent-core/response-renderer";
import { createProductionVisibleOutputRendererRegistry } from "@/lib/server/visible-training-proposals/visible-training-proposal-renderer";

describe("visible training proposal renderer", () => {
  it("renders exercise card details from validated metadata instead of concrete tool result shapes", () => {
    const events = renderAgentResponseEvents(createRunResult(), {
      visibleOutputRenderers: createProductionVisibleOutputRendererRegistry(),
    });

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "visible_output",
        outputType: "visibleTrainingProposal",
        content: expect.objectContaining({
          sections: [
            {
              section: "training",
              items: [
                expect.objectContaining({
                  exerciseId: "push-up",
                  exercise: expect.objectContaining({
                    exerciseId: "push-up",
                    nameZh: "俯卧撑",
                    nameEn: "Push-Up",
                    allowedSections: ["training"],
                  }),
                }),
              ],
            },
          ],
        }),
      }),
    ]));
    expect(JSON.stringify(events)).not.toContain("来自旧 tool result 的名称");
  });
});

function createRunResult(): AgentRunResult {
  return {
    runId: "run-render-visible-training-proposal",
    status: "completed",
    terminalAction: {
      type: "final_answer",
      content: "可以参考这个动作。",
      visibleOutputs: [
        {
          outputType: "visibleTrainingProposal",
          schemaVersion: "1",
          payload: {
            kind: "exercise_selection",
            exerciseItems: [
              { exerciseId: "push-up", section: "training", order: 1 },
            ],
          },
        },
      ],
    },
    terminalOutputValidation: {
      outputs: [
        {
          index: 0,
          outputType: "visibleTrainingProposal",
          schemaVersion: "1",
          metadata: {
            exerciseDetails: [
              {
                exerciseId: "push-up",
                nameZh: "俯卧撑",
                nameEn: "Push-Up",
                equipmentZh: "自重",
                primaryMusclesZh: ["胸大肌"],
                allowedSections: ["training"],
                imageUrl: null,
              },
            ],
          },
        },
      ],
    },
    toolResults: [
      {
        ok: true,
        toolResultId: "tr_legacy_shape",
        toolName: "someFutureExerciseTool",
        toolVersion: "0.1.0",
        toolCallId: "tc_legacy_shape",
        idempotencyKey: "idem_legacy_shape",
        normalizedInputHash: "hash_legacy_shape",
        startedAt: "2026-06-04T00:00:00.000Z",
        completedAt: "2026-06-04T00:00:00.000Z",
        output: {
          groups: {
            training: {
              exercises: [
                { exerciseId: "push-up", nameZh: "来自旧 tool result 的名称" },
              ],
            },
          },
        },
        projection: { model: {}, user: {} },
        fulfillment: { satisfied: true, summary: "future tool result" },
      },
    ],
    observations: [],
    traceEvents: [],
    steps: 1,
  };
}
