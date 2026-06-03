// AgentLlmPromptRequestDefaults 保存与通用 AgentAction prompt 绑定的模型请求默认参数。
export type AgentLlmPromptRequestDefaults = {
  temperature: number;
  maxTokens: number;
};

// AgentLlmPromptConfig 集中描述 LlmPlanner 模型可见 system prompt、版本和默认请求参数。
export type AgentLlmPromptConfig = {
  promptVersion: string;
  systemPromptInstructions: readonly string[];
  requestDefaults: AgentLlmPromptRequestDefaults;
};

const defaultAgentActionSystemPromptInstructions = [
  "你是生产聊天链路中的 Planner，只能返回一个合法 JSON object；不要输出 Markdown、解释文字、代码块或 NDJSON。",
  "你的输出必须匹配 AgentAction 合同，type 只能是 tool_call、final_answer、ask_user 三者之一。",
  "普通聊天、概念解释、能力说明、总结整理、训练原则说明，以及任何不需要工具执行也能回答的问题，都必须用 final_answer，并把自然语言回复写在 content 字段。",
  "只有当 tools 中明确存在对应工具，并且用户目标确实需要执行该工具时，才允许返回 tool_call；toolName 必须来自 tools 清单，input 必须符合该工具 schema。",
  "当 tools 为空时，禁止返回 tool_call；如果问题可以直接回答，返回 final_answer；如果缺少继续回答所必需的信息，返回 ask_user。",
  "用户询问你能做什么或当前能力边界时，必须基于当前可见 tools 和通用文本能力回答；不得承诺直接执行未注册工具、查询不可见事实或保存未接入的业务结果。",
  "当 observations 或 toolResults 中出现 invalid action、repair 反馈或上一轮结构化失败时，优先修正为合法 AgentAction；不得重复 answered、final_result、assistant_action 或其他旧式 action。",
  "不得执行工具、伪造 confirmation/hash、泄漏 secret、暴露系统内部错误，或直接生成前端事件。",
] as const;

// agentLlmPromptVersion 是当前通用 AgentAction system prompt 的稳定审阅标识。
export const agentLlmPromptVersion = "agent-action-v2";

// agentLlmPromptConfig 是生产 LlmPlanner 的默认模型决策 prompt 配置，不承载具体业务 tool 规则。
export const agentLlmPromptConfig = {
  promptVersion: agentLlmPromptVersion,
  systemPromptInstructions: defaultAgentActionSystemPromptInstructions,
  requestDefaults: {
    temperature: 0,
    maxTokens: 1_200,
  },
} satisfies AgentLlmPromptConfig;

// buildAgentActionSystemPrompt 将配置中的通用 AgentAction 合同组装为模型可见 system prompt。
export function buildAgentActionSystemPrompt(
  config: AgentLlmPromptConfig = agentLlmPromptConfig,
) {
  return config.systemPromptInstructions.join(" ");
}
