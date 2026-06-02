## Why

当前 Tool-first Agent 主链已经能让 LLM 调用工具，但部分生成类工具偏离了原始边界：`generateRoutineDraft` 和 `generatePlanDraft` 不是执行 LLM 已产出的编排草稿，而是在服务端根据候选动作、动作元数据和本地规则生成完整 routine / plan。这样会把“哪个动作属于热身、主训练、拉伸”“长期计划怎么展开”等训练语义从 LLM 转移到服务端，违反“LLM 做语义决策、Tool 只执行和校验”的架构原则。

这次 change 需要重新梳理全部 Agent Tool 的能力边界，并把训练生成链路重构为 LLM-authored draft：LLM 通过纯读取 / 纯搜索工具获取动作、artifact 和 memory 事实，再输出完整结构化 routine / plan / patch；服务端工具只负责资源引用、确定性校验、Policy 和保存。

## What Changes

- 增加完整 Agent Tool 合同审计文档，逐个列出每个 Tool 需要传什么、执行什么、返回什么、哪些行为不允许。
- **BREAKING** 调整搜索类 Tool 语义：`searchExercises` 和 `searchArtifacts` 必须退回纯搜索职责，移除 `candidateUse`、`resultRequirements`、`sectionCoverage`、`satisfied` 等编排层字段。
- **BREAKING** 调整 `generateRoutineDraft` 语义：不再由服务端从 `candidateExerciseIds` 自动编排 routine；改为接收 LLM 产出的完整 `WorkoutRoutineDraft` 或等价 structured sections，再登记为本轮 draft resource。
- **BREAKING** 调整 `generatePlanDraft` 语义：不再由服务端 `DomainPlanEngine` 直接展开完整 plan draft；改为接收 LLM 产出的完整 `WorkoutPlanDraft` 或等价 structured plan，再登记为本轮 draft resource。
- 将 `generateRoutineDraft` / `generatePlanDraft` 的目标语义收敛为 `registerRoutineDraft` / `registerPlanDraft`：如果实现阶段保留旧名称，也只能作为登记工具执行。
- 将 `proposeWorkoutEditPlan` / `proposeWorkoutPatch` 的目标语义收敛为 `registerWorkoutEditPlan` / `registerWorkoutPatch`，强调这些工具只登记 LLM-authored 结构化资源。
- 保留 `validateRoutineDraft` / `validatePlanDraft` / `evaluatePolicy` / `saveConversationArtifactRevision` 的资源合同，强化它们只消费已登记 draft / patch / validation / policy 的边界。
- 将 `DomainPlanEngine` 降级为确定性 schedule / calendar 展开或校验辅助，不再从用户自然语言、候选动作或 source template 生成训练语义草稿。
- 废弃或重写 `section-aware-routine-candidate-pools` 中“服务端按 sectionPools 分段生成 routine”的错误方向；热身 / 拉伸默认无器械应表达为纯动作搜索 filters 或确定性搜索默认，不应表达为生成候选池覆盖要求。
- 删除服务端基于 `latestUserMessage` 正则推断长期计划策略、强度、周期或约束的生产使用路径；这些字段必须来自 LLM 结构化输出或确定性已确认事实。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-tool-capability-contract`: 增加完整 Agent Tool 合同审计要求，明确搜索类 Tool 必须保持纯检索，生成类 Tool 必须接收 LLM-authored structured draft，而不得自行生成训练语义。
- `tool-first-agent-orchestrator`: 明确 Tool-first Agent Loop 的职责边界：LLM 负责语义决策和草稿结构，Tool 负责执行、校验、登记和保存。
- `chat-routine-composition`: 修改 routine 生成合同，要求 LLM 输出完整 routine sections，服务端不得用动作元数据替 LLM 编排 section。
- `plan-push-composition`: 修改 plan 生成合同，要求 LLM 输出完整长期计划草稿，服务端不得用 `DomainPlanEngine` 自动生成训练日语义。
- `domain-plan-engine`: 将 DomainPlanEngine 从计划语义生成器收缩为确定性 schedule / calendar 展开和一致性校验辅助。
- `workout-generation-validation-recovery`: 调整 validation recovery 边界，失败恢复只能要求 LLM 修复结构化 draft 或重新搜索动作，不得让服务端补写语义编排。

## Impact

- 影响 `lib/server/agent-orchestrator/workout-tools.ts` 中 `generateRoutineDraft`、`generatePlanDraft`、`proposeWorkoutPatch`、draft / patch resource 登记、validation resource 解析和保存 payload 解析。
- 影响 `lib/server/workout-plans/domain-plan-engine.ts` 的职责边界，移除或隔离自然语言正则推断和 plan draft 自动展开生产路径。
- 影响 `lib/server/agent-orchestrator/readonly-tools.ts` 中 `searchExercises`、`searchArtifacts` 的输入 schema、输出说明和资源登记，确保它们返回纯搜索结果而不是生成候选集合。
- 影响 `lib/server/ai/prompt-config.ts` 中工具调用说明，要求 LLM 在生成工具输入中提交完整 structured draft。
- 影响 `tests/agent-orchestrator.test.ts`、`tests/domain-plan-engine.test.ts`、`tests/workout-plan-validation.test.ts`、`tests/readonly-tools.test.ts` 和手动 LLM 黑盒 flow。
- 影响已有 change `section-aware-routine-candidate-pools` 的实现方向；该 change 不应按原设计实现，应由本 change 的 LLM-authored draft 边界重新收敛。
- 不修改 Prisma Schema、数据库迁移、动作库原始数据、用户权限模型或前端视觉结构。
