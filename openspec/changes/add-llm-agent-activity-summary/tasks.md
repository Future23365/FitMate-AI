## 1. AgentAction 合同与模型可见输入

- [ ] 1.1 在 `AgentAction` 三类 action schema 中新增共同可选 `activitySummary` 字段，并为字段添加短中文用户态摘要的类型约束和意图注释。
- [ ] 1.2 更新 `AgentAction` 类型、schema error projection / repair feedback，使非法摘要只反馈确定性字段问题，缺失摘要不触发 repair。
- [ ] 1.3 更新 `lib/server/config/agent-llm-prompt-config.ts` 的 system prompt 短规则、`protocol.actionContract.shapes`、field dictionary 和示例，说明 `activitySummary` 的用途、可选性、用户安全边界和非决策属性。
- [ ] 1.4 更新 prompt version，并确认模型可见描述性自然语言使用中文，技术标识如 `activitySummary`、`AgentAction`、`tool_call` 保持英文。

## 2. Runtime Trace 与聊天流投影

- [ ] 2.1 在 runtime trace 的 `planner_action` 或等价安全事件摘要中携带已解析 action 的安全 `activitySummary` 诊断信息。
- [ ] 2.2 在 `/api/chat` agent activity writer 中支持输出可选 `activitySummary`，但只从已校验 action 的安全摘要投影，不让 LLM 直接生成 NDJSON event。
- [ ] 2.3 保持 `agent_loop` 先发轮次、`agent_progress` 后发摘要更新的时序，确保同一 loop 内摘要更新不影响 `loopTurn`。
- [ ] 2.4 为摘要添加服务端安全 sanitizer / guard：空值、过长、内部术语或明显调试字段时丢弃并 fallback 到固定 stage 文案。
- [ ] 2.5 确认 `activitySummary` 不进入 replay summary、conversation summary、conversation context、visible output、artifact payload、跨 run fact bridge 或最终用户业务 payload。

## 3. 前端 Stream 解析与活动条展示

- [ ] 3.1 扩展 `AgentProgressPayload`、`AgentTextChatEvent` 和 NDJSON parser，解析合法 `activitySummary` 并对非法摘要执行前端二次忽略。
- [ ] 3.2 更新 `reduceAgentActivity` / `reduceVisibleAgentActivity`，使摘要只更新右侧文案，不修改、递增、回滚或推断 `loopTurn`。
- [ ] 3.3 更新 `getAgentActivityDisplay` 和 `AgentActivityIndicator`，优先展示安全摘要，缺失或非法时继续使用现有 stage / messageKey fallback。
- [ ] 3.4 确认 `done`、`error`、abort、timeout、会话切换、新建会话和历史恢复会同时清空摘要、stage、pending state 和 loop 轮次。
- [ ] 3.5 确认聊天保存 payload、`ChatMessage`、本地历史兼容字段和 suggestion / visible output 渲染不会持久化或重放 `activitySummary`。

## 4. 测试与边界验证

- [ ] 4.1 增加或更新 AgentAction schema / prompt config 测试，覆盖三类 action 的 `activitySummary`、模型可见中文说明、旧 `rationale` 不承担 UI 摘要职责。
- [ ] 4.2 增加或更新 runtime / chat service tests，覆盖合法摘要投影、非法摘要 fallback、`agent_loop` 与摘要事件时序、trace 诊断和终态事件不携带摘要。
- [ ] 4.3 增加或更新 frontend NDJSON parser tests，覆盖合法摘要解析、非法摘要忽略、未知 stage fallback 和 stream 不中断。
- [ ] 4.4 增加或更新 activity reducer / component tests，覆盖摘要优先展示、重复摘要不阻止新 loop 前缀、过期 sequence 不回滚、content 不解析摘要、生命周期清理。
- [ ] 4.5 增加或更新历史持久化测试，证明 `activitySummary` 不写入 `ChatMessage`、聊天历史、conversation summary、visible output 或 artifact payload。
- [ ] 4.6 增加或更新架构边界测试，证明 route/runtime/validator/tool/renderer 不根据 `activitySummary` 或用户原文做语义分流、toolName 特判或 action 改写。

## 5. 文档与验证命令

- [ ] 5.1 对照 `docs/llm-prompt-guidance.md` 检查本 change 的规则分层：Prompt 定策略，Schema 定形状，Runtime 给事实，Validator 守边界，Frontend 只展示。
- [ ] 5.2 如实现涉及核心链路优化或长期架构边界变化，按项目规则补充 `docs/方案变更历史/` 和 `docs/项目演变历程.md`。
- [ ] 5.3 运行 `openspec validate add-llm-agent-activity-summary --strict`。
- [ ] 5.4 运行相关自动化测试：AgentAction / prompt config / runtime / chat service / frontend activity tests。
- [ ] 5.5 修改 TypeScript、React、API、Schema 或 AI 编排代码后运行 `npm run typecheck`，并按改动范围运行 `npm test`。
