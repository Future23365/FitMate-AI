## ADDED Requirements

### Requirement: 模型可见门禁必须覆盖肌群匹配角色合同
系统 SHALL 通过 model-visible contract gate 或等价测试验证肌群匹配角色合同不会退化为 case-specific 生产规则、固定 workflow、业务目标满足度或服务端语义分流。测试 MUST 检查实际组装后的 system prompt、`searchExerciseResources` description、schema description 和相关模型可见 summary。

#### Scenario: 允许稳定的主练和参与语义说明
- **WHEN** Agent model-visible contract gate 运行
- **THEN** 测试 MUST 允许模型可见文本表达 `muscleMatchRole = "primary"` 用于主练肌群匹配
- **AND** 测试 MUST 允许模型可见文本表达 `muscleMatchRole = "any"` 用于主/辅任意参与匹配
- **AND** 测试 MUST 允许目标肌群推荐默认主练口径、候选池选择子集和停止同类查询的稳定规则

#### Scenario: 拦截用户短句和具体字段组合触发规则
- **WHEN** Agent model-visible contract gate 运行
- **THEN** 测试 MUST 失败于通用 prompt、tool description、schema description 或 tool result summary 中出现基于原始用户短句、关键词、正则、同义词、具体 phrasing、具体业务 `toolName` 或字段组合的固定触发规则
- **AND** 具体用户输入和 trace 条件 MUST 只允许出现在回归测试样例、OpenSpec 证据或人工说明中

#### Scenario: 拦截固定补查和结构化收口 workflow
- **WHEN** Agent model-visible contract gate 运行
- **THEN** 测试 MUST 失败于模型可见文本要求模型为了肌群匹配角色、候选池纯净度或未确认偏好必须继续调用同一查询 tool
- **AND** 测试 MUST 失败于模型可见文本把成功查询结果包装成固定下一步 workflow、业务目标满足度或结构化训练结果交付准备度

#### Scenario: 拦截服务端语义分流文案
- **WHEN** Agent model-visible contract gate 运行
- **THEN** 测试 MUST 失败于模型可见文本要求服务端根据用户自然语言、关键词、正则、同义词、短句模板或具体 phrasing 自动选择 `muscleMatchRole`
- **AND** 测试 MUST 验证 `muscleMatchRole` 的选择属于模型基于当前模型可见合同构造 tool input，而不是 `/api/chat`、repository 或 handler 的自然语言分流
