## Why

本次失败的核心不是“上一轮没有卡片”，而是当前 run 的模型可见输入暴露了会被误用的历史业务引用。`run.metadata.recentVisibleTrainingProposals` 带着具体 `factRef/messageId`，但这些值只是跨轮业务事实索引，不是当前 run 已登记的 `resourceId`，也不是可直接支撑 `final_answer.usedRefs.resource.id` 的资源引用。

模型在没有调用 `inspectVisibleTrainingProposals` 的情况下，把 metadata 里的业务引用写进了 terminal grounding。服务端正确地返回 `resource_missing`，但 repair feedback 没有说明 `resource.id` 与业务引用的区别，导致模型继续重复同类错误并触发 `repair_limit_exceeded`。

## What Changes

- `run.metadata.recentVisibleTrainingProposals` 只保留不含具体引用 id 的最近可见方案状态摘要，不能作为 `read_recent` 输入或 `usedRefs.resource.id` 来源。
- `inspectVisibleTrainingProposals(operation = "read_recent")` 只接受本轮 `list_recent` result 或 `visible_training_proposal_fact_index` diagnostic resource 中真实出现的引用值，不再从 run metadata 读取引用。
- `inspectVisibleTrainingProposals` manifest / schema description / observation 明确：`factRef/messageId` 只能用于 `read_recent.ref.value`，不能作为 terminal resource id。
- `inspectVisibleTrainingProposals` examples 只保留安全 `list_recent` 示例，不再提供可被照抄的假 `factRef`。
- 默认 Agent prompt 明确 `usedRefs.resource.id` 必须是当前 run 登记的 `resourceId`，通常来自 `fulfillment.producedResources[].resourceId`；若事实来自 satisfied tool result，优先使用 `usedRefs.type = "tool_result"`。
- `resource_missing` repair feedback 收敛为通用 domain facts，指出错误路径是 `usedRefs.resource.id`，并给出当前 run resourceId、satisfied tool result 或合法 `visibleOutputs` 的恢复方向；不在 agent-core 写具体业务 toolName 分支。

## Capabilities

### Modified Capabilities

- `visible-proposal-reference-tool`: 收紧 metadata、`list_recent` 和 `read_recent` 的引用边界。
- `visible-proposal-read-recent-contract`: 明确 `read_recent` 的可见引用来源和 fake example 禁止规则。
- `agent-llm-prompt-configuration`: 明确 resource grounding 与业务引用 id 的区别。
- `agent-tool-contract-kernel`: 增强 terminal resource 缺失的通用 repair feedback。

## Impact

- 影响模型可见输入与 tool manifest：
  - `lib/server/config/agent-llm-prompt-config.ts`
  - `lib/server/agent-tools/exercise-facts/inspect-visible-training-proposals.tool.ts`
  - `lib/server/visible-training-proposals/visible-training-proposal-fact-store.ts`
- 影响 terminal action validator 的通用 repair feedback：
  - `lib/server/agent-core/action-validator.ts`
- 影响测试：
  - tool-level `inspectVisibleTrainingProposals` tests
  - prompt / manifest snapshot tests
  - chat service replay tests
  - resource grounding validator tests

不新增服务端自然语言关键词分流、用户短语特判、业务 toolName core 分支或跨 run 资源自动导入。
