import { describe, expect, it } from "vitest";

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
      "consumable resource",
      "toolResults[].producedResources",
      "resource summary",
      "toolResults[].fulfillment.satisfied",
      "missingSectionsForRoutineOrPlan",
      "payload",
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
      "visible_training_proposal_fact",
      "failed tool result",
      "diagnostic resource",
      "satisfied=false",
      "缺少训练约束",
      "需要动作事实",
      "把这些动作编成一套 30 分钟训练",
      "给我一批更简单的徒手动作",
      "只保留适合在家练的动作",
      "事实不足的 routine",
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
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("keeps expectedAction examples as full AgentAction objects and moves decisions to expectedDecision", () => {
    const examples = visibleTrainingProposalOutputContract.examples;
    const expectedDecisionExamples = examples.filter((example) => example.expectedDecision);

    expect(expectedDecisionExamples.length).toBeGreaterThan(0);
    expect(expectedDecisionExamples.map((example) => example.description)).toEqual(expect.arrayContaining([
      "需要动作事实：用户要结构化训练结果但当前 run 没有可消费动作事实时先 tool_call。",
      "事实不足的 routine：只有 training 动作事实但用户要一次完整训练时继续补齐或澄清。",
      "基于已有结构派生计划：用户要求按当前内容做一周计划时使用 derive。",
      "替换或修改：用户要求换一批、避免重复或组数少一点时使用 replace / modify。",
    ]));

    for (const example of examples) {
      if (example.expectedAction !== undefined) {
        expect(typeof example.expectedAction).toBe("object");
        expect(Array.isArray(example.expectedAction)).toBe(false);
        expect(example.expectedAction).toEqual(expect.objectContaining({
          type: expect.stringMatching(/^(tool_call|final_answer|ask_user)$/),
        }));
      }

      if (example.expectedDecision !== undefined) {
        expect(example.expectedDecision).toMatch(/[\u4e00-\u9fff]/);
      }
    }
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
