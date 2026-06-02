## MODIFIED Requirements

### Requirement: AI 调用必须经过 token budget 决策
系统 SHALL 在聊天与训练生成链路发起 LLM 调用前生成本轮 token budget 决策，决策结果 MUST 明确本轮需要执行的 AI 阶段、模型可见上下文、prompt module、候选动作字段和跳过原因。

#### Scenario: 生成本轮预算决策
- **WHEN** 用户向 `/api/chat` 发送新消息
- **THEN** 服务端 MUST 在执行下游 LLM 调用前生成预算决策
- **AND** 预算决策 MUST 标明意图解析、上下文总结、候选动作处理和最终回答阶段是否需要执行
- **AND** 预算决策 MUST 不依赖客户端传入的未校验字段作为事实来源

#### Scenario: 明确跳过不必要阶段
- **WHEN** 某个 AI 阶段因为用户操作、意图类型、无新增长期事实或可模板化回复而无需执行
- **THEN** 预算决策 MUST 将该阶段标记为 skipped
- **AND** 预算决策 MUST 记录稳定的中文跳过原因
- **AND** 服务端 MUST NOT 为该阶段发起 LLM 请求

#### Scenario: Agent decision 输入使用瘦身上下文
- **WHEN** Tool-first Agent 发起 tool decision 模型请求
- **THEN** 模型可见输入 MUST 使用专用瘦身视图
- **AND** 工具定义 MUST 只包含模型决策需要的名称、描述、输入字段摘要、枚举和依赖摘要
- **AND** 已登记 tool result MUST 只包含 `toolResultId`、状态、结构化资源 id、候选摘要、失败码和必要计数
- **AND** 模型可见输入 MUST NOT 包含完整 registry JSON、完整 diagnostics/rerank、完整数据库记录或仅用于展示的冗长字段
- **AND** Trace MUST 记录裁剪前后字符数或等价预算摘要
