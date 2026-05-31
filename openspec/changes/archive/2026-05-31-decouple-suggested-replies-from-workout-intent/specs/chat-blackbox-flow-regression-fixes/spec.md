## MODIFIED Requirements

### Requirement: 黑盒失败样例必须被自动化回归覆盖

系统 SHALL 为最新手动 LLM 黑盒报告中暴露的聊天主路径失败增加自动化回归测试，覆盖服务端确定性边界，而不是只依赖真实模型手测。

#### Scenario: 问候引导场景保留模型建议回复

- **WHEN** 用户输入“你好”
- **AND** 当前会话缺少训练目标、场地、频率和单次时长
- **AND** 意图模型返回 `canTriggerAction=false`
- **AND** 意图模型返回非空 `suggestedReplies`
- **AND** 意图模型返回 `workoutIntent=null`
- **THEN** 系统 MUST 保留模型返回的合法 `suggestedReplies`
- **AND** 系统 MUST 通过 `suggested_replies` 流事件把这些回复返回给前端
- **AND** 系统 MUST NOT 触发 `exercise_recommendation`、`workout_routine` 或 `workout_plan`
- **AND** 系统 MUST NOT 因 `workoutIntent=null` 使用清空建议回复的兜底意图

#### Scenario: 正文示例不自动变成建议回复

- **WHEN** 助手自然语言正文包含类似“想减脂+在家练+每周3次每次30分钟”的示例文本
- **AND** 本轮结构化意图没有返回合法 `suggestedReplies`
- **THEN** 前端和服务端 MUST NOT 从正文中提取该示例并自动展示为建议回复按钮
- **AND** 建议回复按钮 MUST 只来自结构化 `suggestedReplies` 或兼容的 `suggestedQuestions`

#### Scenario: 执行型请求不能靠无效 workoutIntent 生成卡片

- **WHEN** 用户请求生成动作推荐、单次训练或长期计划
- **AND** 意图模型返回的执行层字段无法通过 `workoutIntent` 校验
- **THEN** 系统 MUST 阻止对应内部动作
- **AND** 系统 MUST 进入澄清、恢复或可追踪失败路径
- **AND** 系统 MUST NOT 仅为了保留建议回复而生成训练卡片
