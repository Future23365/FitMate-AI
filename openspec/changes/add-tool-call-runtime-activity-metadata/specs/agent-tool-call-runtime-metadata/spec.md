## ADDED Requirements

### Requirement: Business tool calls must support runtime metadata envelope
系统 SHALL 为所有生产业务 LangChain tool 统一支持 request-local runtime metadata envelope。该 envelope MUST 只承载运行期 UI / trace metadata，不得成为业务 input、业务 output、模型可见 tool result、resource、grounding 或持久化事实。

#### Scenario: Provider-visible input includes runtimeMetadata
- **WHEN** production tool catalog 序列化任意 `executionKind = "business"` 的 LangChain tool
- **THEN** provider-visible input schema MUST 包含可选 `runtimeMetadata`
- **AND** `runtimeMetadata` MUST 至少允许可选 `activitySummary`
- **AND** `runtimeMetadata` 的模型可见说明 MUST 使用中文解释其 request-local UI metadata 语义
- **AND** `runtimeMetadata` MUST NOT 要求模型提供 `toolName`、trace id、数据库 id、resource id、message id 或服务端内部字段

#### Scenario: Handler receives only business input
- **WHEN** 模型调用业务 tool 并在 arguments 中提供 `runtimeMetadata`
- **THEN** 通用 wrapper MUST 在业务 schema 校验和 handler 执行前剥离 `runtimeMetadata`
- **AND** handler MUST 只收到该 tool 原本的业务 input 字段
- **AND** handler MUST NOT 根据 `activitySummary` 改变查询、校验、保存、权限或业务输出行为

#### Scenario: Runtime metadata does not change business schema boundary
- **WHEN** 业务 input 字段不满足原业务 `inputSchema`
- **THEN** wrapper MUST 继续按原业务 schema 返回 `tool_schema_invalid` 或等价结构化失败
- **AND** `runtimeMetadata` 的存在 MUST NOT 让非法业务字段通过校验
- **AND** `runtimeMetadata` 的缺失 MUST NOT 让合法业务 tool call 失败

### Requirement: activitySummary must be projected before business tool execution
系统 SHALL 将 `runtimeMetadata.activitySummary` 作为当前请求内的用户可见活动摘要，在业务 tool handler 执行前投影为 `agent_progress` 或等价活动事件。该投影 MUST 不改变 Agent 决策、业务 tool 结果或最终回答 grounding。

#### Scenario: Valid activitySummary emits progress event
- **WHEN** 模型调用业务 tool 并提供合法 `runtimeMetadata.activitySummary`
- **THEN** wrapper 或 runtime observer MUST 在 handler 执行前产生 request-local activity event
- **AND** `/api/chat` stream MUST 能将该 event 投影为 `agent_progress`
- **AND** `agent_progress.activitySummary` MUST 使用归一化后的摘要
- **AND** 该事件 MUST NOT 写入 assistant `content`、聊天历史、conversation summary、visible output、artifact payload 或训练事实

#### Scenario: Missing activitySummary uses tool default summary
- **WHEN** 模型调用业务 tool 但未提供 `runtimeMetadata.activitySummary`
- **THEN** wrapper SHOULD 使用该 tool wrapper 声明的 `runtimeActivity.defaultSummary`
- **AND** 如果该 tool 未声明默认摘要，wrapper MUST 使用安全通用兜底摘要
- **AND** 默认摘要 MUST 来自 tool wrapper 静态能力声明或通用 fallback
- **AND** runtime MUST NOT 根据用户自然语言、关键词、正则、同义词表或具体 phrasing 生成摘要

#### Scenario: Invalid activitySummary falls back without blocking tool
- **WHEN** 模型提供的 `runtimeMetadata.activitySummary` 为空、包含控制字符、过长或包含明显内部实现细节
- **THEN** wrapper MUST 丢弃该模型摘要
- **AND** wrapper MUST 使用 tool 默认摘要或通用兜底摘要投影进度
- **AND** wrapper MAY 在 runtime trace metadata 中记录摘要被丢弃的稳定 reason
- **AND** wrapper MUST NOT 因 UI metadata 非法而阻断原本合法的业务 tool handler

### Requirement: activitySummary content must remain user-safe runtime UI text
系统 SHALL 将 `activitySummary` 限定为用户可见的当前步骤短状态文案。该字段 MUST 描述正在做什么，不得描述内部调用细节、完成态承诺、服务端合同或业务事实结论。

