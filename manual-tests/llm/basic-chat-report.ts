import type { BasicChatFlow } from "./basic-chat-fixtures";
import type { BasicChatJudgeResult, BasicChatTokenUsage } from "./basic-chat-judge";

export type BasicChatTurnRunStatus =
  | "passed"
  | "failed"
  | "judge_failed"
  | "error"
  | "skipped";

export type BasicChatTurnRunRecord = {
  flowId: string;
  goal: string;
  turnIndex: number;
  userInput: string;
  expectation: string;
  executed: boolean;
  status: BasicChatTurnRunStatus;
  finalAssistantTextSummary: string;
  visibleOutputKinds: string[];
  judge?: BasicChatJudgeResult;
  failureReason?: string;
  skipReason?: string;
  chatTokenUsage?: BasicChatTokenUsage;
  judgeTokenUsage?: BasicChatTokenUsage;
};

export type BasicChatSuiteSummary = {
  status: "passed" | "failed" | "configuration_failed" | "preflight_failed";
  model: string;
  judgeModel: string;
  sourcePath: string;
  reportPath: string;
  startedAt: Date;
  endedAt: Date;
  selectedFlowIds: string[];
  filterLabel: string;
  fullFlowCount: number;
  fullTurnCount: number;
  executedFlowCount: number;
  executedTurnCount: number;
  passedTurnCount: number;
  failedTurnCount: number;
  skippedTurnCount: number;
  estimatedTokenTotal: number;
  actualChatTokenUsage?: BasicChatTokenUsage;
  actualJudgeTokenUsage?: BasicChatTokenUsage;
  missingConfiguration: string[];
  preflightErrors: string[];
};

export type BasicChatReportInput = {
  summary: BasicChatSuiteSummary;
  flows: BasicChatFlow[];
  records: BasicChatTurnRunRecord[];
};

const maxReportTextLength = 500;

// renderBasicChatBlackboxReport 输出人工复核报告，只保留最终用户可见结果和安全摘要。
export function renderBasicChatBlackboxReport(input: BasicChatReportInput) {
  const lines = [
    "# 基础 LLM 首页聊天黑盒测试报告",
    "",
    `生成时间：${formatShanghaiDateTime(input.summary.endedAt)}`,
    `状态：${input.summary.status}`,
    `用例来源：${input.summary.sourcePath}`,
    `报告路径：${input.summary.reportPath}`,
    "",
    "## 运行摘要",
    "",
    `- 模型：${input.summary.model}`,
    `- Judge 模型：${input.summary.judgeModel}`,
    `- 筛选条件：${input.summary.filterLabel}`,
    `- 完整 flow 数：${input.summary.fullFlowCount}`,
    `- 完整 turn 数：${input.summary.fullTurnCount}`,
    `- 实际执行 flow 数：${input.summary.executedFlowCount}`,
    `- 实际执行 turn 数：${input.summary.executedTurnCount}`,
    `- 通过 turn 数：${input.summary.passedTurnCount}`,
    `- 失败 turn 数：${input.summary.failedTurnCount}`,
    `- 跳过 turn 数：${input.summary.skippedTurnCount}`,
    `- 预计 token 消耗：约 ${input.summary.estimatedTokenTotal}`,
    `- 聊天 token 汇总：${formatTokenUsage(input.summary.actualChatTokenUsage)}`,
    `- Judge token 汇总：${formatTokenUsage(input.summary.actualJudgeTokenUsage)}`,
    `- 开始时间：${formatShanghaiDateTime(input.summary.startedAt)}`,
    `- 结束时间：${formatShanghaiDateTime(input.summary.endedAt)}`,
    "",
  ];

  if (input.summary.missingConfiguration.length > 0) {
    lines.push(
      "## 缺失配置",
      "",
      ...input.summary.missingConfiguration.map((name) => `- ${name}`),
      "",
    );
  }

  if (input.summary.preflightErrors.length > 0) {
    lines.push(
      "## Preflight 错误",
      "",
      ...input.summary.preflightErrors.map((error) => `- ${escapeMarkdownText(error)}`),
      "",
    );
  }

  lines.push(
    "## Flow 结果",
    "",
    "| Flow | 轮次 | 状态 | 用户输入 | 文档期望 | 最终 assistant 回复摘要 | 可见输出类型 | Judge / 失败原因 |",
    "|---|---:|---|---|---|---|---|---|",
  );

  for (const record of input.records) {
    lines.push([
      record.flowId,
      String(record.turnIndex),
      record.status,
      escapeMarkdownTableCell(record.userInput),
      escapeMarkdownTableCell(record.expectation),
      escapeMarkdownTableCell(summarizeReportText(record.finalAssistantTextSummary || "(无文本输出)")),
      escapeMarkdownTableCell(record.visibleOutputKinds.join(", ") || "(无)"),
      escapeMarkdownTableCell(formatRecordReason(record)),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  if (input.records.length === 0) {
    lines.push("| (未执行) | 0 | skipped | (无) | (无) | (无) | (无) | 未执行任何 turn |");
  }

  lines.push(
    "",
    "## 用例规模",
    "",
    "| Flow | 目标 | Turn 数 |",
    "|---|---|---:|",
  );

  for (const flow of input.flows) {
    lines.push(`| ${flow.id} | ${escapeMarkdownTableCell(flow.goal)} | ${flow.turns.length} |`);
  }

  return `${lines.join("\n")}\n`;
}

export function summarizeReportText(value: string, maxLength = maxReportTextLength) {
  const normalized = value.trim().replace(/\s+/g, " ");

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

export function mergeTokenUsage(usages: Array<BasicChatTokenUsage | undefined>): BasicChatTokenUsage | undefined {
  const present = usages.filter((usage): usage is BasicChatTokenUsage => Boolean(usage));

  if (present.length === 0) {
    return undefined;
  }

  return present.reduce(
    (total, usage) => ({
      promptTokens: total.promptTokens + usage.promptTokens,
      completionTokens: total.completionTokens + usage.completionTokens,
      totalTokens: total.totalTokens + usage.totalTokens,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  );
}

function formatRecordReason(record: BasicChatTurnRunRecord) {
  if (record.status === "skipped") {
    return record.skipReason ?? "跳过";
  }

  if (record.judge) {
    const missing = record.judge.missingExpectations.length
      ? `缺失：${record.judge.missingExpectations.join("；")}`
      : "";
    return [record.judge.reason, missing].filter(Boolean).join("；");
  }

  return record.failureReason ?? "(无)";
}

function formatTokenUsage(usage: BasicChatTokenUsage | undefined) {
  if (!usage) {
    return "未获取";
  }

  return `prompt=${usage.promptTokens}, completion=${usage.completionTokens}, total=${usage.totalTokens}`;
}

function formatShanghaiDateTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")} +08:00`;
}

function escapeMarkdownTableCell(value: string) {
  return escapeMarkdownText(value).replace(/\|/g, "\\|");
}

function escapeMarkdownText(value: string) {
  return value.replace(/\r?\n/g, " ").trim();
}
