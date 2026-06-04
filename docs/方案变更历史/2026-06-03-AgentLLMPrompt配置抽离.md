# Agent LLM Prompt 配置抽离

时间：2026-06-03 17:37:00 CST

## 当前问题

生产 `/api/chat` 已接入 `LlmPlanner + DeepSeekModelAdapter`，但默认 system prompt 仍写在 `DeepSeekModelAdapter.createRequestBody()` 里。这样后续调整模型决策合同时，会直接触碰 DeepSeek 请求构造、模型参数、HTTP 协议和输出解析，容易把 prompt 文案和供应商 adapter 职责混在一起。

同时，`docs/llm-prompt-guidance.md` 仍把旧 `lib/server/ai/prompt-config.ts` 作为提示词入口说明。该说明已经不符合当前新 `agent-core` 文本聊天链路，后续排查容易继续找错入口。

## 调整思路

本次只抽离通用 Agent LLM prompt 配置，不接入任何业务 tool，也不改变 `/api/chat` 外部请求、NDJSON 事件或用户可见能力。

新的边界是：

```txt
agentLlmPromptConfig
-> buildAgentActionSystemPrompt()
-> DeepSeekModelAdapter
-> LlmPlanner
-> PlannerPort
-> agent-core runtime
```

`agent-core` 继续只依赖 `PlannerPort`，不感知 prompt 配置或 DeepSeek 协议。默认 prompt 只描述 `AgentAction` 输出合同、允许的 action 类型和安全边界。

## 关键改动

- 新增 `lib/server/agent-planners/prompts/agent-llm-prompt-config.ts`，集中定义 `AgentLlmPromptConfig`、默认配置、`agentLlmPromptVersion` 和 `buildAgentActionSystemPrompt()`。
- `DeepSeekModelAdapter` 改为从 prompt 配置读取 system message，并支持测试注入自定义配置。
- 保持生产 planner factory 继续使用默认配置，不注册 fixture tool 或真实业务 tool。
- 新增 prompt 配置、DeepSeek 请求体和架构边界测试。
- 更新 prompt 说明文档和 Agent Tool Orchestrator 架构文档，标注旧 `lib/server/ai/prompt-config.ts` 不再是当前生产入口。

## 验证方式

计划运行：

```txt
npm test -- tests/agent-core
npm run typecheck
openspec validate externalize-agent-llm-prompts --strict
```
