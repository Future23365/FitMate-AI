# agent-text-chat-basic-answering Specification

## Purpose
TBD - created by archiving change stabilize-agent-text-chat-basic-final-answer. Update Purpose after archive.
## Requirements
### Requirement: 空工具文本聊天必须支持基础自然语言问答
生产 `/api/chat` 文本聊天 SHALL 在当前没有注册业务 tool 的阶段继续支持基础自然语言问答。模型 MUST 通过合法 `final_answer` 决定用户可见回复，服务端 MUST NOT 用用户原文关键词、固定业务文案或隐藏工具替代该回复。

#### Scenario: 用户询问助手能做什么
- **WHEN** 当前生产文本聊天使用空 `ToolRegistry`
- **AND** 用户询问助手能力、基础聊天能力或当前能帮什么
- **THEN** 模型 SHOULD 基于可见 `tools` 和通用文本能力返回合法 `final_answer`
- **AND** `final_answer.content` SHOULD 用自然语言说明当前可以进行普通文本交流、解释训练原则、梳理目标和整理信息
- **AND** 回复 MUST NOT 声称可以直接执行未注册的业务 tool、保存训练计划或查询数据库事实
- **AND** 服务端 MUST NOT 基于该用户原文写死能力说明回复

#### Scenario: 空工具阶段的普通可回答问题
- **WHEN** 当前生产文本聊天使用空 `ToolRegistry`
- **AND** 用户提出不需要工具执行的普通问答、概念解释、信息整理或训练原则说明
- **THEN** 模型 MUST 使用 `final_answer` 返回自然语言回答
- **AND** 模型 MUST NOT 返回 `tool_call`
- **AND** Response Renderer MUST 将已校验的 `final_answer.content` 投影为 `content` 事件

### Requirement: Agent LLM 默认 prompt 必须用中文说明基础问答收口规则
系统 SHALL 使用中文 Agent LLM 默认 prompt 描述 `AgentAction` 决策合同。该 prompt MUST 明确空工具、基础问答、能力说明、工具调用、澄清和 repair 场景的行为边界。

#### Scenario: Prompt 说明空工具行为
- **WHEN** 默认 Agent LLM prompt 被构造成 system message
- **THEN** prompt MUST 使用中文说明 `tools` 为空时禁止返回 `tool_call`
- **AND** prompt MUST 要求可直接回答的问题使用 `final_answer`
- **AND** prompt MUST 要求缺少必要用户信息时使用 `ask_user`

#### Scenario: Prompt 说明能力回答边界
- **WHEN** 默认 Agent LLM prompt 被构造成 system message
- **THEN** prompt MUST 要求模型回答能力边界时基于当前可见 `tools` 和通用文本能力
- **AND** prompt MUST 禁止模型承诺执行未注册工具、查询不可见数据库事实或保存未接入的业务结果
- **AND** prompt MUST 不包含具体业务 toolName、服务端关键词分流规则、动作库查询流程或训练计划保存流程

#### Scenario: Prompt 说明 repair 后修正 action
- **WHEN** 模型上下文包含 invalid action observation、repair 反馈或上轮结构化失败摘要
- **THEN** prompt MUST 要求模型优先修正为合法 `AgentAction`
- **AND** 如果没有可执行工具，模型 MUST 选择 `final_answer` 或 `ask_user`
- **AND** 模型 MUST NOT 重复旧式 `answered`、`final_result`、`assistant_action` 或其他非当前合同 action

### Requirement: 基础问答不得扩大当前业务能力
基础文本问答 SHALL 保持当前 AgentAction、ToolRegistry 和 tool-first 能力边界。支持基础问答 MUST NOT 恢复旧 AgentOrchestrator、绕过 Action Validator、注册未声明业务 tool 或新增服务端自然语言分流。

#### Scenario: 基础问答通过现有 AgentAction 合同完成
- **WHEN** `/api/chat` 处理基础文本问答
- **THEN** 系统 MUST 继续通过 `LlmPlanner -> runAgentRuntime -> Action Validator -> Response Renderer` 或等价当前链路收口
- **AND** 成功回复 MUST 来自合法 `final_answer`
- **AND** 系统 MAY 使用当前 production registry 暴露 `searchExerciseResources`
- **AND** 系统 MUST NOT 注册 fixture tool、训练生成 tool、保存 artifact tool、用户记忆 tool 或未在当前 OpenSpec change 中声明的业务 tool
- **AND** 系统 MUST NOT 通过用户原文关键词、正则、同义词表或短句模板路由基础问答

### Requirement: 有只读业务 tool 时基础问答必须保持直接回答边界
生产文本聊天 SHALL 在 registry 非空时继续支持不需要数据库事实的普通自然语言问答。模型 MUST 基于当前可见 tools 判断是否需要 tool call，而服务端 MUST NOT 用隐藏业务分支替代模型决策。

#### Scenario: 普通问题不调用动作查询 tool
- **WHEN** production registry 包含 `searchExerciseResources`
- **AND** 用户提出不需要当前动作库事实的普通问答、概念解释、能力说明、信息整理或训练原则说明
- **THEN** 模型 MUST 使用合法 `final_answer` 返回自然语言回答
- **AND** 模型 MUST NOT 调用 `searchExerciseResources`
- **AND** Response Renderer MUST 将已校验的 `final_answer.content` 投影为 `content` 事件

#### Scenario: 能力说明基于当前可见 tools
- **WHEN** production registry 包含 `searchExerciseResources`
- **AND** 用户询问助手当前能做什么
- **THEN** 模型 MUST 基于当前可见 `tools` 和通用文本能力回答能力边界
- **AND** 回复 MAY 说明当前可以通过受控工具查询发布态动作库事实
- **AND** 回复 MUST NOT 声称可以生成训练卡片、保存计划、修改日程、查询未发布动作或执行未注册业务 tool

