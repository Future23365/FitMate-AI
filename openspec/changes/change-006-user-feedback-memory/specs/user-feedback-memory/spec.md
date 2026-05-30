## ADDED Requirements

### Requirement: 用户反馈必须按生命周期结构化保存
系统 SHALL 将用户反馈保存为具有类型、来源、置信度、有效期和状态的结构化记忆。

#### Scenario: 用户表达长期动作 dislike
- **WHEN** 用户说“我不喜欢俯卧撑”
- **THEN** 系统 MUST 记录该用户对对应 exercise 的长期负向反馈
- **AND** 后续推荐和 Patch 候选 SHOULD 降权或排除该动作

#### Scenario: 用户表达临时上下文
- **WHEN** 用户说“今天不想练腿”
- **THEN** 系统 MUST 将该约束保存为 temporary_context 或仅用于当前上下文
- **AND** 该记忆 MUST 有短期有效范围
- **AND** 系统 MUST NOT 将其沉淀为永久不练腿偏好

### Requirement: 动作难度反馈必须影响降阶候选
系统 SHALL 将“太难”“太轻松”等动作反馈用于后续替代和递进策略。

#### Scenario: 用户说平板支撑太难
- **WHEN** 用户反馈某个动作太难
- **THEN** 系统 MUST 记录该动作的 too_hard 反馈
- **AND** 后续替换该动作时 SHOULD 优先召回 regression 候选
- **AND** 系统 MUST NOT 在用户未请求挑战时继续优先推荐同一高难度动作

### Requirement: 健康和不适信号必须保守处理
系统 SHALL 将疼痛、伤病或高风险信号作为训练约束处理，但不得生成医疗诊断。

#### Scenario: 用户表达肩膀不舒服
- **WHEN** 用户说“最近肩膀不舒服”
- **THEN** 系统 MUST 将该信息作为 injury_or_pain_signal 或保守训练约束
- **AND** 系统 SHOULD 避免相关高风险动作和高强度替代
- **AND** 用户可见回复 MUST NOT 提供医疗诊断或治疗承诺

#### Scenario: 写入长期健康限制
- **WHEN** 系统准备将健康或不适信号写入长期记忆
- **THEN** 该写入 SHOULD 标记 `requiresConfirmation = true`
- **AND** Confirmation Gate MUST 决定是否需要用户确认

### Requirement: 记忆读取必须遵循固定优先级
系统 SHALL 在构建训练上下文时使用固定优先级合并当前消息、artifact、用户画像、反馈和训练结果。

#### Scenario: 当前消息与历史偏好冲突
- **WHEN** 当前用户消息明确要求尝试某个历史 dislike 动作
- **THEN** 当前消息 MUST 优先
- **AND** 系统 SHOULD 在解释中提示该动作过去被标记为不喜欢或太难

#### Scenario: 构建候选过滤上下文
- **WHEN** Exercise Retrieval Service 构建候选过滤条件
- **THEN** 系统 MUST 读取当前用户可访问的动作反馈和约束
- **AND** 系统 MUST NOT 读取其他用户的记忆或训练结果

### Requirement: 训练完成结果必须作为递进输入
系统 SHALL 将训练完成率、跳过动作、实际时长和主观疲劳保存为可被后续推荐与计划递进读取的训练行为反馈。

#### Scenario: 用户完成一次训练并提交反馈
- **WHEN** 用户结束训练并提交完成结果
- **THEN** 系统 MUST 保存完成率、跳过动作、实际时长和主观疲劳
- **AND** 后续推荐、Patch 和 PlanEngine SHOULD 将这些训练行为反馈作为递进或降阶输入
- **AND** 系统 MUST NOT 将一次训练结果直接写成永久偏好

### Requirement: 长期强约束必须经过确认写入
系统 SHALL 对“以后都不要”等长期强约束和高影响偏好使用 Confirmation Gate 或等价确认状态。

#### Scenario: 用户要求以后都不要某动作
- **WHEN** 用户说“以后都不要安排这个动作”
- **THEN** 系统 SHOULD 将该写入标记 `requiresConfirmation = true`
- **AND** 该记忆在确认前 MUST NOT 作为已生效的长期排除规则
- **AND** 系统 SHOULD 在确认完成后才把状态更新为 active
