## Why

当前训练草稿校验把“结构是否可执行”和“训练安排是否合理”混在一起，导致用户明确要求连续多天练同一套动作时，服务端因 `consecutive_load_high`、`day_similarity_high` 等合理性判断阻止卡片展示。

这与当前职责边界冲突：LLM 负责训练编排和合理性判断，服务端只应负责结构、动作来源、权限和用户明确约束等可确定验证的契约边界。

## What Changes

- 移除服务端训练草稿 hard fail 中的合理性判断，包括训练日重复度、连续负荷、训练量偏高、休息偏短、新手容量偏高和 section 语义偏好。
- 保留这些合理性信号作为 warning、trace 诊断或 LLM 修复上下文，但它们不得单独阻止 routine / plan 卡片展示或保存。
- 调整目标时长和周频率校验：只有当字段来源表明用户明确提出该约束时，服务端才可将明显不一致作为契约失败；默认值或 LLM 推断值不得作为 hard fail 依据。
- 修正校验失败恢复分类：失败分类只根据 hard contract errors 决定，warning 不得把未知 error 误包装成 recoverable，也不得触发“计划生成失败”。
- 更新测试覆盖，确保用户明确要求“三天都练这个”时，重复训练计划可以通过结构校验并返回 warning。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workout-validation-boundary`: 收窄服务端 hard fail 范围，只保留结构、动作来源、权限、候选集合和用户明确约束等契约边界。
- `workout-generation-validation-recovery`: 调整失败恢复分类，使 warning 不再参与失败判定，合理性 warning 不触发失败恢复。
- `chat-routine-composition`: 更新 routine 展示前校验要求，明确训练量、休息、section 语义和目标时长推断值不阻止卡片展示。
- `domain-plan-engine`: 更新长期计划 Validator 边界，移除连续负荷和重复训练日作为保存前 hard fail 的要求。

## Impact

- 影响 `lib/server/workout-plans/workout-plan-validation-service.ts` 的 error / warning 分类和字段来源判断。
- 影响 `lib/server/workout-plans/workout-plan-validation-recovery-service.ts` 的失败分类和引导文案。
- 影响 `lib/server/workout-plans/domain-plan-engine.ts` 或其调用方对 `PlanStrategy.fieldSources` 的传递和校验使用。
- 影响 `tests/workout-plan-validation.test.ts`、`tests/ai-workout-plan-service.test.ts` 以及相关聊天/计划生成回归测试。
- 需要同步更新 `docs/方案变更历史` 和 `docs/项目演变历程.md`，记录服务端训练校验职责边界调整。
