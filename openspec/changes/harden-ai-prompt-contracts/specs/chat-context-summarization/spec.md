## ADDED Requirements

### Requirement: Summary 更新必须区分事实来源可信度
系统 SHALL 在更新 `conversationSummary` 时优先使用服务端结构化事实和内部动作摘要，并将 assistant 自然语言回复视为弱参考。

#### Scenario: 服务端动作摘要存在
- **WHEN** 本轮产生 resolved intent、artifact result、referenceResolution、policy 结果或其他服务端内部动作摘要
- **THEN** summary 更新 MUST 优先保留这些结构化事实
- **AND** summary MUST NOT 因 assistant 自然语言中的表达偏差覆盖结构化事实

#### Scenario: assistant 回复包含默认值或流程文案
- **WHEN** assistant 回复提到默认时长、默认频率、默认经验、马上生成、稍后生成、后台生成或等价流程表达
- **THEN** summary 更新 MUST NOT 将这些内容记录为用户明确事实
- **AND** summary MAY 只记录本轮用户实际提供的信息、服务端实际生成的 artifact 和仍待确认的问题

### Requirement: Summary 不得替代 artifact 和 reference 事实源
系统 SHALL 将 `conversationSummary` 作为自然语言历史摘要，而不是历史训练内容的完整事实源。

#### Scenario: 后续短指令依赖最近训练内容
- **WHEN** 用户通过“这个”“它”“第一个动作”“改成45分钟”等表达引用历史训练结果
- **THEN** 系统 MUST 结合 artifact summary、ReferenceResolver 或服务端 hydrated context 确认对象
- **AND** 系统 MUST NOT 仅凭 `conversationSummary` 编造 artifactId、动作顺序或完整训练内容

#### Scenario: summary 与 artifact 事实冲突
- **WHEN** `conversationSummary` 与当前用户可访问 artifact summary 或 referenceResolution 结果冲突
- **THEN** 模型可见上下文和服务端执行路径 MUST 以 artifact 或 referenceResolution 为准
- **AND** Trace MUST 能展示最终采用的结构化事实来源
