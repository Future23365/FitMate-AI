## ADDED Requirements

### Requirement: Trace 必须记录 LangChain 模型可见输入快照
系统 SHALL 在 LangChain Agent 每次 provider model call 的 trace 中记录足够复盘真实模型可见输入的安全快照。该快照 MUST 能证明 system prompt、messages、tool description、schema description、finalization tool 和预算边界是否被记录；如果任一部分缺失，trace MUST 明确标记缺失，而不是让开发者通过摘要猜测。

#### Scenario: 记录完整模型请求快照
- **WHEN** LangChain runtime 通过 provider 发起一次 model call
- **THEN** trace MUST 记录该次请求的 model call index、runtime step、model、tool availability 和预算摘要
- **AND** trace MUST 记录 system prompt 或等价 system message 的安全长文本引用、长度和 hash / fingerprint
- **AND** trace MUST 按顺序记录每条 message 的 role、内容安全长文本引用、长度和 hash / fingerprint
- **AND** trace MUST 记录当前 provider request 暴露 tool 的 name、description、安全 schema / schema description 引用和 hash / fingerprint
- **AND** trace MUST 记录 finalization tool 的 name、description、安全 schema 引用和 hash / fingerprint
- **AND** trace MUST NOT 记录 API key、authorization、cookie、跨用户 payload、完整数据库 raw payload 或完整 tool handler output

#### Scenario: 模型可见输入审计标记完整性
- **WHEN** trace 记录任一 LangChain model request
- **THEN** trace MUST 包含 `modelVisibleInputAudit` 或等价审计对象
- **AND** 审计对象 MUST 记录 `sourceKind`
- **AND** 审计对象 MUST 记录 `completeness`
- **AND** 审计对象 MUST 记录 `missingModelVisibleParts[]`
- **AND** 当 system prompt、messages、tool description、schema description、finalization tool 或预算摘要任一缺失时，`completeness` MUST 为 `incomplete`
- **AND** 缺失部分 MUST 写入 `missingModelVisibleParts[]`
- **AND** trace MUST NOT 将只有 `messagePreviews` 和 `toolNames` 的摘要标记为完整模型可见输入

#### Scenario: 长文本外置不掩盖缺失字段
- **WHEN** `/dev/ai-traces` 保存包含 LangChain model request 的全链路 log
- **THEN** 已进入 trace payload 的 system prompt、message content、tool description、schema description 和 tool result summary 长文本 MUST 通过 `contentRef`、`detailRef` 或等价引用保存到 `codex_logs/ai_trace_texts.jsonl`
- **AND** `ai_trace_log.js` MUST 保留每个引用字段的路径、kind、长度和 hash / fingerprint
- **AND** 如果 runtime 没有记录某类模型可见字段，导出层 MUST 保留缺失标记
- **AND** 导出说明 MUST NOT 暗示未进入 payload 的 prompt、tool description 或 schema description 已被保存到长文本文件

#### Scenario: 重复消息风险可诊断
- **WHEN** LangChain model request messages 中存在相同 role 和相同内容 hash 的重复消息
- **THEN** trace MUST 在 `modelVisibleInputAudit` 或等价审计对象中标记 duplicate message risk
- **AND** trace MUST 保留重复消息的 role、顺序、hash / fingerprint 和来源摘要
- **AND** trace MUST NOT 自动删除、合并、改写或重排 provider request messages
- **AND** trace MUST NOT 直接把重复消息风险归因为 prompt、tool description 或模型能力问题

#### Scenario: tool result 可见性语义保持分层
- **WHEN** trace 记录 tool execution 和后续 model request
- **THEN** trace MUST 继续区分 `modelVisibleSummary`、`userProjection` 和 `traceSummary`
- **AND** `enteredModelContext=true` MUST 只表示 `modelVisibleSummary` 或等价 ToolMessage 内容进入模型上下文
- **AND** trace MUST NOT 暗示完整 tool execution record、debug-only diagnostics 或用户投影默认进入模型
- **AND** 后续 model request 快照 MUST 能通过引用或摘要关联到进入模型的 tool result summary

#### Scenario: 旧 trace 或不完整 trace 不得作为完整输入证据
- **WHEN** 开发者查看或导出缺少 system prompt、tool description、schema description、finalization tool 或完整 messages 的历史 trace
- **THEN** 系统 MUST 将该 trace 的模型可见输入完整性标记为 `incomplete` 或等价状态
- **AND** 系统 MUST 保留已有 tool call、tool execution、token usage 和 response projection 证据
- **AND** 系统 MUST NOT 声称该 trace 已证明 prompt / tool schema 已进入或未进入 provider request
- **AND** 系统 MUST 引导开发者重新采集具备完整模型可见输入快照的新 trace
