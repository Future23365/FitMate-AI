## ADDED Requirements

### Requirement: Replay Runner 必须能复盘关键 AI 决策链路
系统 SHALL 提供 Replay Runner，基于 `AiRunTrace` 或等价 fixture 复盘一次 AI 编排请求的关键决策。

#### Scenario: 复盘引用解析错误
- **WHEN** 开发者选择一次包含 reference_resolution 的 trace
- **THEN** Replay Runner MUST 读取用户消息、artifact 摘要、必要 payload 快照、promptVersion、toolVersions 和模型配置
- **AND** Replay Runner MUST 输出引用解析、工具调用、Policy、Validator 和 finalDecision 的复盘结果
- **AND** Replay Runner MUST NOT 要求逐 token 重现原模型回复

### Requirement: Eval Suite 必须覆盖总方案关键用例
系统 SHALL 提供 Eval Suite，批量验证引用、Patch、长期计划、推荐、确认、修复和健康边界的结构化行为。

#### Scenario: 运行核心 Eval
- **WHEN** 开发者运行 Eval Suite
- **THEN** 系统 MUST 覆盖“三周都练这个”、“俯卧撑太难换一个”、“后面都别安排俯卧撑”和 ambiguous reference 用例
- **AND** Eval MUST 断言 reference status、patch operation、policy result、validator result 和 finalDecision
- **AND** Eval MUST NOT 只依赖自然语言回复是否相似

### Requirement: Eval fixture 必须版本化
系统 SHALL 为 replay/eval fixture 记录 promptVersion、toolVersions、schema version、模型名称和期望断言。

#### Scenario: 工具版本变更后运行 Eval
- **WHEN** ReferenceResolver、PatchEngine、PlanEngine 或 Prompt 版本变化
- **THEN** Eval 报告 MUST 展示版本变化和失败用例
- **AND** 开发者 MUST 能区分模型文案变化和结构化决策回归

### Requirement: Replay 和 Eval 必须保护隐私边界
系统 SHALL 对 replay/eval 输入和报告执行 userId 范围控制、字段脱敏和 payload 长度限制。

#### Scenario: fixture 包含 artifact payload
- **WHEN** Replay 或 Eval 需要 artifact payload 快照
- **THEN** fixture MUST 只包含当前用户可访问且通过 schema 校验的必要字段
- **AND** 报告 MUST 截断或摘要化长文本和大 payload
