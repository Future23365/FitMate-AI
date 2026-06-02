## Why

Tool-first Agent 主链切换后，真实 trace 显示动作推荐请求被模型结束为 `answered` 文本回复，未产生前端可消费的推荐卡片；同一请求还因每轮 Agent decision 重复发送完整 registry、tool results 和 diagnostics 导致约 5.5 万 token。与此同时，模型响应被 trace 页面归入 `legacy_compatibility`，建议提问 chips 也没有稳定从新 Agent 结果回到前端。

## What Changes

- 修复动作推荐请求的 Agent 结果合同：成功检索动作候选后必须产出可展示 `exercise_recommendation` artifact 或明确阻断原因，不能仅以 `answered + answer_only` 结束。
- 恢复建议提问按钮：Agent 产生的 `assistantSuggestions` 必须通过统一流事件输出，并被前端原有 chips 渲染路径消费。
- 压缩 Agent decision 模型输入：模型只接收当前决策必要的工具摘要、已瘦身 tool result 摘要和依赖图摘要，不再反复发送完整 registry JSON、完整 diagnostics/rerank 或展示噪音。
- 修复 Agent trace 分组：Agent decision 的模型响应必须归入 `tool_decision` 阶段并正确分账 token，不再显示为旧链路兼容。
- 增加覆盖推荐卡片、建议 chips、token 输入边界和 trace 分组的自动化验证。

## Capabilities

### New Capabilities

### Modified Capabilities
- `chat-exercise-recommendation-trigger`: 动作推荐必须在新 Agent 主链中产生可展示 artifact 事件或明确阻断原因。
- `assistant-suggestions`: Agent 终止结果中的建议必须通过统一流事件恢复到前端建议 chips。
- `ai-token-budgeting`: Agent decision 请求必须使用瘦身后的模型可见上下文和工具摘要。
- `ai-trace-debugger`: Agent 模型响应和 token usage 必须归入正确 Agent 阶段。

## Impact

- 影响 `/api/chat` Agent 编排、Response Writer、流事件输出和前端聊天 hook。
- 影响 Agent tool result 摘要、模型请求 payload、trace step metadata 和 `/dev/ai-traces` view model 分类。
- 不变更数据库 schema、不新增外部依赖、不恢复旧 intent-first 主链。
