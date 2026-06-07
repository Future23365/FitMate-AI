import { describe, expect, it } from "vitest";

import { AgentActionSchema } from "@/lib/server/agent-core/contracts";
import {
  getAgentVisibleOutputContracts,
  summarizeAgentVisibleOutputContracts,
  visibleTrainingProposalOutputContract,
} from "@/lib/server/config";
import {
  visibleTrainingProposalOutputType,
  visibleTrainingProposalSchemaVersion,
} from "@/lib/server/visible-training-proposals/visible-training-proposal-contract";

describe("agent visible output contracts", () => {
  it("exposes visibleTrainingProposal as a Chinese model-visible output contract", () => {
    const contracts = getAgentVisibleOutputContracts();
    const contract = contracts.find((item) => item.outputType === visibleTrainingProposalOutputType);
    if (!contract) {
      throw new Error("visibleTrainingProposal output contract should be registered.");
    }
    const serialized = JSON.stringify(contract);

    expect(contracts).toHaveLength(1);
    expect(contract).toMatchObject({
      outputType: visibleTrainingProposalOutputType,
      schemaVersion: visibleTrainingProposalSchemaVersion,
    });
    expect(contract.schemaVersion).toBe("1");
    expect(serialized).not.toContain("\"schemaVersion\":1");
    expect(contract.description).toMatch(/[\u4e00-\u9fff]/);
    expect(contract.fieldDictionary.map((field) => field.field)).toEqual(expect.arrayContaining([
      "visibleTrainingProposal",
      "visible_training_proposal_fact",
      "business fact",
      "toolResults[].fulfillment.summary",
      "toolResults[].fulfillment.unmetRequirements",
      "currentRunSourceDiagnostic",
      "toolResults[].fulfillment.satisfied",
      "missingSections",
      "payload",
      "final_answer.content",
      "exerciseItems",
      "schedule.assignments",
    ]));
    expect(contract.whenToUse.join(" ")).toMatch(/[\u4e00-\u9fff]/);
    expect(contract.whenNotToUse.join(" ")).toMatch(/[\u4e00-\u9fff]/);
    expect(contract.kindSelectionRules.join(" ")).toMatch(/[\u4e00-\u9fff]/);
    expect(contract.groundingRequirements.join(" ")).toMatch(/[\u4e00-\u9fff]/);
    expect(contract.validatorBoundary.join(" ")).toMatch(/[\u4e00-\u9fff]/);
  });

  it("keeps visibleTrainingProposal schema summary aligned with validator boundaries", () => {
    const serialized = JSON.stringify(visibleTrainingProposalOutputContract);

    for (const required of [
      "payload.kind",
      "exercise_selection",
      "routine",
      "plan",
      "exerciseItems",
      "exerciseId",
      "section",
      "allowedSections",
      "warmup",
      "training",
      "stretch",
      "prescription",
      "mode",
      "reps",
      "duration",
      "setRestSeconds",
      "transitionRestSeconds",
      "schedule.assignments",
      "cycleDayIndex",
      "one_routine_template_with_schedule",
      "one routine template + schedule",
      "routines[]",
      "routineId",
      "content",
      "contentPayloadConsistency",
      "训练频次、周期、多天或一周安排",
      "visible_training_proposal_fact",
      "failed tool result",
      "diagnostic observation",
      "satisfied=false",
      "currentRunSourceDiagnostic",
      "数据库硬校验",
      "缺少训练约束",
      "需要动作事实",
      "把这些动作编成一套 30 分钟训练",
      "给我一批更简单的徒手动作",
      "只保留适合在家练的动作",
      "7 天周期",
      "每周 3 练",
      "support section 未齐的 routine",
      "基于已有结构派生计划",
      "替换或修改",
    ]) {
      expect(serialized).toContain(required);
    }

    for (const forbidden of [
      "database object",
      "secret-token",
      "authorization",
      "cookie",
      "stack trace",
      "provider raw",
      "schemaVersion = 1",
      "当前 run 可消费动作事实",
      "必须替换为当前 run 可见",
      "consumable resource",
      "producedResources",
      "consumedResources",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("describes content and payload kind consistency without adding semantic routing", () => {
    const contract = visibleTrainingProposalOutputContract;
    const fieldDictionary = contract.fieldDictionary.map((field) => field.field);
    const kindRules = contract.kindSelectionRules.join("\n");
    const validatorBoundary = contract.validatorBoundary.join("\n");
    const schemaSummary = contract.schemaSummary as {
      payload: {
        contentPayloadConsistency?: string;
      };
      kindContracts: Array<{
        kind: string;
        requirements: string[];
      }>;
    };
    const routineContract = schemaSummary.kindContracts.find((item) => item.kind === "routine");
    const planContract = schemaSummary.kindContracts.find((item) => item.kind === "plan");

    expect(fieldDictionary).toContain("final_answer.content");
    expect(kindRules).toContain("routine 只表达一次可执行训练编排");
    expect(kindRules).toContain("正文如果承诺训练频次、周期、多天或一周安排");
    expect(kindRules).toContain("kind = \"plan\"");
    expect(kindRules).toContain("schedule.assignments");
    expect(schemaSummary.payload.contentPayloadConsistency).toContain("visibleOutputs[].payload.kind = \"plan\"");
    expect(routineContract?.requirements).toEqual(expect.arrayContaining([
      "final_answer.content 只能描述一次可执行训练编排，不得声称已生成多天、周期或每周训练计划。",
    ]));
    expect(planContract?.requirements).toEqual(expect.arrayContaining([
      "schedule.assignments 必须覆盖 1..cycleLengthDays，type 只能是 training 或 rest。",
      "final_answer.content 中关于训练频次、周期、多天或一周安排的承诺，必须能由同一 payload 的 schedule.assignments 支撑。",
    ]));
    expect(validatorBoundary).toContain("服务端不根据用户原文关键词、正则、同义词、短句模板或 final_answer.content 语义替模型判断或改写 payload.kind");
    expect(validatorBoundary).toContain("缺少当前 run 来源只记录为 currentRunSourceDiagnostic");
  });

  it("uses a 7-day 3-training-day single-template plan example", () => {
    const planExample = visibleTrainingProposalOutputContract.examples.find((example) =>
      example.description.startsWith("多天计划：")
    );
    const visibleOutputs = planExample?.expectedAction && Array.isArray(planExample.expectedAction.visibleOutputs)
      ? planExample.expectedAction.visibleOutputs
      : [];
    const output = visibleOutputs[0] as {
      payload?: {
        kind?: string;
        exerciseItems?: unknown[];
        schedule?: {
          cycleLengthDays?: number;
          assignments?: Array<{ cycleDayIndex: number; type: string }>;
        };
      };
    } | undefined;
    const assignments = output?.payload?.schedule?.assignments ?? [];

    expect(planExample?.expectedAction?.content).toContain("每周 3 练");
    expect(output?.payload?.kind).toBe("plan");
    expect(output?.payload?.exerciseItems).toHaveLength(3);
    expect(output?.payload?.schedule?.cycleLengthDays).toBe(7);
    expect(assignments).toEqual([
      { cycleDayIndex: 1, type: "training" },
      { cycleDayIndex: 2, type: "rest" },
      { cycleDayIndex: 3, type: "training" },
      { cycleDayIndex: 4, type: "rest" },
      { cycleDayIndex: 5, type: "training" },
      { cycleDayIndex: 6, type: "rest" },
      { cycleDayIndex: 7, type: "rest" },
    ]);
    expect(assignments.filter((assignment) => assignment.type === "training")).toHaveLength(3);
    expect(planExample?.notes.join("\n")).toContain("不新增 routines[]、routineId 或 A/B 多模板结构");
  });

  it("keeps expectedAction examples as full AgentAction objects and moves decisions to expectedDecision", () => {
    const examples = visibleTrainingProposalOutputContract.examples;
    const expectedDecisionExamples = examples.filter((example) => example.expectedDecision);

    expect(expectedDecisionExamples.length).toBeGreaterThan(0);
    expect(expectedDecisionExamples.map((example) => example.description)).toEqual(expect.arrayContaining([
      "需要动作事实：用户要结构化训练结果但当前上下文没有模型可见动作事实时先 tool_call。",
      "support section 未齐的 routine：只有 training 动作事实时优先补齐。",
      "基于已有结构派生计划：用户要求按当前内容做一周计划时使用 derive。",
      "替换或修改：用户要求替换已有动作、避免重复或调整处方时使用 replace / modify。",
    ]));

    for (const example of examples) {
      if (example.expectedAction !== undefined) {
        expect(typeof example.expectedAction).toBe("object");
        expect(Array.isArray(example.expectedAction)).toBe(false);
        expect(example.expectedAction).toEqual(expect.objectContaining({
          type: expect.stringMatching(/^(tool_call|final_answer|ask_user)$/),
        }));
        expect(AgentActionSchema.safeParse(example.expectedAction).success).toBe(true);
      }

      if (example.expectedDecision !== undefined) {
        expect(example.expectedDecision).toMatch(/[\u4e00-\u9fff]/);
      }
    }
  });

  it("keeps support sections as a completion preference without model-visible omission wording", () => {
    const serialized = JSON.stringify(visibleTrainingProposalOutputContract);
    const routineSupportExample = visibleTrainingProposalOutputContract.examples.find((example) =>
      example.description.startsWith("support section 未齐的 routine")
    );

    expect(serialized).toContain("应优先组织为 warmup、training、stretch");
    expect(serialized).toContain("生成 routine 或 plan 时应优先补齐 warmup 和 stretch");
    expect(serialized).toContain("已有可用 warmup 或 stretch 动作事实时，不要只输出主训练");
    expect(routineSupportExample?.expectedDecision).toContain("优先继续合法 tool_call 补齐 warmup/stretch");
    expect(routineSupportExample?.expectedDecision).toContain("不得伪造缺失 section");
    expect(routineSupportExample?.expectedDecision).not.toContain("ask_user 或失败收口");
    expect(serialized).not.toContain("可以不生成热身");
    expect(serialized).not.toContain("可以不生成拉伸");
    expect(serialized).not.toContain("可以省略");
    expect(serialized).not.toContain("可省略");
    expect(serialized).not.toContain("warmup/stretch optional");
  });

  it("returns cloned contracts and records a safe trace summary", () => {
    const first = getAgentVisibleOutputContracts();
    const second = getAgentVisibleOutputContracts();
    const mutableWhenToUse = first[0].whenToUse as string[];

    mutableWhenToUse[0] = "mutated";

    expect(second[0].whenToUse[0]).not.toBe("mutated");
    expect(summarizeAgentVisibleOutputContracts()).toEqual({
      count: 1,
      contracts: [
        {
          outputType: visibleTrainingProposalOutputType,
          schemaVersion: visibleTrainingProposalSchemaVersion,
        },
      ],
    });
  });
});
