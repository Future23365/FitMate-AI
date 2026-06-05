## ADDED Requirements

### Requirement: Trace 必须记录 terminal failure finalizer 链路

系统 SHALL 在 `/api/chat` trace 中记录 terminal failure finalizer 的触发、跳过、模型调用、输出校验、确定性降级和最终响应投影。该 trace MUST 能区分主 Agent 失败和 finalizer 成功回复，MUST NOT 把 finalizer 回复误记为主 Agent 成功。

#### Scenario: finalizer 被调用

- **WHEN** production adapter 调用 terminal failure finalizer
- **THEN** trace MUST 记录 finalizer trigger step
- **AND** step MUST 包含主 Agent failure code、failure category、repair budget 状态和 provider availability gate 结果
- **AND** step MUST 记录 finalizer prompt version、model、timeout、maxTokens 或等价配置摘要
- **AND** step MUST NOT 记录 API key、authorization、cookie、完整 prompt、完整 tool output 或跨用户 payload

#### Scenario: finalizer 输出成功

- **WHEN** terminal failure finalizer 返回合法输出
- **THEN** trace MUST 记录 finalizer model response 摘要
- **AND** trace MUST 记录 finalizer output validation success
- **AND** trace MUST 记录最终 response projection type 为 `terminal_failure_finalizer` 或等价类型
- **AND** trace final decision MUST 保留主 Agent 原始 failure code

### Requirement: Trace 必须记录 finalizer 跳过和降级原因

系统 SHALL 在 terminal failure finalizer 未被调用或调用失败时记录稳定跳过 / 降级原因，便于开发者区分 provider 不可用、配置关闭、输出无效、超时和不可分类失败。

#### Scenario: provider gate 跳过 finalizer

- **WHEN** provider availability gate 阻止 finalizer 调用
- **THEN** trace MUST 记录 `finalizerSkippedReason`
- **AND** reason MUST 使用稳定 code，例如 `provider_unavailable`、`provider_quota_exhausted`、`model_config_missing`、`finalizer_disabled`、`remaining_time_insufficient` 或等价 code
- **AND** trace MUST 记录最终使用确定性 fallback

#### Scenario: finalizer 输出无效

- **WHEN** finalizer 返回输出但 schema 或内容校验失败
- **THEN** trace MUST 记录 `finalizer_output_invalid` 或等价 code
- **AND** trace MUST 记录被拒绝字段的安全摘要
- **AND** trace MUST 记录系统已降级为确定性 fallback
- **AND** 用户可见响应 MUST NOT 包含被拒绝的 finalizer 原文

### Requirement: Trace 导出必须支持排查 finalizer 可见输入

系统 SHALL 让 `/dev/ai-traces` 导出能排查 finalizer 实际模型可见输入，同时继续执行长文本外置、脱敏和权限边界。

#### Scenario: 导出 finalizer 模型请求

- **WHEN** trace 包含 terminal failure finalizer 模型调用
- **THEN** trace 导出 MUST 包含 finalizer request 的安全摘要或 `contentRef`
- **AND** 导出 MUST 能显示 finalizer user message 中的 failure category、unmet requirements 和 verified facts 摘要
- **AND** 导出 MUST 能显示 finalizer system prompt version
- **AND** 导出 MUST NOT 显示未脱敏 secret、完整 provider body 或跨用户 payload

#### Scenario: 黑盒报告读取 finalizer 结果

- **WHEN** 手动 LLM 黑盒 runner 或报告消费 trace 摘要
- **THEN** 报告 MUST 能读取本轮是否进入 finalizer
- **AND** 报告 MUST 能读取 finalizer 是否成功、跳过或降级
- **AND** 报告 MUST 区分 `main_agent_completed`、`terminal_failure_finalizer` 和 `deterministic_fallback`
