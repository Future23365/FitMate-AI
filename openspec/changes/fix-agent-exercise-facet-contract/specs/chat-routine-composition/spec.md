## ADDED Requirements

### Requirement: Routine 生成必须恢复可修正的候选检索失败
聊天 routine 生成 SHALL 在动作候选检索出现可恢复 facet 偏差时先重查候选，再决定是否阻断。

#### Scenario: 上肢哑铃 routine 请求
- **WHEN** 用户发送“今天想练上肢，30 分钟，有哑铃，帮我安排一套”或等价请求
- **THEN** 系统 MUST 能通过动作候选检索获得哑铃上肢候选
- **AND** 系统 MUST 继续进入 routine draft、validation、policy 或可展示结果链路
- **AND** 系统 MUST NOT 因 `upper body` 这类未知 facet 首次检索失败直接回复动作库无匹配动作

#### Scenario: 候选重查成功
- **WHEN** Agent 根据 `searchExercises` 可恢复诊断重查后获得候选
- **THEN** routine draft MUST 引用成功候选集合的 `candidateSetId`
- **AND** 用户可见回复 MUST NOT 声称动作库没有匹配动作
