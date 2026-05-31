# ai-run-trace Specification

## Purpose
TBD - created by archiving change change-010-ai-trace-eval. Update Purpose after archive.
## Requirements
### Requirement: AI 编排必须记录基础 AiRunTrace
系统 SHALL 为关键 AI 编排请求记录 `AiRunTrace`，使开发者能复盘输入、关键步骤和最终决策。

#### Scenario: 聊天请求触发 AI 编排
- **WHEN** `/api/chat` 触发意图解析、引用解析、工具调用、Patch 或训练卡片生成
- **THEN** 系统 MUST 创建包含 `runId`、`userId`、`sessionId`、`messageId` 和 `createdAt` 的 trace
- **AND** trace MUST 记录模型、`promptVersion` 和 `toolVersions`
- **AND** trace MUST 记录本轮 `latestUserMessage`
- **AND** trace MUST 记录当前 run 使用的 artifact 摘要，而不是无权限的大 payload 集合

#### Scenario: AI 编排完成
- **WHEN** AI 编排流程完成或失败
- **THEN** trace MUST 记录 `finalDecision`
- **AND** trace MUST 能区分成功、可恢复失败和硬失败

### Requirement: Trace step 必须覆盖第一批架构关键节点
系统 SHALL 按阶段记录 Artifact、ReferenceResolver、Patch、校验和持久化相关 step。

#### Scenario: 引用解析被执行
- **WHEN** ReferenceResolver 解析用户引用
- **THEN** trace MUST 记录 `reference_resolution` step
- **AND** step output MUST 包含 resolved、ambiguous 或 not_found 的状态摘要
- **AND** step MUST NOT 暴露其他用户 artifact payload

#### Scenario: 受控工具被调用
- **WHEN** AI 编排调用 `searchArtifacts`、`getArtifactPayload` 或后续受控工具
- **THEN** trace MUST 记录 `tool_call` step
- **AND** step MUST 记录工具名称、输入摘要、输出摘要、耗时和失败原因

#### Scenario: Patch 被提出或应用
- **WHEN** 系统提出或应用 WorkoutPatch / PlanPatch
- **THEN** trace MUST 记录 `patch_proposal` step
- **AND** trace MUST 记录 Patch scope、operation 类型、目标摘要和校验结果摘要

#### Scenario: 校验或持久化失败
- **WHEN** Validation Service 或 Persistence 步骤失败
- **THEN** trace MUST 记录失败 step
- **AND** step MUST 包含可诊断的错误 code 和原因
- **AND** 用户可见回复 MUST NOT 因 trace 记录失败而丢失

### Requirement: Trace 必须保护权限和隐私边界
系统 SHALL 在记录 trace 前执行权限和敏感字段边界控制。

#### Scenario: 工具读取 artifact payload
- **WHEN** `getArtifactPayload` 返回 artifact payload
- **THEN** trace MUST 只记录当前 `userId` 有权访问的结果
- **AND** trace MUST NOT 记录其他用户 artifact、session 或 schedule 的 payload

#### Scenario: trace 字段包含长文本或大 payload
- **WHEN** step input 或 output 超过系统配置的 trace 长度预算
- **THEN** 系统 MUST 截断或摘要化该字段
- **AND** trace MUST 保留足够定位问题的 code、id、状态和摘要信息

### Requirement: Trace 必须记录 stale artifact revision 解析
系统 SHALL 在受控 artifact payload 读取发生 revision 解析时，记录足够诊断 stale artifact id 的 trace 信息。

#### Scenario: 旧 artifactId 被解析到 active revision
- **WHEN** 受控工具读取 artifact payload 时将原始 artifactId 解析到不同的 active artifactId
- **THEN** trace 的 `tool_call` step MUST 记录原始 artifactId
- **AND** trace 的 `tool_call` step MUST 记录最终读取的 active artifactId
- **AND** trace MUST NOT 记录未授权 artifact payload

