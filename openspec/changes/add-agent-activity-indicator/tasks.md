## 1. Stream Contract

- [ ] 1.1 在 `features/chat/types.ts` 中新增 `agent_activity` stream event 类型、`AgentActivityStage` 枚举类型和 UI 安全 payload 类型。
- [ ] 1.2 在服务端聊天流构造中新增 activity event helper，确保事件只包含 stage、status、messageKey 和 sequence 等白名单字段。
- [ ] 1.3 在 `/api/chat` Agent 主链的稳定边界发出 activity 事件，覆盖上下文准备、需求分析、动作库查询、artifact 读取、训练生成、校验、保存、回复整理和收尾。
- [ ] 1.4 确保首个用户可见 `content` 事件之前至少发送一个 activity 事件，并且普通问答、推荐、routine / plan 生成、patch / regenerate 路径都有合理兜底阶段。

## 2. Frontend State

- [ ] 2.1 在 `useChatController` 中新增短生命周期 `agentActivity` 状态，并在 `sendMessage` 开始时设置初始兜底状态。
- [ ] 2.2 在 stream 解析逻辑中消费 `agent_activity` 事件，按 sequence 或等价规则避免旧事件覆盖新阶段。
- [ ] 2.3 在 `done`、`error`、abort、timeout、hash 切换、加载历史会话和新建会话时清空 `agentActivity`。
- [ ] 2.4 确保 `agentActivity` 不进入 `ChatMessage`、`saveChatConversation` payload、conversation summary、conversation context 或 artifact payload。

## 3. Chat UI

- [ ] 3.1 新增或重构 `AgentActivityIndicator` 组件，放在聊天输入框上方展示当前 Agent 活动状态。
- [ ] 3.2 建立 `AgentActivityStage` 到中文短文案、图标和视觉状态的白名单映射，未知 stage 使用不泄漏内部信息的兜底文案。
- [ ] 3.3 将现有 `ChatThinkingIndicator` 并入新状态条或降级为兜底，避免同一请求期间出现两个 loading 提示。
- [ ] 3.4 为状态条增加克制的编排感动效，并支持 `aria-live="polite"` 与 `prefers-reduced-motion`。
- [ ] 3.5 确保状态条不会遮挡消息列表、输入框、发送按钮、推荐卡片或训练计划卡片操作。

## 4. Tests And Verification

- [ ] 4.1 补充 stream event 构造测试，验证首个 `content` 前存在 activity 事件，且 payload 不包含 prompt、raw model output、tool payload、resource id 或 trace 详情。
- [ ] 4.2 补充 `useChatController` 或等价 hook 测试，覆盖 activity 更新、未知 stage 兜底、请求完成清理、失败清理、超时/取消清理和会话切换清理。
- [ ] 4.3 补充 `AgentActivityIndicator` 组件测试，覆盖中文文案映射、兜底文案、动效 class、`aria-live` 和 reduced motion 边界。
- [ ] 4.4 补充或更新聊天页集成测试，确认 activity 状态不写入聊天历史持久化 payload。
- [ ] 4.5 运行相关自动化测试，例如聊天 stream、hook、组件测试集合。
- [ ] 4.6 运行 `npm run typecheck`。
- [ ] 4.7 运行 `openspec validate add-agent-activity-indicator --strict`。
- [ ] 4.8 如实现阶段认为必须使用真实浏览器验证动效位置，先说明原因并等待确认，只复用已有 `http://localhost:3000`。
