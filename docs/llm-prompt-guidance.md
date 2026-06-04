# LLM Prompt 入口与边界说明

## 1. 文档范围

本文记录当前生产 `/api/chat` 文本聊天链路中，`LlmPlanner + DeepSeekModelAdapter` 使用的模型可见 system prompt 来源，以及它与旧 prompt module、业务 tool 能力说明和运行时校验之间的边界。

当前生产文本聊天链路为：

```txt
/api/chat
-> createAgentTextChatResponse
-> createAgentTextChatRunInput
-> new ToolRegistry()
-> LlmPlanner + DeepSeekModelAdapter
-> runAgentRuntime
-> renderAgentTextChatResponseEvents
-> NDJSON
```

本阶段仍不注册真实动作库、训练生成、artifact 保存、用户记忆或数据库业务 tool。

## 2. 当前生产 Prompt 入口

当前生产 `/api/chat` 的 Agent LLM system prompt 来源是：

```txt
lib/server/agent-planners/prompts/agent-llm-prompt-config.ts
```

该模块集中导出：

- `AgentLlmPromptConfig`：描述 system prompt、`promptVersion` 和默认模型请求参数的配置类型。
- `agentLlmPromptConfig`：生产默认配置。
- `agentLlmPromptVersion`：当前通用 AgentAction prompt 的稳定版本标识。
- `buildAgentActionSystemPrompt()`：把配置组装为 DeepSeek system message。

`DeepSeekModelAdapter` 只负责把 prompt 配置、用户 payload 和模型参数映射为 DeepSeek 请求体；它不拥有默认 prompt 文案，也不注册或执行 tool。

## 3. 旧 Prompt Module 边界

`lib/server/ai/prompt-config.ts` 不再是当前生产 `/api/chat` 文本聊天入口。

旧 `prompt-config.ts` 曾服务于已删除的旧 Agent orchestrator、Response Writer、summary 更新和多业务 prompt module。当前新 `agent-core` 文本聊天闭环已经切到 `agent-planners/prompts/agent-llm-prompt-config.ts`。排查当前首页聊天发给 DeepSeek 的 system prompt 时，应优先查看新的 Agent LLM prompt 配置模块和 `DeepSeekModelAdapter` 请求体测试。

如果后续旧文档或历史报告提到 `aiPromptModuleRegistry`、`agent_tool_decision`、`agent_response_writer` 等旧模块，需要先确认它们是否只是历史说明，不能默认当作当前生产入口。

## 4. 默认 Prompt 内容边界

默认 Agent LLM prompt 只描述通用 `AgentAction` 决策合同、输出格式和安全边界：

- 模型必须只返回一个 JSON object。
- 输出必须匹配 `AgentAction`。
- 允许的 `type` 只有 `tool_call`、`final_answer`、`ask_user`。
- 模型不得执行 tool、伪造 confirmation hash、泄漏 secret 或输出 NDJSON event。

默认 prompt 不包含具体业务 tool、动作库、训练生成、计划保存、artifact revision、用户记忆或推荐卡片流程说明。

## 5. 业务能力说明来源

后续如果接入真实业务能力，模型可见说明应来自独立业务 tool change 中的结构化材料，而不是塞进通用默认 prompt：

- `ToolManifest`
- resource contract
- model observation
- tool result projection
- 经过校验的 run metadata 或服务端事实投影

服务端仍只校验结构、权限、资源存在性、候选归属、policy、confirmation 和持久化合同。不得通过关键词、正则、同义词或短句模板替模型改写用户语义。

## 6. 修改 Prompt 时的验证

修改 Agent LLM prompt 配置后至少需要确认：

- `tests/agent-core/agent-llm-prompt-config.test.ts` 覆盖默认 prompt、`promptVersion` 和 builder。
- `tests/agent-core/adapter-llm-planner.test.ts` 覆盖 DeepSeek 请求体 system message 来自默认或注入配置。
- `tests/agent-core/architecture-boundary.test.ts` 覆盖 `agent-core` 不导入 prompt 配置，prompt 配置不导入业务 tool、Prisma、动作服务、训练服务或旧 orchestrator。
- `npm run typecheck` 通过。
- 对应 OpenSpec change 通过 `openspec validate <change> --strict`。

## 7. 关键代码索引

- `lib/server/agent-planners/prompts/agent-llm-prompt-config.ts`
- `lib/server/agent-planners/model-adapters/deepseek-model-adapter.ts`
- `lib/server/agent-planners/llm-planner.ts`
- `lib/server/chat/agent-text-chat-service.ts`
- `tests/agent-core/agent-llm-prompt-config.test.ts`
- `tests/agent-core/adapter-llm-planner.test.ts`
- `tests/agent-core/architecture-boundary.test.ts`
