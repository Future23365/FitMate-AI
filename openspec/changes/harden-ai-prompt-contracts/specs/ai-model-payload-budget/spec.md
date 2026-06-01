## ADDED Requirements

### Requirement: 最终回复模型必须接收 compact server context
系统 SHALL 为最终自然语言回复构造 compact server context，避免把完整 resolved intent、完整候选动作列表或完整 artifact 结果作为未裁剪 JSON block 传给模型。

#### Scenario: 构造最终回复上下文
- **WHEN** `/api/chat` 需要调用最终回复模型
- **THEN** 模型可见 server context MUST 只包含回复所需的 action kind、触发状态、非 default 字段摘要、artifact success/failure 摘要和必要引用结果
- **AND** 模型可见 server context MUST NOT 包含完整 artifact payload、完整 candidate object 或不参与回复决策的 trace 诊断字段

#### Scenario: 执行型回复可模板化
- **WHEN** 服务端 response writer 已能基于 resolved intent 和 artifact result 生成用户可见回复
- **THEN** 系统 MAY 跳过最终回复模型调用
- **AND** token budget MUST 将该阶段标记为 skipped
- **AND** Trace MUST 记录跳过原因

### Requirement: 训练草稿候选 payload 必须按当前任务裁剪
系统 SHALL 按当前训练草稿任务裁剪候选动作、schema 和修复上下文，只向模型暴露生成或修复所需字段。

#### Scenario: 首次生成训练草稿
- **WHEN** 系统请求生成 routine 或 plan 草稿
- **THEN** 模型 payload MUST 只包含当前 intent、summary、latestUserMessage 和按分池裁剪的候选动作摘要
- **AND** 模型 payload MUST NOT 包含图片、完整动作说明、原始 embedding、完整数据库记录或无关 UI 展示字段

#### Scenario: 修复训练草稿
- **WHEN** 系统请求修复训练草稿
- **THEN** 模型 payload MUST 包含 originalDraft、validation errors、必要 recovery 指导和裁剪候选动作摘要
- **AND** 模型 payload MUST NOT 包含与当前 validation errors 无关的大字段或完整 trace 诊断
