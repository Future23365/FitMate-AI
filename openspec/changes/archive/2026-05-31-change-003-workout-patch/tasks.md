## 1. 前置依赖与 Patch 类型

- [x] 1.1 确认 `change-001-conversation-artifact` 和 `change-002-reference-resolver` 已提供可定位 artifact 与 payload 读取能力。
- [x] 1.2 新增 `ExerciseLocator`、`WorkoutPatch`、`PlanPatch`、Patch operation、Patch scope 和 Patch result 类型。
- [x] 1.3 使用 Zod 或 JSON Schema 校验 Patch 输入，拒绝缺少 target、operation 或 scope 的 Patch。

## 2. PatchEngine

- [x] 2.1 实现 artifact-only Patch 应用流程，读取目标 artifact payload 并生成新 revision。
- [x] 2.2 实现 `replace_exercise` operation，默认保留 section、order、sets、target、duration 和 rest。
- [x] 2.3 实现 `adjust_load` 或难度降低的基础操作，限制在单个 target 内修改执行参数。
- [x] 2.4 实现 `remove_exercise` 的安全分支，replacementRequired 时必须选择合法替代动作。
- [x] 2.5 输出可追踪 diff，标明修改目标、替代动作、保留字段和失败原因。

## 3. PatchValidator 与候选动作

- [x] 3.1 将替代动作选择接入 Exercise Retrieval Service，确保 replacementExerciseId 来自服务端候选集合。
- [x] 3.2 校验替代动作存在于数据库，并满足原 section、器械、难度、风险和用户限制。
- [x] 3.3 校验未点名动作、训练日、循环配置和休息配置保持不变。
- [x] 3.4 校验 Patch 后预估时长没有明显偏离用户目标。
- [x] 3.5 对已完成 schedule 或训练历史默认返回 blocked，不修改历史记录。

## 4. 聊天流程接入

- [x] 4.1 在 ReferenceResolver resolved 且用户表达为局部修改时生成 Patch。
- [x] 4.2 对 Patch 成功结果推送新的 artifact revision 卡片和变更摘要。
- [x] 4.3 对候选不足、目标歧义或校验失败返回可继续对话的引导。
- [x] 4.4 对 saved routine、future schedule 和 completed history scope 返回 blocked，保留复杂覆盖给后续 confirmation change，不在本 change 默认批量写入。

## 5. 测试与验证

- [x] 5.1 补充单动作替换测试，确认未点名动作和参数保持不变。
- [x] 5.2 补充同一 exerciseId 多次出现时的歧义测试。
- [x] 5.3 补充候选外 replacementExerciseId 被拒绝测试。
- [x] 5.4 补充已完成 schedule 不被 Patch 修改测试。
- [x] 5.5 补充聊天局部修改流程测试，覆盖成功 revision 和失败引导。
- [x] 5.6 运行 `npm test`、`npm run typecheck` 和 `npm run lint`。

## 6. 文档记录

- [x] 6.1 在 `docs/方案变更历史` 新增方案变更记录，说明训练内容修改从整份重生成升级为局部 Patch。
- [x] 6.2 如 Patch schema 或 AI 编排工具接口影响核心链路，在 `docs/项目演变历程.md` 追加简要记录。
