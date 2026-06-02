## Why

推荐卡片底部目前固定展示“换一批”和“编成训练”两个操作按钮，但这些按钮不是本轮 Agent 显式产出的建议，容易与 AI 回答中的 `assistantSuggestions` 重复或冲突。用户希望删除固定按钮，并在生成推荐卡片且 AI 提供建议问答时，把这些建议放到原按钮位置。

## What Changes

- 移除推荐卡片底部固定的“换一批”和“编成训练”按钮。
- 当同一条助手消息生成推荐卡片且存在 `assistantSuggestions` 时，在推荐卡片底部原操作区展示这些 AI 建议。
- 当助手消息没有推荐卡片时，现有气泡正文下方建议展示方式保持不变。
- Response Writer 不再为推荐卡片自动注入固定默认建议，只投影 Agent 显式返回的建议。
- 更新相关前端和 Agent Response Writer 测试，覆盖显式建议保留和默认建议移除。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `assistant-suggestions`: 明确推荐卡片生成时，建议展示位置跟随卡片底部，且服务端不得注入非 Agent 显式建议。
- `chat-exercise-recommendation-trigger`: 明确推荐卡片不再包含固定刷新/编排按钮，卡片底部只承载本轮 AI 建议。

## Impact

- 影响前端聊天页和推荐卡片组件：`features/chat/components/chat-page.tsx`、`features/exercises/components/exercise-recommendation-card.tsx`。
- 影响聊天前端控制器中旧按钮专用逻辑：`features/chat/hooks/use-chat-controller.ts`。
- 影响 Agent Response Writer 建议投影：`lib/server/agent-orchestrator/response-writer.ts`。
- 影响测试：`tests/agent-orchestrator.test.ts`。
