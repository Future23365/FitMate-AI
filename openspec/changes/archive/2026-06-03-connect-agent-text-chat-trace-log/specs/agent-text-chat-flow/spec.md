## ADDED Requirements

### Requirement: 文本聊天主链必须生成可诊断 trace
系统 SHALL 在 production `/api/chat` 文本聊天主链中为已认证且请求体验证通过的请求生成开发态 `AiTrace`。该 trace MUST 绑定当前用户，并记录本轮 `AgentRunInput`、runtime 结果和用户可见 NDJSON 响应摘要。

#### Scenario: 文本回答请求完成
- **WHEN** 已认证用户向 `/api/chat` 发送合法请求，并且 runtime 以 `final_answer` 完成
- **THEN** 系统 MUST 创建一条 route 为 `/api/chat` 的 trace
- **AND** trace MUST 包含当前 `userId`、`runId`、`conversationId`、`responseMessageId` 或等价 message id
- **AND** trace MUST 记录最终用户可见响应包含 `content` 和 `done` 事件
- **AND** 响应 MUST 继续使用原有 NDJSON 白名单事件协议

#### Scenario: 澄清请求完成
- **WHEN** runtime 以 `ask_user` 或等价需要用户输入的 terminal action 完成
- **THEN** trace MUST 记录 runtime 状态为需要用户输入或等价状态
- **AND** trace MUST 记录用户可见响应包含澄清文本和建议回复数量
- **AND** trace MUST NOT 将澄清问题伪装成已执行业务 tool 的结果

#### Scenario: 模型配置缺失
- **WHEN** 已认证且合法的 `/api/chat` 请求无法构造生产 `LlmPlanner` 所需配置
- **THEN** 系统 MUST 为该请求创建 failed trace
- **AND** trace MUST 记录稳定配置错误 code，例如 `chat_ai_not_configured`
- **AND** 响应 MUST 继续返回结构化错误事件和 `done` 事件
- **AND** 系统 MUST NOT 返回旧 `chat_ai_disabled` 作为正常路径

#### Scenario: runtime 合同失败
- **WHEN** runtime 因非法 action、未知 tool、预算耗尽、planner 失败或结构化 terminal error 失败
- **THEN** trace MUST 记录失败 code、runtime status 和最终错误响应摘要
- **AND** trace MUST 能区分配置错误、模型输出非法和 runtime 合同失败
- **AND** 系统 MUST NOT 通过 `/api/chat` 业务分支执行未知 tool

### Requirement: 文本聊天 trace 不得扩大当前业务能力
系统 SHALL 保持当前文本聊天阶段的空 `ToolRegistry` 和通用 NDJSON 事件边界。新增 trace 写入 MUST NOT 注册业务 tool、恢复旧事件或引入服务端自然语言分流。

#### Scenario: trace 写入不注册业务 tool
- **WHEN** `/api/chat` 为文本聊天请求创建 trace
- **THEN** Planner 可见 tool manifest MUST 仍为空数组
- **AND** 系统 MUST NOT 注册 `searchExercises`、训练生成、artifact 保存、用户记忆或任何真实业务 tool

#### Scenario: trace 写入不恢复旧兼容事件
- **WHEN** `/api/chat` 返回文本聊天 NDJSON
- **THEN** 响应 MUST NOT 输出旧 `assistant_action`、旧 `intent_resolved`、旧 `agent_execution_result` 或旧 card trigger 事件
- **AND** trace MUST NOT 把这些旧事件描述成参与了当前生产执行

#### Scenario: trace 写入失败不影响用户响应
- **WHEN** trace 创建、step 写入、更新或 finish 发生非业务异常
- **THEN** 用户可见 NDJSON 响应 MUST 继续按 runtime 结果返回
- **AND** trace 写入异常 MUST 被记录为非致命开发诊断
