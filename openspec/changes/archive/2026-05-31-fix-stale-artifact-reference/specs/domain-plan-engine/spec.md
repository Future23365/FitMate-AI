## ADDED Requirements

### Requirement: 长期计划引用必须使用当前 active artifact payload
系统 SHALL 在基于 routine 或 plan 引用展开长期计划前，使用服务端受控工具读取当前 active artifact payload。

#### Scenario: 引用的 sourceArtifactId 已被新 revision 替换
- **WHEN** PlanStrategy 的 `sourceArtifactId` 指向当前用户可访问的旧 revision
- **AND** artifact service 能解析到同一 lineage 的当前 active revision
- **THEN** `/api/ai/workout-plan` MUST 使用当前 active revision 的 payload 调用 DomainPlanEngine
- **AND** 系统 MUST NOT 回退到 LLM 自由生成完整长期日历

#### Scenario: 引用无法解析到可用 payload
- **WHEN** PlanStrategy 的 `sourceArtifactId` 无法读取、不可访问或 payload 校验失败
- **THEN** `/api/ai/workout-plan` MUST 返回可恢复失败
- **AND** 用户可见引导 MUST 要求重新点明训练内容或重新生成
- **AND** 系统 MUST NOT 从 conversationSummary 重建完整训练计划
