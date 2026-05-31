## ADDED Requirements

### Requirement: Summary 必须参与预算化上下文选择
系统 SHALL 将 `conversationSummary` 作为历史上下文的唯一模型可见来源，并且 MUST 由 token budget 决策层决定本轮是否需要读取、更新或仅复用 summary。

#### Scenario: 构造聊天模型输入
- **WHEN** 系统为聊天相关 LLM 调用构造模型输入
- **THEN** 模型可见历史上下文 MUST 来自 `conversationSummary`
- **AND** 模型请求 MUST 只包含当前最新用户消息作为本轮 user message
- **AND** 模型请求 MUST NOT 为降低实现复杂度重新传入完整历史消息窗口

#### Scenario: 复用已有 summary
- **WHEN** 本轮预算决策判断用户消息不会改变长期上下文事实
- **THEN** 系统 MUST 复用已有 `conversationSummary`
- **AND** 系统 MUST NOT 发起仅用于重写同等内容 summary 的 LLM 调用
- **AND** Trace MUST 记录 summary 更新被跳过的原因

#### Scenario: 更新 summary
- **WHEN** 本轮用户消息、助手回复或服务端动作摘要产生新的长期上下文事实
- **THEN** 系统 MUST 更新 `conversationSummary`
- **AND** 更新输入 MUST 只包含旧 summary、本轮最新用户消息、助手回复摘要和服务端动作摘要
- **AND** 更新输入 MUST NOT 包含完整历史消息窗口
