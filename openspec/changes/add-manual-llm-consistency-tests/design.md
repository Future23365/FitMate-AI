## Context

当前 LLM 链路按调用点集中在 `lib/server/ai/prompt-config.ts`，运行时由 `/api/chat`、`/api/ai/exercise-recommendations` 和 `/api/ai/workout-plan` 组装输入并校验输出。已有 `npm test` 通过 Vitest 运行 `tests/**/*.test.ts`，适合确定性逻辑和 mock 外部依赖的自动化测试；但 LLM 输入输出一致性测试会调用真实模型或校验真实 prompt 行为，成本、稳定性和网络依赖都不适合放入默认测试套件。

本 change 只为后续实现定义一套手动 LLM 契约测试：它用于人工在改 prompt、AI 编排或模型接入后主动运行，检查关键输入样例是否仍得到符合预期的结构、字段和分支语义。

## Goals / Non-Goals

**Goals:**

- 提供独立于 `npm run test` 的手动 LLM 测试入口。
- 覆盖当前所有 LLM 调用点：聊天意图解析、聊天可见回复、动作推荐、训练计划意图抽取、长期计划草稿生成、单次 routine 草稿生成。
- 覆盖当前主要分支：健身建议、动作推荐、换一批、长期计划、单次训练、动作替换、动作讲解、非健身问题、信息不足追问、高风险健康提醒、候选不足表达、plan/routine 草稿分流。
- 用结构化 fixture 记录每个测试用例的输入、期望输出字段、允许的文本断言和失败判定。
- 在测试失败时输出可定位的调用点、用例名、输入摘要、实际输出和失败原因。

**Non-Goals:**

- 不把真实 LLM 调用纳入 `npm run test`。
- 不修改线上 prompt 文案、模型名称、API 契约、AI 输出结构或业务逻辑。
- 不替代现有单元测试、服务测试、Schema 校验或候选动作确定性测试。
- 不要求测试结果完全逐字匹配自然语言正文，只校验稳定的结构、关键字段和禁止项。

## Decisions

### Decision: 使用独立手动脚本，而不是纳入 Vitest 默认 include

后续实现应新增独立命令，例如 `npm run test:llm` 或等价脚本。该命令可以调用专用脚本或专用 Vitest 配置，但文件命名和配置必须确保 `npm run test` 当前的 `tests/**/*.test.ts` 不会自动发现这些用例。

备选方案是直接新增 `tests/llm-consistency.test.ts` 并在用例里默认 skip。该方案容易被 `npm run test` 扫描，且 skip 状态会让默认测试输出混入手动测试信息，因此不采用。

### Decision: 测试边界按 LLM 调用点组织

测试用例应按真实调用点组织，而不是按页面或前端流程组织。每个调用点固定输入构造、模型请求参数、输出解析和断言规则，便于在 prompt 或调用链变化时定位是哪一层契约变化。

当前建议的分组为：

- `chatIntentResolution`：断言结构化意图 JSON、`type`、`needsExerciseContext`、`workoutIntent`、`canTriggerAction`、`missingActionFields`、`suggestedReplies`。
- `chatCompletion`：断言自然语言正文、禁止内部 JSON/Trigger、候选不足或高风险提示语义。
- `exerciseRecommendationGeneration`：断言只选择候选内 `exerciseId`，换一批时避开 `excludedExerciseIds`。
- `workoutPlanIntentExtraction`：断言 `WorkoutPlanIntent` 字段和 plan/routine 分流。
- `workoutPlanDraftGeneration`：分别断言 `WorkoutPlanDraft` 和 `WorkoutRoutineDraft` 的 Schema、候选动作 ID 和分区规则。

### Decision: 自然语言只做语义和禁止项断言

聊天可见回复等自然语言输出不应做全文快照匹配。测试应断言它不包含内部 Trigger、JSON fenced block、UI 流程字样或候选外动作名，并在需要时断言必须包含安全提醒、追问缺失信息或自然过渡语义。

备选方案是保存完整 golden 文本。该方案对模型措辞过度敏感，会让测试频繁因无害表达变化失败，因此不采用。

### Decision: 真实模型调用必须显式 opt-in

手动测试应要求显式环境变量或命令参数，例如需要 `DEEPSEEK_API_KEY`，并在缺少配置时清晰失败或跳过。测试输出必须提示会产生外部模型调用、成本和不稳定性，避免开发者误以为它是无副作用的本地单元测试。

### Decision: 用 fixture 记录“输入 + 期望输出约束”

每个用例应包含：

- 调用点名称。
- 输入消息、`conversationContext`、候选动作、排除动作或 intent。
- 期望分支和关键字段。
- 输出 Schema 或自定义断言。
- 禁止项，例如内部 Trigger、候选外 `exerciseId`、Markdown fenced block。

这样 fixture 可以随着 prompt 演进被 review，而不是把预期散落在脚本条件里。

## Risks / Trade-offs

- [Risk] 真实模型输出存在随机性，可能出现偶发失败。→ Mitigation: 只断言稳定结构和关键语义，避免逐字匹配；失败报告保留原始输出方便人工判断。
- [Risk] 手动测试调用外部模型会增加成本和耗时。→ Mitigation: 不接入 `npm run test`，并要求显式手动运行。
- [Risk] 只测 prompt 行为可能掩盖服务端校验问题。→ Mitigation: 手动 LLM 测试只覆盖 LLM 输入输出一致性，服务端 Schema、候选筛选和持久化仍由现有自动化测试覆盖。
- [Risk] 用例矩阵过大导致维护困难。→ Mitigation: 以每个调用点的关键分支为最小覆盖单元，新增 prompt 分支时同步补 fixture。
