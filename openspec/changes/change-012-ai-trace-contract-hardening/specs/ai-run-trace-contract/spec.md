## ADDED Requirements

### Requirement: AiRunTrace 必须提供稳定顶层 envelope
系统 SHALL 为每次关键 AI 编排 run 创建稳定的 `AiRunTrace` envelope，用于排查、保存 log、后续 Replay 和 Eval。

#### Scenario: 创建 AI run trace
- **WHEN** `/api/chat`、`/api/ai/workout-plan`、`/api/ai/exercise-recommendations` 或后续 confirmation continuation 创建 trace
- **THEN** trace MUST 包含 `runId`、`rootRunId`、`route`、`routeSpanId`、`title`、`status`、`createdAt`、`userId`、`sessionId`、`messageId`
- **AND** trace MUST 包含 `model`、`promptVersion` 和 `toolVersions`
- **AND** trace MUST 能记录 `parentTraceId` 或 `sourceTraceId` 以串联下游请求
- **AND** trace MUST 保留 `input` 摘要，但不得默认记录未经权限校验的大 payload

#### Scenario: 下游接口续写 trace
- **WHEN** 下游接口通过 parent trace 或 existing trace 继续记录
- **THEN** trace MUST 保留原始 `rootRunId`
- **AND** trace MUST 记录当前 route 的 `routeSpanId` 和 `continuedRoutes`
- **AND** 下游 step MUST 能追溯来自哪个 route span

### Requirement: Trace step 必须使用类型化 payload 契约
系统 SHALL 为高频 trace step 定义可校验的 input、output 和 metadata payload，避免各模块自由写入不稳定字段。

#### Scenario: 记录模型请求和响应
- **WHEN** 系统记录 `model_request` 或 `model_response`
- **THEN** step payload MUST 包含模型、消息摘要、长文本字段、结构化上下文预览、response format、thinking/stream 配置和 token usage 摘要
- **AND** 长文本 `message.content`、直接字段 `content`、`preview` 或截断后的 `{ preview }` MUST 保留可读文本入口
- **AND** payload MUST 标明 `task`，例如 `intent_extraction`、`draft_generation`、`draft_repair` 或 `response_generation`

#### Scenario: 记录工具调用
- **WHEN** 系统记录 `tool_call`
- **THEN** step payload MUST 包含 `toolName`、输入摘要、输出摘要、`ok`/`status`、错误 code、耗时和权限边界信息
- **AND** `searchArtifacts`、`getArtifactPayload`、Policy、Confirmation 和后续受控工具 MUST 使用同一 payload 结构

#### Scenario: 记录引用解析
- **WHEN** 系统记录 `reference_resolution`
- **THEN** step payload MUST 包含 status、reason、confidence、artifactId、artifactKind、候选摘要和澄清问题
- **AND** payload MUST NOT 包含其他用户 artifact、session 或 schedule payload

#### Scenario: 记录候选筛选
- **WHEN** 系统记录 `candidate_selection` 或 `exercise_lookup`
- **THEN** step payload MUST 包含候选状态、相关候选数、最低需求数、候选池摘要、排除原因、relaxed constraints 和 warnings
- **AND** payload MUST 标明候选是否足够继续生成计划、推荐或 Patch

#### Scenario: 记录校验和持久化
- **WHEN** 系统记录 `validation` 或 `persistence`
- **THEN** step payload MUST 包含 `ok`/`valid`、错误 code、错误列表、目标 id、revision、source artifact、保存结果和失败原因
- **AND** 持久化 step MUST 明确是否写入 artifact、routine、schedule、memory 或 response message

#### Scenario: 记录响应写入和错误
- **WHEN** 系统记录 `response_write`、`final_response` 或 `error`
- **THEN** step payload MUST 包含 responseType、用户可见结果摘要、contentLength、suggestedReplies、错误 code、异常详情摘要和最终写入状态

### Requirement: Trace step 必须记录真实执行耗时
系统 SHALL 记录业务步骤真实执行耗时，而不是只记录 trace 写入发生的时间。

