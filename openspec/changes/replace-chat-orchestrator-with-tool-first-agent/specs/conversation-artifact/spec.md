## ADDED Requirements

### Requirement: Agent 必须通过工具读取和修订 ConversationArtifact

系统 SHALL 让 Agent 通过受控工具读取、摘要、修订和保存 `ConversationArtifact`，不得通过 summary、候选摘要、recent messages 或模型记忆重建完整 artifact。

#### Scenario: Agent 读取最近训练卡片
- **WHEN** 用户请求解释、调整、替换或继续已有训练内容
- **THEN** Agent MUST 调用 `listRecentArtifacts`、`searchArtifacts` 或 `getArtifactPayload` 读取事实
- **AND** 工具 MUST 只返回当前 userId 可访问的 artifact
- **AND** 完整 payload MUST 经过 schema 校验后才能进入后续工具

#### Scenario: Agent 保存修订结果
- **WHEN** Agent 生成新的 routine、plan 或 patch 结果并通过校验
- **THEN** 系统 MUST 通过 `saveConversationArtifactRevision` 或等价写工具创建新 artifact revision
- **AND** 新 artifact MUST 记录来源 artifact 或来源消息
- **AND** 原 artifact MUST 按既有 revision 规则保持可读取或标记 superseded

#### Scenario: Summary 不是事实源
- **WHEN** Agent 需要动作列表、训练 section、exerciseId、时长或 artifactId
- **THEN** Agent MUST 通过工具读取结构化事实
- **AND** 系统 MUST NOT 允许 LLM 或服务端从 summary、recent messages 或自然语言回复正文反向构造可保存 payload
