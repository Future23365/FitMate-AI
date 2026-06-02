## Why

最新 AI Trace 显示，用户要求“这8个动作做成一套训练”时，ContextPackage 已带有最近推荐 artifact 的 8 个 `exerciseIds`，但该 artifact 在后续读取完整 payload 前已变成 `superseded`。Agent 工具仍只读取 `status = active` 的 artifact，导致合法旧 revision 被误判为不可访问，并在 12 轮工具决策中重复消耗超过 10 万 token。

这不是用户意图理解问题，也不应通过服务端关键词纠偏解决；需要把 artifact revision 恢复、artifact-bound routine 校验和 tool loop 重试预算收敛成确定性服务端契约。

## What Changes

- `getArtifactPayload` Agent 工具在读取当前用户 artifact 时支持同 lineage 的 active revision 恢复，并向模型与 trace 暴露 `requestedArtifactId`、`activeArtifactId` 和恢复状态摘要。
- `generateRoutineDraft` 在绑定 `sourceArtifactId` 与 `requiredExerciseIds` 时使用同样的 active revision 恢复能力，确保 recent artifact summary 中的旧 id 不会阻断 routine 生成。
- Agent runtime 对同一工具、同一归一化输入、同一失败码的重复失败调用执行确定性去重熔断，避免模型反复读取同一个不可访问 artifact。
- Agent model-visible tool result 摘要压缩重复失败记录，只保留最新失败与累计次数，降低失败循环中的 prompt token 增长。
- Trace 记录 artifact revision 恢复与重复工具失败熔断，便于后续排查 token 异常和引用恢复问题。

## Capabilities

### New Capabilities

无。本次优化修改已有聊天 Agent、artifact 读取、routine 编排、trace 与 token 预算能力。

### Modified Capabilities

- `conversation-artifact`: artifact payload 读取需要支持合法旧 revision 恢复到同用户、同 session、同 kind、同 lineage 的 active revision。
- `readonly-llm-tool-calling`: Agent 只读工具需要返回 revision 恢复摘要，并对重复失败工具调用执行熔断。
- `chat-routine-composition`: 基于推荐 artifact 生成 routine 时，旧 revision id 应恢复到 active payload 后继续校验 `requiredExerciseIds` 覆盖。
- `ai-run-trace`: trace 需要记录 requested/active artifact id、revision 恢复状态和重复工具失败熔断。
- `ai-token-budgeting`: tool loop 中重复失败结果进入模型上下文前需要压缩，避免无效 prompt 累积。

## Impact

- 影响 `lib/server/conversation-artifacts/artifact-service.ts` 的 artifact 读取入口使用方式，但不放宽用户隔离、session/kind/lineage 校验。
- 影响 `lib/server/agent-orchestrator/readonly-tools.ts`、`lib/server/agent-orchestrator/workout-tools.ts` 和 Agent runtime 的工具执行/上下文摘要。
- 影响 routine 编排中 `sourceArtifactId` 与 `requiredExerciseIds` 的服务端校验路径。
- 影响 trace/debug 输出字段和相关测试。
- 不新增数据库表、不修改 Prisma Schema、不改变 API Route 契约。
