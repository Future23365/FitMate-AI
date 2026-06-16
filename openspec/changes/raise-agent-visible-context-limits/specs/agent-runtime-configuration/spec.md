## MODIFIED Requirements

### Requirement: Tool 模型可见摘要截断预算必须通过集中配置表达
系统 SHALL 将生产 Agent tool 返回给主模型的 `ToolMessage content` 摘要长度预算和模型可见 JSON 结构预算集中配置。业务 tool 返回数量、repository hard cap、trace/user projection、terminal failure finalizer 和聊天 raw message 上限 MUST NOT 因本配置变更被同步放大。

#### Scenario: ToolMessage 使用集中模型可见摘要预算
- **WHEN** tool wrapper 将 `toModelVisibleSummary()` 序列化为 LangChain `ToolMessage content`
- **THEN** 字符串长度、数组项数和对象字段数预算 MUST 来自集中配置
- **AND** 正常受控候选事实在配置预算内 MUST NOT 被包装成 `status: "truncated"`
- **AND** 该结构预算 MUST 只用于模型可见摘要链路，不得扩大 userProjection、traceSummary、NDJSON projection 或 finalizer 输入投影

#### Scenario: searchExerciseResources 业务数量保持原业务边界
- **WHEN** `searchExerciseResources` 查询发布态动作事实
- **THEN** 每个 section 的默认返回数量和最大返回数量 MUST 保持原业务配置
- **AND** repository hard cap MUST 保持原业务上限，防止把摘要截断修复误变成扩大候选池

#### Scenario: inspectVisibleTrainingProposals 最近事实数量保持原业务边界
- **WHEN** `inspectVisibleTrainingProposals(operation = "list_recent")` 查询当前会话最近可见训练方案事实
- **THEN** 默认最近事实数量 MUST 保持原业务配置
- **AND** fact store hard cap MUST 保持原业务上限，防止把摘要截断修复误变成扩大历史事实读取

### Requirement: Tool 可见 payload 预算必须避免隐性结构裁剪
系统 SHALL 通过集中配置管理 tool result summary 的模型可见长度预算与结构预算。结构预算 MUST 覆盖数组项数和对象字段数，避免模型可见事实在字符串长度预算之前被固定小上限裁剪。

#### Scenario: 模型可见 tool result 使用集中结构预算
- **WHEN** tool wrapper 将 `toModelVisibleSummary()` 序列化为 LangChain `ToolMessage content`
- **THEN** 字符串长度、数组项数和对象字段数预算 MUST 来自集中配置
- **AND** 正常受控候选事实在配置预算内 MUST NOT 被包装成 `status: "truncated"`

#### Scenario: 非模型可见投影不使用放大的结构预算
- **WHEN** 系统生成 trace summary、userProjection、visible output NDJSON 投影或 terminal failure finalizer 输入
- **THEN** 投影 MUST 使用原有长度预算和默认结构裁剪
- **AND** 模型可见摘要预算 MUST NOT 改变这些非主 Agent `ToolMessage content` 链路的 payload 规模
