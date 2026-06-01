## ADDED Requirements

### Requirement: Prompt modules 必须避免无关 schema 和重复指令
系统 SHALL 按当前 AI 阶段和 intent kind 裁剪 prompt modules，避免向模型注入无关 schema、重复 repair 指令或不参与本阶段决策的长规则。

#### Scenario: routine 草稿生成
- **WHEN** 系统请求模型生成 `routine` 草稿
- **THEN** 模型请求 MUST 只包含 routine 所需 schema 和生成规则
- **AND** 模型请求 MUST NOT 注入长期 plan 完整 schema，除非本轮 intent kind 为 `plan`

#### Scenario: plan 草稿生成
- **WHEN** 系统请求模型生成 `plan` 草稿
- **THEN** 模型请求 MUST 只包含 plan 所需 schema 和生成规则
- **AND** 模型请求 MUST NOT 注入 routine 完整 schema，除非本轮 intent kind 为 `routine`

#### Scenario: 草稿修复
- **WHEN** 系统请求模型修复未通过校验的训练草稿
- **THEN** repair prompt MUST 只保留一份修复基础规则
- **AND** 针对 `session_too_long`、`session_too_short` 或结构错误的修复说明 MUST 只注入与当前 validation errors 相关的规则

### Requirement: token 回归必须可观测
系统 SHALL 在 trace 和手动 LLM 报告中展示 prompt contract 优化后的 token 使用情况，便于比较优化是否有效。

#### Scenario: 记录 token budget 决策
- **WHEN** 系统发起聊天、动作推荐、训练草稿或 summary 更新模型请求
- **THEN** Trace MUST 记录本阶段启用的 promptModules、候选裁剪摘要和模型可见上下文摘要
- **AND** Trace MUST 能看出本阶段是否注入了无关 schema 或被跳过

#### Scenario: 手动 LLM 报告展示 token 变化
- **WHEN** 手动 LLM 黑盒测试运行结束
- **THEN** 报告 MUST 汇总 `prompt_tokens`、`completion_tokens` 和 `total_tokens`
- **AND** 报告 MUST 保留估算来源和实际偏差
- **AND** 如果 prompt contract 优化后实际 token 明显升高，报告 MUST 能提供定位阶段的 traceId 或运行上下文
