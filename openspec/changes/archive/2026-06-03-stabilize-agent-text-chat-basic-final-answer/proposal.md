## Why

当前 `/api/chat` 文本聊天在空 `ToolRegistry` 阶段遇到“你能干什么”这类基础问答时，模型没有稳定返回合法 `final_answer`，而是连续产出不被 Action Validator 接受的 action，最终以 `repair_limit_exceeded` 暴露为用户可见错误。这个问题说明当前 Agent LLM prompt 仍停留在测试级英文合同，缺少中文、完整、模型可执行的基础问答决策规则；同时生产聊天的 unsupported fallback 把空 registry 场景投影成固定业务文案，容易替代模型本该完成的自然语言回答。

## What Changes

- 将 Agent LLM 默认 prompt 从测试级英文短句升级为中文合同，明确 `tools` 为空时不得调用工具，普通问答、能力说明、训练原则解释等必须由模型用 `final_answer` 自然语言回答。
- 明确 Prompt 只约束 `AgentAction` 决策、输出 JSON 形态、安全边界、空 registry 行为、repair 反馈处理和用户可见回答原则，不引入具体业务 toolName、关键词分流或服务端语义改写。
- 收窄 `/api/chat` 生产文本聊天的 unsupported fallback：空 registry 下 `tool_call` 不可执行仍可作为安全错误边界，但服务端不得用固定“不能生成训练计划”业务文案替代普通基础问答；真正的正常回复必须来自模型 `final_answer`。
- 保留服务端安全兜底职责：任何 runtime / validator / provider 内部错误不得原样进入用户气泡；内部 code、details 和 trace 继续保留给调试。
- 增加针对中文 prompt、空 registry 基础问答、空 registry 工具调用失败投影、架构边界和 trace 诊断的测试。
- 同步 OpenSpec、Agent Tool 架构文档、方案变更历史和项目演变记录。

## Capabilities

### New Capabilities

- `agent-text-chat-basic-answering`: 生产文本聊天在没有业务 tool 时，仍必须支持基础自然语言问答，并由模型通过合法 `final_answer` 决定用户可见回复。

### Modified Capabilities

- `agent-text-chat-user-error-boundary`: 当前不支持的 tool 能力只作为安全错误边界处理，不得替代基础问答的模型自然语言回复，也不得使用服务端固定业务回答。

## Impact

- 可能影响代码：`lib/server/agent-planners/prompts/agent-llm-prompt-config.ts`、`lib/server/chat/agent-text-chat-service.ts`、`lib/server/agent-core/response-renderer.ts` 或其生产聊天投影调用点。
- 可能影响测试：`tests/agent-core/agent-llm-prompt-config.test.ts`、`tests/agent-core/adapter-llm-planner.test.ts`、`tests/chat-service.test.ts`、`tests/agent-core/architecture-boundary.test.ts`。
- 可能影响文档：`docs/agent-tool-orchestrator-design.md`、`docs/方案变更历史/`、`docs/项目演变历程.md`。
- 不影响 Prisma Schema、数据库迁移、业务 tool 注册、训练计划生成规则、动作选择规则、前端 NDJSON 事件协议、权限模型或 `AgentAction` 三类合同。