#### Scenario: revision 解析失败
- **WHEN** 受控工具无法将原始 artifactId 解析到可访问 active artifact
- **THEN** trace 的 `tool_call` step MUST 记录失败 code 和可诊断原因
- **AND** 用户可见回复 MUST 继续使用可恢复失败引导

### Requirement: Trace 必须记录 LLM 只读工具决策
系统 SHALL 在 AI Trace 中记录 LLM 是否进入只读 tool loop、可用工具版本和模型选择的工具决策。

#### Scenario: LLM 请求只读工具
- **WHEN** LLM 在 tool loop 中选择一个只读工具
- **THEN** trace MUST 记录 `tool_decision` step
- **AND** step MUST 包含 tool name、参数摘要、工具版本、当前 step index 和选择原因摘要
- **AND** step MUST NOT 包含敏感认证信息或完整大 payload

#### Scenario: LLM 未请求工具
- **WHEN** tool loop 可用但 LLM 决定不调用工具
- **THEN** trace MUST 记录 `tool_decision` step，并写入未调用工具的决策摘要
- **AND** trace MUST 能区分“未进入 tool loop”和“进入后未选择工具”

#### Scenario: 只读 tool loop 被配置跳过
- **WHEN** feature flag 关闭或当前路径不满足进入 tool loop 的条件
- **THEN** trace MUST 记录 skipped reason
- **AND** trace MUST 能区分 feature flag 关闭、确定性早返回、引用澄清和预算跳过

### Requirement: Trace 必须记录只读工具执行结果
系统 SHALL 对每次只读工具执行记录标准化 `tool_call` step。

#### Scenario: 只读工具执行成功
- **WHEN** `searchArtifacts`、`getArtifactPayload`、`getExerciseById` 或 `searchExercises` 执行成功
- **THEN** trace MUST 记录工具名称、输入摘要、输出摘要、耗时、状态和候选或资源 id 摘要
- **AND** trace MUST NOT 记录未经摘要的大 payload

#### Scenario: 只读工具执行失败
- **WHEN** 只读工具因 Schema、权限、未找到、数据校验或内部错误失败
- **THEN** trace MUST 记录失败 code、可诊断原因和回退状态
- **AND** trace MUST NOT 暴露其他用户资源是否存在的敏感细节

### Requirement: Trace 必须记录只读 tool loop 回退
系统 SHALL 在只读 tool loop 停止、失败或达到上限时记录回退决策。

#### Scenario: 达到工具步数上限
- **WHEN** tool loop 达到最大步骤数
- **THEN** trace MUST 记录 step limit、已执行工具列表、已消耗 step 数和最终回退策略

#### Scenario: 工具上下文被截断
- **WHEN** tool context bundle 超过预算并发生截断
- **THEN** trace MUST 记录截断前后大小、保留的 tool call id 和 `truncated = true`
- **AND** trace MUST NOT 记录被截断移除的完整大 payload

#### Scenario: 工具上下文进入最终回复
- **WHEN** tool context bundle 被传入最终回复模型请求
- **THEN** trace MUST 记录进入模型上下文的工具结果摘要
- **AND** trace MUST 能关联这些摘要来自哪些 tool call step

### Requirement: Trace 必须记录只读 tool loop 成本和延迟
系统 SHALL 记录只读 tool loop 引入的额外模型调用、工具执行和耗时信息，便于评估成本是否可控。

#### Scenario: tool loop 完成
- **WHEN** 只读 tool loop 成功完成、失败回退或被跳过
- **THEN** trace MUST 记录额外 tool decision 模型调用次数
- **AND** trace MUST 记录实际工具执行次数
- **AND** trace MUST 记录 tool loop 总耗时、是否达到 step limit、是否 timeout 和最终 stop reason

#### Scenario: feature flag 未启用
- **WHEN** `ENABLE_READONLY_LLM_TOOLS` 未设置或不等于 `true`
- **THEN** trace MUST 表达本轮没有因只读 tool loop 增加模型调用
- **AND** trace MUST 记录 skipped reason 为 feature flag disabled 或等价 code

