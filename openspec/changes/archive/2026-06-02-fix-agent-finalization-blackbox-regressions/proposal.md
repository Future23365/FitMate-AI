## Why

最新 `docs/manual-llm-blackbox-flow-latest-report.md` 显示，`/api/chat` 切到 Tool-first Agent 后基础黑盒从 27 轮全通过退化为 5 轮通过、9 轮失败、13 轮跳过。主要问题不是旧 intent 缺失，而是新 Agent 工具链在动作推荐、首个 routine/plan artifact 创建和最终结果投影上没有稳定闭环。

## What Changes

- 修复动作推荐投影：当 Agent 已成功调用 `searchExercises(candidateUse="recommendation")` 时，即使最终 `answered` 漏写 `usedToolResultIds`，系统仍可基于本轮工具结果生成推荐卡片。
- 修复动作 facet 合同：模型工具入参中的常见短 facet（如 `胸`、`胸肌`、`腿部`）应被规范化到动作库真实 facet 或 body region 展开结果，避免可恢复搜索被错误阻断。
- 修复首个训练 artifact 创建：`saveConversationArtifactRevision` 工具必须支持“创建新的 routine/plan artifact”和“基于旧 artifact 创建 revision”两种写入边界。
- 修复直接长期计划生成：`generatePlanDraft` 在没有历史 routine/plan artifact 时，可以使用本轮受控候选集合生成种子训练模板，再由 `DomainPlanEngine` 展开 plan。
- 收窄黑盒报告卡片类型统计：当同一轮已经产生训练卡片时，`answered` 状态不应被当成额外用户可见卡片类型导致假失败。
- 不恢复旧 intent-first、旧 `assistant_action`、旧 ReferenceResolver-first 或服务端自然语言语义纠偏。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `chat-exercise-recommendation-trigger`: 动作推荐卡片必须可从本轮 Agent 推荐候选工具结果稳定投影，不能因最终结果漏写引用 id 而丢卡。
- `chat-routine-composition`: 首次生成 routine 时，Agent 写工具必须能创建新的 routine artifact，而不是只支持已有 artifact revision。
- `plan-push-composition`: 首次生成长期 plan 时，Agent plan draft 工具必须支持从本轮候选集合生成计划种子，而不是强制要求已有 source artifact。
- `chat-blackbox-llm-flow-tests`: 报告的“实际卡片类型”必须反映用户可见训练卡片，不能把 Agent `answered` 状态误算为训练卡片之外的额外卡片。

## Impact

- 影响 `lib/server/agent-orchestrator/*`、`lib/server/chat/chat-service.ts`、`lib/server/exercises/exercise-service.ts`。
- 影响 `manual-tests/llm/blackbox-runner.ts` 的用户可见卡片统计。
- 影响 `tests/agent-orchestrator.test.ts`、`tests/chat-service.test.ts`、`tests/exercise-service.test.ts`。
- 不修改数据库 schema、HTTP API 契约或前端卡片组件结构。
