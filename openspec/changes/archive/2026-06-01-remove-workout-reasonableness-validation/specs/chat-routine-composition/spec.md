## MODIFIED Requirements

### Requirement: Routine 生成必须基于动作库候选并经过服务端校验

聊天推送的 routine 草稿 SHALL 只使用后端动作库中存在且属于本轮候选集合的动作，并且 SHALL 在保存或展示前通过服务端确定性结构校验。服务端校验不得仅因训练合理性判断、动作 section 与本地推导元数据不一致、训练量偏高、休息偏短或目标时长来自默认推断而拒绝草稿。用户当前消息、历史已确认约束或用户确认 artifact 明确表达的避免动作、禁忌和时长要求仍可作为 hard fail 依据；未主动提出或未确认的伤病限制不得作为 hard fail 依据。

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

- **WHEN** AI 输出的 routine 草稿未通过 Zod Schema、缺少必要 section、缺少动作执行参数，或违反服务端确定性契约边界
- **THEN** 系统 MUST 返回 `invalid_ai_output` 或等价的结构化失败结果
- **AND** AI Trace MUST 记录失败详情
- **AND** 聊天卡片 MUST NOT 展示可保存的错误草稿

#### Scenario: AI section 语义判断优先

- **WHEN** AI 将真实存在且属于本轮候选集合的动态活动、灵活性或拉伸动作放入 `warmup` 或 `stretch`
- **AND** 该动作不违反用户明确器械、权限或动作来源约束
- **THEN** 服务端 MUST 接受 AI 的 section 选择
- **AND** 服务端 MUST NOT 仅因 `allowedSections` 或等价本地推导元数据不匹配而拒绝草稿

#### Scenario: Routine 合理性 warning 不阻止展示

- **WHEN** routine 草稿通过 Schema、候选动作和必要 section 校验
- **AND** 服务端发现训练量偏高、新手训练量偏高、休息偏短、section 语义分歧或用户历史偏好冲突
- **THEN** 服务端 MUST 将这些问题记录为 warning
- **AND** 聊天卡片 MUST 继续展示该 routine 草稿

### Requirement: Routine 校验失败必须可恢复

聊天推送单次 routine 时，系统 SHALL 将违反用户明确约束的可调整契约失败转成自动修复或继续对话引导。训练合理性 warning 不得触发失败恢复。

#### Scenario: 用户明确时长下 routine 时长超出

- **WHEN** AI 生成的 routine 草稿通过结构解析
- **AND** 用户明确提供目标时长
- **AND** 服务端估算时长明显超过用户目标时长
- **THEN** 系统 MUST 先尝试自动压缩并重新校验
- **AND** 系统 MUST NOT 直接把该失败作为终止型错误展示给用户

#### Scenario: 推断时长下 routine 时长不一致

- **WHEN** AI 生成的 routine 草稿通过结构解析
- **AND** `sessionMinutes` 来源是默认值或 LLM 推断
- **AND** 服务端估算时长与该值明显不一致
- **THEN** 系统 MUST NOT 因该不一致阻止 routine 卡片展示
- **AND** 系统 MAY 记录时长 warning

#### Scenario: Routine 修复失败

- **WHEN** routine 自动修复后仍未通过服务端契约校验
- **THEN** 系统 MUST 展示“计划生成失败”
- **AND** 系统 MUST 引导用户选择压缩时长、补足时长、重新生成或调整明确约束
- **AND** 系统 MUST NOT 展示未通过契约校验的 routine 卡片

### Requirement: 明确时长的 routine 必须接近目标可执行时长

当用户明确提供单次训练时长时，聊天推送 routine 的服务端估算结果 SHALL 接近该目标时长；当时长来自默认值或 LLM 推断时，估算不一致 SHALL 仅作为 warning，不得阻止卡片展示。

#### Scenario: 用户明确提供时长

- **WHEN** 用户明确输入“练腿 40 分钟”或等价表达
- **AND** routine 草稿实际估算明显低于或高于 40 分钟
- **THEN** 系统 MUST 将该不一致作为可恢复契约失败
- **AND** 系统 MUST 尝试修复或返回可继续对话的引导

#### Scenario: 时长来自默认值

- **WHEN** 用户没有明确提供单次训练时长
- **AND** 系统使用默认或 LLM 推断的 `sessionMinutes`
- **AND** routine 草稿实际估算与该值不一致
- **THEN** 系统 MUST NOT 因该不一致阻止卡片展示
- **AND** 系统 MAY 在 trace 中记录 warning
