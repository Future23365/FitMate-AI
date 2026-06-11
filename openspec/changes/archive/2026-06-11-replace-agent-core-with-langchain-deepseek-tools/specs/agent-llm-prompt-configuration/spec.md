## ADDED Requirements

### Requirement: LangChain 模型可见合同必须描述 native Tool Calling 边界
系统 SHALL 将生产模型可见合同迁移为 LangChain agent prompt、DeepSeek native Tool Calling tools、tool schema description、tool result summary 和结构化终态说明。模型可见合同 MUST NOT 要求模型输出旧 `AgentAction` JSON。

#### Scenario: 构造 LangChain system prompt
- **WHEN** 生产 `/api/chat` 构造 LangChain agent
- **THEN** system prompt MUST 使用中文说明 AI 健身助手角色、非医疗边界、tool calling 规则、能力边界和终态回答要求
- **AND** prompt MUST NOT 要求模型输出 `{ "type": "tool_call" }`、`final_answer` 或 `ask_user` 旧 action JSON
- **AND** prompt MUST NOT 描述旧 `AgentAction`、旧 `ToolRegistry`、旧 `PlannerPort` 或旧 Response Renderer

#### Scenario: 构造 DeepSeek tools
- **WHEN** LangChain model request 暴露生产 tools
- **THEN** 每个 tool 的 `description`、schema description 和 examples 中的描述性自然语言 MUST 默认使用中文
- **AND** `toolName`、字段名、枚举值、resource type、provider 字段和代码标识 MUST 保持英文原样
- **AND** tool description MUST 描述稳定能力边界、输入来源、输出事实含义和 grounding 方式
- **AND** tool description MUST NOT 写用户关键词、短句模板或 phrasing 触发规则

### Requirement: LangChain prompt 必须保留服务端确定性边界
系统 SHALL 在模型可见说明中表达：模型负责自然语言理解和 tool calling 决策，服务端负责 schema、权限、数据库事实、policy、结构化输出和 response projection 校验。

#### Scenario: 模型可见服务端边界
- **WHEN** LangChain agent prompt 被构造
- **THEN** prompt MUST 说明工具调用只是请求执行工具，不代表工具已执行成功
- **AND** prompt MUST 说明工具结果和结构化输出会被服务端校验
- **AND** prompt MUST 说明模型不得伪造工具结果、数据库事实、保存结果或确认状态
- **AND** prompt MUST 说明需要当前 tools 未注册的能力时不得承诺已执行

#### Scenario: 结构化训练输出说明
- **WHEN** 模型可见输入描述训练方案、动作推荐、routine 或 plan 输出
- **THEN** 说明 MUST 表达结构化输出必须来自当前可见事实和可消费 tool result
- **AND** 说明 MUST 表达 `exerciseId` 必须来自数据库事实或服务端可校验来源
- **AND** 说明 MUST 表达服务端会在渲染或保存前校验输出
- **AND** 说明 MUST NOT 通过固定用户短语规定 payload kind、tool 调用顺序或输出策略

### Requirement: Prompt 迁移不得引入服务端语义分流
系统 SHALL 保持语义判断由模型基于可见 prompt、messages、tool descriptions 和 tool results 完成。服务端 route、runtime、tool wrapper、validator 和 response adapter MUST NOT 基于用户原文关键词改写模型决策。

#### Scenario: 用户请求训练业务
- **WHEN** 用户要求推荐动作、生成训练、调整计划、保存内容或引用上一轮结果
- **THEN** 模型 MAY 基于 LangChain prompt 和 tools 自主选择 tool call、回答或澄清
- **AND** 服务端 MUST NOT 根据用户原文固定选择 tool、固定输出结构或固定回复策略
- **AND** 具体业务名只可出现在对应 tool description、schema、observation / tool result summary、spec 或测试样例中
