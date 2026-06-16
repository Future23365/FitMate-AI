import { describe, expect, it } from "vitest";

import {
  agentRuntimeConfig,
  createLangChainJsonProjectionBudget,
} from "@/lib/server/config";
import {
  stringifyForModelSummary,
  toLangChainJsonValue,
} from "@/lib/server/langchain-agent/utils";

describe("LangChain JSON projection budgets", () => {
  it("keeps arrays and object entries beyond the legacy fixed projection limits", () => {
    const arrayValue = Array.from({ length: 40 }, (_, index) => ({ index }));
    const objectValue = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [`field${index}`, index]),
    );
    const budget = createLangChainJsonProjectionBudget(
      agentRuntimeConfig.langChain.toolWrapper.modelVisibleSummaryMaxLength,
    );

    const projectedArray = toLangChainJsonValue(arrayValue, budget);
    const projectedObject = toLangChainJsonValue(objectValue, budget);

    expect(projectedArray).toHaveLength(40);
    expect(Object.keys(projectedObject as Record<string, unknown>)).toHaveLength(40);
  });

  it("does not wrap configured-size model-visible summaries as truncated previews", () => {
    const summary = {
      status: "succeeded",
      candidateGroups: [
        {
          suitability: "training",
          exercises: Array.from({ length: 40 }, (_, index) => ({
            exerciseId: `exercise-${index}`,
            nameZh: `动作 ${index}`,
          })),
        },
      ],
    };
    const serialized = stringifyForModelSummary(
      summary,
      agentRuntimeConfig.langChain.toolWrapper.modelVisibleSummaryMaxLength,
      createLangChainJsonProjectionBudget(agentRuntimeConfig.langChain.toolWrapper.modelVisibleSummaryMaxLength),
    );
    const parsed = JSON.parse(serialized);

    expect(parsed.status).toBe("succeeded");
    expect(parsed.status).not.toBe("truncated");
    expect(parsed.candidateGroups[0].exercises).toHaveLength(40);
  });
});
