import { describe, expect, it } from "vitest";

import {
  createSubmitVisibleTrainingProposalLangChainTool,
  executeLangChainToolWrapper,
} from "@/lib/server/langchain-agent";
import type { VisibleTrainingProposalExerciseFactLoader } from "@/lib/server/visible-training-proposals/visible-training-proposal-exercise-facts";

const baseContext = {
  actor: { userId: "user-1", conversationId: "conversation-1" },
};

describe("submitVisibleTrainingProposal LangChain tool", () => {
  it("exposes support-section readiness guidance in the model-visible description", () => {
    const tool = createSubmitVisibleTrainingProposalLangChainTool();

    expect(tool.description).toContain("warmup、training、stretch");
    expect(tool.description).toContain("缺 warmup 或 stretch");
    expect(tool.description).toContain("先查询缺失 support section");
  });

  it("validates visibleTrainingProposal payloads before exposing visible_output projection", async () => {
    const tool = createSubmitVisibleTrainingProposalLangChainTool({
      loadExerciseRecordsByIds: createExerciseFactLoader(),
    });

    const execution = await executeLangChainToolWrapper(tool, {
      outputType: "visibleTrainingProposal",
      schemaVersion: "1",
      payload: {
        kind: "exercise_selection",
        exerciseItems: [
          { exerciseId: "push-up", section: "training", order: 1 },
        ],
      },
    }, baseContext);

    expect(execution.record).toMatchObject({
      toolName: "submitVisibleTrainingProposal",
      status: "succeeded",
      enteredModelContext: true,
      userProjection: {
        validatedVisibleOutputs: [
          {
            outputType: "visibleTrainingProposal",
            schemaVersion: "1",
            payload: {
              kind: "exercise_selection",
              exerciseItems: [{ exerciseId: "push-up", section: "training" }],
            },
            content: {
              sections: [
                {
                  section: "training",
                  items: [
                    expect.objectContaining({
                      exerciseId: "push-up",
                      exercise: expect.objectContaining({
                        nameZh: "俯卧撑",
                        allowedSections: ["training"],
                      }),
                    }),
                  ],
                },
              ],
            },
          },
        ],
      },
    });
    expect(execution.modelMessage).toContain("\"status\":\"accepted\"");
  });

  it("returns validator rejection without creating a visible output projection", async () => {
    const tool = createSubmitVisibleTrainingProposalLangChainTool({
      loadExerciseRecordsByIds: createExerciseFactLoader(),
    });

    const execution = await executeLangChainToolWrapper(tool, {
      outputType: "visibleTrainingProposal",
      schemaVersion: "1",
      payload: {
        kind: "exercise_selection",
        exerciseItems: [
          { exerciseId: "missing-exercise", section: "training", order: 1 },
        ],
      },
    }, baseContext);

    expect(execution.record).toMatchObject({
      toolName: "submitVisibleTrainingProposal",
      status: "succeeded",
      userProjection: {
        rejectedVisibleOutput: {
          code: "structured_output_validation_failed",
          message: "visibleTrainingProposal 引用了数据库不存在的动作。",
        },
      },
    });
    expect(JSON.stringify(execution.record.userProjection)).not.toContain("validatedVisibleOutputs");
    expect(execution.modelMessage).toContain("\"status\":\"rejected\"");
    expect(execution.modelMessage).toContain("不要把该结构当作已生成卡片");
  });

  it("rejects malformed tool input before running the business validator", async () => {
    const tool = createSubmitVisibleTrainingProposalLangChainTool({
      loadExerciseRecordsByIds: createExerciseFactLoader(),
    });

    const execution = await executeLangChainToolWrapper(tool, {
      outputType: "visibleTrainingProposal",
      schemaVersion: "1",
    }, baseContext);

    expect(execution.record).toMatchObject({
      toolName: "submitVisibleTrainingProposal",
      status: "failed",
      failureCode: "tool_schema_invalid",
      schemaIssues: [
        expect.objectContaining({
          path: "payload",
          code: expect.any(String),
          message: expect.any(String),
        }),
      ],
      enteredModelContext: true,
    });
  });
});

function createExerciseFactLoader(): VisibleTrainingProposalExerciseFactLoader {
  return async (ids) => ids.flatMap((id) => {
    if (id !== "push-up") {
      return [];
    }

    return [{
      id,
      nameZh: "俯卧撑",
      nameEn: "Push-Up",
      equipmentZh: "自重",
      primaryMusclesZh: ["胸大肌"],
      allowedSections: ["training"],
      imageUrls: ["https://example.test/push-up.jpg"],
      isPublished: true,
    }];
  });
}
