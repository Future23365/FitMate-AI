## ADDED Requirements

### Requirement: 默认 prompt 必须约束当前 request tools 可调用边界
系统 SHALL 在默认 LangChain Agent system prompt 中表达当前 provider request 实际暴露的 `tools` schema 是本次模型调用唯一可调用的工具目录。Prompt MUST 说明历史消息、历史 `tool_calls` 或历史 tool result 中出现过的 `toolName` 不代表该工具在当前 request 中仍可调用。该规则 MUST 是通用工具调用边界，不得写具体业务 `toolName`、用户短句、字段组合或服务端语义分流。

#### Scenario: Prompt 声明当前 request tools 是唯一工具目录
- **WHEN** 默认 LangChain Agent system prompt 被构造成模型可见 system message
- **THEN** prompt MUST 使用中文说明模型只能调用当前 provider request 实际暴露的 `tools` schema
- **AND** prompt MUST 使用中文说明历史中出现过但当前 request 未暴露的 `toolName` 不可调用
- **AND** prompt MUST 保持 `tools`、`toolName` 和 `tool_calls` 等技术标识英文原样

#### Scenario: Prompt 不列不可用业务工具
- **WHEN** 默认 LangChain Agent system prompt 表达当前 request tools 边界
- **THEN** prompt MUST NOT 列出因连续调用上限、预算或其它 runtime 状态而不可用的具体业务 tool 名称
- **AND** prompt MUST NOT 暴露不可用原因清单作为主模型常规决策上下文
- **AND** 不可用工具名、原因和计数 MAY 继续只保留在 trace、runtime 失败 execution 或 terminal failure finalizer 输入中

#### Scenario: Prompt 不新增服务端语义分流
- **WHEN** 实现当前 request tools 边界提示
- **THEN** `/api/chat`、LangChain runtime、tool wrapper、validator 和 response adapter MUST NOT 新增基于用户原文、关键词、正则、同义词表、短句模板、具体业务 `toolName` 或业务字段组合的分支
- **AND** 服务端 MUST NOT 将模型返回的未暴露 tool call 改写成其它 tool call 或最终回答策略
