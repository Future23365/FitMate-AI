# Agent 推荐卡片与 Token 预算修复

记录时间：2026-06-01 19:50:42 CST

## 当前真实问题

Tool-first Agent 主链切换后，动作推荐请求虽然能通过 `searchExercises` 找到候选动作，但模型最终以 `answered` 文本结果结束。服务端只在 `generated` / `patched` 分支发送 artifact 事件，因此前端没有收到推荐卡片。

同一轮请求中，Agent decision 连续多次把完整工具 registry、完整 tool results、diagnostics 和 rerank 信息发送给模型，单次请求 token 增长到约 5.5 万。模型响应 trace 也因为缺少 Agent stage metadata 被归入 `legacy_compatibility`，让日志页面看起来仍在旧链路里。

建议提问按钮缺失的根因是 Agent 内部建议结构只有 `label` / `message`，没有前端统一 `assistantSuggestions` 协议需要的 `kind`、`blocking` 和 `source` 字段，前端校验后会过滤为空。

## 调整思路

推荐卡片不恢复旧 intent-first 触发链，而是在 Response Writer 之后根据本轮已引用的 `searchExercises` tool result 投影成 `exercise_recommendation` artifact 事件。这样卡片来源仍是服务端候选集合，不让模型自由构造展示 payload。

Agent decision 模型输入改为专用瘦身视图：工具只暴露名称、描述、输入字段摘要和依赖摘要；tool result 只暴露结果 id、状态、结构化资源 id、候选摘要和必要诊断计数；完整 diagnostics/rerank 继续留在 trace，不进入下一轮模型上下文。

建议按钮统一在 Response Writer 投影层补齐协议字段；推荐成功但没有显式建议时，基于已确认推荐结果给出少量确定性下一步建议。

## 关键改动

- `/api/chat` 对 `answered + searchExercises` 成功结果补发 `artifact_validated` / `artifact` 事件。
- `projectAgentExecutionResultToResponse` 将 Agent 建议归一成前端可消费的 `assistantSuggestions`。
- Agent decision 请求改用 `buildAgentDecisionModelInput` 瘦身 payload，并在 trace metadata 记录裁剪摘要。
- `Agent tool decision 大模型回复` 记录 `aiStage: "agent_tool_decision"`，trace 页面按 `tool_decision` 分账 token。
- 增加推荐卡片事件、建议协议、payload 瘦身和 trace 分组测试。

## 验证结果

- `npm run test -- tests/chat-service.test.ts tests/agent-orchestrator.test.ts tests/ai-trace-viewer.test.ts`
- `npm run typecheck`
