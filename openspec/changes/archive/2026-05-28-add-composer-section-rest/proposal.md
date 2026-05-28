## Why

动作编排页底部 sticky 工具栏已经和页面内控件重复，并且“插入休息”“生成循环训练”的语义不再准确。当前热身到训练、训练到拉伸之间只能隐式复用动作间休息，缺少面向阶段切换的明确配置。

## What Changes

- 删除动作编排页底部 sticky 工具栏，不再重复展示“自动排序、插入休息、生成循环训练、保存编排”。
- 在热身到训练、训练到拉伸之间新增阶段间休息配置。
- 保存 `WorkoutRoutine` 时保留阶段间休息配置，并让训练执行时间线和预估时长使用该配置。
- 保留训练区已有的循环轮数和循环间隙配置，不新增重复入口。

## Capabilities

### New Capabilities

### Modified Capabilities
- `workout-data-model`: `WorkoutRoutine` 需要保存可执行阶段间休息配置。
- `workout-session-step-flow`: 训练时间线需要在热身到训练、训练到拉伸之间使用阶段间休息。

## Impact

- 影响 `lib/shared/workouts/composition.ts` 的 routine 类型、默认值、归一化、估算和时间线构建。
- 影响 `lib/shared/workouts/persistence-schema.ts`、`lib/server/workouts/workout-persistence-service.ts` 和 Prisma 模型，确保阶段间休息可持久化。
- 影响 `features/workouts/components/action-composer-page.tsx` 的编排 UI 和保存 payload。
- 需要补充相关单元测试或类型检查，验证保存、读取、估算和时间线休息步骤一致。
