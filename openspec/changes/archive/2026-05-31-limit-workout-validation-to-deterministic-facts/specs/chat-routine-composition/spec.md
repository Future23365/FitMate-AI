## MODIFIED Requirements

### Requirement: Routine 生成必须基于动作库候选并经过服务端校验

聊天推送的 routine 草稿 SHALL 只使用后端动作库中存在且属于本轮候选集合的动作，并且 SHALL 在保存或展示前通过服务端确定性结构校验。服务端校验不得仅因动作 section 与本地推导元数据不一致而拒绝草稿。

#### Scenario: AI 选择候选动作
- **WHEN** 系统调用 AI 生成 routine 草稿
- **THEN** 提示词 MUST 要求 AI 只能选择候选动作中的 `exerciseId`
- **AND** 服务端 MUST 校验草稿中每个 `exerciseId` 存在于数据库动作库
- **AND** 服务端 MUST 校验草稿中每个 `exerciseId` 属于本轮候选集合
- **AND** 系统 MUST NOT 持久化模型编造、客户端伪造或候选集合外的动作 id

#### Scenario: 候选动作不足
- **WHEN** 动作库候选不足以生成包含热身、训练、拉伸的 routine
- **THEN** 系统 MUST 返回可识别的失败结果
- **AND** 系统 MUST NOT 让 AI 用候选列表之外的动作补足 section

#### Scenario: AI 输出结构无效
- **WHEN** AI 输出的 routine 草稿未通过 Zod Schema、缺少必要 section、缺少动作执行参数，或违反服务端确定性边界
- **THEN** 系统 MUST 返回 `invalid_ai_output` 或等价的结构化失败结果
- **AND** AI Trace MUST 记录失败详情
- **AND** 聊天卡片 MUST NOT 展示可保存的错误草稿

#### Scenario: AI section 语义判断优先
- **WHEN** AI 将真实存在且属于本轮候选集合的动态活动、灵活性或拉伸动作放入 `warmup` 或 `stretch`
- **AND** 该动作不违反用户器械、伤病、权限、时长或训练量限制
- **THEN** 服务端 MUST 接受 AI 的 section 选择
- **AND** 服务端 MUST NOT 仅因 `allowedSections` 或等价本地推导元数据不匹配而拒绝草稿
