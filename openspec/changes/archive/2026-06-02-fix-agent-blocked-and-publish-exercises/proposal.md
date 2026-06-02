## Why

当前 Tool-first Agent 在推荐“新手、弹力带、无跳跃”的臀腿动作时，`searchExercises` 使用 `visibility: "published"` 后没有任何候选，随后模型返回 `blocked` 终止结果时缺少 `blockReason`，触发 `model_output_invalid`，用户只能看到通用失败文案。

这会让动作库已有内容无法被推荐，也会把可恢复的“候选为空”错误误投影成执行失败，影响首页聊天的真实可用性。

## What Changes

- 将动作种子数据中的所有 `isPublished` 统一设为 `true`，并让 seed 脚本默认写入发布态动作。
- 修正 Agent tool decision / final result 提示，让 `blocked` 终止结果必须使用 `blockReason` 表达阻塞原因。
- 增加服务端兜底映射：当模型把阻塞说明放在 `replyContext.reply` 这类旧形态字段时，转成合法 `blockReason`，避免可恢复失败被误判为 `model_output_invalid`。
- 补充测试，覆盖动作发布态数据、候选为空后的合法 `blocked` 结果，以及 Response Writer 的用户可见回复。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `readonly-llm-tool-calling`: `searchExercises` 的发布态动作数据必须能支持真实推荐，不应因默认未发布导致候选全集为空。
- `chat-intent-decision-flow`: Agent 终止结果为 `blocked` 时必须产出合法 `blockReason`，候选为空应被表达为可恢复阻塞，而不是模型输出非法失败。

## Impact

- 影响 `data/exercises.zh.json` 和 `scripts/seed-exercises.mjs` 的动作发布态。
- 影响 Agent prompt、Agent tool decision 解析或终止结果兼容逻辑。
- 影响 `searchExercises` 相关测试、Agent Orchestrator 测试和可能的 seed 数据测试。
