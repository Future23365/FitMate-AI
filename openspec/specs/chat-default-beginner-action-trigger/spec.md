# chat-default-beginner-action-trigger Specification

## Purpose
TBD - created by archiving change allow-default-beginner-action-trigger. Update Purpose after archive.
## Requirements
### Requirement: 默认新手边界必须由 Agent 结构化输入表达
系统 SHALL 在经验缺失时由 Agent plan/routine 工具输入或领域默认策略表达保守新手边界，而不是通过旧 `workoutIntent.experience` 或旧内部动作触发字段表达。

#### Scenario: 用户请求训练但未说明经验
- **WHEN** Agent 判断用户请求可生成 routine、plan 或动作推荐
- **AND** 用户经验缺失
- **THEN** Agent 或领域服务 MUST 使用保守默认经验边界
- **AND** 该默认来源 MUST 进入 tool result、validation 或 trace
- **AND** 系统 MUST NOT 依赖旧 `workoutIntent.experience` 触发生产动作

