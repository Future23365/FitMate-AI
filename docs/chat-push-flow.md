# 聊天推送流程说明

## 1. 文档范围

本文记录首页聊天把自然语言请求转成用户可见回复、训练卡片、动作推荐、Patch 和建议回复的当前真实链路。

当前生产入口只有 `/api/chat`。聊天计划、routine、动作推荐和推荐刷新不得再通过独立聊天 AI route 或前端旧 trigger JSON 解析触发。

## 2. 总体链路

```txt
用户输入
  ↓
features/chat/hooks/use-chat-controller.ts
  ↓
features/chat/api/chat-client.ts
  ↓
POST /api/chat
  ↓
app/api/chat/route.ts
  ↓
lib/server/chat/chat-service.ts
  ↓
prepareAiChatRequest()
  ↓
ContextPackage
  ↓
runAgentOrchestrator()
  ↓
AgentToolRegistry 执行只读 / 生成 / 校验 / Policy / 保存工具
  ↓
AgentExecutionResult
  ↓
Response Writer 投影用户可见回复
  ↓
NDJSON stream: content / agent_execution_result / artifact / workout_patch / assistant_suggestions / done
  ↓
前端按事件写入消息、卡片和建议
```

## 3. 前端发送聊天消息

前端只调用 `requestChatStream()`。

请求体包含：

- `conversationId`
- `responseMessageId`
- `latestUserMessage`
- `conversationSummary`
- `conversationContext`
- `thinkingEnabled`

`conversationSummary` 是后台摘要、标题和调试材料，不是训练卡片、动作 ID、Patch target 或保存 payload 的事实源。需要结构化事实时，服务端必须使用已保存 conversation、recent artifacts、memory 和 Agent tools。

## 4. `/api/chat` 服务端职责

`app/api/chat/route.ts` 只负责 HTTP 边界：

- 鉴权
- 请求体验证
- 模型配置检查
- 调用 `createAiChatResponse()`
- 返回流式响应

业务编排位于 `lib/server/chat/chat-service.ts` 和 `lib/server/agent-orchestrator/*`。

## 5. Agent 决策协议

Agent 只能输出两类结构：

- 合法 registry tool 调用
- 符合 `AgentExecutionResult` Schema 的终止结果

Agent 不得读取旧 resolved intent、旧 action gate、旧 trigger JSON 或 summary-only payload reconstruction 作为执行事实。服务端只校验工具输入、权限、候选集合、artifact 归属、validation、policy 和持久化边界，不用关键词或正则替模型重写高层语义。

## 6. 动作推荐

动作推荐由 Agent 的 `searchExercises(candidateUse="recommendation")` 工具结果和 `AgentExecutionResult.usedToolResultIds` 投影。

Response Writer 根据被引用的 `searchExercises` tool result 生成 `exercise_recommendation` artifact 事件。前端收到 `artifact` 或 `artifact_validated` 后写入 `bubbleExerciseRecommendations[messageId]` 并渲染推荐卡片。

“换一批”或刷新推荐应走两种方式之一：

- 用户发送一条新的自然语言消息，由 `/api/chat` Agent 重新理解并生成新推荐。
- 对已存在 Agent result 做确定性 result-level 操作，例如分页、去重或排除已反馈动作。

刷新流程不得新增服务端关键词、同义词、正则或短句模板去替 Agent 改写推荐目标、器械条件、肌群或 action。

## 7. Routine 和长期计划

Routine 和 plan 均由 Agent 工具链生成：

- `searchExercises`
- `generateRoutineDraft` 或 `generatePlanDraft`
- `validateRoutineDraft` 或 `validatePlanDraft`
- `evaluatePolicy`
- `saveConversationArtifactRevision`

首次生成训练卡片时可以没有 `sourceArtifactId`；这表示创建新 artifact。基于历史训练或推荐继续生成时，Agent 必须先通过 `listRecentArtifacts`、`searchArtifacts` 或 `getArtifactPayload` 读取真实 artifact payload，再引用对应 tool result。

