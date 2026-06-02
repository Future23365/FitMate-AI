## Context

首页聊天推荐卡片当前由 `ExerciseRecommendationCard` 展示动作列表，卡片底部固定提供“换一批”和“编成训练”两个按钮。Tool-first Agent 主链已经通过 `assistantSuggestions` 表达下一步建议，但 Response Writer 在没有显式建议时仍会基于 recommendation 工具结果注入固定建议，前端也把建议默认渲染在气泡正文下方。

这会造成两类问题：一是固定按钮与 Agent 显式建议来源不一致；二是推荐卡片生成时，用户需要在卡片下方寻找下一步操作，而不是在推荐卡片自身的操作区看到 AI 建议。

## Goals / Non-Goals

**Goals:**

- 删除推荐卡片内固定“换一批”和“编成训练”按钮。
- 推荐卡片生成时，将同条消息的 `assistantSuggestions` 放到卡片底部原操作区。
- 非推荐卡片消息继续在正文下方展示建议 chips。
- Response Writer 只投影 Agent 显式返回的建议，不再按工具结果注入默认建议。
- 删除前端中仅服务旧固定按钮的状态和处理函数。

**Non-Goals:**

- 不改变 Agent 对用户自然语言的理解方式。
- 不新增建议生成 LLM 调用。
- 不删除 `/api/ai/exercise-recommendations` 或动作推荐 API 能力。
- 不改变推荐卡片的动作详情入口、图片回填、候选来源和 artifact 保存逻辑。

## Decisions

1. **推荐卡片组件接收统一建议协议，而不是继续暴露固定操作回调。**
   - 选择：`ExerciseRecommendationCard` 接收 `assistantSuggestions`、`onSuggestionClick` 和禁用态。
   - 原因：卡片只负责展示推荐结果和本轮 AI 建议，不再内置“刷新/编排”语义。
   - 备选：保留 `onRefresh/onCompose` 但隐藏按钮。该方案会保留无入口逻辑，后续容易误用。

2. **聊天页按消息是否有推荐卡片决定建议展示位置。**
   - 选择：同一条助手消息存在推荐卡片时，不再在正文下方渲染建议，而是传给卡片底部。
   - 原因：避免重复展示，并让建议与推荐结果视觉绑定。
   - 备选：两处都显示建议。该方案会造成重复按钮和焦点分散。

3. **Response Writer 不再基于 recommendation 工具结果生成默认建议。**
   - 选择：只读取 `replyContext.assistantSuggestions` 并归一化为前端协议。
   - 原因：服务端投影层不应补充“换一批/生成训练”这类非 Agent 显式建议，符合建议内容由对应阶段 LLM 产出的边界。
   - 备选：继续保留默认建议但由前端过滤。该方案会让协议层仍然包含不应出现的建议，测试和黑盒输出也会继续看到默认按钮。

## Risks / Trade-offs

- [Risk] 某些推荐卡片没有 Agent 显式建议时，卡片底部不再展示下一步按钮。→ Mitigation：这是期望行为；用户仍可直接输入下一步需求，且建议生成责任留给 Agent。
- [Risk] 历史会话中旧 `suggestedReplies` 仍可能存在。→ Mitigation：前端继续兼容旧字段；有推荐卡片时同样移动到卡片底部展示。
- [Risk] 删除旧刷新按钮后，直接调用 `/api/ai/exercise-recommendations` 的前端入口减少。→ Mitigation：聊天主链继续通过用户下一轮消息和 Agent 工具调用刷新推荐，不删除 API。

