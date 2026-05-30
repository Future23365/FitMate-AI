## Why

RAG 混合检索接入后，聊天、动作推荐和训练编排会把候选动作上下文继续传给模型，单轮短对话的 token 成本明显上升。当前部分模型输入包含图片、英文名、长推荐原因和重复候选池等非必要字段，需要先收敛为模型理解和选择动作所需的最小安全字段。

## What Changes

- 为发给模型的动作候选 payload 建立精简字段边界，只保留动作选择、训练阶段判断和安全约束需要的信息。
- 从动作推荐模型输入中移除图片、英文名、中文难度冗余字段和长候选原因，只保留候选来源、分数和核心训练属性。
- 从训练计划/单次编排模型输入中去除重复候选池里的非必要字段，并降低单次传入候选数量。
- 保留服务端完整候选对象用于最终卡片、持久化、校验和 trace 调试，不改变数据库、API 响应或用户可见卡片字段。

## Capabilities

### New Capabilities
- `ai-model-payload-budget`: 约束 AI 模型请求中的动作候选 payload 应只包含完成当前模型任务所需的最小字段。

### Modified Capabilities

## Impact

- 影响 `lib/server/chat/chat-service.ts` 中聊天模型的 `providedExercises` 上下文。
- 影响 `lib/server/exercise-recommendations/ai-exercise-recommendation-service.ts` 中动作推荐模型输入。
- 影响 `lib/server/workout-plans/ai-workout-plan-service.ts` 中训练草稿生成和修复模型输入。
- 需要补充测试，确认模型输入不再包含图片等非必要字段，且动作卡片仍从服务端完整对象补齐图片。
