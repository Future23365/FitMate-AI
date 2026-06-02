## Why

最新 AI Trace 显示，用户要求“就显示的这 8 个动作，生成 30 分钟的训练”时，外层 `recentArtifactSummaries` 已包含推荐卡片的 8 个 `exerciseIds`，但 Agent 可见的 `ContextPackage` 丢失了这些结构化 id。模型随后按 prompt 重新调用裸 `searchExercises(candidateUse="routine")`，生成了一组与推荐卡片无关的腹肌、肩部和肱三头肌动作，并被后续 draft / validation / policy 链路成功保存。

这说明当前 Tool-first Agent 只证明了“动作来自数据库候选集合”，还没有证明“候选集合来自用户引用的推荐卡片”。需要把 artifact 动作集合纳入 Agent 事实入口和 routine 候选边界。

## What Changes

- 扩展 Agent 可见的 recent artifact 摘要，使 `exercise_recommendation` 等 artifact 的主要 `exerciseIds` 能进入 `ContextPackage` 和 trace 摘要。
- 调整 Agent 工具决策约束：当模型通过结构化决策绑定已有推荐 artifact 生成 routine 时，必须读取或继承该 artifact 的动作集合，而不是重新裸搜动作。
- 为 `generateRoutineDraft` 增加来源 artifact / required 动作集合契约：绑定推荐 artifact 的 routine 必须保留该 artifact 中的全部 required 动作；只有缺少 `warmup` 或 `stretch` 等必要阶段时，才允许服务端从受控动作库补充额外动作。
- 增强服务端确定性校验：校验 artifact 归属、artifact kind、required 动作是否来自 artifact index/payload、draft 输出是否保留全部 required 动作。
- 补充回归测试，覆盖“推荐卡片 8 个动作生成 routine 不会重新裸搜并丢动作”的 Agent 工具链行为。

## Capabilities

### New Capabilities

<!-- 无新增 capability，本次修改现有 artifact 上下文和聊天 routine 生成合同。 -->

### Modified Capabilities

- `conversation-artifact`: recent artifact 摘要和可读 payload 必须保留可用于后续 Agent 决策的主要 `exerciseIds` 事实，并保持用户权限隔离。
- `chat-routine-composition`: 基于推荐 artifact 生成 routine 时，推荐 artifact 的动作集合必须成为 required candidate boundary，服务端必须校验全部 required 动作被保留。

## Impact

- 影响 `lib/server/agent-orchestrator/contracts.ts`、`context-builder.ts`、`runtime.ts` 和 `lib/server/chat/chat-service.ts` 的 `ContextPackage` / trace 摘要。
- 影响 `lib/server/agent-orchestrator/workout-tools.ts` 的 `generateRoutineDraft` 输入 schema、工具描述、候选边界和保存前校验。
- 影响 `lib/server/ai/prompt-config.ts` 的 Agent 决策约束，避免“引用已有推荐动作”场景被强制重新搜索。
- 需要更新 Agent 工具链相关测试，必要时补充 manual LLM flow fixture 的语义断言。
