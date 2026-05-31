import { describe, expect, it } from "vitest";

import { createFlowFailureSkipReason } from "@/manual-tests/llm/flow-runner-policy";

describe("manual LLM blackbox flow runner policy", () => {
  it("labels first-turn and mid-flow failures before downstream skips", () => {
    expect(createFlowFailureSkipReason(0, "first turn failed")).toContain("首轮基础能力失败");
    expect(createFlowFailureSkipReason(1, "second turn failed")).toContain("第 2 轮失败");
  });
});