#### Scenario: 包裹异步业务步骤
- **WHEN** 系统执行模型请求、工具调用、数据库查询、校验、修复或持久化
- **THEN** trace helper MUST 在执行前记录 startedAt
- **AND** helper MUST 在执行后记录 endedAt、durationMs、status 和 output
- **AND** helper MUST 在异常时记录 failed status 和 error，并继续遵守 trace 写入失败不影响用户回复的原则

#### Scenario: 记录纯摘要事件
- **WHEN** step 只是同步摘要事件而不是业务 span
- **THEN** 系统 MAY 使用一次性 addStep
- **AND** step MUST 标明该 duration 不代表外部请求或数据库操作耗时，或不写 durationMs

### Requirement: finalDecision 必须统一所有 AI 入口
系统 SHALL 在每次 AI run 完成时记录统一 `finalDecision`，区分成功、可恢复失败和硬失败。

#### Scenario: AI run 完成
- **WHEN** trace finish 被调用
- **THEN** 调用方 MUST 传入 `finalDecision`
- **AND** `finalDecision` MUST 包含 status、code、reason 和 responseType
- **AND** status MUST 是 `success`、`recoverable_failure` 或 `hard_failure`

#### Scenario: 发生可恢复失败
- **WHEN** 候选不足、引用歧义、需要用户确认、Policy blocked、校验可修复失败或模型输出可重试失败发生
- **THEN** `finalDecision.status` MUST 是 `recoverable_failure`
- **AND** `finalDecision` MUST 记录用户下一步或系统下一步，例如 clarification、confirmation、relax_constraints、repair 或 retry

#### Scenario: 发生硬失败
- **WHEN** 配置缺失、权限拒绝、持久化不可恢复失败、模型接口不可用或未知异常导致流程无法继续
- **THEN** `finalDecision.status` MUST 是 `hard_failure`
- **AND** `finalDecision.code` MUST 能定位失败类别

### Requirement: Trace 必须提供 Replay/Eval 最小快照
系统 SHALL 为后续 Replay Runner 和 Eval Suite 提供最小可验证快照，而不是依赖不稳定的完整日志。

#### Scenario: 记录可回放决策快照
- **WHEN** run 使用 artifact、候选池、用户记忆、prompt、工具或校验结果作出决策
- **THEN** trace MUST 记录对应的 snapshot 摘要、版本、hash 或 revision
- **AND** snapshot MUST 包含 promptVersion、toolVersions、model、artifact revision、candidate pool summary、memory summary、policy result、validation result 和必要 payload hash

#### Scenario: 保存 replay/eval fixture
- **WHEN** 开发者从 trace 生成 replay/eval fixture
- **THEN** fixture MUST 只包含当前 userId 有权访问的数据
- **AND** fixture MUST 对长文本、大 payload 和敏感字段执行截断、摘要化或脱敏
- **AND** fixture MUST 包含可断言的 expected decision、scope、code、candidate source、validation result 或 finalDecision

### Requirement: Trace 必须保护隐私、权限和写入隔离
系统 SHALL 在 trace 采集和保存时维持权限、隐私和稳定性边界。

#### Scenario: 记录敏感字段
- **WHEN** input、output、metadata、error 或 snapshot 包含 token、authorization、cookie、password、secret、credential 或 API key
- **THEN** trace MUST 将该字段脱敏为 `[REDACTED]`

#### Scenario: 记录超长文本或大 payload
- **WHEN** 单字段或整体序列化结果超过 trace 长度预算
- **THEN** trace MUST 保留 `truncated`、`originalLength`、`maxLength` 和 `preview`
- **AND** trace MUST 保留足够排查问题的 id、code、status、reason、hash 或摘要

#### Scenario: trace 写入失败
- **WHEN** trace 写入、截断、序列化或保存 log 失败
- **THEN** 系统 MUST 记录服务端 warning
- **AND** 用户可见回复或业务写入 MUST NOT 因 trace 写入失败而丢失
