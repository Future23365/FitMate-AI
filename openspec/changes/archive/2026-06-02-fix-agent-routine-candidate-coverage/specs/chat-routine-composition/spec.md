## MODIFIED Requirements

### Requirement: Routine 生成必须基于动作库候选并经过服务端校验

聊天推送的 routine 草稿 SHALL 只使用后端动作库中存在、属于本轮候选集合或服务端受控补充候选集合的动作，并且 SHALL 在保存或展示前通过服务端确定性结构校验。用户或 Agent 明确传入 routine draft 工具的 `candidateExerciseIds` SHALL 被视为必须保留动作，系统不得在生成三段式 routine 时静默丢弃。服务端校验不得仅因训练合理性判断、动作 section 与本地推导元数据不一致、训练量偏高、休息偏短或目标时长来自默认推断而拒绝草稿。用户当前消息、历史已确认约束或用户确认 artifact 明确表达的避免动作、禁忌和时长要求仍可作为 hard fail 依据；未主动提出或未确认的伤病限制不得作为 hard fail 依据。

#### Scenario: AI 选择候选动作

- **WHEN** 系统调用 AI 生成 routine 草稿
- **THEN** 提示词 MUST 要求 AI 只能选择候选动作中的 `exerciseId`
- **AND** 服务端 MUST 校验草稿中每个 `exerciseId` 存在于数据库动作库
- **AND** 服务端 MUST 校验草稿中每个 `exerciseId` 属于本轮候选集合或服务端受控补充候选集合
- **AND** 系统 MUST NOT 持久化模型编造、客户端伪造或候选边界外的动作 id

#### Scenario: 指定动作必须保留

- **WHEN** 用户要求把一批指定动作编成 routine
- **AND** Agent 调用 `generateRoutineDraft` 时传入这些动作的 `candidateExerciseIds`
- **THEN** 生成的 routine 草稿 MUST 包含这些 `candidateExerciseIds` 中每一个数据库存在的动作
- **AND** 系统 MUST NOT 仅因三段式 section 选择逻辑而丢弃指定动作
- **AND** 若指定动作不适合作为 warmup 或 stretch，系统 MUST 将其保留在 `training` 或更合适的非补充 section 中

#### Scenario: 候选动作不足时受控补齐

- **WHEN** 指定动作不足以生成包含热身、训练、拉伸的 routine
- **THEN** 系统 MUST 从后端动作库中选择受控补充动作补齐缺失 section
- **AND** 补充动作 MUST 纳入本次 routine 的候选边界并在后续 `validateRoutineDraft` 中可校验
- **AND** 补充动作 MUST 优先满足用户明确器械、权限、候选用途和动作来源约束
- **AND** 系统 MUST NOT 让 AI 使用数据库不存在或未纳入候选边界的动作补足 section

#### Scenario: 受控补齐仍不足

- **WHEN** 指定动作和受控补充动作仍无法覆盖 `warmup`、`training`、`stretch`
- **THEN** 系统 MUST 返回可识别的失败结果
- **AND** 系统 MUST NOT 将缺少必要 section 的草稿发送给聊天卡片保存

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
