# visibleTrainingProposal 引用查询合同扩展

时间：2026-06-04 16:20:26 CST

## 真实问题

`visibleTrainingProposal` 落地后，模型只能通过 `readRecentVisibleTrainingProposal` 读取已经知道的上一轮事实引用。最新 trace 中，当前会话没有可引用方案时，模型没有一个可调用能力去确认“到底有没有上一轮可见训练方案”，于是把省略表达直接补全成动作刷新并调用 `searchExerciseResources`。

同一条 trace 还暴露出另一个模型可见合同问题：system prompt 把 `final_answer.visibleOutputs[].schemaVersion` 写成数字 `1`，而服务端 `VisibleOutputEnvelopeSchema` 要求字符串，模型复制数字后被结构校验拒绝并耗尽 repair。

## 调整思路

本次没有在 `/api/chat`、handler 或 renderer 中加入“换一批”这类短语判断，也没有让服务端根据用户原文替模型选择 tool。修复点放在 tool-first 合同：

- 将旧 `readRecentVisibleTrainingProposal` delete-only 重命名为 `inspectVisibleTrainingProposals`。
- 同一个 tool 使用 `operation = "list_recent" | "read_recent"` 区分“查询事实索引”和“读取具体事实”。
- `list_recent` 只返回当前 actor 和当前 conversation 可访问的轻量索引，并产出 diagnostic index resource；它不产出可消费训练方案事实。
- `read_recent` 只接受当前 run 可见索引或 metadata 中真实出现的 `factRef` / `messageId`，成功后才登记 `visible_training_proposal_fact` consumable resource。
- `searchExerciseResources` 继续只查询动作库，manifest 中说明可见训练方案引用状态应由 `inspectVisibleTrainingProposals` 查询。
- `visibleOutputs[].schemaVersion` 的模型可见说明、observation 和 repair feedback 统一改为字符串 `"1"`；服务端不新增数字兼容或自动转换。

## 关键改动

- 新增 `inspectVisibleTrainingProposals` tool bundle，支持 `list_recent` 和 `read_recent`。
- 新增 `visible_training_proposal_fact_index` diagnostic resource type，用于承载当前 run 的只读事实索引。
- 更新 production tool registry、tool manifest、prompt、renderer、terminal validator 和相关 replay 测试。
- 增强 `invalid_action` repair feedback：当模型输出数字 `schemaVersion: 1` 时，明确提示改为字符串 `"1"`。

## 验证结果

- `npm test -- tests/agent-tools/inspect-visible-training-proposals.test.ts`
- `npm test -- tests/agent-core/tool-registry-manifest.test.ts`
- `npm test -- tests/agent-core/agent-llm-prompt-config.test.ts`
- `npm test -- tests/agent-core/planner-validator.test.ts`
- `npm test -- tests/chat-service.test.ts`
- `npm test -- tests/agent-core/architecture-boundary.test.ts`
- `npm run typecheck`
