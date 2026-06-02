## ADDED Requirements

### Requirement: Routine draft 工具不得消费长期计划 scope

聊天推送单次 routine 时，系统 SHALL 只接受单次训练或可复用单套训练的结构化 routine scope。若模型调用 `generateRoutineDraft` 时提交的结构化 intent 自身包含长期计划边界，系统 MUST 将该输入视为工具合同冲突，而不是生成并保存单次 routine。

#### Scenario: Routine 工具收到每周频率

- **WHEN** Agent 调用 `generateRoutineDraft`
- **AND** 工具输入的 `intent.intentType = "routine"`
- **AND** 工具输入包含 `weeklyFrequency > 1`
- **THEN** 工具 MUST 返回可恢复失败
- **AND** 失败结果 MUST 指出该输入属于 plan scope 或 routine / plan scope 冲突
- **AND** 工具 MUST NOT 生成 routine draft
- **AND** 系统 MUST NOT 保存 `ConversationArtifact(kind = "routine")`

#### Scenario: Routine scope 冲突需要改走 plan

- **WHEN** `generateRoutineDraft` 因长期计划 scope 冲突返回可恢复失败
- **THEN** feedback MUST 引导 Agent 使用 `searchExercises(candidateUse = "plan")` 和 `generatePlanDraft`
- **AND** feedback MUST NOT 要求服务端基于用户原文关键词重写意图

#### Scenario: 单次训练仍可生成 routine

- **WHEN** 用户明确请求今天、这次、单次、一套可复用训练或本次训练流程
- **AND** Agent 调用 `generateRoutineDraft` 的结构化 intent 未包含长期计划频率
- **THEN** 系统 MUST 继续允许生成、校验、Policy 和保存 `kind = "routine"` 的单次编排
