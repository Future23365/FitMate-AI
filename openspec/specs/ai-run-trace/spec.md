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

