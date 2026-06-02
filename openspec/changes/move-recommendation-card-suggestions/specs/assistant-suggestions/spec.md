## MODIFIED Requirements

### Requirement: 建议内容由对应阶段的 LLM 产出

系统 SHALL 让最了解当前上下文的 LLM 阶段产出建议候选；服务端 SHALL 负责统一结构和边界校验，不得把通用训练建议长期硬编码在服务端。

#### Scenario: 意图解析产出缺信息建议

- **WHEN** 用户请求不足以触发动作推荐、routine 或 plan
- **THEN** 意图解析 LLM MUST 产出可点击补充信息建议
- **AND** 服务端 MUST 将这些建议标记为 `kind = "clarification"` 和 `blocking = true`

#### Scenario: 动作推荐成功后产出下一步建议

- **WHEN** 动作推荐 LLM 成功生成 `exercise_recommendation`
- **THEN** 动作推荐阶段 MUST 能产出基于该推荐结果的下一步建议
- **AND** 建议 MAY 包括基于这些动作生成训练、换一批更简单动作或调整偏好
- **AND** 服务端 MUST 将这些建议标记为 `kind = "next_action"` 和 `blocking = false`

#### Scenario: 推荐卡片不注入默认建议

- **WHEN** Agent 已生成动作推荐卡片
- **AND** Agent 回复上下文没有显式提供 `assistantSuggestions`
- **THEN** Response Writer MUST NOT 自动注入“换一批”“生成训练”或等价固定建议
- **AND** 前端 MUST NOT 展示来自 Response Writer 默认兜底的推荐卡片按钮

#### Scenario: 训练生成失败后产出恢复建议

- **WHEN** routine 或 plan 生成失败并返回可恢复上下文
- **THEN** 训练生成或修复阶段 MUST 能产出恢复建议
- **AND** 服务端 MUST 将这些建议标记为 `kind = "retry"` 或 `kind = "adjustment"`

#### Scenario: 不默认新增建议模型调用

- **WHEN** 本轮已有意图解析、动作推荐、routine/plan 生成或修复 LLM 调用
- **THEN** 系统 MUST 优先复用这些阶段产出的建议候选
- **AND** 系统 MUST NOT 默认为了建议回复额外发起一次独立 LLM 调用
