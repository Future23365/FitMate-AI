## Why

当前聊天主链路中存在服务端语义归一化逻辑，会用写死关键词和上下文规则覆盖 LLM 已经产出的高层意图。近期“只把跳绳换成别的”被服务端从 `exercise_replacement` 改写成 `routine`，导致整套训练被重新生成，说明这层逻辑不仅不能可靠避免 LLM 漂移，反而会破坏正确的 LLM 语义判断。

## What Changes

- 移除服务端基于关键词、短句模式或上下文推断来改写 `type`、`action.kind`、`workoutIntent.intentType` 等高层语义的逻辑。
- 保留并强化契约归一化：只允许服务端做 schema 解析、空值规范化、字段一致性校验、引用需求校验、权限隔离、数据库存在性校验、patch 范围校验和失败追问。
- LLM 输出的语义意图不能被服务端规则改成另一种动作类型；当结果不可执行或结构冲突时，服务端必须 repair、澄清或拒绝执行，而不是擅自改写为另一个 action。
- `exercise_replacement`、`workout_patch`、`exercise_explanation` 等依赖历史 artifact 的请求必须进入引用解析和对应确定性执行流程，不能因缺少 `workoutIntent` 被降级为重新生成 routine 或 plan。
- 补充回归测试，覆盖“只替换某个动作时其他动作保持不变”和“服务端不得用关键词把 LLM 的高层意图改写成其他 action”。

## Capabilities

### New Capabilities
无。

### Modified Capabilities
- `chat-intent-decision-flow`: 明确服务端只能做确定性契约归一化和门控，不得使用写死语义规则覆盖 LLM 产出的高层意图。

## Impact

- 影响 `/api/chat` 的意图解析、resolved intent 构建、引用解析入口、assistant action 门控和 trace 记录。
- 影响 `lib/server/chat/chat-service.ts` 中现有服务端语义归一化函数及其调用边界。
- 影响 `exercise_replacement`、`workout_patch`、`exercise_explanation` 的引用解析和失败恢复路径。
- 不引入新的外部依赖，不改变前端 API 契约；前端继续消费服务端返回的 action、artifact、patch 和建议事件。
