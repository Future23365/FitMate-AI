/** activitySummary 是当前请求内活动条的用户可见短文案，不参与 Agent 决策或持久化。 */
export const agentActivitySummaryDisplayMaxLength = 40;

/** agentActivitySummarySchemaMaxLength 是 AgentAction schema 的硬结构上限，超过后进入结构 repair。 */
export const agentActivitySummarySchemaMaxLength = 80;

/** agentActivitySummarySafetyEnabled 控制调试期是否拦截模型活动摘要中的内部词、长度和字符风险。 */
export const agentActivitySummarySafetyEnabled = false;

export type AgentActivitySummaryRejectionReason =
  | "not_string"
  | "empty"
  | "too_long"
  | "non_chinese"
  | "control_character"
  | "internal_term";

export type AgentActivitySummarySanitizationResult =
  | { ok: true; summary: string }
  | { ok: false; reason: AgentActivitySummaryRejectionReason };

const internalActivitySummaryPatterns = [
  /\bAgentAction\b/i,
  /\btoolName\b/i,
  /\btool_call\b/i,
  /\bfinal_answer\b/i,
  /\bask_user\b/i,
  /\bvisibleOutputs\b/i,
  /\busedRefs\b/i,
  /\btool_result\b/i,
  /\bcontent\b/i,
  /\binput\b/i,
  /\boutput\b/i,
  /\bpayload\b/i,
  /\bstage\b/i,
  /\bmessageKey\b/i,
  /\bsequence\b/i,
  /\bresource\b/i,
  /\bruntime\b/i,
  /\bvalidator\b/i,
  /\bprovider\b/i,
  /\btrace\b/i,
  /\bschema\b/i,
  /\bprompt\b/i,
  /\bNDJSON\b/i,
  /\braw\b/i,
  /\bstack\b/i,
  /\bdebug\b/i,
  /\berror\s*code\b/i,
  /[`{}[\]]/,
  /[_$][A-Za-z0-9_]+/,
  /[A-Za-z]+[A-Z][A-Za-z]*/,
  /错误码/,
  /字段路径/,
  /服务端校验/,
  /内部/,
  /调试/,
  /工具名/,
  /执行合同/,
] as const;

/** sanitizeAgentActivitySummary 只做活动摘要展示投影，不根据用户原文或摘要语义改写内容。 */
export function sanitizeAgentActivitySummary(value: unknown): AgentActivitySummarySanitizationResult {
  if (typeof value !== "string") {
    return { ok: false, reason: "not_string" };
  }

  const summary = value.trim();

  if (!summary) {
    return { ok: false, reason: "empty" };
  }

  if (!agentActivitySummarySafetyEnabled) {
    return { ok: true, summary };
  }

  if (summary.length > agentActivitySummaryDisplayMaxLength) {
    return { ok: false, reason: "too_long" };
  }

  if (/[\u0000-\u001F\u007F]/.test(summary)) {
    return { ok: false, reason: "control_character" };
  }

  if (!/\p{Script=Han}/u.test(summary)) {
    return { ok: false, reason: "non_chinese" };
  }

  if (internalActivitySummaryPatterns.some((pattern) => pattern.test(summary))) {
    return { ok: false, reason: "internal_term" };
  }

  return { ok: true, summary };
}