前端只消费 stream 事件中的 `artifact`、`artifact_validated`、`artifact_failed` 和 `workout_patch`。不会从 assistant 文本里解析旧 trigger JSON 来触发卡片。

## 8. Patch

局部修改走 Agent Patch 工具链：

- `getArtifactPayload`
- `searchExercises`，需要替代动作时
- `proposeWorkoutEditPlan`
- `proposeWorkoutPatch`
- `validateWorkoutPatch`
- `evaluatePolicy`
- `saveConversationArtifactRevision`

Patch 保存必须引用本轮已登记的 `patchId`、`validationId` 和 `policyDecisionId`。没有真实保存结果时，Response Writer 不得承诺训练内容已更新。

## 9. 流式事件

前端按事件类型处理：

- `agent_activity`：展示当前 Agent 阶段
- `agent_execution_result`：记录最终 Agent 执行结果和旧路径缺席诊断
- `content`：追加 assistant 可见文本
- `assistant_suggestions` / `suggested_replies` / `suggested_questions`：写入一键建议
- `artifact_generating`：展示生成中状态
- `artifact` / `artifact_validated`：渲染推荐、routine 或 plan 卡片
- `artifact_failed`：展示可恢复失败
- `workout_patch`：渲染修改后的训练卡片
- `done`：更新后台 summary 和 conversation context
- `error`：展示错误

生产新运行不输出旧 `assistant_action`、`intent_resolved` 或可执行 trigger JSON。

## 10. 聊天历史保存

前端保存对话时只保存用户可见消息和已由 Agent stream 产生的卡片状态：

- `messages`
- `plans`
- `routines`
- `exerciseRecommendations`
- `recommendationIntents`
- `conversationSummary`
- `conversationContext`

`createChatConversationSavePayload()` 使用字段白名单，避免请求态 loading、Agent activity 或原始模型内部字段进入历史。

## 11. 排查入口

优先看一次 `/api/chat` trace：

- `agent_execution_result` 是否存在
- `usedToolResultIds` 是否引用了需要展示的 tool result
- `dependencyGraph` 是否记录工具依赖
- `legacyPathSkip` 是否证明旧 intent、旧 trigger、ReferenceResolver-first 和 readonly loop 未触发
- `artifact` / `workout_patch` 事件是否由 Response Writer 产出

如果自然语言承诺生成但没有卡片，重点检查：

- Agent final result 是否错误返回 `answered`
- `usedToolResultIds` 是否缺少生成或搜索 tool result
- 保存型结果是否缺少 `revisionId`
- validation、policy 或 persistence 是否返回了 `blocked` / `failed`

如果推荐刷新重复，重点检查：

- 新消息是否进入 `/api/chat`
- Agent 是否使用 `searchExercises(candidateUse="recommendation")`
- result-level 分页/去重是否只基于已有 Agent result
- 是否错误引入了服务端自然语言关键词规则

## 12. 关键代码索引

聊天入口：

- `features/chat/hooks/use-chat-controller.ts`
- `features/chat/api/chat-client.ts`
- `app/api/chat/route.ts`
- `lib/server/chat/chat-service.ts`

Agent 主链：

- `lib/server/agent-orchestrator/runtime.ts`
- `lib/server/agent-orchestrator/tool-registry.ts`
- `lib/server/agent-orchestrator/readonly-tools.ts`
- `lib/server/agent-orchestrator/workout-tools.ts`
- `lib/server/agent-orchestrator/response-writer.ts`

训练规则：

- `lib/server/workout-plans/exercise-candidate-service.ts`
- `lib/server/workout-plans/domain-plan-engine.ts`
- `lib/server/workout-plans/workout-plan-validation-service.ts`
- `lib/server/workout-patches/workout-patch-engine.ts`
