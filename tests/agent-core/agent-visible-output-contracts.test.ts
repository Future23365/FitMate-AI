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
    expect(contract.whenToUse.join(" ")).toMatch(/[\u4e00-\u9fff]/);
    expect(contract.whenNotToUse.join(" ")).toMatch(/[\u4e00-\u9fff]/);
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
      "content",
      "visible_training_proposal_fact",
      "failed tool result",
      "diagnostic resource",
      "satisfied=false",
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
