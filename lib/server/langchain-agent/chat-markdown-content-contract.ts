import "server-only";

/** chatMarkdownContentContract 集中描述用户可见聊天正文允许的 Markdown 子集，避免 prompt 与 schema 文案漂移。 */
export const chatMarkdownContentContract = {
  allowedSyntax: "emoji、段落、短标题、编号列表、项目列表、加粗、斜体和行内代码",
  disallowedSyntax: "raw HTML、Markdown 水平分割线、删除线、表格、脚注、任务清单、代码块和一级大标题",
  dividerSyntax: "单独一行的 ---、***、___、<hr>，以及只由横线、星号或下划线组成的分隔行",
  rangeSyntax: "数字范围使用 8-12、8 到 12 或 8 至 12，不要使用 ~ 表达范围",
} as const;

/** buildChatMarkdownContentPromptRules 生成给模型看的正文格式规则，只描述稳定渲染合同，不承载业务语义。 */
export function buildChatMarkdownContentPromptRules() {
  return [
    `- content 只能使用适合聊天正文的 Markdown 子集：${chatMarkdownContentContract.allowedSyntax}；emoji 可以正常使用。`,
    `- content 禁止使用会改变聊天正文结构或造成误解的语法：${chatMarkdownContentContract.disallowedSyntax}。`,
    `- content 禁止使用 Markdown 水平分割线或装饰性分隔行，包括${chatMarkdownContentContract.dividerSyntax}；需要分段时使用标题、编号列表、项目列表或空行。`,
    `- content 中${chatMarkdownContentContract.rangeSyntax}。`,
  ];
}

/** buildChatMarkdownContentSchemaDescription 生成 fitmate_final_response.content 的模型可见字段说明。 */
export function buildChatMarkdownContentSchemaDescription() {
  return [
    "用户可见正文。使用中文，简洁可执行。",
    "不要输出未校验 JSON、NDJSON event 或工具调用参数。",
    "当回答包含已校验 visibleTrainingProposal、routine 或 plan 时，content 只解释、提醒或总结已校验结构；不要把正文当作结构化训练 payload，也不要在正文中补写 payload 未承载的动作、处方或 schedule 事实。",
    `只能使用适合聊天正文的 Markdown 子集：${chatMarkdownContentContract.allowedSyntax}；emoji 可以正常使用。`,
    `禁止使用会改变聊天正文结构或造成误解的语法：${chatMarkdownContentContract.disallowedSyntax}。`,
    `禁止使用 Markdown 水平分割线或装饰性分隔行，包括${chatMarkdownContentContract.dividerSyntax}。`,
    `${chatMarkdownContentContract.rangeSyntax}。`,
  ].join("");
}
