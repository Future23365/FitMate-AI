# Agent Artifact Revision 与 Tool Loop 稳定化

时间：2026-06-02 14:13:19 +0800

## 当前真实问题

最新 trace 中，用户说“这8个动作做成一套训练”时，ContextPackage 已经带有最近推荐 artifact 的 8 个 `exerciseIds`。但该 artifact id 在工具读取完整 payload 前已经变成 `superseded`，Agent 工具仍只读取 `status = active` 的 artifact，导致连续返回 `Artifact not found or not accessible.`。

模型随后重复调用同一个 `getArtifactPayload`，并两次尝试 `generateRoutineDraft`，整轮 12 次 tool decision 累积到 10 万以上 token，最终只给出“推荐记录 artifact 已无法访问”的文本回复。

## 原方案为什么不合适

之前的绑定方案能让模型传入 `sourceArtifactId` 和 `requiredExerciseIds`，但没有处理 artifact revision 在同一会话中被后续保存或刷新变成旧 id 的情况。仅靠 prompt 提醒模型不要裸搜，也无法阻止它在工具失败后重复尝试同一个不可访问 id。

这个问题不应该通过服务端关键词判断“这8个动作”来修复；合法旧 revision 恢复、动作来源覆盖和重复失败熔断都属于确定性服务端执行契约。

## 调整思路

- Agent artifact payload 读取改用同 lineage active revision 恢复入口。
- artifact-bound `generateRoutineDraft` 也使用同一恢复入口读取推荐 payload。
- `requiredExerciseIds` 仍必须来自恢复后的 active recommendation payload，不能用裸搜候选替代。
- Agent runtime 增加本轮不可重试失败索引，重复同工具同输入失败时返回结构化熔断结果，不再执行底层工具。
- 模型可见 tool result 上下文压缩重复失败摘要，trace 继续保留完整执行证据。

## 关键改动

- `getArtifactPayload` Agent 工具输出 `requestedArtifactId`、`activeArtifactId` 和 `revisionResolution`。
- `generateRoutineDraft` 输出 `activeSourceArtifactId` 与 `sourceArtifactRevisionResolution`，保留旧 `sourceArtifactId` 作为用户引用来源。
- 新增 `duplicate_tool_failure` 错误码，用于区分 runtime 熔断和真实工具失败。
- `buildAgentDecisionModelInput()` 合并重复失败摘要，减少后续 prompt 增长。
- trace metadata 增加 artifact revision 恢复和 duplicate failure 熔断字段。

## 验证

- `npm test -- tests/agent-orchestrator.test.ts tests/chat-service.test.ts tests/readonly-tools.test.ts tests/conversation-artifact-service.test.ts`
- `npm run typecheck`

结果：相关测试通过，TypeScript 类型检查通过。
