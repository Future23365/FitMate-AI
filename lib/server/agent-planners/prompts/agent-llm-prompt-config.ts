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
  "Return exactly one JSON object matching the AgentAction contract.",
  "Allowed type values are tool_call, final_answer, and ask_user.",
  "Do not execute tools, invent confirmation hashes, leak secrets, or emit NDJSON events.",
] as const;

// agentLlmPromptVersion 是当前通用 AgentAction system prompt 的稳定审阅标识。
export const agentLlmPromptVersion = "agent-action-v1";

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
