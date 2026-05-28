# 手动 LLM 输入输出一致性测试

这组测试用于在修改 LLM prompt、AI 编排、模型参数或输出结构后，手动检查关键输入样例是否仍然得到符合预期的输出。它会调用真实 DeepSeek 模型，因此不会包含在 `npm run test` 中。

## 运行方式

```bash
DEEPSEEK_API_KEY=你的真实 key npm run test:llm
```

命令会自动读取项目根目录的 `.env*` 配置。缺少 `DEEPSEEK_API_KEY` 时，命令会明确报错，并说明不会使用 mock、旧快照或非真实模型结果。

运行开始时会输出本次测试的粗略 token 预估，包括预计 prompt tokens、预计 completion tokens 和预计总量。预估按当前用例规模粗略计算，最终以模型返回的 `usage` 为准。

运行结束后会输出真实 token 汇总，并生成验收报告：

```text
docs/manual-llm-consistency-latest-report.md
```

验收报告会记录用例通过/失败数量、总 token 消耗，以及类似“用户提问 / 大模型回答 / 本地意图解析结果”的简要结果，方便人工快速判断模型输出是否仍符合预期。命令结束后也会在终端打印报告摘要和部分样例结果，不需要打开完整报告就能做粗验收。

## 与默认测试的边界

- `npm run test` 仍只运行 `vitest.config.ts` 中的 `tests/**/*.test.ts`。
- 手动 LLM 测试位于 `manual-tests/llm/`，由 `vitest.llm.config.ts` 单独收集。
- 这组测试依赖外部模型、网络和账户额度，结果可能因为模型波动出现偶发失败。
- 失败时应先看失败报告里的调用点、用例名、输入摘要、实际输出和失败原因，再判断是 prompt 需要调整，还是 fixture 预期需要更新。
- 每次真实运行都会覆盖 `docs/manual-llm-consistency-latest-report.md`，该文件用于人工验收最新一次结果。

## 覆盖范围

当前测试矩阵覆盖以下 LLM 调用点：

- `chatIntentResolution`：聊天意图解析。
- `chatCompletion`：用户可见自然语言回复。
- `exerciseRecommendationGeneration`：动作推荐选择。
- `workoutPlanIntentExtraction`：训练计划意图抽取。
- `workoutPlanDraftGeneration`：长期计划和单次 routine 草稿生成。

当前测试矩阵覆盖以下主要分支：

- `general_fitness_advice`
- `exercise_recommendation`
- `workout_plan`
- `routine`
- `exercise_replacement`
- `exercise_explanation`
- `non_fitness`
- `canTriggerAction=true`
- `canTriggerAction=false`
- 信息不足追问和第一人称 `suggestedReplies`
- 显式动作列表默认时长
- 换一批复用 `fitnessConversationContext.currentIntent`
- 高风险健康提醒
- 候选充足、候选有限可用、候选不足表达
- 动作推荐普通推荐和 `excludedExerciseIds` 排除
- `WorkoutPlanIntent` 的 `plan`、`routine` 和默认值补齐
- `WorkoutPlanDraft` 与 `WorkoutRoutineDraft`

## 断言策略

结构化输出会做 JSON 解析和 Zod Schema 校验，并检查关键字段、候选动作 ID、排除动作和 routine 分段。

自然语言输出不做全文快照匹配，只检查稳定语义和禁止项，例如：

- 不输出内部 Trigger。
- 不输出 JSON fenced block。
- 不提及 `卡片`、`下方`、`后台生成` 等 UI 或系统流程字样。
- 高风险健康输入必须提醒咨询医生或专业人士。

## 维护规则

- 新增 LLM 调用点时，必须在 `manual-tests/llm/fixtures.ts` 中新增对应用例。
- 新增 prompt 分支时，必须补充最小覆盖 fixture。
- 如果只是模型措辞变化，不应把自然语言断言改成逐字匹配。
- 如果模型稳定输出已经合理变化，应同步更新 fixture 中的期望分支和断言。
