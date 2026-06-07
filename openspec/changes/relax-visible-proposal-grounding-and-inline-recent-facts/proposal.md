## Why

当前 `visibleTrainingProposal` 把“动作必须来自当前 run 可消费事实来源”作为 hard fail，导致模型输出数据库中真实存在且 section 合法的动作时，仍可能因为未出现在本轮 tool result 的对应 group 中被拒绝。与此同时，`inspectVisibleTrainingProposals` 要求模型先 `list_recent` 再 `read_recent` 才能复用历史方案，增加了模型规划分支和失败面。

本 change 的目标是把服务端 hard 校验收敛到确定性数据库事实和结构边界，并把历史可见训练方案读取封装进一次 tool 调用，降低模型选择复杂度，同时保留权限、状态、schema 和 trace 诊断边界。

## What Changes

- 调整 `visibleTrainingProposal` terminal output 校验：新生成卡片的 `exerciseItems[*].exerciseId` 不再要求必须出现在当前 run 的 `toolResults.groups.<section>.exercises[]` 或 consumable resource 中。
- 保留并强化数据库事实 hard 校验：`exerciseId` 必须存在、发布态可展示、当前用户可访问，且 `exerciseItems[*].section` 必须被数据库 `allowedSections` 覆盖。
- 将当前 run 动作来源从 hard fail 降级为 provenance / trace diagnostic；缺少当前 run 来源时不得阻断已通过数据库事实校验的 `visibleTrainingProposal`。
- 删除模型可见的 `inspectVisibleTrainingProposals(operation = "read_recent")` 分支；历史方案事实读取、权限校验和 consumable resource 登记由 `list_recent` 一次完成。
- 将 `inspectVisibleTrainingProposals(operation = "list_recent")` 改为查询当前 actor 和当前 conversation 中历史生成并已展示的 `visibleTrainingProposal` 事实，返回可复用的受控压缩事实，并登记当前 run 可消费 resource。
- 更新模型可见 output contract、tool manifest、schema summary、examples、observation 和 repair feedback，移除“必须 `read_recent`”和“新卡片动作必须来自当前 run 来源”的强规则。
- 不新增服务端自然语言关键词路由、短句模板、同义词判断或具体 `toolName` 语义分支。
- **BREAKING**: `inspectVisibleTrainingProposals` 的模型可见 input contract 不再支持 `operation = "read_recent"`；相关测试、manifest 和 replay fixture 需要同步更新。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `visible-training-proposal-validation`: 将当前 run 动作来源从 hard fail 改为诊断信息，保留数据库事实、section、payload、prescription 和 schedule hard 校验。
- `visible-proposal-reference-tool`: 收敛 `inspectVisibleTrainingProposals` 为一次 `list_recent` 可消费事实查询，移除模型可见 `read_recent` 分支。
- `agent-visible-output-contracts`: 更新 `visibleTrainingProposal` 模型可见 output contract，使其表达数据库事实校验和历史事实一次导入的新 grounding 边界。

## Impact

- 影响 `lib/server/visible-training-proposals/visible-training-proposal-validator.ts`、`visible-training-proposal-exercise-facts.ts` 及相关 terminal output validation metadata。
- 影响 `lib/server/agent-tools/exercise-facts/inspect-visible-training-proposals.tool.ts` 的 input schema、handler、resource contract、model/user projection、trace projection 和 tests。
- 影响 `lib/server/config/agent-visible-output-contracts.ts` 以及相关 prompt / manifest / model input builder 测试。
- 影响依赖 `current_run_source_missing`、`read_recent`、`visible_training_proposal_fact_index` 或二阶段历史读取的 `tests/chat-service.test.ts`、`tests/visible-training-proposal-validator.test.ts`、`tests/agent-tools/inspect-visible-training-proposals.test.ts` 和 registry manifest 测试。
- 不改变 `/api/chat` 的生产入口职责，不绕过 `ToolRegistry`、`Policy Guard`、`ResourceStore`、terminal output validator 或 Response Renderer。
