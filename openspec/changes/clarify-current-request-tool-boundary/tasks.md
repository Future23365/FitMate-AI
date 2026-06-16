## 1. 合同边界检查

- [x] 1.1 使用 `agent-tool-change-governance` 确认本 change 不修改 LangChain runtime 主循环、provider payload、production tool catalog、tool wrapper handler、response adapter 或 `/api/chat` route。
- [x] 1.2 使用 `agent-prompt-contract-governance` 对照 `docs/llm-prompt-guidance.md`，确认新增规则属于通用 System Prompt / provider tool calling 边界，而不是业务 tool 局部说明。
- [x] 1.3 完成抽象层级检查，确认 prompt 不写具体业务 `toolName` 触发条件、不列不可用工具清单、不新增服务端关键词或 phrasing 特判。

## 2. Prompt 实现

- [x] 2.1 更新 `lib/server/langchain-agent/prompt.ts`，在默认 system prompt 中补充“当前 provider request 实际暴露的 `tools` schema 是唯一可调用工具目录”的通用规则。
- [x] 2.2 明确历史消息、历史 `tool_calls` 或历史 tool result 中出现过的 `toolName` 不代表当前仍可调用。
- [x] 2.3 确认新增文案使用中文描述业务含义，并保持 `tools`、`toolName`、`tool_calls` 等技术标识英文原样。

## 3. 测试与验证

- [x] 3.1 更新 `tests/langchain-agent-runtime/runtime.test.ts` 的 prompt 合同断言，覆盖当前 request tools 边界。
- [x] 3.2 运行 `openspec validate clarify-current-request-tool-boundary --strict`。
- [x] 3.3 运行 `npm test -- tests/langchain-agent-runtime/runtime.test.ts tests/langchain-agent-tools/model-visible-contract-gate.test.ts`。
- [x] 3.4 运行 `npm run typecheck`。
- [x] 3.5 检查最终 diff，确认没有新增服务端关键词规则、自然语言模板路由、phrasing 特判或具体业务 `toolName` 语义分支。
