## 1. 草稿结构与类型

- [ ] 1.1 更新 `WorkoutPlanDraft` 相关 Zod schema 和 TypeScript 类型，新增计划层字段、训练日 `dayType`、`schedulePattern` 和三段式 `sections`。
- [ ] 1.2 移除长期计划旧的 `days[].items` 读取路径，确保 plan 和 routine 都通过 section 表达可执行动作。
- [ ] 1.3 为新增核心 schema、类型和结构化字段添加简短中文意图注释。

## 2. AI 生成与候选动作

- [ ] 2.1 更新 `workoutPlanDraftGeneration.plan` prompt，要求先生成计划层骨架，再生成每个训练日的 `warmup`、`training`、`stretch`。
- [ ] 2.2 调整候选动作选择逻辑，确保长期计划补充足够的热身、拉伸和恢复类 supplementary candidates。
- [ ] 2.3 确认长期 plan 和单次 routine 的意图边界不回退，单次需求继续生成 `kind = "routine"`。
- [ ] 2.4 更新 AI Trace 记录中的计划草稿校验信息，便于定位三段式缺失、候选不足或非法动作 ID。

## 3. 服务端校验

- [ ] 3.1 更新 plan draft 结构校验，拒绝缺少三段式 sections、section 不一致或训练日数量不匹配的草稿。
- [ ] 3.2 更新动作 ID 校验，覆盖长期计划每个 section 内的所有动作。
- [ ] 3.3 增加计划层质量校验，覆盖训练日差异、时长估算、新手训练量、伤病限制和安全提示。
- [ ] 3.4 确认校验失败不会持久化未经校验的 AI 输出。

## 4. 计划卡片与导入保存

- [ ] 4.1 更新 `WorkoutPlanDraftCard`，展示计划层摘要、周期、递进说明、恢复策略和训练日角色。
- [ ] 4.2 更新训练日展示，按 `warmup`、`training`、`stretch` 展示动作，并保留动作详情入口。
- [ ] 4.3 更新 `convertWorkoutPlanDraftToWorkoutRoutine()`，将单个训练日的 sections 按顺序转换为 `WorkoutRoutine.items` 并保留 `section`。
- [ ] 4.4 更新计划导入排期逻辑，基于 `weeklyFrequency` 和结构化 `schedulePattern` 生成训练日与休息日。
- [ ] 4.5 确认重复导入只替换同一计划来源和导入区间内的旧 schedule。

## 5. 测试与文档

- [ ] 5.1 补充 `WorkoutPlanDraft` schema 测试，覆盖合法三段式计划和缺少/错配 section 的失败场景。
- [ ] 5.2 补充服务端校验测试，覆盖非法动作 ID、候选外动作、训练日重复、时长超限和安全提示缺失。
- [ ] 5.3 补充转换与排期测试，覆盖 section 保留、训练日循环、休息日生成和重复导入替换范围。
- [ ] 5.4 补充计划卡片测试，覆盖计划层信息、训练日切换、三段式展示、动作详情入口和导入状态。
- [ ] 5.5 更新 manual LLM consistency tests，校验长期计划输出 `kind = "plan"` 且每个训练日包含三段式 sections。
- [ ] 5.6 更新 README 或 `docs/database-design.md` 中关于聊天计划草稿、routine/schedule 转换和三段式长期计划的说明。

## 6. 验证

- [ ] 6.1 运行 `openspec validate improve-plan-push-composition --strict`。
- [ ] 6.2 运行相关自动化测试，至少覆盖 workout plan schema、validation、conversion、card 和排期逻辑。
- [ ] 6.3 运行 `npm run typecheck`。
- [ ] 6.4 运行 `npm run lint`。
- [ ] 6.5 如实现影响构建、路由或服务端/客户端模块边界，运行 `npm run build` 或记录无法运行原因。
