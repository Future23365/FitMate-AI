import { describe, expect, it } from "vitest";

import { createProductionVisibleOutputRendererRegistry } from "@/lib/server/visible-training-proposals/visible-training-proposal-renderer";
import type {
  VisibleOutputEnvelope,
  VisibleOutputRendererRunResult,
} from "@/lib/server/visible-outputs/contracts";

describe("visible training proposal renderer", () => {
  it("renders exercise card details from validated metadata instead of concrete tool result shapes", () => {
    const registry = createProductionVisibleOutputRendererRegistry();
    const events = registry.render(createVisibleOutput(), {
      result: createRunResult(),
      outputIndex: 0,
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

function createVisibleOutput(): VisibleOutputEnvelope {
  return {
    outputType: "visibleTrainingProposal",
    schemaVersion: "1",
    payload: {
      kind: "exercise_selection",
      exerciseItems: [
        { exerciseId: "push-up", section: "training", order: 1 },
      ],
    },
  };
}

function createRunResult(): VisibleOutputRendererRunResult {
  return {
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
  };
}
