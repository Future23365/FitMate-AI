## ADDED Requirements

### Requirement: 已读取 artifact payload 必须能重新投影聊天卡片

系统 SHALL 在只读 artifact 查看路径中，将本轮已通过受控工具读取并通过 Schema 校验的 routine / plan payload 重新投影为聊天卡片事件。该投影 MUST 只来自当前用户可访问的 `ConversationArtifact` payload 或当前 run 已登记 tool result，不得从回复正文、summary、artifact title 或 recent artifact 摘要反向重建 payload。

#### Scenario: answered 引用 routine payload
- **WHEN** Agent 本轮成功调用 `getArtifactPayload` 或等价只读工具读取 routine payload
- **AND** `final_result.answered` 的 `usedToolResultIds` 引用该读取结果
- **THEN** 聊天流 MUST 输出 `artifact_validated` 和 `artifact` 事件
- **AND** 事件 metadata MUST 包含 `artifactKind = "routine"`、`artifactId` 和完整可展示 payload
- **AND** 前端 MUST 能在当前 assistant bubble 下展示 routine 卡片

#### Scenario: answered 引用 plan payload
- **WHEN** Agent 本轮成功调用 `getArtifactPayload` 或等价只读工具读取 plan payload
- **AND** `final_result.answered` 的 `usedToolResultIds` 引用该读取结果
- **THEN** 聊天流 MUST 输出 `artifact_validated` 和 `artifact` 事件
- **AND** 事件 metadata MUST 包含 `artifactKind = "plan"`、`artifactId` 和完整可展示 payload

#### Scenario: 没有完整 payload
- **WHEN** Agent 只拥有 recent artifact summary、artifact title、自然语言回复或 conversationSummary
- **THEN** 系统 MUST NOT 生成 routine / plan 卡片事件
- **AND** 系统 MUST 要求模型先通过受控工具读取完整 payload，或返回澄清、普通回答、blocked 或 failed

### Requirement: Artifact 写入和聊天自动保存必须避免重复 active 记录

系统 SHALL 对 Agent 写入和聊天自动保存两条入口使用一致的 artifact 绑定与去重规则。同一用户、同一会话、同一 assistant message、同一 kind 和同一稳定 payload 的卡片 MUST 只保留一条 active `ConversationArtifact` 与一条 active `ArtifactIndex`。

#### Scenario: 同一 message 重复保存同一 routine payload
- **WHEN** Agent 写工具已经为当前 `messageId` 创建 active routine artifact
- **AND** 聊天自动保存随后提交同一 `messageId` 和稳定相同的 routine payload
- **THEN** 系统 MUST 复用已有 artifact 或刷新其 index
- **AND** 系统 MUST NOT 创建第二条 active routine artifact
- **AND** 下一轮 recent artifact summaries MUST 只返回该 message 对应的一条 active routine

#### Scenario: 同一 message payload 发生变化
- **WHEN** 同一 `userId + sessionId + messageId + kind` 已有 active artifact
- **AND** 新提交的 payload 与原 payload 稳定比较不同
- **THEN** 系统 MUST 按既有 revision 或 superseded 规则处理
- **AND** recent artifact summaries MUST 只暴露新的 active artifact
- **AND** 原 payload MUST 保持可诊断或按既有生命周期规则读取

#### Scenario: 旧 artifact 未绑定 message
- **WHEN** 当前会话存在未绑定 `messageId` 的旧 active artifact
- **AND** 本轮 Agent 或聊天自动保存为当前 assistant message 写入稳定相同 payload
- **THEN** 系统 MUST 优先将 active artifact 事实收敛到当前 message 绑定
- **AND** 系统 MUST 避免 recent artifact summaries 同时暴露旧未绑定记录和新绑定记录作为两个可保存或可查看候选

### Requirement: Recent artifact 列表必须反映用户端可见卡片事实

系统 SHALL 确保传给 Agent 的 recent artifact summaries 与当前会话用户可见卡片事实保持一致。重复 active artifact、superseded revision 或同一 message 的重复 index MUST NOT 让模型看到比用户端更多的等价训练候选。

#### Scenario: 前端只有两张 routine 卡片
- **WHEN** 当前会话用户端只有两条 assistant message 绑定 routine 卡片
- **AND** ArtifactIndex 中存在同 payload 或同 message 的重复记录
- **THEN** `listRecentArtifactSummariesForCurrentUser` MUST 只返回去重后的 active routine summaries
- **AND** Agent MUST NOT 因重复 index 认为当前会话有四套等价训练

#### Scenario: 不同 message 的不同 routine
- **WHEN** 当前会话存在多个不同 assistant message 绑定不同 routine payload
- **THEN** recent artifact summaries MUST 保留这些不同训练候选
- **AND** 系统 MUST NOT 仅因 title 或 summary 相同而合并不同 payload
