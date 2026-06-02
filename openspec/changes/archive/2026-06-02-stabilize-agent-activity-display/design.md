## Context

`/api/chat` 当前会在 Agent 主链中发送 `agent_activity` stream 事件。服务端的事件来自动态 tool loop：每一轮模型决策前会出现 `analyzing_request`，如果模型随后调用工具，则再出现 `querying_exercises`、`reading_artifacts`、`generating_workout`、`validating_result` 等更具体阶段。

这个事件序列对开发者是合理的，但用户看到的是生产聊天页的短文案。当前前端把事件直接更新到展示层，导致具体阶段之后又频繁回到通用“分析/思考”状态，看起来像系统不断重启或卡住。由于 Agent tool 调用不是固定流程，本次不能引入固定业务状态机，只能做用户可见文案的动态仲裁。

## Goals / Non-Goals

**Goals:**

- 在不假设 tool 固定顺序的前提下，稳定展示当前最有信息量的 Agent 活动文案。
- 将 `analyzing_request` 降级为低权重兜底阶段，避免短时间覆盖具体工具阶段。
- 保留 `done`、`error`、abort、会话切换的立即清理能力。
- 保留现有 `AgentActivityIndicator` 和 `ChatThinkingIndicator` 的并存关系，不改动它们的布局关系。
- 用纯函数覆盖展示仲裁规则，便于单元测试动态事件序列。

**Non-Goals:**

- 不改变服务端 Agent tool loop、工具选择、模型决策、训练生成规则或 stream payload 结构。
- 不把 activity 展示设计成精确进度条或固定流程状态机。
- 不隐藏或移除原有“正在思考”加载态。
- 不新增数据库表，不持久化 activity 状态。

## Decisions

### 1. 新增前端展示仲裁器，而不是固定状态机

前端新增 `reduceVisibleAgentActivity` 或等价纯函数，输入当前展示状态与下一条 stream activity，输出是否更新展示。函数只关心“用户此刻看哪个文案更稳定、更有信息量”，不关心 Agent 是否按固定步骤执行。

替代方案是按照 `preparing_context -> analyzing_request -> querying_exercises -> generating_workout -> writing_reply` 建状态机。这个方案不采用，因为 Agent tool 调用顺序和数量由模型动态决定，固定状态机容易误伤合法路径。

### 2. `analyzing_request` 只作为低权重兜底

如果当前没有展示状态，`analyzing_request` 可以显示；如果当前正在展示具体阶段，短时间内新的 `analyzing_request` 不应覆盖当前文案。若具体阶段已经展示较久且没有新具体事件，才允许降级到通用文案。

`analyzing_request` 的中文文案改成“正在规划下一步...”，表达 Agent 正在决定下一步动作，而不是重新开始思考。

### 3. 具体阶段拥有最小展示时间

`querying_exercises`、`reading_artifacts`、`generating_workout`、`validating_result`、`saving_result`、`writing_reply`、`finalizing` 等具体阶段出现时可以立即展示，但应至少保留约 900-1200ms，除非遇到 `done`、`error`、abort 或会话切换。

这个规则只影响 UI 文案稳定性，不阻塞 stream 读取、不延迟内容渲染、不影响请求清理。

### 4. Hook 层负责处理 stream 语义，组件层只负责渲染

`useChatController` 接收到 `agent_activity` 后先经过展示仲裁器，再传给 `AgentActivityIndicator`。组件不保留计时状态，不使用 effect 改写 activity，只负责把当前可见状态渲染成中文文案、图标和轻量动效。

这样可以把动态事件序列测试集中在 `features/chat/lib/agent-activity.ts`，避免组件测试依赖计时器和 React 状态更新细节。

## Risks / Trade-offs

- [Risk] 低权重 `analyzing_request` 被忽略后，用户短时间看不到每次模型决策。→ Mitigation：生产 UI 本来不应展示每轮内部决策，开发者仍可在 trace 页查看完整 loop。
- [Risk] 具体阶段保留时间过长，可能与真实内部阶段存在轻微滞后。→ Mitigation：只保留短窗口，且 `done`、`error`、abort 始终立即清理。
- [Risk] 未知 stage 可能覆盖当前具体阶段。→ Mitigation：未知 stage 只在当前为空时使用安全兜底文案，已有具体阶段时不抢占展示。

## Migration Plan

1. 新增 activity 展示仲裁纯函数和阶段权重分类。
2. 调整 `analyzing_request` 文案为“正在规划下一步...”。
3. 在 `useChatController` 中接入展示仲裁器，保持 `content` 到达时进入 `writing_reply` 的现有能力。
4. 更新 `AgentActivityIndicator` 的最小展示阶段列表，避免通用阶段抢占具体阶段。
5. 补充测试并运行相关自动化检查。
