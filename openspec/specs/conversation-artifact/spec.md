# conversation-artifact Specification

## Purpose
TBD - created by archiving change change-001-conversation-artifact. Update Purpose after archive.
## Requirements
### Requirement: 聊天结构化卡片必须保存为 artifact
系统 SHALL 将成功推送给用户的结构化训练卡片保存为 `ConversationArtifact`，作为后续 AI 引用、读取和修订的事实对象。

#### Scenario: 推送动作推荐卡片
- **WHEN** 聊天服务成功向用户推送动作推荐卡片
- **THEN** 系统 MUST 创建归属于当前 `userId` 和 `sessionId` 的 `ConversationArtifact`
- **AND** artifact MUST 记录对应 `messageId`
- **AND** artifact MUST 使用 `kind = "exercise_recommendation"`
- **AND** artifact MUST 保存服务端校验后的结构化 payload

#### Scenario: 推送 routine 卡片
- **WHEN** 聊天服务成功向用户推送单次 routine 卡片
- **THEN** 系统 MUST 创建归属于当前 `userId` 和 `sessionId` 的 `ConversationArtifact`
- **AND** artifact MUST 使用 `kind = "routine"`
- **AND** artifact payload MUST 保留热身、训练、拉伸 section、循环配置和动作执行参数

#### Scenario: 推送 plan 卡片
- **WHEN** 聊天服务成功向用户推送长期 plan 卡片
- **THEN** 系统 MUST 创建归属于当前 `userId` 和 `sessionId` 的 `ConversationArtifact`
- **AND** artifact MUST 使用 `kind = "plan"`
- **AND** artifact payload MUST 保留训练日、休息日、频率、周期和动作结构

### Requirement: Artifact 必须记录来源和版本状态
系统 SHALL 为每个 artifact 记录来源实体、版本关系和生命周期状态，避免后续引用读取到被覆盖的历史内容。

#### Scenario: artifact 被保存为 routine
- **WHEN** 用户将聊天 routine artifact 保存为 `WorkoutRoutine`
- **THEN** artifact MUST 记录 `sourceEntityKind = "workout_routine"`
- **AND** artifact MUST 记录保存后的 `sourceEntityId`
- **AND** 系统 MUST NOT 通过覆盖 artifact payload 表达已保存实体的后续编辑

#### Scenario: artifact 创建修订版本
- **WHEN** 系统基于某个 artifact 生成修订后的训练卡片
- **THEN** 系统 MUST 创建新的 artifact version
- **AND** 新 artifact MUST 记录 `revisionOfArtifactId`
- **AND** 原 artifact MUST 标记为 `superseded`
- **AND** 原 artifact payload MUST 保持可读取

### Requirement: ArtifactIndex 必须支持轻量检索
系统 SHALL 为每个 active artifact 维护轻量 `ArtifactIndex`，供引用解析和上下文构建读取。

#### Scenario: 创建 artifact 索引
- **WHEN** 系统创建新的 `ConversationArtifact`
- **THEN** 系统 MUST 同步创建或更新对应 `ArtifactIndex`
- **AND** index MUST 包含 `artifactId`、`userId`、`sessionId`、`kind`、`scope`、标题文本、摘要文本和主要 `exerciseIds`
- **AND** index SHOULD 包含可从 payload 稳定提取的目标、肌群、器械、时长、频率和训练天数字段

#### Scenario: 读取 recent artifacts
- **WHEN** 会话上下文构建器读取当前会话最近 artifact
- **THEN** 系统 MUST 只返回当前 `userId` 可访问的 artifact index
- **AND** 系统 MUST 优先返回当前 `sessionId` 下较新的 active artifact
- **AND** 系统 MUST 对 `superseded` 或 `archived` artifact 降权或排除

### Requirement: conversationSummary 不得作为完整训练事实源
系统 SHALL 保持 `conversationSummary` 的自然语言摘要职责，不得依赖它恢复完整训练卡片 payload。

#### Scenario: 构建下一轮聊天上下文
- **WHEN** 系统为下一轮聊天模型构造上下文
- **THEN** `conversationSummary` MAY 包含用户目标、偏好、限制和最近意图摘要
- **AND** 完整动作推荐、routine 或 plan payload MUST 从 `ConversationArtifact` 读取
- **AND** 系统 MUST NOT 从自然语言 summary 反向重建可保存训练卡片

