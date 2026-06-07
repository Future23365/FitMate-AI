## Why

当前 `visibleTrainingProposal` 把“训练编排应优先包含热身、主训练、拉伸”同时写成模型可见要求和服务端 hard validation。模型偶尔只输出主训练动作时，终态 validator 会直接拒绝整张训练卡片，导致本可以展示的训练编排被判为失败。

本次改动需要拆开“生成偏好”和“确定性安全边界”：继续引导模型优先生成完整三段式，但服务端不再因为缺少 `warmup` 或 `stretch` 拒绝已经结构合法、动作合法的 `routine` / `plan`。

## What Changes

- `visibleTrainingProposal` 的终态校验只把 `training` 主训练 section 作为 `routine` / `plan` 必要动作事实。
- `warmup` 和 `stretch` 从 hard validation requirement 降级为模型可见的正向完整度偏好；模型可见合同不能告诉模型“可以不生成热身或拉伸”。
- 保留数据库 hard validation：`exerciseId` 存在、发布态、权限边界、`allowedSections`、`prescription`、`schedule` 和 schema 严格性仍必须通过。
- 保留 `searchExerciseResources` 的 support section 查询和受控补齐能力，帮助模型优先拿到 `warmup` / `stretch` 候选。
- 聊天富卡片 adapter 和共享 draft schema 允许只包含已实际生成的 section；`training` 仍必须存在，缺失的 `warmup` / `stretch` 不由前端或服务端伪造。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `visible-training-proposal`: 调整 `routine` / `plan` 的 section 完整度合同，把 support section 从服务端 hard requirement 改为模型侧正向生成偏好。
- `visible-training-proposal-validation`: 调整终态 validator 的 section coverage 边界，只因缺少 `training` hard fail，不因缺少 `warmup` / `stretch` hard fail。
- `agent-visible-output-contracts`: 调整 Planner 可见 output contract，继续正向引导完整三段式，但不暴露“可以省略热身/拉伸”的模型可见规则。
- `chat-routine-composition`: 调整聊天富卡片 draft 结构，支持展示只包含主训练或部分 support section 的合法 `routine` / `plan`。

## Impact

- 影响服务端终态输出校验：`lib/server/visible-training-proposals/visible-training-proposal-validator.ts` 和 `visible-training-proposal-contract.ts`。
- 影响 Planner 可见输出合同：`lib/server/config/agent-visible-output-contracts.ts`。
- 影响聊天富卡片适配和共享 draft schema：`features/chat/lib/visible-training-proposal-cards.ts`、`lib/shared/workout-plans/draft-schema.ts`。
- 影响相关测试：`tests/visible-training-proposal-validator.test.ts`、`tests/chat-service.test.ts`、`tests/visible-training-proposal-cards.test.ts`、`tests/shared-schemas.test.ts` 或等价窄测试。
- 不新增业务 tool，不修改 `/api/chat` 主链路，不修改 Planner / Executor / Policy Guard，不新增服务端关键词、正则、同义词或短句模板分流。
