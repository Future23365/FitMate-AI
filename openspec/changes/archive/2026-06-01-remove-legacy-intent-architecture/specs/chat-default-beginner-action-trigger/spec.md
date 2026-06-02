## ADDED Requirements

### Requirement: 默认新手边界必须由 Agent 结构化输入表达
系统 SHALL 在经验缺失时由 Agent plan/routine 工具输入或领域默认策略表达保守新手边界，而不是通过旧 `workoutIntent.experience` 或旧内部动作触发字段表达。

#### Scenario: 用户请求训练但未说明经验
- **WHEN** Agent 判断用户请求可生成 routine、plan 或动作推荐
- **AND** 用户经验缺失
- **THEN** Agent 或领域服务 MUST 使用保守默认经验边界
- **AND** 该默认来源 MUST 进入 tool result、validation 或 trace
- **AND** 系统 MUST NOT 依赖旧 `workoutIntent.experience` 触发生产动作

## REMOVED Requirements

### Requirement: 经验缺失不得单独阻断聊天内部动作

**Reason**: “聊天内部动作”属于旧 action trigger 语义。

**Migration**: Agent 通过 tool result 和领域默认策略决定生成、澄清或阻断；经验缺失的默认边界由 validation 可见。

### Requirement: 默认经验必须保持保守生成边界

**Reason**: 要求仍正确，但旧表述绑定 `workoutIntent.experience`。

**Migration**: 使用 Agent 工具输入、DomainPlanEngine / routine 生成默认策略和 validation trace 表达默认经验。

### Requirement: 回复必须与内部动作状态一致

**Reason**: 内部动作状态已被 `AgentExecutionResult` 替代。

**Migration**: Response Writer 必须只描述 `AgentExecutionResult` 和已登记 tool results 中真实发生的结果。
