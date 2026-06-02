## 1. 校验边界重构

- [x] 1.1 梳理 `workout-plan-validation-service.ts` 当前所有 `errors` / `warnings` 写入点，确认哪些属于结构契约，哪些属于训练合理性诊断。
- [x] 1.2 将 `day_similarity_high`、`consecutive_load_high`、训练量偏高、休息偏短、新手容量偏高、section 语义分歧和用户历史偏好冲突统一降级为 warning。
- [x] 1.3 保留 `invalid_exercise_id`、`outside_candidate_exercise_id`、`empty_candidate_set`、Schema 解析失败、必要结构缺失和 payload 内部计数不一致作为 hard contract errors。
- [x] 1.4 为 plan / routine 校验传入字段来源，使 `session_too_long`、`session_too_short` 和 `weekly_frequency_mismatch` 只在用户明确约束下进入 errors。
- [x] 1.5 区分 `history` / `artifact` 中的用户确认约束和旧模型生成字段，只有前者可触发 hard fail。
- [x] 1.6 保留用户明确避免动作或具体训练禁忌的 hard fail；未主动提出或未确认的伤病限制不得作为 hard fail。
- [x] 1.7 确保用户明确要求重复当前 routine 时，`repeat_previous_routine` / `repeat_same_routine_with_progression` 计划不会因重复训练日或连续负荷失败。

## 2. 恢复分类与生成链路

- [x] 2.1 调整 `workout-plan-validation-recovery-service.ts`，只根据 `validation.errors` 判断失败、可恢复和硬边界。
- [x] 2.2 防止 warning 将未知 error 误包装成 recoverable，确保 warning 单独存在时不会触发 `plan_validation_failed`。
- [x] 2.3 更新 AI 修复 prompt 和失败引导文案，使它只针对契约失败修复，不再要求模型修复合理性 warning。
- [x] 2.4 检查 `DomainPlanEngine`、`PlanStrategy` 和 `/api/chat` 生成型 artifact 链路，确保字段来源能传递到校验层。

## 3. 测试覆盖

- [x] 3.1 更新 `tests/workout-plan-validation.test.ts`，覆盖三天重复同一 routine 时校验通过并记录 warning。
- [x] 3.2 增加测试覆盖 `day_similarity_high`、`consecutive_load_high` 不再进入 errors。
- [x] 3.3 增加测试覆盖默认或 LLM 推断的 `sessionMinutes` / `weeklyFrequency` 不触发 hard fail。
- [x] 3.4 增加测试覆盖旧模型生成或未确认 artifact 字段不触发 hard fail，用户确认的 history / artifact 约束仍可触发 hard fail。
- [x] 3.5 增加测试覆盖用户明确避免动作或具体训练禁忌仍可 hard fail，未主动提出或未确认的伤病限制不 hard fail。
- [x] 3.6 增加测试覆盖用户明确时长或频率被违反时仍进入可恢复契约失败。
- [x] 3.7 更新 `tests/ai-workout-plan-service.test.ts`，覆盖 warning 不触发失败恢复、未知 error 不被 warning 误分类。
- [x] 3.8 按需更新聊天服务测试，覆盖“今天明天后天都练这个”可以返回计划卡片。

## 4. 文档与验证

- [x] 4.1 在 `docs/方案变更历史` 新增变更记录，说明服务端移除训练合理性 hard fail 的原因和新边界。
- [x] 4.2 在 `docs/项目演变历程.md` 追加此次训练校验职责边界调整。
- [x] 4.3 运行 `openspec validate remove-workout-reasonableness-validation --strict`。
- [x] 4.4 运行相关自动化测试：`npm test -- --run tests/workout-plan-validation.test.ts tests/ai-workout-plan-service.test.ts`，如修改聊天链路则补跑对应 `tests/chat-service.test.ts`。
- [x] 4.5 如改动影响构建或服务端/客户端模块边界，运行 `npm run typecheck` 或说明无法运行的原因。
