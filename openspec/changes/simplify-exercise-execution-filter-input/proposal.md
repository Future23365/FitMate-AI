## Why

当前 `searchExerciseResources` 已经暴露 execution taxonomy 的底层字段，但这些字段更接近数据库事实而不是用户语义。模型需要自己组合 `requiresExternalEquipment`、`supportRequirementTags`、`setupComplexityMax` 等字段来表达“无器械”“居家支撑”“健身房器械”等常见约束，容易把“无外部器械”和“完整无器械/无固定设施/只需垫子”混为一谈。

本 change 将动作执行条件收敛为少量模型可见高层输入，由服务端 adapter 确定性映射到数据库 taxonomy 查询条件。这样模型仍负责自然语言语义理解和枚举选择，服务端只做 schema 校验、权限/安全边界和数据库过滤，不新增关键词分流或用户原文特判。

## What Changes

- **BREAKING**：调整 `searchExerciseResources` 的模型可见 input schema，弃用模型可见底层 taxonomy 输入：
  - `requiresExternalEquipment`
  - `requiredEquipmentTags`
  - `supportRequirementTags`
  - `setupComplexityMax`
  - `impactLevelMax`
  - `noiseLevelMax`
- 新增模型可见高层执行条件字段：
  - `executionProfile`：表达无器械、居家支撑、小型器械、健身房器械、搭档辅助、户外空间等用户语义口径，其中小型器械使用 `small_equipment`。
  - `equipmentScope`：表达用户明确拥有或希望使用的器械集合，并区分“兼容这些可用器械”和“必须使用其中一种器械”。
  - `impactLimit`：表达冲击等级上限。
  - `noiseLimit`：表达噪音等级上限。
- 新增 `searchExerciseResources` 服务端查询 adapter，将上述高层字段确定性映射到 `Exercise` 的 execution taxonomy 字段、数组 containment / overlap 条件和等级上限条件。
- 更新 tool description、schema description、facet catalog、query summary、model-visible summary、user projection 和 trace summary，避免模型继续看到或复制底层查询字段。
- 更新 `requiredExerciseIds` 与执行条件冲突诊断，将冲突字段指向新的模型可见字段，同时保留内部 taxonomy conflict details 供 trace 复盘。
- 更新 tool-level tests、production catalog / model-visible contract tests 和 OpenSpec 验证，覆盖新字段、旧字段拒绝、数据库映射、projection / trace 边界。
- 不新增第二个动作查询 tool，不修改 LangChain runtime 主循环、provider payload、`/api/chat` 主链路、production response adapter 或 finalization tool。
- 不新增服务端关键词、正则、同义词表、固定短句模板、用户 phrasing 特判或 provider `tool_calls` 改写。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-exercise-resource-query-tool`: 收敛 `searchExerciseResources` 的 execution taxonomy 模型可见输入，新增高层执行条件字段，并规定这些字段到数据库 taxonomy 查询条件的确定性映射。

## Impact

- 影响 Agent tool 合同与实现：
  - `lib/server/langchain-agent/tools/exercise-resource-tools.ts`
  - `lib/server/exercises/exercise-repository.ts`
  - `lib/server/exercises/exercise-resource-filter-policy.ts`
  - `lib/server/langchain-agent/model-visible-contract-gate.ts`
- 影响共享 taxonomy / 查询辅助：
  - `lib/shared/exercises/execution-taxonomy.ts`
- 影响测试：
  - `tests/langchain-agent-tools/search-exercise-resources.test.ts`
  - `tests/langchain-agent-tools/production-tool-catalog.test.ts`
  - `tests/langchain-agent-tools/model-visible-contract-gate.test.ts`
- 影响 OpenSpec：
  - `openspec/specs/agent-exercise-resource-query-tool/spec.md`
  - `openspec/changes/simplify-exercise-execution-filter-input/specs/agent-exercise-resource-query-tool/spec.md`
- 不影响：
  - Prisma schema、migration 或动作回填数据
  - 动作数据回填脚本
  - LangChain runtime 主循环
  - model factory provider payload
  - production response adapter 主流程
  - `/api/chat` 主链路
  - `submitVisibleTrainingProposal` 的最终动作数据库事实校验
