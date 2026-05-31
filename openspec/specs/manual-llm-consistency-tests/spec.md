# manual-llm-consistency-tests Specification

## Purpose
TBD - created by archiving change add-manual-llm-consistency-tests. Update Purpose after archive.
## Requirements
### Requirement: Manual LLM consistency tests are isolated

项目 MUST 提供一套只在开发者手动执行时运行的 LLM 输入输出一致性测试。该测试 MUST NOT 被 `npm run test` 自动发现、自动运行或作为常规 CI 风险门禁的一部分。

#### Scenario: Default test command excludes LLM consistency tests

- **WHEN** 开发者在项目根目录执行 `npm run test`
- **THEN** 系统 MUST NOT 运行任何真实 LLM 输入输出一致性测试
- **AND** 系统 MUST NOT 因缺少 `DEEPSEEK_API_KEY` 或外部模型网络不可用而导致 `npm run test` 失败

#### Scenario: Manual command runs LLM consistency tests

- **WHEN** 开发者执行专用手动 LLM 测试命令
- **THEN** 系统 MUST 运行 LLM 输入输出一致性测试
- **AND** 测试输出 MUST 明确显示被运行的 LLM 调用点、用例名称和通过或失败结果
- **AND** 测试开始前 MUST 输出本次运行的粗略 token 消耗预估

#### Scenario: Missing model configuration is explicit

- **WHEN** 开发者执行专用手动 LLM 测试命令但缺少必需模型配置
- **THEN** 系统 MUST 输出缺失配置名称
- **AND** 系统 MUST NOT 静默改用 mock、旧快照或非真实模型结果

### Requirement: Manual tests cover all current LLM call sites

手动 LLM 一致性测试 MUST 覆盖当前项目所有真实 LLM 调用点，并为每个调用点提供至少一个成功路径用例和关键分支用例。

#### Scenario: Chat intent resolution is covered

- **WHEN** 手动 LLM 一致性测试运行
- **THEN** 测试 MUST 覆盖 `/api/chat` 的聊天意图解析调用
- **AND** 测试 MUST 校验输出包含 `type`、`needsExerciseContext`、`canTriggerAction`、`missingActionFields` 和 `suggestedReplies`
- **AND** 需要动作上下文的分支 MUST 校验 `workoutIntent` 符合 `WorkoutPlanIntent` 结构

#### Scenario: Chat completion is covered

- **WHEN** 手动 LLM 一致性测试运行
- **THEN** 测试 MUST 覆盖 `/api/chat` 的用户可见回复调用
- **AND** 测试 MUST 校验回复是自然语言正文
- **AND** 回复 MUST NOT 包含内部 Trigger、JSON fenced block 或服务端流程字样

#### Scenario: Exercise recommendation generation is covered

- **WHEN** 手动 LLM 一致性测试运行
- **THEN** 测试 MUST 覆盖 `/api/ai/exercise-recommendations` 的动作推荐生成调用
- **AND** 测试 MUST 校验模型返回的每个 `exerciseId` 都来自输入候选动作
- **AND** 换一批用例 MUST 校验模型没有返回 `excludedExerciseIds` 中的动作

#### Scenario: Workout plan intent extraction is covered

- **WHEN** 手动 LLM 一致性测试运行
- **THEN** 测试 MUST 覆盖 `/api/ai/workout-plan` 的训练计划意图抽取调用
- **AND** 测试 MUST 校验输出符合 `WorkoutPlanIntent`
- **AND** 测试 MUST 覆盖 `plan` 和 `routine` 两种 `intentType`

#### Scenario: Workout draft generation is covered

- **WHEN** 手动 LLM 一致性测试运行
- **THEN** 测试 MUST 覆盖 `/api/ai/workout-plan` 的训练草稿生成调用
- **AND** 长期计划用例 MUST 校验输出符合 `WorkoutPlanDraft`
- **AND** 单次训练用例 MUST 校验输出符合 `WorkoutRoutineDraft`
- **AND** 所有草稿动作的 `exerciseId` MUST 来自输入候选动作

### Requirement: Manual tests cover current LLM branches

手动 LLM 一致性测试 MUST 覆盖当前 prompt 和服务端 LLM 输入输出契约中的主要分支，避免只验证单一路径。

