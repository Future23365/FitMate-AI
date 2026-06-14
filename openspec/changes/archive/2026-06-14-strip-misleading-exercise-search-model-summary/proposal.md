## Why

`simplify-exercise-resource-search-output` 已经移除了 section coverage 类字段，但最新日志仍显示 `searchExerciseResources` 的模型可见结果会暴露精确命中数、截断标记、候选预算回显和查询执行诊断。模型把这些调试信号误读成“还应该继续查更多候选”，在已经拿到可用于选择的候选事实时继续扩大 `candidateCountPerSection`，最终浪费工具调用与 token。

这次 change 需要把动作候选事实和查询执行诊断进一步分层：Planner 可见结果只提供可用于选择动作的事实和中性失败说明，调试统计继续保留在 trace / user projection 中。

## What Changes

- **BREAKING** 收紧 `searchExerciseResources.toModelVisibleSummary()` 的模型可见输出合同：不再暴露精确命中数、返回数量、截断标记、候选预算回显、查询具体度、过滤执行细节、正向锚点边界、刷新排除边界、零命中肌群 bucket 和容易诱导继续查询的诊断 code。
- 模型可见 `candidateGroups[]` 仅保留查询口径、动作候选列表与必要的候选适配事实；模型可以基于候选列表和动作事实完成选择，不需要知道全库还有多少匹配项。
- 模型可见 `diagnostics[]` 调整为 action-neutral 诊断：只说明本次查询返回了哪些候选事实、是否无候选、是否存在点名动作无法纳入或输入约束冲突；不得判断候选是否足以完成用户目标、是否 ready、是否可生成训练方案，不携带 `totalMatches`、`returnedCount`、`truncated`、`exercise_name_too_broad` 等会暗示继续扩大查询的字段。
- 保留内部执行结果、trace summary 和 user projection 中的调试统计，例如 `totalMatches`、`returnedCount`、`truncated`、`candidateCountPerSection` 和过滤命中详情，用于开发者排障与 UI 调试，不作为 Planner 下一步决策输入。
- 同步更新 model-visible contract gate 和相关单测，禁止这些误导字段重新出现在 `searchExerciseResources` 的模型可见 summary 中。
- 不新增服务端自然语言分流、关键词规则、用户 phrasing 特判、provider `tool_calls` 改写、LangChain runtime 循环策略或 `/api/chat` 主链路改动。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-exercise-resource-query-tool`: 收紧 `searchExerciseResources` 的模型可见 observation 字段边界，使其只暴露动作候选事实和中性诊断，不暴露查询执行统计和继续查询暗示。
- `agent-tool-production-hardening`: 增加模型可见 summary 合同门禁，防止调试统计、候选预算回显和截断语义重新泄漏给 Planner。
- `ai-token-budgeting`: 减少 Planner 可见 token 与低价值诊断字段，避免模型为了追逐精确计数或截断状态消耗额外工具调用。

## Impact

- 影响代码：
  - `lib/server/langchain-agent/tools/exercise-resource-tools.ts`
  - `tests/langchain-agent-tools/search-exercise-resources.test.ts`
  - `tests/langchain-agent-tools/model-visible-contract-gate.test.ts`
  - 可能涉及 `tests/langchain-agent-tools/production-tool-catalog.test.ts` 中对 tool summary 合同的断言
- 影响模型可见合同：
  - `searchExerciseResources` 的 LangChain tool result summary / model-visible summary
  - 相关 schema description 或 tool description 中对诊断字段含义的说明
- 不影响：
  - `searchExerciseResources` 的数据库查询能力和内部执行结果
  - trace / user projection / 开发者调试信息
  - LangChain runtime 主循环、provider payload、response adapter 和 `/api/chat`
  - `submitVisibleTrainingProposal` 的最终动作事实校验
- 需要验证：
  - `openspec validate strip-misleading-exercise-search-model-summary --strict`
  - `npm test -- tests/langchain-agent-tools/search-exercise-resources.test.ts tests/langchain-agent-tools/model-visible-contract-gate.test.ts`
  - 按需运行 `npm run typecheck`
