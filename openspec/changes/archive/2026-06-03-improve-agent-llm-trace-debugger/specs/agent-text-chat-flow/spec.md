## ADDED Requirements

### Requirement: 文本聊天接入必须接入 Planner / ModelAdapter trace 观测
production `/api/chat` 文本聊天主链 SHALL 将 `LlmPlanner` 和 `ModelAdapter` 的安全观测写入当前用户的开发态 `AiTrace`。该接入 MUST 不改变用户可见 NDJSON 响应，也 MUST 不扩大当前空 `ToolRegistry` 业务能力。

#### Scenario: 文本回答包含模型调用 trace
- **WHEN** 已认证用户向 `/api/chat` 发送合法请求，并且 `LlmPlanner` 调用模型后以 `final_answer` 完成
- **THEN** 当前用户 trace MUST 包含对应的 `model_request` 和 `model_response` step
- **AND** trace MUST 包含传给模型的 messages 摘要、模型 raw output 摘要、parsed `final_answer`、token usage 和 runtime validation result
- **AND** 响应 MUST 继续只返回 `content` 和 `done` 等 NDJSON 白名单事件

#### Scenario: 模型要求未知 tool
- **WHEN** 空 `ToolRegistry` 阶段模型返回 `tool_call`
- **THEN** trace MUST 同时记录模型输出中的 action type / toolName、Action Validator 的拒绝 code、repair / budget 事件和最终用户可见响应摘要
- **AND** `/api/chat` MUST NOT 通过业务分支执行该 tool
- **AND** trace MUST NOT 将该 tool 描述成已经执行成功

#### Scenario: 模型配置缺失
- **WHEN** `/api/chat` 无法构造生产 `LlmPlanner` 所需配置
- **THEN** trace MUST 记录配置错误和最终错误响应摘要
- **AND** trace MAY 缺少 `model_request` / `model_response` step
- **AND** 页面 MUST 将失败边界显示为配置阶段，而不是模型调用阶段

### Requirement: 文本聊天 trace 观测必须保持非致命
生产文本聊天 SHALL 将 trace 观测视为开发诊断，任何 trace 创建、planner diagnostics 读取、step 写入或保存摘要失败都不得改变用户可见响应。

#### Scenario: planner diagnostics 写入失败
- **WHEN** `model_request` 或 `model_response` trace step 写入失败
- **THEN** `/api/chat` MUST 继续按 runtime 结果返回 NDJSON 响应
- **AND** 系统 MUST 记录非致命开发诊断
- **AND** Runtime MUST NOT 因 trace 写入失败重试模型或改写 action

#### Scenario: 模型响应解析失败
- **WHEN** ModelAdapter 收到 invalid JSON、invalid action schema、空 content 或 HTTP 错误
- **THEN** trace MUST 记录模型调用失败摘要和稳定 failure code
- **AND** runtime MUST 继续通过 Action Validator / repair budget / terminal error 合同收口
- **AND** 服务端 MUST NOT 使用用户原文关键词修正模型 action
