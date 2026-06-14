## ADDED Requirements

### Requirement: 默认 prompt 必须表达 batch-aware 工具循环预算
系统 SHALL 在默认 LangChain Agent system prompt 中用中文表达当前业务 tool 预算边界。Prompt MUST 说明整轮业务 tool 总预算和单个业务 tool 连续模型决策批次上限，并且 MUST 区分同一模型响应中的并列 `tool_calls` 与跨 observation 的连续 tool loop。该说明 MUST 保持通用 Agent 合同层级，不得写入具体业务 `toolName`、用户短句、关键词、正则、同义词表、业务字段组合或固定恢复流程。

#### Scenario: prompt 区分 fan-out 和 loop
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明同一业务 tool 的连续限制用于约束跨模型决策批次的重复请求
- **AND** system message MUST 说明同一模型响应内的并列 `tool_calls` 不按循环计数
- **AND** system message MUST 说明重复同参输入会被去重或拒绝
- **AND** system message MUST 保持 `tool_calls`、`runtimeMetadata.activitySummary`、`maxToolCalls`、`maxToolCallsPerTool` 等技术标识英文原样

#### Scenario: prompt 不引入业务特例
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST NOT 根据用户原文、关键词、短句模板、业务 phrasing 或具体业务 `toolName` 规定模型必须拆分、合并或改写 tool calls
- **AND** system message MUST NOT 描述未注册 tool、隐藏业务服务或绕过 LangChain tool catalog 的恢复流程
