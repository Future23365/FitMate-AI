## Why

当前动作替换链路存在两个真实用户可见问题：用户说“把上斜哑铃前平举换成别的吧”时，助手只在正文里列出候选动作，没有输出可点击的 `assistantSuggestions`；用户随后输入“侧平举至前平举”时，动作库检索命中但 resolved intent 被降级为 `answer_only`，没有触发 Patch 或卡片更新。

这会让聊天正文承诺“会更新训练内容”，但服务端实际没有生成或修订 artifact，破坏了用户对训练卡片和 AI 编排状态的预期一致性。

## What Changes

- 修正 `exercise_replacement` 的 resolved intent 恢复和门控：当替换动作依赖历史 artifact 时，必须保留 `action.kind = "exercise_replacement"` 和引用需求，不能因为模型输出不完整而降级成 `none + answer_only`。
- 为“已定位被替换动作但尚未指定替换动作”的场景输出结构化候选建议，使用 `assistantSuggestions` 作为唯一可点击来源，而不是让最终回复模型在 Markdown 正文里列候选。
- 增加短期 pending replacement selection 状态：服务端在下一轮能识别用户点击或手动输入的候选动作，并补齐为确定性的 `replace_exercise` Patch。
- 让 `WorkoutPatchEngine` 或等价服务端 Patch 链路消费 replacement selection，成功时输出修订后的 routine/plan artifact 或 Patch 结果，失败时返回可恢复建议。
- 收紧最终回复边界：当 `serverAssistantAction.triggered = false` 或 artifact 未请求时，用户可见回复不得承诺稍后会生成、更新或展示训练内容。
- 增加单元测试和黑盒回归用例，覆盖候选按钮、候选选择后推卡、resolved intent 恢复和回复承诺一致性。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `chat-intent-decision-flow`: 明确 `exercise_replacement` 依赖历史 artifact 的 resolved intent、引用解析、pending selection 和回复一致性要求。
- `assistant-suggestions`: 明确替换候选必须通过 `assistantSuggestions` 输出，并且点击 payload 必须是完整用户口吻替换表达。
- `workout-patch`: 明确替换候选选择应生成 `replace_exercise` Patch，并保持被替换对象和候选动作的服务端校验边界。
- `chat-blackbox-flow-regression-fixes`: 增加“请求替换动作 -> 选择候选动作 -> 推送修订卡片”的真实聊天回归场景。

## Impact

- 影响 `lib/server/chat/chat-service.ts` 的意图解析恢复、resolved intent 门控、引用解析调用、建议归一化、最终回复上下文和 trace 输出。
- 影响 `lib/server/workout-patches/*` 或等价 Patch 编排模块的候选替换、pending selection 消费和失败恢复。
- 可能影响会话上下文或聊天历史持久化结构，用于保存短期 pending replacement selection；若引入持久化字段，必须保持 userId/sessionId 隔离。
- 前端应继续只消费 `assistantSuggestions`，不从 Markdown 正文解析候选按钮。
- 需要补充 `tests/chat-service.test.ts`、`tests/workout-patch-chat-service.test.ts`、`tests/manual-llm-flow-policy.test.ts` 或详细黑盒 flow fixture 的相关覆盖。
