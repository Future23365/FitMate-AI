## Why

当前 `AiRunTrace` 已能支撑本地开发排查，但采集契约仍偏自由 JSON：step input/output/metadata 缺少稳定 schema，耗时不一定是真实执行耗时，`finalDecision` 在不同入口不一致，跨接口续写和后续 Replay/Eval 所需快照也没有明确边界。随着 `change-011` 准备引入 Orchestrator、Replay 和 Eval，需要先把 trace 从“可看日志”加固为“可验证契约”。

## What Changes

- 定义 `AiRunTrace` 顶层 envelope、step envelope、step payload、finalDecision、correlation、snapshot 和 privacy budget 的稳定契约。
- 为高频 step 建立类型化 payload：`model_request`、`model_response`、`tool_call`、`reference_resolution`、`candidate_selection`、`validation`、`persistence`、`response_write`、`error`。
- 记录真实 step duration，避免把“写入 trace 的时间”误当作“业务步骤耗时”。
- 统一所有 AI 入口的 `finalDecision`，明确 success、recoverable_failure、hard_failure、code、reason 和 responseType。
- 增加跨接口关联字段，支持 chat -> workout plan / exercise recommendation / confirmation continuation 的 root run、parent trace 和 route span。
- 明确 Replay/Eval 所需的最小快照：promptVersion、toolVersions、模型、候选池摘要、artifact revision、用户记忆摘要、必要 payload hash / version 和权限边界。
- 扩展 `/dev/ai-traces` 对类型化 payload、真实耗时、correlation 和 replay snapshot 的展示要求。

## Capabilities

### New Capabilities

- `ai-run-trace-contract`: 定义 AI 编排 trace 采集契约、类型化 step payload、真实耗时、finalDecision、跨接口关联、Replay/Eval 快照和隐私边界。

### Modified Capabilities

- `ai-trace-debugger`: 调试页需要展示并解释类型化 payload、真实 step duration、跨接口关联、finalDecision 和 replay snapshot 摘要。

## Impact

- 影响 `lib/server/dev/ai-trace-store.ts`、`lib/server/dev/ai-trace-logger.ts`、`lib/server/dev/ai-run-trace.ts`。
- 影响 `/api/chat`、`/api/ai/workout-plan`、`/api/ai/exercise-recommendations` 以及后续 confirmation / replay 相关入口的 trace 创建和 finish 逻辑。
- 影响 ReferenceResolver、PatchEngine、Exercise Candidate Service、Validation Service、Persistence Service、Response Writer 和 `/dev/ai-traces` 展示层。
- 需要补充 trace contract 单元测试、关键入口 fixture、隐私/截断测试和 OpenSpec 验证。
