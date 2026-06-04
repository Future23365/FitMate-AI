## Why

最新 trace 显示，当前 run 的 `recentExerciseRecommendationFacts` 为空时，模型仍照抄 `readRecentExerciseRecommendationFact` manifest example 中的占位 `factRef: "cbf_previous_response"`。该引用不存在于模型实际可见上下文，工具读取时又被归一成 `handler_error`，第二轮重复调用后触发 `duplicate_tool_failure`，导致“换一批”直接报错。

这个问题不是用户语义需要服务端接管，而是模型可见工具合同和 read/import 失败边界没有把“只能引用真实上下文 fact”表达清楚。

## What Changes

- 收紧 `readRecentExerciseRecommendationFact` 的模型可见说明和 examples，删除或替换 `cbf_previous_response` 这类容易被模型当成真实引用的占位值。
- 明确模型只能从 `run.metadata.recentExerciseRecommendationFacts` 中复制真实 `factRef` 或 `messageId`；如果当前上下文没有可读取事实，是否解释、澄清或普通查询继续由 Planner 决定。
- 在 tool handler 内把 fact store 抛出的读取异常归一为结构化失败输出，避免数据库 / Prisma / store 异常变成 `handler_error` 和重复失败熔断。
- 为占位 factRef、空 recent fact、store 异常和 manifest 示例补回归测试。
- 保持服务端语义边界：不在 `/api/chat` 或 tool handler 中根据“换一批”“再推荐一批”等自然语言关键词选择 tool、改写 action 或替模型决定业务语义。

## Capabilities

### New Capabilities

- `agent-exercise-refresh-factref-contract`: 定义动作刷新 read/import tool 的 factRef 模型可见合同、真实引用校验、失败归一化和禁止服务端语义分流边界。

### Modified Capabilities

无。

## Impact

- 预计影响代码：
  - `lib/server/agent-tools/exercise-facts/read-recent-exercise-recommendation-fact.tool.ts`
  - `tests/agent-tools/read-recent-exercise-recommendation-fact.test.ts`
  - `tests/agent-core/tool-registry-manifest.test.ts`
  - `tests/chat-service.test.ts`
- 预计影响 OpenSpec：
  - `openspec/changes/harden-exercise-refresh-factref-contract/**`
- 不涉及 Prisma Schema、数据库迁移、新依赖、Agent core、`PlannerPort`、Executor 主流程、Policy Guard、Response Renderer、`/api/chat` 关键词分流、训练生成或旧 route 恢复。
