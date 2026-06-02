## Why

当前聊天页已经能展示 Agent 活动阶段，但前端会把动态 tool loop 中反复出现的 `analyzing_request` 原样呈现，导致用户看到状态在具体工具阶段和通用“正在思考/分析”之间来回抖动。这个问题会让正常的 Agent 多轮决策看起来像服务端卡顿，需要在展示层做稳定的文案仲裁。

## What Changes

- 新增前端 activity 展示仲裁规则，把 `analyzing_request` 视为低优先级通用阶段，而不是覆盖具体工具阶段的主提示。
- 在不假设 Agent tool 固定顺序的前提下，让具体阶段拥有最小展示时间，并允许 `done`、`error`、abort、会话切换立即清理。
- 将 `analyzing_request` 的中文文案调整为更贴近 Agent loop 的“正在规划下一步...”，避免用户误解为重新开始思考。
- 补充自动化测试，覆盖动态 tool 序列、重复通用阶段、未知 stage 兜底和生命周期清理。
- 不改变服务端 Agent tool 选择、tool loop 执行逻辑、模型输出结构、训练计划生成规则或 stream payload 安全边界。

## Capabilities

### New Capabilities
- `chat-agent-activity-display-stability`: 约束聊天页在动态 Agent activity stream 下如何稳定展示用户可见状态文案。

### Modified Capabilities

## Impact

- 影响 `features/chat/lib/agent-activity.ts` 的前端 activity 显示仲裁逻辑。
- 影响 `features/chat/hooks/use-chat-controller.ts` 中接收 `agent_activity` 和 `content` 的状态更新方式。
- 影响 `features/chat/components/agent-activity-indicator.tsx` 的短生命周期展示去抖逻辑。
- 影响 `tests/chat-agent-activity.test.ts` 的 activity 展示稳定性测试。
