## MODIFIED Requirements

### Requirement: AI 调用必须经过 token budget 决策
系统 SHALL 在聊天与训练生成链路发起 LLM 调用前生成本轮 token budget 决策，决策结果 MUST 明确本轮需要执行的 AI 阶段、模型可见上下文、prompt module、候选动作字段和跳过原因。

#### Scenario: Agent decision 输入使用瘦身上下文
- **WHEN** Tool-first Agent 发起 tool decision 模型请求
- **THEN** 模型可见输入 MUST 使用专用瘦身视图
- **AND** 工具定义 MUST 只包含模型决策需要的名称、描述、输入字段摘要、枚举和依赖摘要
- **AND** 数组字段摘要 MUST 保留 `items.type`、`items.enum` 和与执行相关的数量边界
- **AND** 已登记 tool result MUST 只包含 `toolResultId`、状态、结构化资源 id、候选摘要、失败码和必要计数
- **AND** 模型可见输入 MUST NOT 包含完整 registry JSON、完整 diagnostics/rerank、完整数据库记录或仅用于展示的冗长字段
- **AND** Trace MUST 记录裁剪前后字符数或等价预算摘要
