## Why

最新 `codex_logs/ai_trace_log.js` 显示，生产文本聊天在“换一个”场景中已经恢复到真实 `recentExerciseRecommendationFacts`，模型第 1 轮正确调用 `readRecentExerciseRecommendationFact` 读取上一轮用户可见动作事实，但后续第 2、3 轮仍重复调用同一个 tool 和同一个 `factRef`，最终在当前 run 内重复登记同一 consumable resource，触发 `Resource id is already registered in the current run.` 并以 `invalid_action` hard failure 收口。

这不是“调用次数太多”本身，也不是服务端需要根据“换一个 / 换一批”替模型判断语义。根因是模型实际可见合同没有表达清楚 read/import tool 的状态迁移：

- `run.metadata.recentExerciseRecommendationFacts` 每轮都会继续暴露同一个真实 `factRef`。
- `readRecentExerciseRecommendationFact` 的 `whenToUse` 容易被理解成“用户要求换一批且 metadata 有 factRef 时就调用”，而不是“模型判断确实需要复用上一轮已展示动作事实时才考虑调用”。
- 成功 read 后的 Planner observation 投出完整 fact、`displayedExercises` 和 `query`，但没有明确说明“该 fact 已经在当前 run 导入，下一步应使用已有 `toolResultId` / `displayedExerciseIds` 进入 `searchExerciseResources.excludeExerciseIds`、`final_answer` 或 `ask_user`，不要再次 read 同一 fact”。
- observation / compressed tool results 还可能把 `maxReturned` 等 output-only 字段通过嵌套 `query` 继续暴露给模型，诱发后续非法 input。
- runtime 只对重复失败有熔断，对重复成功同参调用只记录 trace，不能阻止重复执行 handler 和重复资源登记。

## What Changes

- 收紧 `readRecentExerciseRecommendationFact` 的模型可见合同：是否读取历史 fact 由 Planner 基于当前上下文判断；manifest 不得表达成“用户说换一批就调用”；成功读取同一 fact 后不得再次调用本 tool。
- 调整 `readRecentExerciseRecommendationFact.toModelObservation` 或等价投影，只暴露下一步决策必需的安全摘要，明确当前 run 已成功导入该 fact、可用 `displayedExerciseIds` 作为 `searchExerciseResources.excludeExerciseIds`，并移除完整 `displayedExercises`、完整 `query` 和 `maxReturned` 等 output-only 字段。
- 补强 `searchExerciseResources` 的 manifest / schema description / examples / observation，明确 `maxReturned`、`returnedCount`、`totalMatches`、`truncated` 是输出摘要字段，不属于可传入 input；成功且 `satisfied=true` 的查询结果可以支撑 `final_answer.usedToolResultIds`。
- 补充通用 runtime repair / feedback 合同：当同一 run 中模型重复调用同一 `toolName + toolVersion + normalizedInputHash`，且已有 `ok=true && fulfillment.satisfied=true` 的成功结果时，runtime 应返回结构化反馈，引用既有 `toolResultId`，要求 Planner 基于已有结果继续 `search` / `final_answer` / `ask_user` 或提交改变后的合法 input，而不是再次执行 handler 或再次登记资源。
- 保持服务端语义边界：是否需要换一批、更多结果、排除已展示动作、改变筛选条件或补充约束，仍由 Planner 基于模型可见上下文判断；服务端不得用关键词、正则、同义词表或业务短句模板替模型判断用户意图。
- 保留严格输入 schema：不把 `maxReturned`、`limit`、`take`、`offset`、`page` 或 `pageSize` 开放给 LLM 输入控制。
- 增加 tool-level、manifest / model input、runtime repair 和生产聊天回归测试，覆盖“换一个 + recent fact + 重复 read/import”和“既练腿又练胸肌的动作 + 成功 search 后收口”两类路径。

## Capabilities

### New Capabilities
无。

### Modified Capabilities
- `agent-contract-repair-loop`: 增加重复成功 tool call 的结构化反馈要求，区分“重复不可重试失败熔断”和“已有同等成功结果，应基于既有结果收口”的 repair 边界。
- `agent-tool-production-hardening`: 增加模型可见 manifest / observation 对 output-only 字段的边界要求，确保输出摘要字段不会被表达成可传入 input 或分页控制能力。
- `agent-exercise-refresh-factref-contract`: 增加 read/import 成功后的模型可见状态迁移要求，确保同一 fact 已导入当前 run 后，Planner 不再重复调用 `readRecentExerciseRecommendationFact`，而是使用既有事实继续查询或收口。

## Impact

- 预计影响代码：
  - `lib/server/agent-tools/exercise-facts/read-recent-exercise-recommendation-fact.tool.ts`
  - `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`
  - `lib/server/agent-core/**` 中负责重复 tool call 诊断、repair feedback 或 runtime observation 的窄口模块
  - `lib/server/agent-core/manifest.ts` 或等价 manifest / schema summary 测试覆盖入口
  - `tests/agent-tools/read-recent-exercise-recommendation-fact.test.ts`
  - `tests/agent-tools/search-exercise-resources.test.ts`
  - `tests/agent-core/tool-registry-manifest.test.ts`
  - `tests/agent-core/contract-helper.test.ts`
  - 覆盖重复成功 feedback 的最窄 Agent runtime 测试文件
  - `tests/chat-service.test.ts` 或当前生产聊天 Agent runtime 回归测试
- 预计影响 OpenSpec：
  - `openspec/changes/harden-search-exercise-final-answer-settling/**`
- 不涉及 Prisma Schema、数据库迁移、新依赖、动作刷新事实桥、训练计划生成、routine / plan / artifact 写入、Policy Guard、Resource Contract Validator、Response Renderer 主流程或 `/api/chat` 关键词分流。
