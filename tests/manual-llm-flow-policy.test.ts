import { describe, expect, it } from "vitest";

import { getBlackboxFlowCases } from "@/manual-tests/llm/flow-fixtures";
import { createFlowFailureSkipReason } from "@/manual-tests/llm/flow-runner-policy";

describe("manual LLM blackbox flow runner policy", () => {
  it("labels first-turn and mid-flow failures before downstream skips", () => {
    expect(createFlowFailureSkipReason(0, "first turn failed")).toContain("首轮基础能力失败");
    expect(createFlowFailureSkipReason(1, "second turn failed")).toContain("第 2 轮失败");
  });

  it("keeps the basic suite stable and adds a broader detail suite", () => {
    const basicCases = getBlackboxFlowCases("basic");
    const detailCases = getBlackboxFlowCases("detail");

    expect(basicCases).toHaveLength(9);
    expect(detailCases.length).toBeGreaterThan(basicCases.length);
    expect(detailCases.map((flowCase) => flowCase.id)).toEqual(
      expect.arrayContaining(["H01", "R03", "W08", "P06", "C07", "M02", "S02", "Q03"]),
    );
    expect(detailCases.every((flowCase) => flowCase.turns.length === 3)).toBe(true);
  });
});
