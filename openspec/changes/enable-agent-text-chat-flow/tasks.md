## 1. 后端文本聊天接入

- [ ] 1.1 新增聊天 Agent 接入服务，将 `PreparedChatRequest`、`CurrentUser`、`conversationId`、`responseMessageId` 和 hydration metadata 转换为 `AgentRunInput`。
- [ ] 1.2 新增生产 planner factory，使用 `LlmPlanner + DeepSeekModelAdapter` 构造 planner，并在缺少必需 DeepSeek 配置时返回稳定配置错误。
- [ ] 1.3 在生产文本聊天路径中创建空 `ToolRegistry`，确保不注册 fixture tool、真实业务 tool 或任何 `agent-tools/<domain>` 工具。
- [ ] 1.4 调用 `runAgentRuntime()` 并通过默认 Response Renderer 生成 `content`、`assistant_suggestions`、`error`、`done` 等 NDJSON 白名单事件。
- [ ] 1.5 修改 `app/api/chat/route.ts`，将合法请求从 `createChatUnavailableResponse()` 切换到新的文本聊天 NDJSON 响应。
- [ ] 1.6 删除或收窄禁用响应相关命名，保留必要的配置错误和失败收口，不恢复旧 `AgentOrchestrator`、旧 `AgentExecutionResult` 或旧兼容事件。

## 2. 前端 NDJSON 消费

- [ ] 2.1 将 `features/chat/api/chat-client.ts` 从禁用 JSON 请求改为 NDJSON stream client，支持跨 chunk 行缓存、空行、非法 JSON、HTTP 错误和 abort。
- [ ] 2.2 更新 `use-chat-controller`，把 `content` 事件追加到当前 assistant message。
- [ ] 2.3 更新 `use-chat-controller`，把 `assistant_suggestions` 事件写入当前 assistant message 的建议回复字段。
- [ ] 2.4 更新 `use-chat-controller`，在 `error`、abort、超时或解析失败时设置错误信息并清理当前 assistant message 的 loading / reasoning 状态。
- [ ] 2.5 确保 `done` 事件、请求完成和异常路径都会清理 `isLoading`，并保持现有会话自动保存流程可用。
- [ ] 2.6 确保前端本阶段不根据用户文本、旧事件或空 registry 结果推断训练卡片、动作推荐、保存 artifact 或业务执行成功。

## 3. 自动化测试

- [ ] 3.1 增加后端 service / route 测试，使用 fake planner 或 fake adapter 验证 `final_answer` 会输出 `content` + `done` NDJSON。
- [ ] 3.2 增加后端 service / route 测试，验证 `ask_user` 会输出澄清文本和 `assistant_suggestions`。
- [ ] 3.3 增加后端测试，验证缺少 DeepSeek 配置时返回稳定配置错误，不返回旧 `chat_ai_disabled` 正常路径。
- [ ] 3.4 增加 runtime 接入测试，验证空 registry 下模型返回 `tool_call` 不会执行任何 handler，并按结构化错误收口。
- [ ] 3.5 增加 chat client 测试，覆盖多行 NDJSON、跨 chunk NDJSON、非法 JSON、HTTP 错误、abort 和 done 收尾。
- [ ] 3.6 增加 `use-chat-controller` 或等价前端逻辑测试，覆盖文本追加、建议回复、错误状态和 loading 清理。
- [ ] 3.7 增加架构扫描测试，证明 `/api/chat`、聊天接入服务和 `agent-core` 没有旧 `agent-orchestrator` 导入、旧 `assistant_action` 派生、业务关键词分流或具体业务 toolName 分支。
- [ ] 3.8 增加架构扫描测试，证明生产注册入口没有注册 fixture tool、`searchExercises`、训练生成、保存、用户记忆或任何 `agent-tools/<domain>` 真实业务 tool。

## 4. 文档与项目记录

- [ ] 4.1 更新 `docs/agent-tool-orchestrator-design.md`，新增 production text chat flow 落地状态，说明它位于 M2 之后、只接空 registry 文本聊天、不接业务 tool。
- [ ] 4.2 如实现新增或改变环境变量使用方式，更新 README 或相关开发文档；如未改变，在实现总结中说明无 README 更新。
- [ ] 4.3 在 `docs/方案变更历史` 中新增本次生产文本聊天接入方案记录，时间使用上海时区精确到秒。
- [ ] 4.4 在 `docs/项目演变历程.md` 末尾追加本次从禁用 `/api/chat` 到新 `agent-core` 文本聊天闭环的简要记录。

## 5. 验证与收尾

- [ ] 5.1 运行 `openspec validate enable-agent-text-chat-flow --strict`。
- [ ] 5.2 运行与本 change 相关的后端 route / service / agent-core 测试。
- [ ] 5.3 运行与 chat client / hook 相关的前端测试。
- [ ] 5.4 修改 TypeScript、React、API 或 Agent 接入代码后运行 `npm run typecheck`。
- [ ] 5.5 按需运行 `npm test`；如环境或时间限制无法运行，记录未运行原因和剩余风险。
- [ ] 5.6 最终检查 `git diff`，确认只包含本 change 的 OpenSpec、聊天文本接入、测试和必要文档改动，没有混入业务 tool 或无关重构。
