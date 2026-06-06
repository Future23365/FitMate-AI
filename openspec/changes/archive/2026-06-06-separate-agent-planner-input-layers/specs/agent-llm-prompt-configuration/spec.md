## ADDED Requirements

### Requirement: Planner 模型输入必须分离稳定协议和当前事实
系统 SHALL 将生产 Planner 的模型可见输入分为稳定协议层和当前事实层。稳定协议层 SHALL 承载 `AgentAction` 合同、glossary、Planner policy、output contract 摘要和 prompt 版本；当前事实层 SHALL 承载本轮 `run`、`step`、`tools`、`observations` 和 `toolResults`。系统 MUST NOT 继续把完整长期协议和当前事实平铺在同一个 user payload 顶层。

#### Scenario: 首轮 Planner 请求分层
- **WHEN** `DeepSeekModelAdapter` 或等价 adapter 构造首轮 production Planner 请求
- **THEN** 模型请求 MUST 包含高优先级稳定协议内容
- **AND** 稳定协议内容 MUST 包含 `AgentAction` 顶层 action 类型、字段字典、引用 glossary、grounding policy、Planner policy 和 output contract 摘要
- **AND** 当前事实 payload MUST 包含 `run`、`step`、`tools`、`observations` 和 `toolResults`
- **AND** 当前事实 payload MUST NOT 在顶层平铺完整 `actionContract`
- **AND** 当前事实 payload MUST NOT 把长期规则当作本轮普通数据传入

#### Scenario: adapter 保持供应商协议边界
- **WHEN** 实现 Planner 输入分层
- **THEN** `agent-core` MUST 继续只依赖模型无关 `PlannerPort` / `ModelActionCompletionInput` 或等价输入结构
- **AND** `agent-core` MUST NOT 构造 DeepSeek message、导入 DeepSeek 请求类型或依赖供应商专有字段
- **AND** adapter MAY 将稳定协议渲染为单个 system message 或供应商支持的等价高优先级 message
- **AND** adapter MUST NOT 注册 tool、执行 tool、修改 validation result 或绕过 runtime 校验

#### Scenario: trace 摘要保留分层证据
- **WHEN** 记录模型请求 trace summary
- **THEN** trace summary SHOULD 表达本次请求是否包含 `protocol`、`context` 和可选 `repairContext`
- **AND** trace summary MUST NOT 泄漏完整 tool output、secret、provider 原始敏感内容或跨用户事实

### Requirement: output contract action 示例必须使用真实 AgentAction 形态
系统 SHALL 区分模型可见 output contract 中的 action 示例和自然语言决策说明。字段名为 `expectedAction` 时，其值 MUST 是完整 `AgentAction` object；自然语言说明 MUST 使用 `expectedDecision` 或等价非 action 字段。

#### Scenario: expectedAction 不允许字符串
- **WHEN** `getAgentVisibleOutputContracts()` 或等价 helper 返回模型可见 output contract
- **THEN** 任意 `examples[].expectedAction` 如果存在，MUST 是 JSON object
- **AND** `examples[].expectedAction.type` MUST 是 `tool_call`、`final_answer` 或 `ask_user`
- **AND** `examples[].expectedAction` MUST NOT 是字符串、Markdown、伪代码或只描述 input 的片段

#### Scenario: 自然语言决策说明使用 expectedDecision
- **WHEN** output contract 需要表达“继续合法 tool_call、ask_user 或失败收口”等策略
- **THEN** 该说明 MUST 写入 `expectedDecision` 或等价字段
- **AND** 该字段 MUST 使用中文说明业务决策边界
- **AND** 该字段 MUST NOT 被命名为 `expectedAction`

#### Scenario: action 示例不复制占位业务 id
- **WHEN** output contract 示例包含 `visibleOutputs[]`
- **THEN** 示例中的 `exerciseId`、`resourceId`、`toolResultId`、`factRef` 或 `messageId` MUST 清楚表达不可照抄
- **AND** 示例 MUST 引导模型使用当前 run 可见事实
- **AND** 示例 MUST NOT 暴露看起来像真实 id 的可复制占位值
