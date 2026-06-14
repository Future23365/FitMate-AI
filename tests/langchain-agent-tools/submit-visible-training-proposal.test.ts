import { describe, expect, it } from "vitest";

import {
  createSubmitVisibleTrainingProposalLangChainTool,
  executeLangChainToolWrapper,
} from "@/lib/server/langchain-agent";
import type { VisibleTrainingProposalExerciseFactLoader } from "@/lib/server/visible-training-proposals/visible-training-proposal-exercise-facts";

const baseContext = {
  actor: { userId: "user-1", conversationId: "conversation-1" },
};
type ExerciseFactRecord = Awaited<ReturnType<VisibleTrainingProposalExerciseFactLoader>>[number];

describe("submitVisibleTrainingProposal LangChain tool", () => {
  it("exposes finalization and validator boundaries without support-section workflow instructions", () => {
    const tool = createSubmitVisibleTrainingProposalLangChainTool();

    expect(tool.description).toContain("visibleTrainingProposal");
    expect(tool.description).toContain("服务端 validator");
    expect(tool.description).toContain("最终回答会向用户呈现一个或多个具体训练动作");
    expect(tool.description).toContain("受控动作事实");
    expect(tool.description).toContain("Content Boundary");
    expect(tool.description).toContain("content 不能替代 payload 中的动作、prescription 或 schedule 事实");
    expect(tool.description).toContain("Kind Selection");
    expect(tool.description).toContain("payload.kind=exercise_selection");
    expect(tool.description).toContain("纯主训练动作推荐集合");
    expect(tool.description).toContain("section 必须全部是 training");
    expect(tool.description).toContain("不得包含 prescription 或 schedule");
    expect(tool.description).toContain("payload.kind=routine");
    expect(tool.description).toContain("单次可执行训练");
    expect(tool.description).toContain("可以包含 warmup、training、stretch");
    expect(tool.description).toContain("至少包含 training");
    expect(tool.description).toContain("每个 exerciseItems[] 动作项都必须包含 prescription");
    expect(tool.description).toContain("不得包含 schedule");
    expect(tool.description).toContain("payload.kind=plan");
    expect(tool.description).toContain("多天或周期训练计划");
    expect(tool.description).toContain("必须包含 schedule");
    expect(tool.description).toContain("schedule 只表达同一套编排在周期内的训练日和休息日");
    expect(tool.description).toContain("不要把这些动作塞进 exercise_selection");
    expect(tool.description).toContain("不替模型生成 prescription");
    expect(tool.description).toContain("可以从当前模型可见候选事实中选择子集构造");
    expect(tool.description).toContain("不要求使用候选池中的全部动作");
    expect(tool.description).toContain("不要求先排除未使用动作");
    expect(tool.description).toContain("sectionSummary");
    expect(tool.description).toContain("availableSections");
    expect(tool.description).toContain("missingSections");
    expect(tool.description).toContain("不把具体数据库动作作为回答条目展示");
    expect(tool.description).toContain("单次训练 routine");
    expect(tool.description).toContain("多天训练 plan");
    expect(tool.description).toContain("Do Not Use When");
    expect(tool.description).toContain("payload.kind");
    expect(tool.description).toContain("exercise_selection");
    expect(tool.description).toContain("routine");
    expect(tool.description).toContain("plan");
    expect(tool.description).toContain("accepted 表示结构已通过服务端 validator");
    expect(tool.description).toContain("rejected 只表示结构或确定性事实校验失败");
    expect(tool.description).not.toContain("缺 warmup 或 stretch");
    expect(tool.description).not.toContain("先查询");
    expect(tool.description).not.toContain("support section");
    expect(tool.description).not.toContain("必须调用");
    expect(tool.description).not.toContain("当前 run");
    expect(tool.description).not.toContain("factRef");
    expect(tool.description).not.toContain("messageId");
    expect(tool.description).not.toContain("resourceId");
    expect(tool.description).not.toContain("toolResultId");
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
    const modelMessage = JSON.parse(execution.modelMessage);

    expect(modelMessage).toMatchObject({
      status: "accepted",
      payloadKind: "exercise_selection",
      exerciseItemCount: 1,
      sectionSummary: { warmup: 0, training: 1, stretch: 0 },
      availableSections: ["training"],
      missingSections: ["warmup", "stretch"],
    });
    expect(modelMessage).not.toHaveProperty("nextActionHints");
    expect(modelMessage).not.toHaveProperty("recommendedNextStep");
    expect(modelMessage).not.toHaveProperty("satisfied");
  });

  it("summarizes accepted routine coverage across warmup training and stretch", async () => {
    const tool = createSubmitVisibleTrainingProposalLangChainTool({
      loadExerciseRecordsByIds: createExerciseFactLoader(),
    });

    const execution = await executeLangChainToolWrapper(tool, {
      outputType: "visibleTrainingProposal",
      schemaVersion: "1",
      payload: {
        kind: "routine",
        exerciseItems: [
          {
            exerciseId: "jumping-jack",
            section: "warmup",
            order: 1,
            prescription: createPrescription({ mode: "reps", target: 20 }),
          },
          {
            exerciseId: "push-up",
            section: "training",
            order: 1,
            prescription: createPrescription({ mode: "reps", target: 10 }),
          },
          {
            exerciseId: "standing-quad-stretch",
            section: "stretch",
            order: 1,
            prescription: createPrescription({ mode: "duration", target: 30 }),
          },
        ],
      },
    }, baseContext);
    const modelMessage = JSON.parse(execution.modelMessage);

    expect(modelMessage).toMatchObject({
      status: "accepted",
      payloadKind: "routine",
      exerciseItemCount: 3,
      sectionSummary: { warmup: 1, training: 1, stretch: 1 },
      availableSections: ["warmup", "training", "stretch"],
      missingSections: [],
    });
    expect(execution.record.traceSummary).toMatchObject({
      status: "accepted",
      payloadKind: "routine",
      exerciseItemCount: 3,
      sectionSummary: { warmup: 1, training: 1, stretch: 1 },
      availableSections: ["warmup", "training", "stretch"],
      missingSections: [],
    });
    expect(JSON.stringify(modelMessage)).not.toContain("nextActionHints");
    expect(JSON.stringify(modelMessage)).not.toContain("recommendedNextStep");
    expect(JSON.stringify(modelMessage)).not.toContain("satisfied");
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
    expect(execution.modelMessage).toContain("validationBoundary");
    expect(execution.modelMessage).not.toContain("重新调用工具");
    expect(execution.modelMessage).not.toContain("必须调用");
    expect(execution.modelMessage).not.toContain("nextActionHints");
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
  const records: Record<string, ExerciseFactRecord> = {
    "jumping-jack": {
      id: "jumping-jack",
      nameZh: "开合跳",
      nameEn: "Jumping Jack",
      equipmentZh: "自重",
      primaryMusclesZh: ["全身"],
      allowedSections: ["warmup"],
      imageUrls: ["https://example.test/jumping-jack.jpg"],
      isPublished: true,
    },
    "push-up": {
      id: "push-up",
      nameZh: "俯卧撑",
      nameEn: "Push-Up",
      equipmentZh: "自重",
      primaryMusclesZh: ["胸大肌"],
      allowedSections: ["training"],
      imageUrls: ["https://example.test/push-up.jpg"],
      isPublished: true,
    },
    "standing-quad-stretch": {
      id: "standing-quad-stretch",
      nameZh: "站姿股四头肌拉伸",
      nameEn: "Standing Quad Stretch",
      equipmentZh: "自重",
      primaryMusclesZh: ["股四头肌"],
      allowedSections: ["stretch"],
      imageUrls: ["https://example.test/standing-quad-stretch.jpg"],
      isPublished: true,
    },
  };

  return async (ids) => ids.flatMap((id) => records[id] ? [records[id]] : []);
}

function createPrescription(input: { mode: "reps" | "duration"; target: number }) {
  return {
    mode: input.mode,
    sets: 1,
    target: input.target,
    setRestSeconds: 30,
    transitionRestSeconds: 30,
  };
}
