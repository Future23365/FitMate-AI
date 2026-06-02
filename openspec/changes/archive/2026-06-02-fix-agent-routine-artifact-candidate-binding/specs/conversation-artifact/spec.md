## ADDED Requirements

### Requirement: Agent 上下文中的 artifact 摘要必须保留主要动作 id

系统 SHALL 在构造 Agent `ContextPackage` 时，将 recent artifact index 中可稳定提取的主要 `exerciseIds` 作为结构化轻量事实传入 `recentArtifacts`。这些 id 只能来自当前用户可访问的 artifact index 或 payload，不得从自然语言 summary 反向推断。

#### Scenario: 推荐卡片进入下一轮 Agent 上下文

- **WHEN** 当前会话最近存在 `exercise_recommendation` artifact
- **AND** artifact index 中包含主要 `exerciseIds`
- **THEN** `ContextPackage.recentArtifacts` 中对应 artifact MUST 包含这些 `exerciseIds`
- **AND** Agent trace MUST 能展示这些 id 的数量或摘要

#### Scenario: Agent 需要完整 artifact payload

- **WHEN** Agent 需要读取推荐卡片的完整动作详情、展示字段或保存 payload
- **THEN** Agent MUST 通过 `getArtifactPayload` 或等价受控工具读取结构化事实
- **AND** 系统 MUST NOT 从 `summary` 文本反向重建完整 payload

#### Scenario: artifact 权限隔离

- **WHEN** Agent 读取 recent artifact 摘要或 payload
- **THEN** 系统 MUST 只返回当前 `userId` 可访问的 artifact 数据
- **AND** 系统 MUST NOT 将其他用户或其他不可访问会话的 `exerciseIds` 暴露给 Agent
