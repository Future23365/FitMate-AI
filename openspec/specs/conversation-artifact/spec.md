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

### Requirement: Agent artifact 保存工具必须接受可选字段 null absence
Agent 保存 `ConversationArtifact` 或 artifact revision 时，系统 SHALL 区分可选字段的 `null` absence 与真正缺失必需资源。对于保存工具中表示“不适用”的可选字段，`null` MUST 被解析为未提供；必填字段、依赖资源和权限边界 MUST 继续由服务端校验。

#### Scenario: 首次保存 routine 时可选字段为 null
- **WHEN** Agent 已经生成 routine draft
- **AND** draft 已通过 validation
- **AND** policy 允许保存新 artifact
- **AND** `saveConversationArtifactRevision` 输入包含 `sourceArtifactId: null`、`payload: null`、`patchId: null` 或 `responseMessageId: null`
- **THEN** 系统 MUST 将这些可选字段视为未提供
- **AND** 系统 MUST 使用 `draftId` 解析服务端已登记 draft payload
- **AND** 系统 MUST NOT 因这些可选字段为 `null` 返回 Schema 校验失败

#### Scenario: 缺少 draft 或 payload 仍失败
- **WHEN** `saveConversationArtifactRevision` 输入没有 `draftId`
- **AND** 输入没有有效 `payload`
- **THEN** 系统 MUST 拒绝保存
- **AND** 系统 MUST NOT 因 `payload: null` 绕过 payload 或 draft 依赖校验

#### Scenario: 首次创建缺少 artifactKind 仍失败
- **WHEN** `saveConversationArtifactRevision` 输入没有 `sourceArtifactId`
- **AND** 输入没有有效 `artifactKind`
- **THEN** 系统 MUST 拒绝保存
- **AND** 系统 MUST NOT 因 `artifactKind: null` 绕过首次创建 artifact 的类型校验

### Requirement: Agent 保存前不得以 generated 终止
Agent 在生成或修订 routine / plan artifact 时，系统 SHALL 只有在已成功保存 `ConversationArtifact` 或 artifact revision 并获得 `revisionId` 后，才允许以 `generated` 或 `patched` 终止。若模型在保存前提前输出缺少保存结果的 `final_result`，系统 MUST 将该错误视为可恢复决策反馈，继续推进保存工具链。

#### Scenario: Policy 通过后模型提前返回 generated
- **WHEN** Agent 已经获得 `draftId`
- **AND** Agent 已经获得通过的 `validationId`
- **AND** Agent 已经获得允许写入的 `policyDecisionId`
- **AND** Agent 尚未获得 `saveConversationArtifactRevision` 返回的 `revisionId`
- **AND** 模型输出缺少 `artifact`、`revisionId` 或 `validationId` 的 `final_result.generated`
- **THEN** 系统 MUST NOT 将该结果投影为用户可见生成成功
- **AND** 系统 MUST 将该非法终止记录为可见的决策反馈
- **AND** 系统 SHOULD 继续下一轮 Agent 决策，使模型可以调用 `saveConversationArtifactRevision`

#### Scenario: 保存成功后允许 generated
- **WHEN** Agent 已经成功调用 `saveConversationArtifactRevision`
- **AND** 保存结果包含 `revisionId`、`artifactId`、`artifactKind`、`validationId` 和 `policyDecisionId`
- **THEN** 模型返回的 `final_result.generated` MUST 引用这些已登记资源
- **AND** 系统 MAY 将该结果投影为用户可见训练编排卡片

### Requirement: Agent 保存成功后必须产出合法 generated 终止结果
Agent 在生成 routine / plan artifact 并成功调用 `saveConversationArtifactRevision` 后，系统 SHALL 以本轮已登记保存结果为事实源产出合法 `AgentExecutionResult.generated`。如果模型在保存成功后返回缺少 `artifact`、`revisionId` 或 `validationId` 的 `final_result.generated`，系统 MUST NOT 丢弃已保存结果；在缺失字段可由当前 run 的保存 tool result 唯一确定时，系统 MUST 补齐结构化终止合同并继续执行最终投影。

#### Scenario: 保存成功后模型返回缺字段 generated
- **WHEN** Agent 已经成功调用 `saveConversationArtifactRevision`
- **AND** 保存结果包含 `artifactId`、`artifactKind`、`title`、`revisionId`、`validationId` 和 `policyDecisionId`
- **AND** 模型返回 `final_result.generated`
- **AND** 该结果缺少 `artifact`、`revisionId` 或 `validationId`
- **THEN** 系统 MUST 使用本轮保存 tool result 补齐 `artifact`、`revisionId`、`validationId` 和可用的 `policyDecisionId`
- **AND** 系统 MUST 继续执行 final result 引用校验
- **AND** 系统 MUST NOT 将该场景降级为 `model_output_invalid`

#### Scenario: 保存结果不足以补齐 generated
- **WHEN** 模型返回缺字段 `final_result.generated`
- **AND** 当前 run 没有成功的 `saveConversationArtifactRevision` 结果
- **OR** 保存结果缺少 `artifactId`、`artifactKind`、`title`、`revisionId` 或 `validationId`
- **THEN** 系统 MUST 保持 `AgentExecutionResult.generated` schema 严格
- **AND** 系统 MUST NOT 伪造 artifact summary 或保存结果
- **AND** 系统 MUST 返回结构化失败或继续既有可恢复流程

