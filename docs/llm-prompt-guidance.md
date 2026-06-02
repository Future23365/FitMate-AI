# LLM 提示词引导机制说明

## 1. 文档范围

本文说明当前项目中 `lib/server/ai/prompt-config.ts` 的提示词如何约束 Tool-first Agent、Response Writer 和后台 summary 更新。

当前聊天 AI 执行面已经收敛到 `/api/chat`。训练计划、routine、动作推荐和 Patch 的执行事实来自 `ContextPackage`、Agent registry tools、tool results、`AgentExecutionResult` 和 Response Writer 投影，不再依赖旧独立聊天 AI 接口、旧 trigger JSON 或前端二次生成调用。

## 2. 当前提示词模块

`aiPromptModuleRegistry` 当前主要模块如下：

| 模块 | 使用位置 | 主要职责 |
|---|---|---|
| `base_safety` | Agent 决策、Response Writer 等模型调用 | 保持健身助手身份，禁止医疗诊断，要求动作与训练结果遵守服务端候选和校验 |
| `agent_context_build` | token budget / trace 记录 | 说明 Agent 上下文来自 `ContextPackage`，`conversationSummary` 不是执行事实源 |
| `agent_tool_decision` | Agent 工具决策 | 限制模型只能调用 registry 工具或返回合法终止结果 |
| `agent_tool_execution` | Agent loop 反馈 | 告诉模型工具失败后只能基于结构化结果 repair、retry、澄清、blocked 或 failed |
| `agent_final_result` | Agent 终止结果 | 要求 generated / patched / completed_operation 引用真实 tool result、validation、policy、revision 或 operation result |
| `agent_response_writer` | 用户可见回复投影 | Response Writer 只能消费 Agent result 和 tool result，不得重新解释语义或承诺未执行写入 |
| `agent_summary_update` | 后台 summary 更新 | summary 只用于背景摘要、会话标题或调试材料，失败不得影响本轮执行 |
| `exercise_candidate_constraints` | 候选动作约束 | 要求具体动作只能来自服务端动作库候选集合 |
| `user_feedback_memory` | 动作选择上下文 | 将用户明确反馈作为当前动作选择边界 |
| `conversation_summary_update` | 自然语言 summary 更新 | 生成下一轮背景摘要，不输出内部协议 |

## 3. ContextPackage 边界

Agent 可见事实来自：

- `latestUserMessage`
- recent messages
- recent artifacts
- user memory
- pending confirmation
- optional ContextSnapshot
- 已登记 tool results

`conversationSummary` 只能作为后台摘要、标题或调试材料。任何需要 artifact payload、exerciseId、Patch target、保存 payload 或用户私有数据的场景，都必须通过服务端工具读取结构化事实。

## 4. Agent Tool Decision

`agent_tool_decision` 把模型定位为工具决策器，而不是自由生成器。

它要求：

- 输出必须是合法工具调用，或合法 `AgentExecutionResult`。
- 需要动作推荐时调用 `searchExercises(candidateUse="recommendation")`。
- 需要单次训练时调用 `searchExercises(candidateUse="routine")` 后继续 `generateRoutineDraft`。
- 需要长期计划时使用 `generatePlanDraft`，必要时先读取历史 artifact payload。
- 基于已有推荐 artifact 生成 routine 时，必须绑定 `sourceArtifactId` 和来自该 artifact 的 `requiredExerciseIds`。
- 生成、校验、policy 和保存必须引用服务端已登记的 `draftId`、`validationId`、`policyDecisionId` 和 revision 结果。

服务端不得新增关键词、正则、同义词表或短句模板去替模型改写高层语义。

## 5. Agent Final Result

`agent_final_result` 要求模型把本轮终止状态表达成结构化结果。

关键约束：

- `generated` 必须有真实 `revisionId`、artifact 摘要、validation 和 policy 引用。
- `patched` 必须有真实 patch 保存结果。
- `completed_operation` 必须有 operation result。
- `answered` 只能表示普通答复或只读推荐结果，不能承诺已生成完整 routine / plan。
- `blocked` 和 `failed` 必须明确引用阻断原因或失败工具结果。

没有成功保存结果时，模型不能用自然语言说“已经生成并保存”。

## 6. Response Writer

Response Writer 只负责把 `AgentExecutionResult` 和必要 tool result 摘要投影成用户可见文本和 stream 事件。

它不得：

- 重新选择工具。
- 重新解释用户意图。
- 重新搜索候选。
- 提出新的 Patch。
- 生成训练草稿。
- 承诺未执行的写入。

回复中的动作、器械、训练结构、artifact 状态和保存结果必须能映射到 `usedToolResultIds`、`revisionId`、`validationId`、`policyDecisionId` 或 blocking reason。

## 7. Summary 更新

summary 更新只用于下一轮背景材料和会话管理。

它需要保留：

- 用户训练目标
- 经验
- 器械或场地
- 单次时长
- 频率
- 偏好
- 避免项
- 最近生成结果
- 未完成问题

它不得把系统默认值写成用户明确提供的信息，也不得输出内部 JSON、Trigger 名称或隐藏字段。

## 8. 候选动作约束

`exercise_candidate_constraints` 是动作库事实边界。

模型或 Response Writer 如果提到具体动作，必须来自服务端候选或 tool result。候选不足时可以要求用户放宽条件；候选充足时不得说动作库没有匹配动作。

服务端仍负责最终校验：

- `exerciseId` 是否存在于数据库。
- `exerciseId` 是否来自当前 candidate set 或 artifact payload。
- routine / plan 结构是否通过 Zod。
- validation、policy 和持久化边界是否满足。

## 9. 常见问题排查

如果回复承诺生成但没有卡片：

- 检查 final result 是否错误使用 `answered`。
- 检查 generated / patched 是否缺少 `revisionId`。
- 检查 `usedToolResultIds` 是否引用了生成或保存工具结果。
- 检查 Response Writer 是否收到 artifact / patch 投影。

如果模型编造动作：

- 检查 `searchExercises` tool result 的 candidate set。
- 检查 `exercise_candidate_constraints` 是否进入对应模型调用。
- 检查 validation 是否拒绝了候选外动作。

如果推荐刷新语义不对：

- 检查用户新约束是否作为新 `/api/chat` 消息进入 Agent。
- 检查是否错误引入了服务端自然语言规则。
- 检查 result-level 换一批是否只基于已有 Agent result 做确定性分页、去重或排除。

## 10. 修改提示词时的注意事项

修改提示词后必须确认：

- Structured Outputs / Zod / JSON Schema 仍能约束模型输出。
- 服务端只校验结构、权限、候选和持久化契约，不判断自然语言语义对错。
- 模型不会被要求复写完整 draft payload 来完成保存。
- Response Writer 不承担工具选择和训练生成职责。
- summary 更新失败不会影响本轮 Agent 执行。

## 11. 关键代码索引

- `lib/server/ai/prompt-config.ts`
- `lib/server/ai/token-budget.ts`
- `lib/server/agent-orchestrator/contracts.ts`
- `lib/server/agent-orchestrator/runtime.ts`
- `lib/server/agent-orchestrator/tool-registry.ts`
- `lib/server/agent-orchestrator/readonly-tools.ts`
- `lib/server/agent-orchestrator/workout-tools.ts`
- `lib/server/agent-orchestrator/response-writer.ts`
- `lib/server/chat/chat-service.ts`
