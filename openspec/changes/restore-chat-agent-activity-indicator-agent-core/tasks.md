## 1. 现状确认与实现边界

- [ ] 1.1 运行 `git status --short`，确认实现前工作区状态，并隔离无关改动。
- [ ] 1.2 读取 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节，确认本 change 属于 production 接入变更并涉及只读 core 观察扩展。
- [ ] 1.3 读取 `features/chat/components/chat-page.tsx`、`features/chat/hooks/use-chat-controller.ts` 和 `features/chat/api/chat-client.ts`，确认当前首页只展示 `ChatThinkingIndicator`、`content`、`visible_output` 和建议回复。
- [ ] 1.4 读取 `lib/server/chat/agent-text-chat-service.ts`、`lib/server/agent-core/runtime.ts`、`lib/server/agent-core/contracts.ts` 和 `lib/server/agent-core/response-renderer.ts`，确认当前 response 生成、runtime trace event 和终态事件投影位置。
- [ ] 1.5 从历史提交 `9f021299` 或等价提交读取旧 `AgentActivityIndicator`、`features/chat/lib/agent-activity.ts` 和相关测试，只复用视觉基线与展示仲裁思路，不恢复旧事件合同。
- [ ] 1.6 确认本 change 不新增业务 tool、不修改业务 tool 语义、不恢复旧 `AgentOrchestrator`、不恢复旧 `agent_activity`、不恢复旧 `assistant_action` 或旧 card trigger。

## 2. Agent core 进度观察合同

- [ ] 2.1 在 `lib/server/agent-core/contracts.ts` 或等价模块中定义用户安全的 `AgentProgressEvent` / `AgentProgressStage` 合同，默认事件名使用 `agent_progress`。
- [ ] 2.2 为 `runAgentRuntime()` 增加可选、非致命、只读的 runtime event 观察点，例如 `onTraceEvent` 或等价 `onRuntimeEvent`。
- [ ] 2.3 确保观察点与现有 `AgentTraceEvent` 生命周期对齐，覆盖 registry snapshot、planner budget、planner action、validation result、policy decision、tool execution、resource registration 和 terminal grounding 等阶段。
- [ ] 2.4 确保观察点异常不会影响 Planner、Action Validator、Executor、Policy Guard、ResourceStore、Resource Contract Validator、terminal action 或 runtime result。
- [ ] 2.5 确保 `agent-core` 不包含具体业务 `toolName` 的 UI 阶段分支；业务 tool 如需更具体阶段，只能通过安全 metadata、projection 或 production adapter 映射表达。

## 3. Production chat stream 接入

- [ ] 3.1 在 `lib/server/chat/agent-text-chat-service.ts` 中增加 `agent_progress` 安全阶段映射，输入只允许当前 runtime 生命周期、`AgentTraceEvent`、tool 安全 UI metadata 或等价确定性事实。
- [ ] 3.2 将 `/api/chat` 响应改为可在 runtime 执行过程中输出 `agent_progress` 的 NDJSON streaming writer，并保持最终用户事件继续来自 `renderAgentResponseEvents()`。
- [ ] 3.3 确保首个用户可见 `content` 之前至少输出一个早期 `agent_progress`，例如 `preparing_context` 或 `analyzing_request`。
- [ ] 3.4 确保 `agent_progress` payload 不包含 prompt、raw model output、toolName、tool input、tool output、resource id、token usage、权限信息、数据库 payload、trace JSON 或错误栈。
- [ ] 3.5 确保 stream 不输出旧 `agent_activity`、旧 `assistant_action`、旧 `intent_resolved`、旧 `agent_execution_result` 或旧 card trigger。
- [ ] 3.6 确保请求 abort、stream 写入失败、runtime 异常和模型配置错误继续使用当前安全中文错误边界，并清理进度状态。

## 4. 前端事件与状态

