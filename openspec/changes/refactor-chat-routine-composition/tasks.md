## 1. 结构与类型

- [ ] 1.1 新增 routine 专用草稿 Schema 和类型，包含 `kind = "routine"`、`trainingLoopRounds`、`trainingLoopRestSeconds`、三段式 `sections` 和动作执行参数。
- [ ] 1.2 将 AI 训练草稿响应类型改成 `kind` 区分的 union，保留长期 plan 的 `WorkoutPlanDraft`，新增 routine 的 `WorkoutRoutineDraft`。
- [ ] 1.3 新增 `convertWorkoutRoutineDraftToWorkoutRoutine()`，将三段式 routine 草稿转换为可保存的 `WorkoutRoutine`。
- [ ] 1.4 删除 routine 场景对 `WorkoutPlanDraft.days[0]` 和全量 `section: "training"` 转换的依赖。

## 2. AI 生成与服务端校验

- [ ] 2.1 调整 `workoutPlanDraftGeneration` 提示词，让 `intentType = routine` 必须输出热身、训练、拉伸三段式 routine 草稿和主训练循环配置。
- [ ] 2.2 调整 AI 生成服务，按 `intent.intentType` 分流 plan 与 routine 的生成、解析、Zod 校验和 trace step 命名。
- [ ] 2.3 为 routine 场景补强候选动作上下文，保证 AI 能从候选中选择热身、训练和拉伸动作，候选不足时返回结构化失败。
- [ ] 2.4 更新训练草稿领域校验，校验 routine 三个 section、动作 id、动作参数、循环配置和预估时长一致性。

## 3. 聊天状态与推送卡片

- [ ] 3.1 调整 chat client、controller 和聊天历史结构，按 `kind` 保存 plan draft 与 routine draft。
- [ ] 3.2 新增 routine 专用聊天推送卡片，按热身、训练、拉伸展示动作，并突出主训练循环次数、循环间休息、组数、次数或秒数。
- [ ] 3.3 保留长期计划卡片的多日计划和排班能力，移除其中为 routine 服务的 `days.length === 1` 特殊语义。
- [ ] 3.4 统一聊天卡片的加载、保存成功、保存失败反馈，避免出现内部流程词或与 AI 回复冲突的文案。

## 4. 保存与执行链路

- [ ] 4.1 将 routine 卡片保存入口改为 `WorkoutRoutineDraft -> WorkoutRoutine -> createWorkoutRoutine()`。
- [ ] 4.2 确认保存后的 `WorkoutRoutine` 保留 `section`、`trainingLoopRounds`、`trainingLoopRestSeconds`、动作执行参数和动作库展示信息。
- [ ] 4.3 验证保存后的 routine 可在动作编排页、训练日历和 `/training` 时间线中按热身、循环训练、拉伸执行。
- [ ] 4.4 删除旧 routine 保存路径中不再需要的 fallback、别名或兼容分支。

## 5. 测试与验证

- [ ] 5.1 为 routine draft Schema、AI 输出校验和无效 section / 无效 exerciseId / 缺失循环配置补单元测试。
- [ ] 5.2 为 `convertWorkoutRoutineDraftToWorkoutRoutine()` 补转换测试，覆盖 section 顺序、主训练循环配置和动作执行参数保留。
- [ ] 5.3 为 AI 生成服务补 plan/routine 分流测试，确保 routine 返回 `kind = "routine"`，plan 仍返回 `kind = "plan"`。
- [ ] 5.4 为聊天 controller 或卡片渲染补测试，覆盖 routine 卡片展示三段式结构和保存调用参数。
- [ ] 5.5 运行 `npm test` 和 `npm run typecheck`。
- [ ] 5.6 如实现影响路由、服务端/客户端模块边界或构建配置，运行 `npm run build`；如未运行，在实现总结中说明原因。

## 6. 文档与 OpenSpec 收尾

- [ ] 6.1 更新 README 或相关架构/数据库文档中聊天推送 routine 到 `WorkoutRoutine` 保存的当前链路说明。
- [ ] 6.2 运行 `openspec validate refactor-chat-routine-composition --strict`。
- [ ] 6.3 实现完成并验证后归档该 OpenSpec change。
