## ADDED Requirements

### Requirement: 内部可分类 terminal failure 应优先生成可继续对话的失败回复

生产 `/api/chat` 文本聊天 SHALL 在主 Agent 内部 repair 或 terminal validation 耗尽后，优先将可分类失败收口为普通助手回复。若 provider availability gate 允许，系统 MUST 可以通过 terminal failure finalizer 生成该回复；若 finalizer 不可用或失败，系统 MUST 使用确定性安全 fallback。

#### Scenario: repair 耗尽后 finalizer 成功

- **WHEN** `runAgentRuntime()` 返回可分类内部 terminal failure
- **AND** production adapter 调用 terminal failure finalizer 成功
- **THEN** 用户可见响应 MUST 包含 `content`
- **AND** 响应 MAY 包含 `suggested_questions`
- **AND** 响应 MUST 包含 `done`
- **AND** 用户可见文案 MUST 明确本轮没有满足用户需求
- **AND** 用户可见文案 MUST NOT 展示 `repair_limit_exceeded`、validator 原文、stack、provider 原文或内部 details

#### Scenario: finalizer 不可用时确定性 fallback

- **WHEN** 主 Agent 返回可分类内部 terminal failure
- **AND** finalizer 被配置关闭、provider availability gate 拒绝、finalizer 超时或 finalizer 输出校验失败
- **THEN** production adapter MUST 输出确定性中文安全回复或安全错误边界
- **AND** 响应 MUST NOT 退回展示内部 `error.message`
- **AND** trace MUST 记录 finalizer 未使用或降级原因

### Requirement: provider / transport failure 不得伪装成内部校验失败

生产 `/api/chat` 文本聊天 SHALL 区分内部 Agent 校验失败和模型供应商 / 传输不可用失败。provider、配置、鉴权、quota、rate limit、HTTP、网络、stream 或 NDJSON 解析失败 MUST 走服务不可用或请求失败的安全文案，MUST NOT 再尝试 finalizer。

#### Scenario: 模型供应商 HTTP 失败

- **WHEN** 模型 adapter 或 planner diagnostics 显示 provider HTTP failure、quota、rate limit、billing、auth 或 network failure
- **THEN** production adapter MUST NOT 调用 terminal failure finalizer
- **AND** 用户可见文案 MUST 表达服务暂不可用、请求受限或稍后重试 / 缩小问题
- **AND** 用户可见文案 MUST NOT 声称模型已经分析了剩余失败信息

#### Scenario: stream 或前端解析失败

- **WHEN** 前端收到 HTTP error、NDJSON parse error、stream error 或非用户主动 abort 的传输失败
- **THEN** 前端 MUST 使用稳定中文安全文案
- **AND** 前端 MUST NOT 把该失败显示成 finalizer 生成的助手回复
- **AND** 前端 MUST NOT 原样展示 provider body、server stack 或内部英文 message

### Requirement: 错误边界不得削弱服务端确定性校验

生产 `/api/chat` 文本聊天 SHALL 继续拒绝和隐藏未通过服务端校验的业务输出。terminal failure finalizer 或确定性 fallback 只能生成文本说明和建议问题，MUST NOT 把无效业务结果重新包装成用户可见成功结果。

#### Scenario: 无效训练结果不展示

- **WHEN** 主 Agent 生成的 `visibleOutputs[]` 未通过 terminal output validator
- **AND** terminal failure finalizer 生成了用户可见回复
- **THEN** 前端 MUST 只展示 finalizer 的普通文本回复和建议问题
- **AND** 前端 MUST NOT 展示被拒绝的训练卡片
- **AND** 后端 MUST NOT 保存被拒绝的训练事实

#### Scenario: trace 保留内部失败证据

- **WHEN** terminal failure 被 finalizer 或确定性 fallback 投影为用户安全回复
- **THEN** trace MUST 保留主 Agent 的失败 code、失败阶段、repair budget 状态和脱敏 details
- **AND** trace MUST 记录最终用户响应来源是 `terminal_failure_finalizer`、`deterministic_terminal_failure_fallback` 或等价 projection type
- **AND** 这些内部诊断 MUST NOT 被渲染成用户可见聊天文本
