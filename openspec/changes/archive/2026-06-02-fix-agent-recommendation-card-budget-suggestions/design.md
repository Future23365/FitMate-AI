## Context

当前 `/api/chat` 已由 Tool-first AgentOrchestrator 驱动。真实 trace 中，用户请求“推荐几个适合新手的臀腿动作，我只有弹力带，不想做跳跃”时，Agent 先调用 `searchExercises`，第二次成功得到候选动作，但最终返回 `answered` 文本结果。由于服务端只在 `generated` / `patched` 分支发送 artifact 事件，前端没有收到推荐卡片。

同一 trace 显示 Agent decision 连续 3 次模型调用，每次都发送完整 `registeredTools`、完整 `toolResults`、`dependencyGraph` 和上下文包；后续调用还带上候选 diagnostics/rerank，导致单请求约 5.5 万 token。模型响应 step 只记录为 `model_response` 且缺少 Agent stage metadata，被 trace view model 兜底归入 `legacy_compatibility`。建议提问按钮缺失则来自新 Agent 流事件没有稳定输出统一 `assistant_suggestions`。

## Goals / Non-Goals

**Goals:**
- 动作推荐请求在 Agent 主链中产生可展示推荐 artifact，并继续基于服务端候选和校验边界。
- Agent decision 输入只保留当前决策必要信息，移除完整 registry、完整 diagnostics/rerank 和重复大 payload。
- Agent 产生的建议通过统一 `assistant_suggestions` 流事件返回，前端无需恢复旧 intent 字段。
- Agent 模型响应归入 `tool_decision` 阶段，token usage 在 trace 中正确分账。

**Non-Goals:**
- 不恢复旧 intent-first 主链、旧 `assistant_action` 触发逻辑或服务端关键词意图纠偏。
- 不改变数据库 schema。
- 不为了降 token 删除候选 grounding、权限隔离、动作库校验或 artifact 保存边界。

## Decisions

1. **推荐卡片由服务端投影生成，而不是让模型自由构造展示 payload。**  
   Agent 成功检索推荐候选后，最终结果可以继续引用 `usedToolResultIds`，服务端 Response Writer 根据可验证的 `searchExercises` tool result 构造 `exercise_recommendation` artifact payload 并发送 `artifact_validated` / `artifact` 事件。这样避免模型直接编造卡片结构，也不需要旧 intent 字段反向驱动。

2. **Agent decision payload 使用专用 model view。**  
   运行时状态仍保留完整 registry 和 tool result，但发给模型的是瘦身视图：工具只暴露名称、用途、输入字段摘要和依赖摘要；tool result 只暴露 `toolResultId`、状态、结构化 id、候选摘要和失败码；diagnostics 仅保留计数和必要失败原因，删除完整 rerank。

3. **建议 chips 从 AgentExecutionResult 统一投影。**  
   `needs_clarification`、`blocked` 和成功推荐后的下一步建议都通过 `assistant_suggestions` 事件输出。若本轮没有 LLM 产出的建议，服务端只允许基于已确认 artifact/result 生成少量确定性下一步建议，例如“按这些动作生成训练”，不引入新的自然语言语义判断。

4. **trace 分类修复在记录端优先完成。**  
   `requestDeepSeekJson` 记录 Agent decision 模型响应时补充 `aiStage: "agent_tool_decision"` 和 prompt modules。View model 继续保留兜底逻辑，但不再把新 Agent 模型响应归入旧链路兼容。

## Risks / Trade-offs

- 推荐结果由服务端投影生成可能减少模型对卡片文案的自由润色。→ 卡片展示以真实候选为准，文本回复仍可保留模型生成内容。
- 瘦身工具 schema 可能让模型少看到边界细节。→ 保留工具名称、描述、输入字段、枚举和依赖摘要；服务端仍执行完整 Zod 校验。
- 自动下一步建议如果过多会干扰用户。→ 限制数量并只在成功推荐且无 blocking 建议时输出。
