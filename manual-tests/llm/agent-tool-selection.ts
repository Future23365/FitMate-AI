import { readFile } from "node:fs/promises";

import {
  getKnownAgentToolCallGroups,
  getKnownAgentToolCallStates,
  getKnownAgentToolCallStatuses,
  getKnownAgentToolCallTools,
  type AgentToolCallCase,
  type AgentToolCallGroup,
  type AgentToolCallStatus,
} from "./agent-tool-fixtures";
import type { BlackboxStateFixtureName } from "./blackbox-runner";

export type AgentToolCallSelectionFilters = {
  ids?: string[];
  groups?: string[];
  tools?: string[];
  statuses?: string[];
  states?: string[];
  failedFromReportPath?: string;
};

export type AgentToolCallSelectionResult = {
  selectedCases: AgentToolCallCase[];
  excludedCases: AgentToolCallCase[];
  errors: string[];
  conditions: {
    ids: string[];
    groups: string[];
    tools: string[];
    statuses: string[];
    states: string[];
    failedFromReportPath?: string;
    failedCaseIds: string[];
  };
  emptyReason?: "no_failed_cases";
};

// 单次 tool 测试在真实模型调用前完成筛选和参数校验，避免错误参数产生无意义成本。
export async function selectAgentToolCallCases(
  cases: AgentToolCallCase[],
  filters: AgentToolCallSelectionFilters,
): Promise<AgentToolCallSelectionResult> {
  const ids = normalizeList(filters.ids);
  const groups = normalizeList(filters.groups);
  const tools = normalizeList(filters.tools);
  const statuses = normalizeList(filters.statuses);
  const states = normalizeList(filters.states);
  const errors: string[] = [];
  const knownIds = new Set(cases.map((testCase) => testCase.id));
  const knownGroups = new Set(getKnownAgentToolCallGroups());
  const knownTools = new Set(getKnownAgentToolCallTools());
  const knownStatuses = new Set(getKnownAgentToolCallStatuses());
  const knownStates = new Set(getKnownAgentToolCallStates());
  let failedCaseIds: string[] = [];
  let emptyReason: AgentToolCallSelectionResult["emptyReason"];

  const unknownIds = ids.filter((id) => !knownIds.has(id));
  const unknownGroups = groups.filter((group) => !knownGroups.has(group as AgentToolCallGroup));
  const unknownTools = tools.filter((tool) => !knownTools.has(tool));
  const unknownStatuses = statuses.filter((status) => !knownStatuses.has(status as AgentToolCallStatus));
  const unknownStates = states.filter((state) => !knownStates.has(state as BlackboxStateFixtureName));

  if (unknownIds.length > 0) {
    errors.push(`未知 agent tool case id：${unknownIds.join(", ")}。可用 id：${cases.map((testCase) => testCase.id).join(", ")}`);
  }
  if (unknownGroups.length > 0) {
    errors.push(`未知 agent tool group：${unknownGroups.join(", ")}。可用 group：${getKnownAgentToolCallGroups().join(", ")}`);
  }
  if (unknownTools.length > 0) {
    errors.push(`未知 agent tool 名称：${unknownTools.join(", ")}。可用 tool：${getKnownAgentToolCallTools().join(", ")}`);
  }
  if (unknownStatuses.length > 0) {
    errors.push(`未知 Agent status：${unknownStatuses.join(", ")}。可用 status：${getKnownAgentToolCallStatuses().join(", ")}`);
  }
  if (unknownStates.length > 0) {
    errors.push(`未知 state fixture：${unknownStates.join(", ")}。可用 state：${getKnownAgentToolCallStates().join(", ")}`);
  }

  if (filters.failedFromReportPath) {
    const parsed = await readFailedAgentToolCaseIdsFromReport(filters.failedFromReportPath);

    if (parsed.error) {
      errors.push(parsed.error);
    } else {
      failedCaseIds = parsed.caseIds;
      if (failedCaseIds.length === 0) {
        emptyReason = "no_failed_cases";
      }
    }
  }

  const selectedCases = cases.filter((testCase) => {
    if (ids.length > 0 && !ids.includes(testCase.id)) {
      return false;
    }
    if (groups.length > 0 && !groups.includes(testCase.group)) {
      return false;
    }
    if (tools.length > 0 && !tools.some((tool) => testCase.expectation.requiredAgentTools.includes(tool))) {
      return false;
    }
    if (statuses.length > 0 && !statuses.some((status) => testCase.expectation.expectedAgentStatuses.includes(status as AgentToolCallStatus))) {
      return false;
    }
    if (states.length > 0 && !states.includes(testCase.stateFixture)) {
      return false;
    }
    if (filters.failedFromReportPath && !failedCaseIds.includes(testCase.id)) {
      return false;
    }
    return true;
  });

  if (errors.length === 0 && selectedCases.length === 0 && emptyReason !== "no_failed_cases") {
    errors.push([
      "筛选结果为空，已阻止真实模型调用。",
      `筛选条件：${formatAgentToolSelectionConditions({ ids, groups, tools, statuses, states, failedFromReportPath: filters.failedFromReportPath, failedCaseIds })}`,
      `可用 id：${cases.map((testCase) => testCase.id).join(", ")}`,
      `可用 group：${getKnownAgentToolCallGroups().join(", ")}`,
      `可用 tool：${getKnownAgentToolCallTools().join(", ")}`,
      `可用 status：${getKnownAgentToolCallStatuses().join(", ")}`,
      `可用 state：${getKnownAgentToolCallStates().join(", ")}`,
    ].join("\n"));
  }

  return {
    selectedCases,
    excludedCases: cases.filter((testCase) => !selectedCases.includes(testCase)),
    errors,
    conditions: {
      ids,
      groups,
      tools,
      statuses,
      states,
      failedFromReportPath: filters.failedFromReportPath,
      failedCaseIds,
    },
    emptyReason,
  };
}

