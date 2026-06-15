## ADDED Requirements

### Requirement: LangChain terminal failure finalizer 建议必须留在原始任务边界内
系统 SHALL 约束 LangChain terminal failure finalizer 的用户可见回复和 `suggestedQuestions` 只服务原始健身任务的恢复、补充条件或可继续方向。Finalizer MUST NOT 建议用户把原始任务改成无关动作解释、动作区别说明、普通知识问答或其他任务；MUST NOT 让用户为系统失败承担重新描述任务的成本。

#### Scenario: 失败收口围绕原任务补条件
- **WHEN** LangChain terminal failure finalizer 被调用
- **THEN** finalizer 输出 MAY 请求用户补充完成原始任务所需的一个或多个条件
- **AND** 这些条件 MUST 与原始任务直接相关，例如训练目标、身体限制、可用器械、训练频率、单次时长、强度或动作难度
- **AND** 输出 MUST NOT 建议用户改问无关的动作解释、动作区别说明或普通知识问题

#### Scenario: 建议问题不得改变任务类型
- **WHEN** terminal failure finalizer 输出 `suggestedQuestions`
- **THEN** 每条建议问题 MUST 能作为继续完成原始任务的下一轮用户消息
- **AND** 建议问题 MUST NOT 把计划生成、routine 生成、动作推荐或训练调整任务改成无关动作教学、动作对比或泛知识咨询
- **AND** 建议问题 MUST NOT 包含重试、系统、错误、繁忙、服务不可用或内部处理失败等运维表达

#### Scenario: finalizer 仍不继续执行原任务
- **WHEN** terminal failure finalizer 生成任务内失败收口回复
- **THEN** finalizer MUST NOT 接收 LangChain tool catalog
- **AND** finalizer MUST NOT 输出 `tool_call`、`visibleOutputs`、训练卡片 payload 或 NDJSON event
- **AND** finalizer MUST NOT 声称已经完成、生成、保存或执行原始任务
