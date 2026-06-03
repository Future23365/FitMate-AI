## Why

最新 `codex_logs/ai_trace_log.js` 显示，模型在 `searchExerciseResources` 已经成功返回 `satisfied=true` 的动作摘要后，没有收口成 `final_answer`，而是继续重复调用同一 tool，并把 output-only 字段 `maxReturned` 当作 input 传回，最终触发 `invalid_tool_input` 和 `repair_limit_exceeded`。

这个问题不是要服务端接管用户语义，也不是要放宽 tool schema；根因是模型可见投影、tool 使用说明和 runtime 重复成功调用反馈没有把“已有同等成功结果时应基于结果回答，而不是继续同参查询”表达成稳定合同。

## What Changes

- 收紧 `searchExerciseResources` 的模型可见投影，避免 `maxReturned` 等 output-only / 服务端内部上限字段被模型误当作下一轮 input。
- 补强 `searchExerciseResources` 的 manifest / schema description / examples，明确 `maxReturned`、`returnedCount`、`totalMatches`、`truncated` 是输出摘要字段，不属于可传入 input。
- 补充通用 runtime repair 合同：当同一 run 中模型重复调用同一 `toolName + normalizedInput`，且已有 `ok=true && fulfillment.satisfied=true` 的成功结果时，runtime 应返回结构化反馈，要求模型基于已有 `toolResultId` 产出合法 terminal action，而不是再次执行或继续消耗 repair。
- 保持服务端语义边界：是否需要换一批、更多结果、排除已展示动作、改变筛选条件或补充约束，仍由 Planner 基于模型可见上下文判断；服务端不得用关键词、正则、同义词表或业务短句模板替模型判断用户意图。
- 保留严格输入 schema：不把 `maxReturned`、`limit`、`take`、`offset`、`page` 或 `pageSize` 开放给 LLM 输入控制。
- 增加 tool-level、manifest / model input、runtime repair 和黑盒回归测试，覆盖“既练腿又练胸肌的动作”这类成功查询后的收口路径。

## Capabilities

### New Capabilities
无。

### Modified Capabilities
- `agent-contract-repair-loop`: 增加重复成功 tool call 的结构化反馈要求，区分“重复不可重试失败熔断”和“已有同等成功结果，应基于既有结果收口”的 repair 边界。
- `agent-tool-production-hardening`: 增加模型可见 manifest / observation 对 output-only 字段的边界要求，确保输出摘要字段不会被表达成可传入 input 或分页控制能力。

## Impact

- 预计影响代码：
  - `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`
  - `lib/server/agent-core/**` 中负责重复 tool call 诊断、repair feedback 或 runtime observation 的窄口模块
  - `lib/server/agent-core/manifest.ts` 或等价 manifest / schema summary 测试覆盖入口
  - `tests/agent-tools/search-exercise-resources.test.ts`
  - `tests/agent-core/tool-registry-manifest.test.ts`
  - `tests/agent-core/contract-helper.test.ts`
  - `tests/chat-service.test.ts` 或当前生产聊天 Agent runtime 回归测试
- 预计影响 OpenSpec：
  - `openspec/changes/harden-search-exercise-final-answer-settling/**`
- 不涉及 Prisma Schema、数据库迁移、新依赖、动作刷新事实桥、训练计划生成、routine / plan / artifact 写入、Policy Guard、Resource Contract Validator、Response Renderer 主流程或 `/api/chat` 关键词分流。
