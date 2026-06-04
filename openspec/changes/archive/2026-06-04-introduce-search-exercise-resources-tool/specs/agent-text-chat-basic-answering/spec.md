## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: 基础问答不得扩大当前业务能力
基础文本问答 SHALL 保持当前 AgentAction、ToolRegistry 和 tool-first 能力边界。支持基础问答 MUST NOT 恢复旧 AgentOrchestrator、绕过 Action Validator、注册未声明业务 tool 或新增服务端自然语言分流。

#### Scenario: 基础问答通过现有 AgentAction 合同完成
- **WHEN** `/api/chat` 处理基础文本问答
- **THEN** 系统 MUST 继续通过 `LlmPlanner -> runAgentRuntime -> Action Validator -> Response Renderer` 或等价当前链路收口
- **AND** 成功回复 MUST 来自合法 `final_answer`
- **AND** 系统 MAY 使用当前 production registry 暴露 `searchExerciseResources`
- **AND** 系统 MUST NOT 注册 fixture tool、训练生成 tool、保存 artifact tool、用户记忆 tool 或未在当前 OpenSpec change 中声明的业务 tool
- **AND** 系统 MUST NOT 通过用户原文关键词、正则、同义词表或短句模板路由基础问答
