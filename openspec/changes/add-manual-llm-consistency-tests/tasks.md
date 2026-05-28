## 1. 测试边界与运行入口

- [ ] 1.1 盘点当前真实 LLM 调用点和 prompt 配置，确认测试矩阵覆盖 `chatIntentResolution`、`chatCompletion`、`exerciseRecommendationGeneration`、`workoutPlanIntentExtraction` 和 `workoutPlanDraftGeneration`。
- [ ] 1.2 新增专用手动 LLM 测试入口，例如 `npm run test:llm` 或等价脚本，并确保该入口不会被 `npm run test` 调用。
- [ ] 1.3 将手动 LLM 测试文件放在不会匹配当前 Vitest `tests/**/*.test.ts` include 的路径或命名下，或使用独立测试配置隔离默认测试。
- [ ] 1.4 在缺少 `DEEPSEEK_API_KEY` 或必需模型配置时输出明确错误或跳过说明，禁止静默使用 mock 或旧快照冒充真实 LLM 结果。

## 2. LLM 输入 Fixture 与断言工具

- [ ] 2.1 新增结构化 fixture，记录每个用例的调用点、输入消息、`conversationContext`、intent、候选动作、排除动作和期望输出约束。
- [ ] 2.2 新增 JSON 解析、Schema 校验、候选动作 ID 校验、禁止项检测和失败报告工具。
- [ ] 2.3 为自然语言输出实现稳定断言，只校验关键语义和禁止项，不做完整正文快照匹配。
- [ ] 2.4 失败报告需要包含调用点名称、用例名称、输入摘要、实际输出、期望断言和失败原因。

## 3. 分支覆盖用例

- [ ] 3.1 为聊天意图解析补齐 `general_fitness_advice`、`exercise_recommendation`、`workout_plan`、`routine`、`exercise_replacement`、`exercise_explanation` 和 `non_fitness` 用例。
- [ ] 3.2 为聊天意图解析补齐 `canTriggerAction=true`、`canTriggerAction=false`、信息不足追问、第一人称 `suggestedReplies`、显式动作列表默认时长和换一批复用上下文用例。
- [ ] 3.3 为聊天可见回复补齐自然过渡、信息不足追问、高风险健康提醒、候选充足、候选可用但有限、候选不足和禁止内部 Trigger 输出用例。
- [ ] 3.4 为动作推荐生成补齐普通推荐和换一批用例，断言返回动作来自候选并避开 `excludedExerciseIds`。
- [ ] 3.5 为训练计划意图抽取补齐 `plan`、`routine` 和默认值补齐用例。
- [ ] 3.6 为训练草稿生成补齐长期计划 `WorkoutPlanDraft` 和单次训练 `WorkoutRoutineDraft` 用例，断言草稿动作 ID 来自候选，routine 包含 `warmup`、`training`、`stretch` 三段。

## 4. 文档与验证

- [ ] 4.1 文档化手动 LLM 测试的运行命令、环境变量、外部模型调用成本、适用场景和失败处理方式。
- [ ] 4.2 运行 `npm run test`，确认默认测试不会执行手动 LLM 一致性测试，也不会依赖模型配置。
- [ ] 4.3 在具备模型配置时手动运行专用 LLM 测试命令，记录通过、失败或因环境无法运行的原因。
- [ ] 4.4 运行 `npm run typecheck`，确认新增脚本、fixture 和断言工具类型正确。
- [ ] 4.5 运行 `openspec validate add-manual-llm-consistency-tests --strict`，确认 OpenSpec change 有效。
