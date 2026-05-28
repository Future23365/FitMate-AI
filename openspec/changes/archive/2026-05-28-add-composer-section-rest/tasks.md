## 1. 数据结构与执行逻辑

- [x] 1.1 在 `WorkoutRoutine`、Zod schema 和 Prisma 模型中加入热身到训练、训练到拉伸的阶段间休息字段。
- [x] 1.2 更新 routine 归一化、保存、读取、排期映射和预估逻辑，让阶段间休息随 routine 传递。
- [x] 1.3 更新 `buildWorkoutTimeline()`，在热身到训练、训练到拉伸边界使用阶段间休息。

## 2. 编排页 UI

- [x] 2.1 删除动作编排页底部 sticky 工具栏。
- [x] 2.2 在热身和训练区块后加入阶段间休息配置控件，并保存到 routine payload。

## 3. 验证

- [x] 3.1 补充或更新自动化测试，覆盖阶段间休息 schema、时间线和持久化映射。
- [x] 3.2 运行相关测试和类型检查，并执行 `openspec validate add-composer-section-rest --strict`。