#### Scenario: Prompt 描述 generated 完整合同
- **WHEN** 系统请求模型做 Agent final result 决策
- **THEN** prompt MUST 给出 `generated` 终止结果的完整字段形态
- **AND** 该形态 MUST 包含 `artifact`、`revisionId`、`validationId` 和 `usedToolResultIds`

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

### Requirement: 旧 artifact revision 读取必须恢复到 active revision
系统 SHALL 在受控 artifact payload 读取中支持将当前用户可访问的旧 revision id 恢复到同 lineage 的 active artifact，并继续执行 payload schema 校验。

#### Scenario: superseded artifact 恢复成功
- **WHEN** Agent 请求读取当前用户当前 session 下 `status = "superseded"` 的 artifact id
- **AND** 该 artifact 所属 lineage 存在同 `userId`、同 `sessionId`、同 `kind` 的 active descendant revision
- **THEN** 系统 MUST 读取 active descendant revision 的 payload
- **AND** 系统 MUST 返回 requested artifact id 与 active artifact id
- **AND** 系统 MUST 对 active payload 执行对应 artifact kind 的 Schema 校验

#### Scenario: active artifact 直接读取
- **WHEN** Agent 请求读取当前用户可访问且 `status = "active"` 的 artifact id
- **THEN** 系统 MUST 直接读取该 artifact payload
- **AND** 系统 MUST 返回 revision resolution 状态为 direct 或等价值

#### Scenario: 不跨越权限和 lineage
- **WHEN** Agent 请求读取的 artifact 不属于当前 `userId`
- **OR** 该 artifact 属于不同 `sessionId`、不同 `kind` 或不存在 active descendant revision
- **THEN** 系统 MUST 返回结构化读取失败
- **AND** 系统 MUST NOT 返回其他用户、其他会话或其他 kind 的 payload

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

### Requirement: Artifact 生成成功必须引用真实写工具结果
系统 SHALL 只有在当前 run 已成功执行 `saveConversationArtifactRevision` 或等价写工具，并获得可验证 `revisionId` 后，才允许 routine / plan artifact 以 `generated` 或 `patched` 状态终止。

#### Scenario: 模型伪造 revisionId
- **WHEN** 模型返回 `final_result.generated` 或 `final_result.patched`
- **AND** 结果中的 `revisionId` 不属于当前 run 已登记的写工具结果
- **THEN** 系统 MUST 拒绝该成功状态
- **AND** 系统 MUST NOT 创建或展示成功训练 artifact 卡片
- **AND** 若已有可保存资源，系统 MUST 通过 `AgentDecisionFeedback` 推荐继续调用写工具

#### Scenario: 写工具保存成功
- **WHEN** `saveConversationArtifactRevision` 成功创建或修订 routine / plan artifact
- **THEN** 写工具结果 MUST 返回 `artifactId`、`revisionId`、`artifactKind`、`validationId` 和 `policyDecisionId`
- **AND** runtime MUST 将这些 id 登记到 dependency graph
- **AND** Response Writer MUST 只消费通过引用校验的 `AgentExecutionResult`

### Requirement: Artifact final result 结构化字段必须由服务端事实投影
系统 SHALL 以当前 run 已登记写工具结果作为 `AgentExecutionResult.generated` / `patched` 中 artifact summary、`revisionId`、`validationId` 和 `policyDecisionId` 的事实来源。

#### Scenario: 模型输出缺少保存字段
- **WHEN** 当前 run 已有唯一成功写工具结果
- **AND** 模型最终结果缺少 artifact summary、`revisionId`、`validationId` 或 `policyDecisionId`
- **THEN** runtime MAY 从写工具结果投影这些结构化字段
- **AND** 投影结果 MUST 继续通过当前 run 引用校验
- **AND** runtime MUST NOT 从模型自由文本或 `conversationSummary` 重建 artifact payload

#### Scenario: patched 结果必须同时引用 patch 和保存事实
- **WHEN** 模型返回 `final_result.patched`
- **THEN** `patchResult.patchId`、`patchResult.sourceArtifactId`、`patchResult.changedExerciseIds` 和 patch summary MUST 来自当前 run 已登记的 patch 工具结果或等价结构化 patch 结果
- **AND** `artifact`、`revisionId`、`validationId` 和 `policyDecisionId` MUST 来自当前 run 已登记的保存、校验和策略结果
- **AND** runtime MUST NOT 只凭保存结果、模型自由文本或旧 artifact summary 猜测 patch 摘要
- **AND** Response Writer MUST 只展示通过该组合引用校验的 patched 结果

#### Scenario: 多个写工具结果无法唯一确定
- **WHEN** 当前 run 中存在多个可能匹配的写工具结果
- **AND** 模型 final result 没有足够引用来唯一确定使用哪一个保存结果
- **THEN** runtime MUST NOT 猜测选择 artifact
- **AND** 系统 MUST 返回可恢复 feedback 或 failed 结果

