import "server-only";

import { z } from "zod";

import { agentRuntimeConfig } from "@/lib/server/config";

import { defineLangChainToolWrapper } from "../tool-wrapper";
import { toLangChainJsonValue } from "../utils";

export const reportAgentActivityInputSchema = z.object({
  summary: z.string().describe("模型对当前步骤正在做什么的短自然语言总结。服务端只做宽松展示归一化，不把它作为业务事实。"),
  stepType: z.string().optional().describe("可选的模型自报步骤类别，只用于 trace 诊断，不参与业务 tool 路由。"),
}).strict();

const reportAgentActivityOutputSchema = z.object({
  status: z.enum(["recorded", "skipped"]),
  summary: z.string().optional(),
  stepType: z.string().optional(),
});

export type ReportAgentActivityOutput = z.output<typeof reportAgentActivityOutputSchema>;

/** reportAgentActivityLangChainTool 让模型汇报当前步骤摘要，只投影为当前请求 UI 活动状态，不产生业务事实。 */
export const reportAgentActivityLangChainTool = defineLangChainToolWrapper<
  typeof reportAgentActivityInputSchema,
  ReportAgentActivityOutput
>({
  name: "reportAgentActivity",
  description: [
    "用于向用户界面报告你当前步骤正在做什么的 request-local 活动汇报工具。",
    "在进入新的理解、查询、校验、整理或收口步骤前可以调用它，summary 写你自己的短中文步骤总结。",
    "它不查询数据库、不生成训练事实、不替代业务工具、不支撑最终回答 grounding，也不会保存到聊天历史。",
    "summary 可以是自然语言表达，不需要匹配固定模板；不要写 toolName、内部字段、trace id、数据库 id、错误堆栈或未完成即宣称完成的内容。",
    "如果接下来还需要业务工具，应继续调用对应业务工具；本工具只负责活动状态展示。",
  ].join("\n"),
  inputSchema: reportAgentActivityInputSchema,
  outputSchema: reportAgentActivityOutputSchema,
  executionKind: "activity",
  handler: async (input) => {
    const summary = normalizeActivitySummary(input.summary);
    const stepType = normalizeActivityStepType(input.stepType);

    if (!summary) {
      return {
        status: "skipped",
        ...projectOptionalString("stepType", stepType),
      };
    }

    return {
      status: "recorded",
      summary,
      ...projectOptionalString("stepType", stepType),
    };
  },
  toModelVisibleSummary: (output) => ({
    status: output.status,
    message: output.status === "recorded"
      ? "活动摘要已记录。继续执行真实业务工具或提交最终回答；不要把活动摘要当作业务事实。"
      : "活动摘要为空，未展示给用户。继续按当前任务执行。",
  }),
  toUserProjection: (output) => toLangChainJsonValue({
    ...(output.summary ? { activitySummary: output.summary } : {}),
    ...(output.stepType ? { stepType: output.stepType } : {}),
  }),
  toTraceSummary: (output) => toLangChainJsonValue({
    status: output.status,
    summaryLength: output.summary?.length ?? 0,
    ...(output.stepType ? { stepType: output.stepType } : {}),
  }),
});

function normalizeActivitySummary(value: string) {
  const normalized = value
    .replace(/```+/g, "")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.slice(0, agentRuntimeConfig.langChain.activityReport.maxSummaryLength).trim();
}

function normalizeActivityStepType(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const normalized = value
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized
    ? normalized.slice(0, agentRuntimeConfig.langChain.activityReport.maxStepTypeLength).trim()
    : undefined;
}

function projectOptionalString<KeyT extends string>(key: KeyT, value: string | undefined): { [key in KeyT]?: string } {
  return value ? { [key]: value } as { [key in KeyT]?: string } : {};
}
