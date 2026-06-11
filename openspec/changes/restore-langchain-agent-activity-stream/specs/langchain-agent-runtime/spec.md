## ADDED Requirements

### Requirement: LangChain runtime 必须支持模型活动汇报 tool
系统 SHALL 在生产 LangChain tool catalog 中提供受控的模型活动汇报 tool，使模型可以用短自然语言报告当前步骤正在做什么。该 tool MUST 只用于当前请求的用户界面活动状态，不得读写业务数据、产生业务 resource、支撑最终回答 grounding 或替代业务 tool。

#### Scenario: 模型汇报当前步骤活动
- **WHEN** LangChain 模型通过 native `tool_calls` 调用 `reportAgentActivity`
- **THEN** runtime MUST 将该 tool call 路由到受控 LangChain tool wrapper
- **AND** wrapper MUST 校验输入结构并宽松归一化 `summary`
- **AND** wrapper MUST NOT 查询数据库、读取用户私有数据、写入训练事实或生成 visible output
- **AND** wrapper MUST NOT 将活动摘要作为最终回答事实来源

#### Scenario: 活动摘要校验保持宽松
- **WHEN** `reportAgentActivity` 收到非空字符串 `summary`
- **THEN** 服务端 MUST 保留模型自然语言摘要的主要内容
- **AND** 服务端 MAY trim 空白、去除控制字符、压平换行或按长度上限裁剪
- **AND** 服务端 MUST NOT 因摘要包含普通英文、普通标点、非固定模板或未命中服务端 stage 文案而拒绝
- **AND** 服务端 MUST NOT 根据用户原文、业务 `toolName`、tool input 或关键词改写摘要

#### Scenario: 活动汇报不占用业务 tool 预算
- **WHEN** 模型在同一轮请求中调用 `reportAgentActivity` 和业务 tool
- **THEN** runtime MUST 能将活动汇报与业务 tool 执行区分
- **AND** 活动汇报 MUST NOT 消耗业务 tool 调用预算
- **AND** runtime MUST 为活动汇报保留独立上限或防循环边界
- **AND** 业务 tool 预算超限逻辑 MUST 继续只保护真实业务 tool 执行

### Requirement: LangChain runtime 必须把模型活动汇报投影为 request-local observer 事件
系统 SHALL 在 `reportAgentActivity` 成功归一化后，通过 runtime observer 产出当前请求内的活动事件。该事件 MUST 可被 `/api/chat` streaming adapter 实时消费，并且 MUST 不进入聊天历史、conversation summary、visible output、artifact payload 或训练事实。

#### Scenario: 活动 tool 成功后产生 observer 事件
- **WHEN** `reportAgentActivity` wrapper 成功得到可展示摘要
- **THEN** runtime MUST 触发 `model_activity_reported` 或等价 observer 事件
- **AND** 事件 MUST 包含宽松归一化后的 `summary`
- **AND** 事件 MAY 包含 `stepType`、`modelCallIndex`、`runtimeStep` 和 `toolCallId` 等诊断字段
- **AND** 事件 MUST NOT 包含 raw provider payload、完整 tool arguments、数据库对象、secret 或跨用户数据

#### Scenario: `/api/chat` 实时输出模型活动摘要
- **WHEN** production chat adapter 收到模型活动 observer 事件
- **THEN** adapter MUST 立即写出 `agent_progress` NDJSON 事件
- **AND** 事件 MUST 使用 `activitySummary` 承载模型生成摘要
- **AND** 事件 MUST 使用稳定 stage，例如 `model_activity`
- **AND** adapter MUST NOT 把摘要追加到 assistant `content`、`suggested_questions`、`visible_output` 或 `done`

### Requirement: 模型可见 prompt 必须说明活动汇报 tool 的用途和边界
系统 SHALL 在模型实际可见输入中说明 `reportAgentActivity` 的用途、输入边界和非业务事实属性。该说明 MUST 是通用 LangChain Agent 合同，不得把具体业务 tool 流程或用户 phrasing 写成触发规则。

#### Scenario: 模型看到活动汇报规则
- **WHEN** runtime 构造生产 LangChain system prompt 和 tool catalog
- **THEN** 模型 MUST 能看到可以使用 `reportAgentActivity` 报告当前步骤活动
- **AND** 模型 MUST 能看到 `summary` 应是短中文自然语言步骤总结
- **AND** 模型 MUST 能看到活动汇报不替代业务 tool、结构化终态工具或最终回答
- **AND** 模型 MUST 能看到不要在摘要中暴露内部字段、trace、数据库 id、错误堆栈或未完成即宣称完成

#### Scenario: 活动汇报不改变业务决策
- **WHEN** 模型需要查询动作、读取可见训练方案、校验结构化输出或提交最终回答
- **THEN** 模型 MAY 先调用 `reportAgentActivity` 说明下一步
- **AND** 模型 MUST 继续调用对应业务 tool 或结构化终态工具完成真实工作
- **AND** 服务端 MUST NOT 因活动摘要内容替模型选择业务 `toolName`、改写 tool arguments 或跳过 validator
