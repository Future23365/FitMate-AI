## Why

当前聊天主链已经切换到 Tool-first Agent loop，请求过程中会经历上下文构建、模型决策、工具查询、训练内容生成、校验、保存和回复投影等多个阶段。用户在聊天页只能看到通用“正在思考”，当真实 Agent 编排耗时变长时，容易误以为系统卡住，也无法感知 FitMate 正在执行有序的训练编排工作。

本 change 需要在聊天输入框上方增加一个面向用户的 Agent 活动状态条，用中文短句展示当前大致阶段，并用克制的动态视觉效果表达“Agent 正在编排”，但不暴露内部 prompt、trace、工具参数或调试细节。

## What Changes

- 新增聊天页 Agent 活动状态能力：当 `/api/chat` 正在处理用户消息时，在对话框上方展示一条紧凑状态条。
- 服务端聊天流新增面向 UI 的轻量 activity 事件或等价字段，用稳定枚举表达当前阶段，例如准备上下文、分析训练需求、查询动作库、生成训练安排、校验训练内容、整理回复。
- 前端将 activity 枚举映射为中文短文案，只展示大致含义，例如“正在查询动作库...”，不展示 toolName、resource id、prompt、候选池、trace payload 或英文内部字段。
- 状态条需要支持简单视觉特效，包括动态图标、阶段脉冲、进度感点阵或流动线条，让用户感知 Agent 编排正在推进。
- 状态条只在当前请求处理中出现；请求完成、失败、取消或超时后必须清理，不写入聊天消息历史。
- 现有“正在思考”状态需要并入或降级为活动状态的兜底文案，避免页面同时出现多个互相竞争的 loading 提示。
- 新增或调整测试，覆盖 stream activity 解析、前端状态清理、失败清理、中文文案映射和不泄漏内部调试信息。

## Capabilities

### New Capabilities

- `chat-agent-activity-indicator`: 定义聊天页 Agent 活动状态的流式事件契约、中文展示、视觉状态、生命周期清理和测试边界。

### Modified Capabilities

- 无。

## Impact

- 主要影响 `/api/chat` 的 NDJSON stream 事件构造、`features/chat/types.ts` 的流事件类型、`features/chat/hooks/use-chat-controller.ts` 的流式状态管理，以及 `features/chat/components/chat-page.tsx` 的输入区上方展示。
- 可能影响 `lib/server/chat/chat-service.ts` 中 Agent stream event 构造、`buildAgentStreamEvents` / `createAgentResponseStream` 或等价流式输出位置。
- 可能新增聊天页专用的 activity 文案映射、展示组件和单元测试 fixture。
- 不改变 AgentOrchestrator 的决策语义，不改变工具执行、训练计划生成、权限校验、数据库结构或模型输出结构。
- 不要求浏览器验证；实现阶段应优先运行相关单元测试、`npm run typecheck` 和 `openspec validate add-agent-activity-indicator --strict`。如确需真实浏览器确认动效位置，应先取得确认并只复用已有 `http://localhost:3000`。
