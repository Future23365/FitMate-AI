## MODIFIED Requirements

### Requirement: Tool 可见事实数量必须通过集中配置表达默认值
系统 SHALL 将生产 Agent tool 暴露给模型的可见事实数量默认值集中配置。业务 tool 或 repository MAY 保留 hard cap，但默认值 MUST 来自 `lib/server/config/`。当准确度优先配置被调大时，相关 hard cap MUST 与集中配置保持同一数量级，避免配置值被底层旧上限静默截断。

#### Scenario: searchExerciseResources 使用集中返回数量
- **WHEN** `searchExerciseResources` 查询发布态动作事实
- **THEN** 每个 section 的默认返回数量 MUST 来自集中配置
- **AND** tool 输出中的 `maxReturned` MUST 反映该配置值或其被 hard cap 限制后的有效值
- **AND** repository MUST 保留确定性 hard cap，防止配置误调导致模型可见 payload 过大
- **AND** 当集中配置调高 `maxCandidateCountPerSection` 时，repository hard cap MUST 同步调高或显式说明仍然更低的原因

#### Scenario: resolveExerciseResourceMentions 使用集中匹配数量
- **WHEN** `resolveExerciseResourceMentions` 解析动作 mention
- **THEN** 默认 `maxMatches` MUST 来自集中配置
- **AND** handler 或 repository MUST 继续限制最大匹配数量，防止返回无界候选

#### Scenario: inspectVisibleTrainingProposals 使用集中最近事实数量
- **WHEN** `inspectVisibleTrainingProposals(operation = "list_recent")` 查询当前会话最近可见训练方案事实
- **THEN** 默认最近事实数量 MUST 来自集中配置
- **AND** fact store MUST 继续保留 hard cap，防止读取过多历史事实进入模型上下文
- **AND** 当集中配置调高 `recentFactListLimit` 时，fact store hard cap MUST 同步调高或显式说明仍然更低的原因

### Requirement: Tool 可见 payload 预算必须避免隐性结构裁剪
系统 SHALL 通过集中配置管理 tool result summary、userProjection、traceSummary、terminal failure finalizer 输入和 visible output 投影的长度预算与结构预算。结构预算 MUST 覆盖数组项数和对象字段数，避免模型可见事实在字符串长度预算之前被固定小上限裁剪。

#### Scenario: 模型可见 tool result 使用集中结构预算
- **WHEN** tool wrapper 将 `toModelVisibleSummary()` 序列化为 LangChain `ToolMessage content`
- **THEN** 字符串长度、数组项数和对象字段数预算 MUST 来自集中配置
- **AND** 正常受控候选事实在配置预算内 MUST NOT 被包装成 `status: "truncated"`

#### Scenario: finalizer 读取更完整的失败上下文
- **WHEN** 主 Agent 失败后构造 terminal failure finalizer 输入
- **THEN** succeeded tool summary、failed tool summary 和 schema issue 投影 MUST 使用集中长度与结构预算
- **AND** finalizer MUST 继续只消费受控摘要，不读取完整 raw handler payload

#### Scenario: trace 和用户投影保持可回收预算
- **WHEN** 系统生成 trace summary、userProjection 或 visible output NDJSON 投影
- **THEN** 投影 MUST 使用集中预算或明确 trace 预算
- **AND** 预算 MUST 保留确定性上限，便于后续 token 和 payload 优化统一调整
