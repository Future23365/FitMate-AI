## ADDED Requirements

### Requirement: Agent 必须通过可恢复反馈修正 plan/routine scope 冲突

Tool-first Agent 工具链 SHALL 将 plan / routine scope 冲突表达为结构化、可恢复的 AgentDecisionFeedback。模型 MUST 基于该反馈和 registry 工具定义重新选择正确工具链；服务端 MUST NOT 通过读取用户原文关键词、正则或短语模板直接改写模型高层语义。

#### Scenario: Routine 工具返回 plan scope 冲突

- **WHEN** `generateRoutineDraft` 返回 plan / routine scope 冲突的可恢复失败
- **THEN** Agent runtime MUST 将失败记录为可诊断 tool result 或 AgentDecisionFeedback
- **AND** feedback MUST 包含失败 code、失败工具、可用资源和推荐的下一步工具方向
- **AND** 下一轮模型决策 MUST 能看到该 feedback

#### Scenario: Agent 重新选择 plan 工具链

- **WHEN** 模型收到 plan / routine scope 冲突 feedback
- **AND** 当前请求仍有足够的计划生成条件
- **THEN** 模型 MUST 改用 plan scope 的候选集合和 `generatePlanDraft`
- **AND** 模型 MUST NOT 继续调用 `generateRoutineDraft` 消费同一长期计划 scope

#### Scenario: 服务端不做原文语义纠偏

- **WHEN** 系统检测到 plan / routine scope 冲突
- **THEN** 服务端 MUST 仅基于模型已提交的结构化工具输入、tool result、dependency graph 或已登记资源做合同校验
- **AND** 服务端 MUST NOT 通过用户原始文本中的“每周”、“一周”、“今天”或等价关键词直接改写 `intentType`、`candidateUse` 或最终 artifact kind
