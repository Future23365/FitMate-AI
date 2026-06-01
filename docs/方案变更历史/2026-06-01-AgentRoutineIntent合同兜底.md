# Agent Routine Intent 合同兜底

时间：2026-06-01 22:39:49 +0800

## 背景

前两轮修复后，真实 trace 已经能让 Agent 使用 `candidateUse: "routine"` 检索上肢哑铃候选，并继续调用 `generateRoutineDraft`。新的失败点出现在工具入参校验：模型传入了用户明确给出的目标、时长、器械、候选集合和标题，但没有传 `experience` 与 `weeklyFrequency`，而 `generateRoutineDraft` 复用了长期计划的 `workoutPlanIntentSchema`，导致 schema validation 失败。

随后模型又以旧式 `failed + replyContext.reply` 返回终止结果，缺少 `failureCode`，解析层把原始工具失败二次降级成 `model_output_invalid`，用户最终只能看到“这次执行没有完成，我没有生成或修改训练结果。”

## 调整思路

这次不增加服务端自然语言判断，也不读取用户原文补语义。边界调整为：

- routine 工具继续复用统一 `WorkoutPlanIntent`，但在工具入口为单次编排不关键的结构字段提供合同默认值。
- 缺少 `experience` 时使用保守的 `beginner`，确保训练量偏安全。
- 缺少 `weeklyFrequency` 时使用 `1`，仅用于满足复用校验模型的长期计划字段。
- final result 解析层兼容旧式 `failed.replyContext.reply`，只补合法 `failureCode`，不改写失败状态或用户语义。

## 关键改动

- 新增 Agent routine intent 预处理 schema，覆盖 `generateRoutineDraft` 与 `validateRoutineDraft`。
- Agent prompt 明确 `generateRoutineDraft` 缺省字段可使用 `experience="beginner"` 与 `weeklyFrequency=1`。
- Agent final result prompt 补充 `failed.failureCode` 合同。
- `parseAgentToolDecision` 从只兼容旧式 `blocked` 扩展为兼容旧式 `failed`，避免字段位置错误掩盖真实工具失败。
- 测试覆盖缺省字段仍可生成 routine draft、旧式 failed 结果可归一化、prompt 包含 routine 默认字段和 failed 合同。

## 结果

`generateRoutineDraft` 不再因为单次 routine 缺少长期计划字段而直接 schema validation 失败。最新验证通过：

- `openspec validate fix-agent-exercise-facet-contract --strict`
- `npm test`：42 个测试文件，257 个测试通过
- `npm run typecheck`
