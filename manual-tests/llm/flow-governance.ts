import type { BlackboxFlowCase } from "./flow-fixtures";
import { detailedBlackboxFlowOverlapMatrix } from "./flow-fixtures";

export type StrictDuplicateFlowGroup = {
  flowIds: string[];
  inputSequence: string[];
  allowed: boolean;
};

export type FlowGovernanceSummary = {
  strictDuplicateGroups: StrictDuplicateFlowGroup[];
  repeatedStartGroups: Array<{ userInput: string; flowIds: string[] }>;
  highOverlapGroups: typeof detailedBlackboxFlowOverlapMatrix;
  missingMetadataFlowIds: string[];
};

// fixture 治理检查只看用户输入和运行元数据，用来在真实模型调用前拦截重复或缺标注用例。
export function inspectBlackboxFlowGovernance(flowCases: BlackboxFlowCase[]): FlowGovernanceSummary {
  return {
    strictDuplicateGroups: findStrictDuplicateFlowGroups(flowCases),
    repeatedStartGroups: findRepeatedStartGroups(flowCases),
    highOverlapGroups: detailedBlackboxFlowOverlapMatrix,
    missingMetadataFlowIds: flowCases
      .filter((flowCase) => !flowCase.suite || flowCase.groups.length === 0 || !flowCase.riskLevel)
      .map((flowCase) => flowCase.id),
  };
}

export function findStrictDuplicateFlowGroups(flowCases: BlackboxFlowCase[]): StrictDuplicateFlowGroup[] {
  const groups = new Map<string, BlackboxFlowCase[]>();

  for (const flowCase of flowCases) {
    const key = JSON.stringify(flowCase.turns.map((turn) => normalizeUserInput(turn.userInput)));
    groups.set(key, [...(groups.get(key) ?? []), flowCase]);
  }

  return [...groups.entries()]
    .filter(([, cases]) => cases.length > 1)
    .map(([key, cases]) => ({
      flowIds: cases.map((flowCase) => flowCase.id),
      inputSequence: JSON.parse(key) as string[],
      allowed: cases.every((flowCase) => flowCase.allowDuplicateSequence),
    }));
}

function findRepeatedStartGroups(flowCases: BlackboxFlowCase[]) {
  const groups = new Map<string, string[]>();

  for (const flowCase of flowCases) {
    const key = normalizeUserInput(flowCase.turns[0].userInput);
    groups.set(key, [...(groups.get(key) ?? []), flowCase.id]);
  }

  return [...groups.entries()]
    .filter(([, flowIds]) => flowIds.length > 1)
    .map(([userInput, flowIds]) => ({ userInput, flowIds }));
}

function normalizeUserInput(input: string) {
  return input.trim().replace(/\s+/g, " ");
}
