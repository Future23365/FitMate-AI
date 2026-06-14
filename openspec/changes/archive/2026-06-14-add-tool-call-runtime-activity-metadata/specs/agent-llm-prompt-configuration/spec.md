## REMOVED Requirements

### Requirement: 默认 prompt 必须区分业务 tool 预算和 activity report 预算
**Reason**: 独立 `reportAgentActivity` tool 和 activity report 预算将被 runtime metadata 合同替代。继续要求 prompt 区分 activity report 预算，会暗示模型仍可或应单独调用 activity tool。

**Migration**: 默认 prompt / tool schema 说明改为表达 `runtimeMetadata.activitySummary` 是业务 tool call arguments 中的可选 UI metadata；它不产生独立 tool call，不支撑 final grounding，不保存到聊天历史。

## MODIFIED Requirements

### Requirement: 模型可见运行预算必须区分总预算和单 tool 上限
系统 SHALL 在生产 LangChain Agent system prompt 或等价模型可见运行规则中说明整轮业务 tool 总预算和单个业务 tool 单轮调用上限。该说明 MUST 使用中文描述业务含义，技术字段名保持英文原样。模型可见说明 MAY 说明业务 tool arguments 支持 `runtimeMetadata.activitySummary` 作为当前请求内 UI 状态摘要，但 MUST NOT 把它描述为独立 tool、独立预算或业务事实来源。

#### Scenario: system prompt 暴露新的预算边界
- **WHEN** Runtime 构造生产 LangChain Agent system prompt
- **THEN** 模型可见内容 MUST 说明本轮业务工具调用总预算为集中配置值
- **AND** 模型可见内容 MUST 说明每个业务工具的单轮调用上限为集中配置值
- **AND** 模型可见内容 MAY 说明 `runtimeMetadata.activitySummary` 不会产生额外业务 tool 调用
- **AND** 模型可见内容 MUST NOT 说明 `reportAgentActivity` 有独立上限、独立预算或应该被单独调用

#### Scenario: prompt 不新增业务流程特判
- **WHEN** 本 change 更新运行预算或 runtime metadata 说明
- **THEN** prompt MUST NOT 根据用户原文、关键词、短句模板或具体 phrasing 指示固定 tool 调用流程
- **AND** prompt MUST NOT 把某个业务 tool 的异常 case 写成通用语义规则
- **AND** prompt MUST NOT 要求模型为了刷新 UI 状态而在没有业务 tool 需求时调用工具