#### Scenario: Acceptable summary describes current action
- **WHEN** 模型提供 `activitySummary`
- **THEN** 摘要 SHOULD 是短中文自然语言状态
- **AND** 摘要 SHOULD 描述当前业务 tool call 即将执行或正在执行的步骤
- **AND** 摘要 MAY 使用用户可理解的业务名词，例如“动作库”“训练方案”“训练卡片”
- **AND** 摘要 MUST NOT 要求用户理解 provider tool calling、LangChain、schema、trace 或 runtime

#### Scenario: Summary must not expose internals
- **WHEN** wrapper 校验或前端展示 `activitySummary`
- **THEN** 系统 MUST 防止摘要展示 `toolName`、字段路径、JSON payload、trace id、schema id、数据库 id、错误码、stack 或服务端内部枚举
- **AND** 摘要 MUST NOT 包含“已保存”“已生成完整计划”“已通过校验”等工具执行前无法确定的完成态承诺
- **AND** 摘要 MUST NOT 被作为医疗诊断、训练处方事实或最终回答依据

### Requirement: Runtime metadata must be isolated from model-visible and business projections
系统 SHALL 保证 `runtimeMetadata` 和 `activitySummary` 只存在于 request-local runtime / UI metadata 边界。它们 MUST NOT 混入业务 tool output、model-visible summary、user projection、trace business summary、resource、visible output 或 final grounding。

#### Scenario: Model-visible summary excludes activitySummary
- **WHEN** 任意业务 tool 执行完成并生成 `toModelVisibleSummary`
- **THEN** `toModelVisibleSummary` MUST NOT 包含 `runtimeMetadata`
- **AND** `toModelVisibleSummary` MUST NOT 包含 `activitySummary`
- **AND** 模型后续推理 MUST 只基于用户输入、上下文、成功 tool result summary、已验证可见输出或受控业务事实

#### Scenario: Business trace summary excludes runtime metadata
- **WHEN** 任意业务 tool 生成 `toTraceSummary`
- **THEN** 业务 `traceSummary` MUST NOT 混入 `runtimeMetadata` 或 `activitySummary`
- **AND** activity metadata MAY 记录在独立 runtime / UI trace 区域
- **AND** trace MUST 能区分业务 tool facts 和 request-local UI progress metadata

#### Scenario: User projection excludes runtime metadata
- **WHEN** 任意业务 tool 生成 `toUserProjection` 或 visible output
- **THEN** user projection MUST NOT 包含 `runtimeMetadata`
- **AND** visible output MUST NOT 包含 `activitySummary`
- **AND** response adapter MUST NOT 把 activity metadata 渲染成训练卡片、建议问题、正文或持久化事实

### Requirement: Runtime metadata support must be covered by contract tests
系统 SHALL 用自动化测试覆盖 runtime metadata envelope、projection、隔离和安全边界。测试 MUST 证明该能力是通用 wrapper 合同，而不是具体业务 toolName 分支。

#### Scenario: Wrapper tests cover metadata extraction
- **WHEN** 测试通过任意业务 fixture tool 或生产 tool 调用 wrapper
- **THEN** 测试 MUST 证明 `runtimeMetadata.activitySummary` 会在 handler 前被提取
- **AND** handler 接收的 input MUST 不包含 `runtimeMetadata`
- **AND** 缺失或非法摘要 MUST 不阻断合法业务 input

#### Scenario: Catalog tests cover schema exposure
- **WHEN** production tool catalog 序列化业务 tools
- **THEN** 测试 MUST 证明所有 `executionKind = "business"` 的 tool schema 暴露统一 `runtimeMetadata.activitySummary`
- **AND** `executionKind != "business"` 的内部或废弃 tool MUST 不被错误暴露为业务 metadata 合同

#### Scenario: Architecture tests reject toolName branches
- **WHEN** 实现完成后运行架构或文本扫描
- **THEN** 测试 MUST 证明 runtime metadata projection 不包含针对 `searchExerciseResources`、`inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions`、`submitVisibleTrainingProposal` 或未来业务 tool 的语义分支
- **AND** 测试 MUST 证明服务端没有基于用户原文、关键词、正则、同义词表或短句模板生成或改写 `activitySummary`
