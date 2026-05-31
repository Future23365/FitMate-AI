## ADDED Requirements

### Requirement: 只读 tool loop 必须遵守 ReferenceResolver 候选边界
系统 SHALL 保证 LLM 通过只读工具补查 artifact 时不能绕过 ReferenceResolver 已建立的候选边界。

#### Scenario: 引用解析已 resolved
- **WHEN** ReferenceResolver 返回 `resolved`
- **AND** tool loop 需要读取该 artifact 的详情
- **THEN** tool loop MUST 只能通过 `getArtifactPayload` 读取当前用户可访问的已解析 artifact 或其 active revision
- **AND** tool loop MUST NOT 接受模型凭空指定的候选外 artifactId 作为事实

#### Scenario: 引用解析为 ambiguous
- **WHEN** ReferenceResolver 返回 `ambiguous`
- **AND** 用户尚未确认候选
- **THEN** tool loop MUST NOT 读取任一候选的完整 payload 来替用户决定目标
- **AND** 系统 MUST 继续返回候选澄清问题

#### Scenario: 引用解析为 not_found
- **WHEN** ReferenceResolver 返回 `not_found`
- **THEN** tool loop MUST NOT 使用 conversationSummary、recent artifact 摘要或模型猜测构造 artifactId
- **AND** 系统 MUST 进入澄清或新生成流程

### Requirement: LLM 触发 artifact 搜索必须使用受控检索工具
系统 SHALL 只允许 LLM 通过受控 `searchArtifacts` 工具检索 artifact 候选摘要。

#### Scenario: LLM 需要查找历史 artifact
- **WHEN** LLM 需要根据用户描述查找历史训练内容
- **THEN** 系统 MUST 执行受控 `searchArtifacts` 工具
- **AND** 工具 MUST 按当前 `userId`、`sessionScope`、`kind`、`query` 和 `limit` 过滤
- **AND** 返回给模型的内容 MUST 是候选摘要而不是完整 payload

#### Scenario: LLM 搜索结果不唯一
- **WHEN** `searchArtifacts` 返回多个相近候选且用户意图依赖唯一目标
- **THEN** 系统 MUST 生成候选澄清
- **AND** 系统 MUST NOT 让 LLM 在没有用户确认时执行修改、替换或重复生成动作
