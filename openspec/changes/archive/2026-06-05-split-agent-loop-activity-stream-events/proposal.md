## Why

当前聊天活动条把 Agent 进度事件数量当成 Loop 轮次，导致一次后端 Agent Loop 内的 planner、tool、validation、content 等多个事件会把前端 `#N` 推高。用户看到的 `#N` 应表示后端真实 Agent Loop 轮次，右侧中文文案应表示当前轮次内正在做什么；这两个状态的更新时机不同，需要从 stream 合同层拆开。

## What Changes

- **BREAKING**: 将聊天 stream 中“Loop 轮次”和“活动阶段”拆成两个用户安全事件族：Loop 事件只表达当前后端 Agent Loop 轮次，Activity 事件只表达当前可展示阶段。
- 前端不得再按 `agent_progress` 事件数量、stage 变化次数或 content 到达次数自行推断 Loop 轮次。
- 服务端需要在真实 Agent Loop 边界输出稳定 `agent_loop` 事件，payload 只包含当前请求内的正整数轮次和必要排序字段。
- 服务端继续输出活动阶段事件，例如沿用或迁移 `agent_progress`，payload 只包含 stage/status/messageKey/sequence 等 UI 安全字段，不绑定 Loop 轮次。
- 前端活动条状态模型拆成 `loopTurn` 和 `activityStage` 两个独立状态：收到 Loop 事件只更新 `#N`，收到 Activity 事件只更新右侧中文文案。
- 未进入后端 Agent Loop 的准备阶段可以只显示活动文案，不显示 `#N`。
- 同一 Loop 内允许多次 Activity 更新；不同 Loop 也允许 Activity 文案重复，例如 `#1 正在查询动作库...` 后可出现 `#2 正在查询动作库...`。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-text-chat-flow`: 修改 production `/api/chat` NDJSON stream 的 Agent 进度合同，新增独立 Loop 事件并明确 Activity 事件不承载轮次语义。
- `chat-agent-activity-indicator`: 修改聊天页活动条展示合同，要求前端独立消费 Loop 事件和 Activity 事件，禁止按进度事件数推断轮次。
- `chat-agent-activity-display-stability`: 扩展活动展示稳定性要求，使具体阶段仲裁只影响右侧文案，不影响 `#N` 轮次。

## Impact

- 受影响生产链路：`/api/chat` NDJSON stream、production chat service、当前 `agent-core` runtime 观察点、Agent trace 到 progress 的投影。
- 受影响前端模块：聊天客户端 stream parser、`use-chat-controller` 活动状态 reducer、`AgentActivityIndicator` 展示组件和相关类型。
- 受影响测试：服务端 stream fixture、前端 activity reducer/component 测试、client parser 测试、architecture boundary 扫描和 typecheck。
- 不应影响：Planner 行为、tool 调用选择、Action Validator、Executor、Policy Guard、ResourceStore、Resource Contract Validator、Response Renderer 最终内容事件、聊天历史持久化和模型可见 prompt。
