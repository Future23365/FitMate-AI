## ADDED Requirements

### Requirement: Agent 必须通过工具读取和修订 ConversationArtifact

系统 SHALL 让 Agent 通过受控工具读取、摘要、修订和保存 `ConversationArtifact`，不得通过 summary、候选摘要、recent messages 或模型记忆重建完整 artifact。

#### Scenario: Agent 读取最近训练卡片
- **WHEN** 用户请求解释、调整、替换或继续已有训练内容
- **THEN** Agent MUST 调用 `listRecentArtifacts`、`searchArtifacts` 或 `getArtifactPayload` 读取事实
- **AND** 工具 MUST 只返回当前 userId 可访问的 artifact
- **AND** 完整 payload MUST 经过 schema 校验后才能进入后续工具
- **AND** 工具 MUST 返回 artifactPayloadId 或等价结构化 id，供 edit plan、Patch、Regenerate 和 Response Writer 引用

#### Scenario: Agent 保存修订结果
- **WHEN** Agent 生成新的 routine、plan 或 patch 结果并通过校验
- **THEN** 系统 MUST 通过 `saveConversationArtifactRevision` 或等价写工具创建新 artifact revision
- **AND** 新 artifact MUST 记录来源 artifact 或来源消息
- **AND** 新 artifact MUST 记录使用的 draftId、patchId、validationId、policyDecisionId 和 candidateSetId 摘要
- **AND** 原 artifact MUST 按既有 revision 规则保持可读取或标记 superseded

#### Scenario: Summary 不是事实源
- **WHEN** Agent 需要动作列表、训练 section、exerciseId、时长或 artifactId
- **THEN** Agent MUST 通过工具读取结构化事实
- **AND** 系统 MUST NOT 允许 LLM 或服务端从 summary、recent messages 或自然语言回复正文反向构造可保存 payload

#### Scenario: Artifact 引用和 active revision
- **WHEN** 用户引用旧 artifactId、lineage 中的历史 revision 或最近卡片
- **THEN** Agent MUST 通过工具解析 active revision 或明确读取指定历史 revision
- **AND** 解析结果 MUST 记录 revisionId、lineageId 和可访问性
- **AND** 系统 MUST NOT 让旧 ReferenceResolver-first 分支在 Agent 前直接决定 Patch 或 Regenerate
