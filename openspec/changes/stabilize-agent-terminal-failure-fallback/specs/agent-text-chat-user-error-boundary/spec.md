## ADDED Requirements

### Requirement: Terminal failure 必须投影为可恢复用户回复

生产 `/api/chat` 文本聊天 SHALL 将可分类的 Agent terminal failure 投影为用户可恢复的安全助手回复。用户可见聊天气泡、页面错误提示和建议回复 MUST NOT 展示“聊天生成失败，请稍后重试。”作为 terminal failure 的最终文案；系统 MUST 根据稳定错误事实输出更具体但不泄漏内部实现的中文说明。

#### Scenario: repair 耗尽来自 visible output 校验失败

- **WHEN** `runAgentRuntime()` 返回 `status = "failed"`
- **AND** `terminalError.code = "repair_limit_exceeded"` 或等价 repair budget 耗尽错误
- **AND** 最近 validation details 或 trace event 表明失败来自 `final_answer.visibleOutputs[]` 校验、terminal reference 或 resource coverage
- **THEN** production `/api/chat` MUST 输出用户安全 `content` 事件，说明本次没有生成通过校验的可靠结果
- **AND** 响应 SHOULD 输出 `assistant_suggestions` 引导用户缩小范围、补充约束、放宽条件或改问当前事实可支撑的问题
- **AND** 响应 MUST 输出 `done`
- **AND** 用户可见文本 MUST NOT 原样包含 `repair_limit_exceeded`、`terminal_reference_invalid`、validator message、stack 或内部 details

#### Scenario: 能力未接入失败

- **WHEN** runtime failure 可由 registry、tool capability、unknown tool、unsupported capability 或 max tool calls 等确定性事实归类为当前能力未接入
- **THEN** production `/api/chat` MAY 输出安全 `content` 事件说明当前还不能直接执行该操作
- **AND** 响应 MAY 输出 `assistant_suggestions` 引导用户改问普通训练问题、训练原则、动作说明或补充信息
- **AND** 响应 MUST NOT 承诺已执行未注册 tool、已生成训练卡片、已保存 artifact 或已查询不可见事实

#### Scenario: 服务不可用或传输失败

- **WHEN** 模型配置缺失、provider 不可用、HTTP 请求失败、NDJSON 解析失败、stream 失败或其他非 Agent terminal validation failure 发生
- **THEN** 前端或后端用户可见文案 MUST 使用稳定中文说明服务暂不可用、请求超时或响应不可读取
- **AND** 文案 MUST NOT 展示 provider 原文、HTTP body 原文、API key 字段、stack、内部英文错误或脱敏前 details
- **AND** 文案 MUST NOT 使用“聊天生成失败，请稍后重试。”作为唯一恢复建议

#### Scenario: fallback 决策不使用用户原文

- **WHEN** 系统决定 terminal failure 的用户可见 fallback 类别
- **THEN** 决策 MUST 只基于 runtime status、terminal error code、validation details、budget events、registry/tool capability、provider/config 状态或等价确定性事实
- **AND** 系统 MUST NOT 基于用户原文关键词、正则、同义词表、短句模板、历史摘要自然语言或具体 phrasing 选择 fallback 类别
- **AND** 系统 MUST NOT 基于具体业务 `toolName` 语义分支改写 Planner 的 action、toolName、payload.kind 或回复策略

#### Scenario: 内部诊断保留

- **WHEN** terminal failure 被投影为用户安全 `content` 或安全错误文案
- **THEN** trace、runtime result、测试断言或开发态日志 MUST 保留原始错误 code、失败阶段、repair budget 状态和脱敏 details
- **AND** trace MUST 能区分模型合法 `final_answer` 成功、unsupported capability fallback、visible output validation fallback 和 transport/config failure
- **AND** 这些内部诊断 MUST NOT 被渲染成用户可见聊天文本
