## Why

当前 `toModelObservation` 已经从安全事实投影扩张成业务决策提示：部分 tool observation 会告诉 Planner `supportsOutputKinds`、`supportsSuccessfulVisibleOutputs`、`nextActionHints` 或 `finalAnswerSupport`。这会把 tool 查询到的确定性事实误包装成“是否符合用户目标、应输出什么 kind、下一步该做什么”的判断，导致模型自主判断 `routine` / `plan` 等业务形态时被中间 tool 投影带偏。

本 change 要把 `toModelObservation` 拉回原始职责：只传递事实、事实覆盖和确定性诊断，不替 Planner 判断用户要求是否满足，不替 output contract / validator 决定最终结构化输出。

本 change 同时澄清一个实现边界：正常成功 tool result 的 model observation 不提供下一步 action 建议；非法 action、重复 tool input 或 schema/domain validation 失败只能通过独立 `repairContext` 暴露字段级错误、当前事实和可恢复边界，不能继续沿用 `nextActionHints` 这类会被误读为编排建议的字段名。

## What Changes

- 移除业务 tool model observation 中的输出类型判断字段，例如 `supportsOutputKinds` 及其嵌套副本。
- 移除 tool observation 中表示“可否成功输出 visibleOutputs”的判断字段，例如 `supportsSuccessfulVisibleOutputs`、`finalAnswerSupport` 或等价业务满足度字段。
- 移除或收敛 `nextActionHints` 这类下一步编排提示；tool observation 不再告诉模型应该 `final_answer_with_visible_outputs`、`continue_tool_call` 或 `ask_user`。
- 将 `routinePlanCompositionBoundary` 等混合字段拆回确定性事实覆盖：只表达 `sectionSummary`、`availableSections`、`missingSections`、`groups.<section>.exercises[]` 和 `allowedSections`。
- 保留 `toModelObservation` 的安全投影职责：脱敏、压缩、暴露有限动作事实、查询条件、命中数量、缺失 section、诊断 code 和引用 id。
- 同步收敛 core ok tool result index observation：只保留 `toolResultId`、`toolName`、`fulfillment` 轻量事实、事实等级、引用通道和 `modelFactsChannel`，不再输出 `finalAnswerSupport` 或 `nextActionHints`。
- 同步收敛 duplicate / invalid action repair 输入：恢复信息放入 `repairContext` 的错误路径、错误 code、expected / actual、previous result fact 和可恢复边界，不再使用 `nextActionHints` 或等价 action 枚举。
- 保留 output contract / terminal validator 对 `visibleTrainingProposal.payload.kind`、`schedule`、`exerciseItems`、`allowedSections` 和 schema 的确定性校验。
- 不新增服务端关键词规则、自然语言模板路由、phrasing 特判、具体业务 `toolName` 语义分支，也不让服务端根据用户原文改写 `payload.kind`、action 或 tool 调用顺序。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-tool-contract-kernel`: 收紧通用 `toModelObservation` / safe projection / ok tool result index observation 合同，禁止正常 model observation 承载业务目标满足度、输出 kind 可行性或下一步编排决策，并把恢复信息限定到独立 `repairContext`。
- `agent-tool-production-hardening`: 修改 production observation 瘦身要求，移除此前允许保留 `supportsOutputKinds` 和 `nextActionHints` 的要求，改为只保留结构化事实、确定性诊断和引用边界。
- `agent-exercise-resource-query-tool`: 收紧 `searchExerciseResources` observation 合同，明确该 tool 只返回动作事实和 section 覆盖，不判断 `visibleTrainingProposal.payload.kind`，也不判断是否满足用户的 routine / plan 目标。
- `visible-proposal-read-recent-contract`: 收紧 `inspectVisibleTrainingProposals(read_recent)` observation 合同，导入历史事实时只表达可复用事实、section 覆盖和是否已有 `schedule` 等事实，不输出 `supportsOutputKinds` 或下一步 action 建议。

## Impact

- 影响业务 tool 模型可见投影：`lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`、`lib/server/agent-tools/exercise-facts/inspect-visible-training-proposals.tool.ts`。
- 影响共享覆盖摘要 helper：`lib/server/visible-training-proposals/visible-training-resource-coverage.ts` 或等价结构需要从“输出 kind 支持”改为纯事实覆盖。
- 影响 core observation / repair 投影：`lib/server/agent-core/observation.ts` 的 ok tool result index observation、duplicate tool input observation，以及 `lib/server/agent-core/runtime.ts` 中 duplicate repair context 的事实 payload。
- 影响模型可见合同测试：`tests/agent-tools/search-exercise-resources.test.ts`、`tests/agent-tools/inspect-visible-training-proposals.test.ts`、`tests/agent-core/contract-helper.test.ts`、`tests/agent-core/tool-registry-manifest.test.ts` 及相关 prompt / observation 测试。
- 影响 OpenSpec 中曾要求保留 `supportsOutputKinds` / `nextActionHints` 的 spec，需要同步改为禁止或移除。
- 不影响 `/api/chat` 外部 API、前端 NDJSON 事件合同、数据库 schema、真实动作库查询 handler、权限隔离、Agent runtime 主循环、PlannerPort、Executor、Response Renderer 主流程或 terminal output validator 的确定性校验边界。
