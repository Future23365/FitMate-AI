## Why

当前聊天链路在 `/api/chat` 解析“这个”等近指引用后，会把 resolved `artifactId` 交给后续 `/api/ai/workout-plan`。如果聊天自动保存或 Patch 链路在两次请求之间创建了新 revision，旧 artifact 会被标记为 `superseded`，导致受控工具按 `status = active` 读取 payload 时返回 `not_found`，用户看到“受控工具调用错误”。

这个问题需要现在修复，因为长期计划生成必须继续坚持服务端受控读取 payload，但不能因为异步保存造成的旧 revision id 让合法的当前用户引用失败。

## What Changes

- 在 artifact 受控读取链路中增加“解析到当前 active revision”的能力，用于处理同一用户、同一会话、同一 artifact revision 链路上的旧 `artifactId`。
- `/api/ai/workout-plan` 在基于 `ReferenceResolution` 展开 DomainPlanEngine 前，使用可校验的当前 active artifact payload，而不是直接因旧 revision id 失败。
- 保持权限边界：只能在当前 `userId` 可访问范围内解析 revision 链路，不能读取其他用户或 archived artifact。
- trace 继续记录受控工具调用结果，并在发生 revision 解析时保留可诊断的 source id 与 active id。
- 补充自动化测试覆盖旧 revision 被 superseded 后仍可生成长期计划，以及真正不可访问 artifact 仍返回可恢复失败。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `reference-resolver`: 后续流程消费 resolved artifact 时，必须能把同一 revision 链路上的旧 artifactId 解析到当前 active artifact。
- `domain-plan-engine`: 基于引用 artifact 展开长期计划时，必须使用当前 active payload；只有无法解析到可访问 active artifact 时才返回可恢复失败。
- `ai-run-trace`: 受控工具调用记录需要表达 revision 解析结果，方便定位 stale artifact id 问题。

## Impact

- 影响服务端 artifact 读取服务：`lib/server/conversation-artifacts/artifact-service.ts`
- 影响长期计划编排：`lib/server/workout-plans/ai-workout-plan-service.ts`
- 影响测试：`tests/conversation-artifact-service.test.ts`、`tests/ai-workout-plan-service.test.ts`
- 不改数据库 schema，不放宽用户权限校验，不让客户端直接读取完整 artifact payload。
