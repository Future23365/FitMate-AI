## MODIFIED Requirements

### Requirement: 当前不支持的 tool 能力必须投影为安全助手回复

生产 `/api/chat` 文本聊天 SHALL 在当前空 `ToolRegistry` 或 tool capability 不支持场景下，把模型明确请求不可执行 tool 的失败作为安全错误边界处理。该边界 MUST 防止内部错误、validator 文案和 runtime budget 细节进入用户气泡，但 MUST NOT 替代基础问答的正常模型回复，也 MUST NOT 使用服务端固定业务回答来解释用户自然语言问题。

#### Scenario: Empty registry rejects a generated tool call

- **WHEN** 当前生产文本聊天使用空 `ToolRegistry`
- **AND** Planner 返回 `tool_call`
- **AND** runtime 因 `unknown_tool`、`invalid_action`、`repair_limit_exceeded` 或等价不可执行错误收口
- **THEN** `/api/chat` MAY 输出普通 `content` 事件说明刚才请求的操作需要当前未接入的工具，无法直接执行
- **AND** 响应 MAY 输出 `assistant_suggestions` 引导用户改问普通文本问题、训练原则、动作说明或需要补充的信息
- **AND** 响应 MUST 输出 `done`
- **AND** 响应 MUST NOT 输出会被前端显示的内部 `error.message`
- **AND** 响应 MUST NOT 把该安全边界文案伪装成模型对基础问答的正常 `final_answer`
- **AND** 响应 MUST NOT 使用固定“生成、保存或执行训练计划”类业务文案替代用户问题的语义回答

#### Scenario: Unsupported fallback is based on runtime facts

- **WHEN** 系统决定输出 unsupported capability fallback
- **THEN** 该决策 MUST 基于 registry、tool capability、action validation、runtime error code 或 trace event 等确定性事实
- **AND** 系统 MUST NOT 基于用户原文关键词、正则、同义词表、短句模板或服务端自然语言意图判断来决定 fallback
- **AND** 系统 MUST NOT 因用户询问助手能力、基础聊天能力或普通可回答问题而直接输出 unsupported fallback

#### Scenario: Internal diagnosis remains available

- **WHEN** unsupported capability fallback 被输出给用户
- **THEN** trace、runtime result 或测试诊断 MUST 仍能定位原始错误 code、触发阶段和是否由空 registry / unsupported tool 导致
- **AND** 这些内部诊断 MUST NOT 被渲染成用户可见聊天文本
- **AND** trace MUST 能区分模型合法 `final_answer` 成功和服务端安全错误边界投影
