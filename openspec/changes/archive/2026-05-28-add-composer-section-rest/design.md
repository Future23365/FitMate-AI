## Context

动作编排页当前已经按 `warmup`、`training`、`stretch` 三段展示动作，主训练区内已有循环轮数和循环间隙配置。底部 sticky 工具栏仍保留早期快捷操作，其中“保存编排”和顶部重复，“生成循环训练”只重置已有循环配置，“插入休息”实际修改选中动作的动作间休息，和用户理解的阶段休息不一致。

`WorkoutRoutine` 目前只保存 `trainingLoopRounds`、`trainingLoopRestSeconds` 和每个动作的 `transitionRestSeconds`。执行时间线通过 `buildWorkoutTimeline()` 展开三段动作和主训练循环，因此阶段间休息应进入共享 routine 模型，保证编排页、保存、日历预估和 `/training` 执行一致。

## Goals / Non-Goals

**Goals:**
- 删除动作编排页底部 sticky 工具栏。
- 为热身到训练、训练到拉伸提供独立的阶段间休息配置。
- 让阶段间休息参与 `WorkoutRoutine` 保存、读取、时间线构建、时长估算和热量估算。
- 保持训练区已有循环控件为主训练循环配置的唯一入口。

**Non-Goals:**
- 不调整动作库、动作筛选、拖拽排序或已保存编排卡片交互。
- 不改变 AI routine 草稿结构或聊天推送逻辑。
- 不新增浏览器验证要求；本次以代码阅读、测试和类型检查为主。

## Decisions

1. 在 `WorkoutRoutine` 上新增 `warmupToTrainingRestSeconds` 和 `trainingToStretchRestSeconds`。
   - 原因：阶段间休息是整套编排的结构参数，不属于某个动作的组间或动作间参数。
   - 取舍：复用最后一个热身动作或最后一个训练动作的 `transitionRestSeconds` 能少改数据库字段，但会让阶段切换语义继续混在动作参数里，后续 UI 和执行页都难以解释。

2. `buildWorkoutTimeline()` 在 section 边界优先使用阶段间休息。
   - 原因：执行时间线是训练执行和估算的统一入口，放在这里可以避免编排页、日历和训练页各自实现一套规则。
   - 取舍：不改变 `WorkoutItem.transitionRestSeconds` 的含义，它仍只表达同一阶段内相邻动作之间的动作间休息。

3. 编排页在热身区和训练区后展示阶段间休息控件。
   - 原因：用户是在阶段边界处理解这类休息，而不是在底部全局工具栏中理解。
   - 取舍：不新增全局快捷按钮，避免和已有训练区循环控件重复。

## Risks / Trade-offs

- [Risk] 旧数据没有阶段间休息字段 → 使用共享默认值归一化，保证旧 routine 仍可读取和执行。
- [Risk] 数据库 schema 改动需要迁移 → 新字段使用 nullable，迁移对现有开发数据低风险。
- [Risk] 阶段为空时出现无意义休息 → 时间线仅在边界两侧都存在动作时插入阶段间休息。
