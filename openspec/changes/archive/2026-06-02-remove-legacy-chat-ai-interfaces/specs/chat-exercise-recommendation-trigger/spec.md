## ADDED Requirements

### Requirement: 推荐刷新必须使用 Agent-first 合同
系统 SHALL 将聊天中的动作推荐刷新、换一批和重新生成推荐收敛到 Agent-first 合同。推荐刷新 MUST NOT 调用旧 `/api/ai/exercise-recommendations`，也不得通过服务端自然语言规则重新解释用户本轮意图。

#### Scenario: 用户点击换一批推荐
- **WHEN** 用户在聊天推荐卡片中请求换一批或刷新推荐
- **THEN** 系统 MUST 通过 `/api/chat` 发起可见的 Agent-first 请求，或对已存在 Agent result 执行确定性分页、去重、排除已反馈动作等 result-level 操作
- **AND** 系统 MUST NOT 调用 `/api/ai/exercise-recommendations`

#### Scenario: 刷新需要理解用户新约束
- **WHEN** 用户刷新推荐时输入新的自然语言约束
- **THEN** LLM / Agent MUST 负责理解该约束并输出结构化工具调用或澄清
- **AND** 服务端 MUST NOT 通过关键词、正则、同义词表或短句模板替 Agent 改写推荐目标、器械条件、肌群或高层 action

#### Scenario: 推荐候选不足
- **WHEN** Agent-first 推荐刷新无法获得足够候选
- **THEN** 系统 MUST 返回澄清、blocked、failed 或可恢复建议
- **AND** 系统 MUST NOT 回退到旧推荐 route 或旧内部推荐事件展示卡片
