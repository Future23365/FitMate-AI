## Why

旧 Agent 运行时删除后，首页聊天里用于展示 Agent 每阶段推进状态的活动条也被一并移除。当前 `/dev/ai-traces` 仍能按 loop 诊断运行链路，但用户在首页聊天请求处理中只能看到泛化的“正在思考”，缺少“正在整理上下文 / 正在规划下一步 / 正在查询动作库 / 正在校验 / 正在整理回复”这类可见进度反馈。

本 change 恢复聊天气泡内的活动条体验，但只复用旧活动条的紧凑视觉样式；事件来源、生命周期和安全边界必须接入当前 `agent-core` 文本聊天主链，不恢复旧 `AgentOrchestrator`、旧 `agent_activity` 事件合同或旧训练卡片触发逻辑。

## What Changes

- 为当前 `/api/chat -> agent-core -> Response Renderer` 文本聊天流新增用户安全的 Agent 进度事件，例如 `agent_progress`。
- 进度事件只表达 UI 可展示的粗粒度阶段、状态和顺序号，不暴露 prompt、raw model output、tool input / output、resource id、token usage 或开发 trace 详情。
- 在 production chat 接入层从当前 `agent-core` 生命周期、runtime trace event 或等价安全观察点投影活动阶段；不得基于用户原文、关键词、正则、同义词表或固定短句推断阶段。
- 首页聊天恢复活动条组件，视觉以旧 `AgentActivityIndicator` 紧凑样式为基线：AI 气泡顶部、Material Symbols 图标、短中文文案、轻量 pulse、`aria-live="polite"`，不做卡片化、不使用调试页 trace 样式。
- 前端活动状态仍是请求级临时 UI 状态，`done`、`error`、abort、timeout、会话切换或新建会话时必须清理，不写入聊天历史、message content、conversation summary、conversation context 或 artifact payload。
- 保留当前 `content`、`visible_output`、`assistant_suggestions`、`tool_result`、`confirmation_request`、`error`、`done` 等白名单事件语义；活动条不能改变最终回答、训练卡片、tool 执行、Policy Guard、ResourceStore 或 Response Renderer 的业务结果。
- 更新测试和架构扫描，证明新进度事件不是旧 stream 合同回滚，也不会引入 `/api/chat` 业务关键词路由或 core 内具体 toolName 分支。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `chat-agent-activity-indicator`: 恢复首页聊天活动条，并要求视觉样式以旧活动条为准，同时将事件来源改为当前 `agent-core` 安全进度投影。
- `chat-agent-activity-display-stability`: 更新活动状态仲裁规则，确保新 `agent_progress` 动态事件不会让 UI 在通用阶段和具体阶段之间抖动，也不会泄漏未知内部字段。
- `agent-text-chat-flow`: 扩展当前生产文本聊天 NDJSON 合同，允许用户安全的 Agent 进度事件进入 stream，但禁止恢复旧 `AgentOrchestrator`、旧 `agent_activity` 合同、旧 `assistant_action` 或任何业务语义分流。

## Impact

- Agent core 运行链路：`lib/server/agent-core/runtime.ts`、`lib/server/agent-core/contracts.ts` 或等价安全观察点。
- 生产聊天接入：`lib/server/chat/agent-text-chat-service.ts`、`app/api/chat/route.ts` 的现有薄接入边界。
- 前端聊天流：`features/chat/api/chat-client.ts`、`features/chat/hooks/use-chat-controller.ts`、`features/chat/types.ts`。
- 前端展示：恢复或重建 `features/chat/components/agent-activity-indicator.tsx` 和 `features/chat/lib/agent-activity.ts`，并接入 `features/chat/components/chat-page.tsx`。
- 测试：Agent runtime / chat service stream / client parser / controller 状态 / 活动条组件 / 聊天历史持久化 / architecture boundary / OpenSpec strict validation。
