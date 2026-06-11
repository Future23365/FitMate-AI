## ADDED Requirements

### Requirement: 模型可见运行预算必须区分总预算和单 tool 上限
系统 SHALL 在生产 LangChain Agent system prompt 或等价模型可见运行规则中说明整轮业务 tool 总预算、单个业务 tool 单轮调用上限和 activity report 上限。该说明 MUST 使用中文描述业务含义，技术字段名保持英文原样。

#### Scenario: system prompt 暴露新的预算边界
- **WHEN** Runtime 构造生产 LangChain Agent system prompt
- **THEN** 模型可见内容 MUST 说明本轮业务工具调用总预算为集中配置值
- **AND** 模型可见内容 MUST 说明每个业务工具的单轮调用上限为集中配置值
- **AND** 模型可见内容 MUST 说明 `reportAgentActivity` 不计入业务工具预算且有独立上限

#### Scenario: prompt 不新增业务流程特判
- **WHEN** 本 change 更新运行预算说明
- **THEN** prompt MUST NOT 根据用户原文、关键词、短句模板或具体 phrasing 指示固定 tool 调用流程
- **AND** prompt MUST NOT 把某个业务 tool 的异常 case 写成通用语义规则