#### Scenario: Chat intent branches are covered

- **WHEN** 手动 LLM 一致性测试运行聊天意图解析用例
- **THEN** 测试 MUST 覆盖 `general_fitness_advice`、`exercise_recommendation`、`workout_plan`、`routine`、`exercise_replacement`、`exercise_explanation` 和 `non_fitness`
- **AND** 测试 MUST 覆盖 `canTriggerAction=true` 和 `canTriggerAction=false`
- **AND** 信息不足用例 MUST 校验 `missingActionFields` 非空且 `suggestedReplies` 使用用户第一人称口吻

#### Scenario: Conversation context branches are covered

- **WHEN** 手动 LLM 一致性测试运行包含上下文的用例
- **THEN** 测试 MUST 覆盖复用 `fitnessConversationContext.currentIntent` 的换一批动作场景
- **AND** 测试 MUST 覆盖从 `fitnessConversationContext.knownFacts` 沿用目标、器械、经验或限制的场景

#### Scenario: Safety and non-fitness branches are covered

- **WHEN** 手动 LLM 一致性测试运行安全相关用例
- **THEN** 高风险健康场景 MUST 在可见回复中触发咨询医生或专业人士的安全提醒
- **AND** 非健身问题 MUST 输出 `type=non_fitness`
- **AND** 非健身问题 MUST NOT 请求动作上下文或触发训练生成动作

#### Scenario: Candidate state branches are covered

- **WHEN** 手动 LLM 一致性测试运行带动作候选上下文的可见回复用例
- **THEN** `candidateStatus=enough` 和 `candidateStatus=limited_but_usable` 用例 MUST NOT 表达动作库无匹配
- **AND** `candidateStatus=insufficient` 用例 MUST 允许说明当前候选不足并建议放宽条件

#### Scenario: Draft generation branches are covered

- **WHEN** 手动 LLM 一致性测试运行训练草稿生成用例
- **THEN** `plan` 用例 MUST 输出 `days`
- **AND** `routine` 用例 MUST 输出 `kind="routine"` 和 `sections`
- **AND** `routine` 用例 MUST 包含 `warmup`、`training` 和 `stretch` 三个阶段

### Requirement: Manual tests report actionable failures

手动 LLM 一致性测试失败时 MUST 输出足够定位问题的信息，帮助开发者判断是 prompt 变化、模型输出漂移、输入 fixture 过期还是服务端结构校验失败。

#### Scenario: Structural assertion fails

- **WHEN** 模型输出没有通过 JSON 解析、Schema 校验或关键字段断言
- **THEN** 测试失败报告 MUST 包含调用点名称、用例名称、期望断言、实际输出和失败原因

#### Scenario: Natural language guardrail fails

- **WHEN** 可见回复包含内部 Trigger、JSON fenced block、候选外动作名或禁止的 UI 流程字样
- **THEN** 测试失败报告 MUST 标出命中的禁止项
- **AND** 测试失败报告 MUST 保留模型原始正文

#### Scenario: Flow failure records downstream skipped turns

- **WHEN** 多轮黑盒流程中的任意一轮失败
- **AND** 同一 fixture 中仍有后续轮次
- **THEN** 验收报告 MUST 将后续轮次记录为 skipped
- **AND** skipped 记录 MUST 包含导致跳过的失败摘要
- **AND** 本次运行的报告轮次数 MUST 等于 fixture 中定义的总轮次数

#### Scenario: Manual run summary is emitted

- **WHEN** 专用手动 LLM 测试命令结束
- **THEN** 系统 MUST 输出测试总数、通过数、失败数和被跳过数
- **AND** 系统 MUST 输出模型返回的 `prompt_tokens`、`completion_tokens` 和 `total_tokens` 汇总
- **AND** 任一非跳过测试失败时命令 MUST 以非零退出码结束

#### Scenario: Acceptance report is written

- **WHEN** 专用手动 LLM 测试命令结束
- **THEN** 系统 MUST 生成一份测试后验收文档
- **AND** 验收文档 MUST 包含用例通过/失败数量、真实 token 汇总和简要人工验收结果
- **AND** 简要人工验收结果 MUST 能展示用户提问、大模型回答摘要和本地解析或断言结果

