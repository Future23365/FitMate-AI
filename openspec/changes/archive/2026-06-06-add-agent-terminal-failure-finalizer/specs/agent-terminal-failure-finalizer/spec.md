## ADDED Requirements

### Requirement: Agent terminal failure finalizer 必须只处理内部可分类失败

系统 SHALL 在主 Agent run 因内部可分类校验或合同失败而耗尽修复机会后，允许 production adapter 额外调用一次受限 terminal failure finalizer。该 finalizer MUST 不属于主 Agent repair loop，MUST 不增加主 Agent 的 planner/tool/repair 次数，MUST 不尝试继续完成原始任务。

#### Scenario: repair 耗尽触发 finalizer

- **WHEN** `runAgentRuntime()` 返回 `status = "failed"`
- **AND** `terminalError.code = "repair_limit_exceeded"` 或等价内部 repair budget 耗尽错误
- **AND** 最近 validation details、terminal output validation、terminal reference、resource contract 或 budget event 可将失败归类为内部可分类合同失败
- **AND** provider availability gate 判定模型服务仍可调用
- **THEN** production adapter MUST 可以进入 terminal failure finalizer
- **AND** finalizer MUST 最多调用一次
- **AND** 主 Agent run MUST 继续记录为 failed 或 recoverable failure，不得被改写为 completed

#### Scenario: finalizer 不继续执行原任务

- **WHEN** terminal failure finalizer 被调用
- **THEN** finalizer MUST NOT 接收 tool manifest
- **AND** finalizer MUST NOT 输出 `AgentAction`
- **AND** finalizer MUST NOT 输出 `tool_call`
- **AND** finalizer MUST NOT 输出 `visibleOutputs`
- **AND** finalizer MUST NOT 保存 artifact、训练事实、用户记忆或数据库记录

### Requirement: finalizer 输入必须是脱敏失败摘要

系统 SHALL 为 terminal failure finalizer 构造独立模型输入。该输入 MUST 只包含脱敏后的用户目标摘要、主 Agent 失败类别、稳定错误 code、未满足要求、被阻断输出和已验证事实摘要；MUST NOT 包含完整内部 payload、未脱敏敏感字段或服务端语义分流结果。

#### Scenario: 输入包含可恢复诊断

- **WHEN** finalizer input builder 处理主 Agent 失败结果
- **THEN** 输入 MUST 包含失败类别，例如 `visible_output_validation`、`terminal_reference`、`repair_exhausted`、`budget_exhausted` 或 `unsupported_capability`
- **AND** 输入 MUST 包含稳定错误 code 和安全摘要
- **AND** 输入 MUST 包含未满足要求或阻断原因的结构化摘要
- **AND** 输入 MUST 包含当前可安全告知用户的 verified facts 摘要

#### Scenario: 输入不泄漏内部或跨用户数据

- **WHEN** finalizer input builder 构造模型可见 payload
- **THEN** 输入 MUST NOT 包含 API key、authorization、cookie、stack、provider 原始 HTTP body、完整 prompt、完整 tool output、跨用户 payload 或未脱敏 details
- **AND** 输入 MUST NOT 包含服务端根据用户原文关键词、正则、同义词表、短句模板或 phrasing 推断的 intent 分类
- **AND** 输入 MUST NOT 包含要求调用具体业务 `toolName` 的固定恢复命令

### Requirement: finalizer 输出必须是受限用户回复

系统 SHALL 使用结构化 schema 校验 terminal failure finalizer 输出。合法输出 MUST 只包含用户可见 `content` 和可选 `suggestedQuestions`；正文 MUST 明确本轮未满足用户需求，MUST 给出可继续对话的下一步，MUST NOT 声称已完成、已生成、已保存或已执行未发生的操作。

#### Scenario: finalizer 输出成功

- **WHEN** finalizer 返回合法输出
- **THEN** 输出 MUST 包含非空 `content`
- **AND** 输出 MAY 包含 `suggestedQuestions`
- **AND** `suggestedQuestions` MUST 最多包含 3 条完整自然语言问题
- **AND** 每条建议问题 MUST 能作为下一轮用户消息直接发送
- **AND** 输出 MUST NOT 包含 `visibleOutputs`、NDJSON event、tool call、训练卡片 payload 或内部错误 code 的用户可见解释

#### Scenario: finalizer 输出无效时降级

- **WHEN** finalizer 输出无法解析、schema 不合法、正文为空、建议问题不合规或声称已经完成原需求
- **THEN** production adapter MUST 丢弃该 finalizer 输出
- **AND** 系统 MUST 使用确定性中文安全 fallback 收口
- **AND** 系统 MUST NOT 对 finalizer 再执行第二轮 repair
- **AND** trace MUST 记录 finalizer output validation failure 的稳定 code

### Requirement: provider 不可用时不得调用 finalizer

系统 SHALL 在调用 terminal failure finalizer 前执行 provider availability gate。当失败来源表明模型供应商、配置、网络、鉴权、quota、rate limit、HTTP 请求或总超时不可用时，系统 MUST NOT 再调用同一模型生成失败回复。

#### Scenario: provider quota 或 rate limit

- **WHEN** 最近模型调用、adapter diagnostics 或 terminal error 表明 provider quota、billing、rate limit、auth、HTTP failure、network failure、adapter exception 或模型请求 timeout
- **THEN** provider availability gate MUST 阻止 finalizer 调用
- **AND** production adapter MUST 使用确定性中文安全 fallback
- **AND** trace MUST 记录 finalizerSkippedReason

#### Scenario: 模型配置缺失

- **WHEN** production `/api/chat` 无法构造模型 planner 或 finalizer 所需配置
- **THEN** 系统 MUST NOT 调用 finalizer
- **AND** 响应 MUST 使用稳定配置错误或确定性安全回复
- **AND** 用户可见文本 MUST NOT 展示缺失环境变量原文、API key 字段值或 provider 原文

### Requirement: finalizer 不得改变确定性校验边界

系统 SHALL 保持主 Agent validator、terminal output validator、ResourceStore、Policy Guard、Response Renderer 和权限隔离边界。finalizer 只能改变用户可见失败回复表达，MUST NOT 使未通过校验的结构化输出被渲染、保存或作为事实来源。

#### Scenario: 无效 visible output 不被渲染

- **WHEN** 主 Agent 失败原因来自 `final_answer.visibleOutputs[]` 未通过校验
- **AND** finalizer 成功生成用户回复
- **THEN** 响应 MUST NOT 输出被拒绝的 `visible_output` 事件
- **AND** 系统 MUST NOT 持久化被拒绝的 visible output
- **AND** 系统 MUST NOT 把 finalizer 回复写入 visible training proposal fact store

#### Scenario: finalizer 不作为 grounding 来源

- **WHEN** finalizer 输出 `content` 和 `suggestedQuestions`
- **THEN** 该输出 MUST NOT 被注册为 consumable resource
- **AND** 后续主 Agent terminal grounding MUST NOT 把 finalizer content 当作已执行 tool result
- **AND** trace MUST 区分 finalizer reply 和主 Agent satisfied tool result
