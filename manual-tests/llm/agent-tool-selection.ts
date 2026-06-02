import { readFile } from "node:fs/promises";

import {
  getKnownAgentSingleToolGroups,
  getKnownAgentSingleToolNames,
  type AgentSingleToolCase,
  type AgentSingleToolGroup,
} from "./agent-tool-fixtures";

export type AgentSingleToolSelectionFilters = {
  ids?: string[];
  groups?: string[];
  tools?: string[];
  failedFromReportPath?: string;
};

export type AgentSingleToolSelectionResult = {
  selectedCases: AgentSingleToolCase[];
  excludedCases: AgentSingleToolCase[];
  errors: string[];
  conditions: {
    ids: string[];
    groups: string[];
    tools: string[];
    failedFromReportPath?: string;
    failedCaseIds: string[];
  };
  emptyReason?: "no_failed_cases";
};

// 单工具测试在真实模型调用前完成筛选校验，避免错误参数产生无意义成本。
export async function selectAgentSingleToolCases(
  cases: AgentSingleToolCase[],
  filters: AgentSingleToolSelectionFilters,
): Promise<AgentSingleToolSelectionResult> {
  const ids = normalizeList(filters.ids);
  const groups = normalizeList(filters.groups);
  const tools = normalizeList(filters.tools);
  const errors: string[] = [];
  const knownIds = new Set(cases.map((testCase) => testCase.id));
  const knownGroups = new Set(getKnownAgentSingleToolGroups());
  const knownTools = new Set(getKnownAgentSingleToolNames());
  let failedCaseIds: string[] = [];
  let emptyReason: AgentSingleToolSelectionResult["emptyReason"];

  const unknownIds = ids.filter((id) => !knownIds.has(id));
  const unknownGroups = groups.filter((group) => !knownGroups.has(group as AgentSingleToolGroup));
  const unknownTools = tools.filter((tool) => !knownTools.has(tool));

  if (unknownIds.length > 0) {
    errors.push(`未知 single tool case id：${unknownIds.join(", ")}。可用 id：${cases.map((testCase) => testCase.id).join(", ")}`);
  }
  if (unknownGroups.length > 0) {
    errors.push(`未知 single tool group：${unknownGroups.join(", ")}。可用 group：${getKnownAgentSingleToolGroups().join(", ")}`);
  }
  if (unknownTools.length > 0) {
    errors.push(`未知 Agent tool 名称：${unknownTools.join(", ")}。可用 tool：${getKnownAgentSingleToolNames().join(", ")}`);
  }

  if (filters.failedFromReportPath) {
    const parsed = await readFailedAgentSingleToolCaseIdsFromReport(filters.failedFromReportPath);

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
    if (tools.length > 0 && !tools.includes(testCase.toolName)) {
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
      `筛选条件：${formatAgentSingleToolSelectionConditions({ ids, groups, tools, failedFromReportPath: filters.failedFromReportPath, failedCaseIds })}`,
      `可用 id：${cases.map((testCase) => testCase.id).join(", ")}`,
      `可用 group：${getKnownAgentSingleToolGroups().join(", ")}`,
      `可用 tool：${getKnownAgentSingleToolNames().join(", ")}`,
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
      failedFromReportPath: filters.failedFromReportPath,
      failedCaseIds,
    },
    emptyReason,
  };
}

export async function readFailedAgentSingleToolCaseIdsFromReport(
  filePath: string,
): Promise<{ caseIds: string[]; error?: string }> {
  try {
    const content = await readFile(filePath, "utf8");
    return { caseIds: parseFailedAgentSingleToolCaseIdsFromReport(content) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { caseIds: [], error: `无法读取 failed-from-report：${filePath}；${message}` };
  }
}

export function parseFailedAgentSingleToolCaseIdsFromReport(content: string): string[] {
  const failedCaseIds = new Set<string>();
  const sections = content.split(/\n(?=###\s+)/g);

  for (const section of sections) {
    const titleMatch = section.match(/^###\s+(TOOL\d{2})\s+/);
    if (!titleMatch) {
      continue;
    }
    if (section.includes("- 状态：失败")) {
      failedCaseIds.add(titleMatch[1]);
    }
  }

  return [...failedCaseIds];
}

export function formatAgentSingleToolSelectionConditions(
  conditions: AgentSingleToolSelectionResult["conditions"] | AgentSingleToolSelectionFilters,
) {
  const parts = [
    `ids=${"ids" in conditions && conditions.ids?.length ? conditions.ids.join(",") : "all"}`,
    `groups=${"groups" in conditions && conditions.groups?.length ? conditions.groups.join(",") : "all"}`,
    `tools=${"tools" in conditions && conditions.tools?.length ? conditions.tools.join(",") : "all"}`,
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