- [ ] 4.1 在 `features/chat/api/chat-client.ts` 中增加 `agent_progress` 事件解析和 payload 校验，未知事件继续按安全 stream 错误处理。
- [ ] 4.2 在 `features/chat/types.ts` 或等价共享类型中增加前端可消费的 `AgentProgressPayload`，并保持它不进入 `ChatMessage` 持久化字段。
- [ ] 4.3 在 `features/chat/hooks/use-chat-controller.ts` 中增加当前请求级 activity state、`agent_progress` reducer、`content -> writing_reply` 处理和 `done` / `error` / abort / timeout 清理。
- [ ] 4.4 在会话切换、新建会话和历史恢复路径中清理 activity state，确保历史会话不会重放旧进度状态。
- [ ] 4.5 确保前端不根据用户文本、assistant content 或旧历史字段推断 Agent 活动阶段。

## 5. 活动条 UI 恢复

- [ ] 5.1 恢复或重建 `features/chat/components/agent-activity-indicator.tsx`，视觉以旧紧凑活动条为准，保留 `agent-activity-indicator` 测试 hook、Material Symbols 图标、中文短文案、轻量 pulse 和 `aria-live="polite"`。
- [ ] 5.2 恢复或重建 `features/chat/lib/agent-activity.ts`，集中维护 stage 到中文文案 / 图标 / tone 的白名单映射和展示仲裁规则。
- [ ] 5.3 将活动条接入 `features/chat/components/chat-page.tsx` 的当前 assistant 气泡顶部，并保持 `ChatThinkingIndicator` 在活动条下方。
- [ ] 5.4 确保活动条不出现在输入框上方、不遮挡消息列表和卡片操作、不使用 `/dev/ai-traces` 的 loop / module / accordion / JSON 调试样式。
- [ ] 5.5 确保未知 stage 和 failed 状态只展示用户安全中文兜底，不渲染内部字段原文、toolName、trace step name 或错误详情。

## 6. 测试与验证

- [ ] 6.1 新增或更新 `tests/agent-core/runtime-hardening.test.ts` 或等价 core 测试，覆盖 runtime 观察点事件顺序和观察点异常非致命。
- [ ] 6.2 新增或更新 `tests/chat-service.test.ts`，覆盖 `/api/chat` 在首个 `content` 前输出 `agent_progress`，终态事件仍来自 Response Renderer，且不输出旧兼容事件。
- [ ] 6.3 新增或更新 `tests/client-api.test.ts`，覆盖 `agent_progress` 解析、非法 payload 拒绝和未知事件安全失败。
- [ ] 6.4 新增或更新 `tests/chat-controller-stream-state.test.ts`，覆盖 activity reducer、`content -> writing_reply`、`done` / `error` / abort / timeout 清理和不写入 message content。
- [ ] 6.5 恢复或新增 `tests/chat-agent-activity.test.ts`，覆盖旧样式视觉基线、`aria-live`、未知 stage 兜底、sequence 倒退和具体阶段不被通用阶段短时间覆盖。
- [ ] 6.6 更新聊天历史持久化测试，证明 `agent_progress` / activity state 不进入聊天历史、conversation summary、conversation context、visible output 或 artifact payload。
- [ ] 6.7 更新 `tests/agent-core/architecture-boundary.test.ts`，证明没有恢复旧 `AgentOrchestrator`、旧 `agent_activity`、旧 `assistant_action`、旧 card trigger、服务端关键词路由或 core 具体业务 `toolName` UI 分支。
- [ ] 6.8 运行 `npm test -- tests/agent-core/runtime-hardening.test.ts tests/chat-service.test.ts tests/client-api.test.ts tests/chat-controller-stream-state.test.ts tests/chat-agent-activity.test.ts tests/agent-core/architecture-boundary.test.ts`。
- [ ] 6.9 运行 `npm run typecheck`。
- [ ] 6.10 运行 `openspec validate restore-chat-agent-activity-indicator-agent-core --strict`。

## 7. 文档与收口

- [ ] 7.1 按实现结果新增 `docs/方案变更历史/<timestamp>-Agent活动条接入新核心链路.md`，记录旧样式为什么恢复、旧链路为什么不能恢复、新事件如何接入当前核心流程。
- [ ] 7.2 在 `docs/项目演变历程.md` 末尾追加本次变化，说明首页聊天恢复 Agent 活动条但继续使用当前 `agent-core` 主链。
- [ ] 7.3 检查最终 diff，确认未混入无关用户改动、未修改无关业务 tool、未保留旧 stream 兼容层、未新增服务端语义分流。
- [ ] 7.4 完成实现后按项目规则运行最终相关验证并提交中文 commit。
