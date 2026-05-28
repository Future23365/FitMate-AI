## Why

当前长期计划推送仍接近“生成几套动作并按天摆放”的模型，缺少计划层结构、训练日分工和恢复节奏；同时单次编排已经支持热身、主训练、拉伸三段式，长期计划没有同步这套可执行语义。现在需要把长期计划从多日动作列表升级为可保存、可排期、可执行的训练周期草稿。

## What Changes

- **BREAKING**: 调整 `WorkoutPlanDraft` 结构，训练日不再只包含扁平 `items`，而是包含 `warmup`、`training`、`stretch` 三段式 sections，并显式表达计划周期、训练日数量、休息日、训练日类型、训练目标、恢复安排和计划节奏。
- 长期计划生成必须先形成计划层编排：区分“6 天计划”“每周 6 练”“未来 6 天每天练”等不同语义，再确定训练日分工、训练日顺序、休息/恢复间隔、每次训练时长和强度递进，而不是只生成多个彼此独立的 routine。
- 计划推送卡片必须展示计划层摘要、训练日分工、三段式动作结构、恢复提示和导入后的周期执行预期。
- 保存长期计划时，每个训练日必须转换为带有热身、主训练、拉伸 section 的 `WorkoutRoutine`，并按计划层节奏生成 `WorkoutSchedule`。
- 服务端校验必须覆盖长期计划的三段式完整性、周频率一致性、训练日差异、时长估算、候选动作合法性、伤病限制和新手训练量边界。
- 更新 AI prompt、Structured Output/Zod schema、前端卡片、转换逻辑、测试和相关文档，使 plan 与 routine 在可执行训练结构上保持一致，但在“多天计划”层保留不同语义。

## Capabilities

### New Capabilities

- `plan-push-composition`: 约束长期计划推送必须具备计划周期语义、训练日分工、三段式训练日结构、保存转换和周期导入规则。

### Modified Capabilities

- `test-coverage`: 增加长期计划三段式草稿、计划层编排、转换保存和排期的自动化验证要求。

## Impact

- 影响 AI 与校验层：
  - `lib/shared/workout-plans/draft-schema.ts`
  - `lib/server/ai/prompt-config.ts`
  - `lib/server/workout-plans/ai-workout-plan-service.ts`
  - `lib/server/workout-plans/workout-plan-validation-service.ts`
  - `lib/server/workout-plans/exercise-candidate-service.ts`
- 影响前端计划推送与保存：
  - `features/workouts/components/workout-plan-draft-card.tsx`
  - `features/workout-plans/lib/workout-routine-conversion.ts`
  - `features/chat/components/chat-page.tsx`
  - `features/chat/hooks/use-chat-controller.ts`
- 影响持久化写入路径：长期计划导入会继续保存为多个 `WorkoutRoutine` 和 `WorkoutSchedule`，但每个 routine 必须保留 section 与循环/阶段休息语义。
- 影响测试与文档：
  - manual LLM consistency 测试
  - workout plan draft schema/validation/conversion tests
  - README 或 `docs/database-design.md` 中关于聊天计划草稿、routine/schedule 转换的说明
