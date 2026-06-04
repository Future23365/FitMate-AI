# Agent 文本聊天基础问答 Prompt 修复

时间：2026-06-03 18:26:07 CST

## 当前问题

最新 trace 中，用户只问“你能干什么”，生产 `/api/chat` 已进入新 `agent-core` 文本聊天链路，且当前阶段按设计使用空 `ToolRegistry`。这本应由模型返回合法 `final_answer`，用自然语言说明当前能做的基础文本交流和能力边界。

实际失败发生在 Planner action 与 Action Validator：模型连续两次产出不被当前 `AgentAction` 合同接受的 action，repair budget 耗尽后以 `repair_limit_exceeded` 收口。由于 trace 导出对 action payload 做了脱敏，当前只能确认失败层级，不能从该文件直接看到具体非法 action 字段。

同时，上一版 unsupported fallback 虽然阻止了内部错误泄漏，但把空 registry 下不可执行 tool call 投影成固定“暂不支持生成、保存或执行训练计划”的业务文案。这个文案不应替代“你能干什么”这类基础问答的模型自然语言回复。

## 调整思路

本次把正常路径和安全边界重新分开：

- 正常基础问答必须由模型返回 `final_answer`，服务端只投影已校验的 `content`。
- 默认 Agent LLM prompt 从测试级英文短句升级为中文合同，明确空 `tools` 时禁止 `tool_call`，普通问答、能力说明和训练原则解释走 `final_answer`，缺少必要信息才走 `ask_user`。
- 模型回答能力边界时，只能基于当前可见 `tools` 和通用文本能力，不承诺执行未注册工具、查询不可见事实或保存未接入业务结果。
- unsupported fallback 只作为安全错误边界，用于模型明确返回不可执行 `tool_call` 的场景；它不再承担基础问答的正常回复职责，也不再输出固定训练计划业务文案。
- 服务端继续禁止用户原文关键词分流、隐藏业务 tool、fixture tool 或旧 Agent 链路回流。

## 关键改动

- `lib/server/agent-planners/prompts/agent-llm-prompt-config.ts`：默认 prompt 改为中文 AgentAction 合同，并将 `agentLlmPromptVersion` 升级为 `agent-action-v2`。
- `lib/server/chat/agent-text-chat-service.ts`：收窄 empty registry unsupported fallback 文案，只表达“请求需要当前未接入工具，无法直接执行”的安全边界。
- `tests/agent-core/agent-llm-prompt-config.test.ts`：覆盖中文 prompt、空工具行为、基础问答、能力说明、repair 行为和禁止业务 toolName。
- `tests/chat-service.test.ts`：新增“你能干什么”由合法 `final_answer` 输出的基础问答测试，并更新不可执行 tool call 的安全边界测试。
- `docs/agent-tool-orchestrator-design.md`：补充 production 文本聊天基础问答与 unsupported fallback 的职责分离。

## 验证结果

- `openspec validate stabilize-agent-text-chat-basic-final-answer --strict` 通过。
- `npm test -- tests/agent-core/agent-llm-prompt-config.test.ts tests/agent-core/adapter-llm-planner.test.ts tests/chat-service.test.ts tests/agent-core/architecture-boundary.test.ts` 通过，4 个测试文件、29 个测试通过。
