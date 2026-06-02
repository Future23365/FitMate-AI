import { readFile } from "node:fs/promises";

import {
  getKnownBlackboxFlowGroups,
  getKnownBlackboxFlowSuites,
  type BlackboxFlowCase,
  type BlackboxFlowGroup,
  type BlackboxFlowRunSuite,
} from "./flow-fixtures";

export type FlowSelectionFilters = {
  ids?: string[];
  groups?: string[];
  suites?: string[];
  failedFromReportPath?: string;
};

export type FlowSelectionResult = {
  selectedFlowCases: BlackboxFlowCase[];
  excludedFlowCases: BlackboxFlowCase[];
  errors: string[];
  conditions: {
    ids: string[];
    groups: string[];
    suites: string[];
    failedFromReportPath?: string;
    failedFlowIds: string[];
  };
  emptyReason?: "no_failed_flows";
};

// 子集选择是 LLM runner 的前置门禁：筛选失败或空集合时必须在真实模型调用前停住。
export async function selectBlackboxFlowCases(
  flowCases: BlackboxFlowCase[],
  filters: FlowSelectionFilters,
): Promise<FlowSelectionResult> {
  const ids = normalizeList(filters.ids);
  const groups = normalizeList(filters.groups);
  const suites = normalizeList(filters.suites).map(normalizeSuiteName);
  const errors: string[] = [];
  const knownIds = new Set(flowCases.map((flowCase) => flowCase.id));
  const knownGroups = new Set(getKnownBlackboxFlowGroups());
  const knownSuites = new Set(getKnownBlackboxFlowSuites());
  const unknownIds = ids.filter((id) => !knownIds.has(id));
  const unknownGroups = groups.filter((group) => !knownGroups.has(group as BlackboxFlowGroup));
  const unknownSuites = suites.filter((suite) => !knownSuites.has(suite as BlackboxFlowRunSuite));
  let failedFlowIds: string[] = [];
  let emptyReason: FlowSelectionResult["emptyReason"];

  if (unknownIds.length > 0) {
    errors.push(`未知 flow id：${unknownIds.join(", ")}。可用 flow id：${flowCases.map((flowCase) => flowCase.id).join(", ")}`);
  }

  if (unknownGroups.length > 0) {
    errors.push(`未知 group：${unknownGroups.join(", ")}。可用 group：${getKnownBlackboxFlowGroups().join(", ")}`);
  }

  if (unknownSuites.length > 0) {
    errors.push(`未知 suite：${unknownSuites.join(", ")}。可用 suite：${getKnownBlackboxFlowSuites().join(", ")}`);
  }

  if (filters.failedFromReportPath) {
    const parsed = await readFailedFlowIdsFromReport(filters.failedFromReportPath);

    if (parsed.error) {
      errors.push(parsed.error);
    } else {
      failedFlowIds = parsed.flowIds;
      if (failedFlowIds.length === 0) {
        emptyReason = "no_failed_flows";
      }
    }
  }

  const selectedFlowCases = flowCases.filter((flowCase) => {
    if (ids.length > 0 && !ids.includes(flowCase.id)) {
      return false;
    }
    if (groups.length > 0 && !groups.some((group) => flowCase.groups.includes(group as BlackboxFlowGroup))) {
      return false;
    }
    if (suites.length > 0 && !suites.includes(flowCase.suite)) {
      return false;
    }
    if (filters.failedFromReportPath && !failedFlowIds.includes(flowCase.id)) {
      return false;
    }
    return true;
  });

  if (errors.length === 0 && selectedFlowCases.length === 0 && emptyReason !== "no_failed_flows") {
    errors.push([
      "筛选结果为空，已阻止真实模型调用。",
      `筛选条件：${formatSelectionConditions({ ids, groups, suites, failedFromReportPath: filters.failedFromReportPath, failedFlowIds })}`,
      `可用 flow id：${flowCases.map((flowCase) => flowCase.id).join(", ")}`,
      `可用 suite：${getKnownBlackboxFlowSuites().join(", ")}`,
      `可用 group：${getKnownBlackboxFlowGroups().join(", ")}`,
    ].join("\n"));
  }

  return {
    selectedFlowCases,
    excludedFlowCases: flowCases.filter((flowCase) => !selectedFlowCases.includes(flowCase)),
    errors,
    conditions: {
      ids,
      groups,
      suites,
      failedFromReportPath: filters.failedFromReportPath,
      failedFlowIds,
    },
    emptyReason,
  };
}

export async function readFailedFlowIdsFromReport(filePath: string): Promise<{ flowIds: string[]; error?: string }> {
  try {
    const content = await readFile(filePath, "utf8");
    return { flowIds: parseFailedFlowIdsFromReport(content) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { flowIds: [], error: `无法读取 failed-from-report：${filePath}；${message}` };
  }
}

export function parseFailedFlowIdsFromReport(content: string): string[] {
  const failedFlowIds = new Set<string>();
  const sections = content.split(/\n(?=###\s+)/g);

  for (const section of sections) {
    const titleMatch = section.match(/^###\s+([A-Z]\d{2})\s+/);
    if (!titleMatch) {
      continue;
    }
    if (section.includes("- 状态：失败")) {
      failedFlowIds.add(titleMatch[1]);
    }
  }

  return [...failedFlowIds];
}

export function formatSelectionConditions(conditions: FlowSelectionResult["conditions"] | FlowSelectionFilters) {
  const parts = [
    `ids=${"ids" in conditions && conditions.ids?.length ? conditions.ids.join(",") : "all"}`,
    `groups=${"groups" in conditions && conditions.groups?.length ? conditions.groups.join(",") : "all"}`,
    `suites=${"suites" in conditions && conditions.suites?.length ? conditions.suites.join(",") : "all"}`,
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

function normalizeSuiteName(value: string) {
  return value.replace(/-/g, "_");
}