export async function readFailedAgentToolCaseIdsFromReport(
  filePath: string,
): Promise<{ caseIds: string[]; error?: string }> {
  try {
    const content = await readFile(filePath, "utf8");
    return { caseIds: parseFailedAgentToolCaseIdsFromReport(content) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { caseIds: [], error: `无法读取 failed-from-report：${filePath}；${message}` };
  }
}

export function parseFailedAgentToolCaseIdsFromReport(content: string): string[] {
  const failedCaseIds = new Set<string>();
  const sections = content.split(/\n(?=###\s+)/g);

  for (const section of sections) {
    const titleMatch = section.match(/^###\s+(AT\d{2})\s+/);
    if (!titleMatch) {
      continue;
    }
    if (section.includes("- 状态：失败")) {
      failedCaseIds.add(titleMatch[1]);
    }
  }

  return [...failedCaseIds];
}

export function formatAgentToolSelectionConditions(
  conditions: AgentToolCallSelectionResult["conditions"] | AgentToolCallSelectionFilters,
) {
  const parts = [
    `ids=${"ids" in conditions && conditions.ids?.length ? conditions.ids.join(",") : "all"}`,
    `groups=${"groups" in conditions && conditions.groups?.length ? conditions.groups.join(",") : "all"}`,
    `tools=${"tools" in conditions && conditions.tools?.length ? conditions.tools.join(",") : "all"}`,
    `statuses=${"statuses" in conditions && conditions.statuses?.length ? conditions.statuses.join(",") : "all"}`,
    `states=${"states" in conditions && conditions.states?.length ? conditions.states.join(",") : "all"}`,
  ];
  const failedFromReportPath = "failedFromReportPath" in conditions ? conditions.failedFromReportPath : undefined;

  if (failedFromReportPath) {
    parts.push(`failedFromReport=${failedFromReportPath}`);
  }

  return parts.join("; ");
}

function normalizeList(value: string[] | undefined) {
  return (value ?? [])
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}
