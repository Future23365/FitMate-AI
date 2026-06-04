## MODIFIED Requirements

### Requirement: Routine 生成必须基于动作库候选并经过服务端校验

聊天推送的 routine 草稿 SHALL 只使用后端动作库中存在、属于本轮候选集合且满足本轮候选集合查询边界的动作，并且 SHALL 在保存或展示前通过服务端确定性结构校验。服务端校验不得仅因训练合理性判断、动作 section 与本地推导元数据不一致、训练量偏高、休息偏短或目标时长来自默认推断而拒绝草稿。用户当前消息、历史已确认约束、用户确认 artifact 或本轮 candidate set 查询证据明确表达的避免动作、禁忌、器械、风险、难度、section 和时长要求仍可作为 hard fail 依据；未主动提出或未确认的伤病限制不得作为 hard fail 依据。

#### Scenario: AI 选择候选动作

- **WHEN** 系统调用 AI 生成 routine 草稿
- **THEN** 提示词 MUST 要求 AI 只能选择候选动作中的 `exerciseId`
- **AND** 服务端 MUST 校验草稿中每个 `exerciseId` 存在于数据库动作库
- **AND** 服务端 MUST 校验草稿中每个 `exerciseId` 属于本轮候选集合
- **AND** 服务端 MUST 校验草稿中每个 `exerciseId` 满足本轮候选集合查询边界
- **AND** 系统 MUST NOT 持久化模型编造、客户端伪造、候选集合外或查询边界外的动作 id

#### Scenario: 候选动作不足

- **WHEN** 动作库候选不足以生成包含热身、训练、拉伸的 routine
- **THEN** 系统 MUST 返回可识别的失败结果
- **AND** 系统 MUST NOT 让 AI 用候选列表之外的动作补足 section

#### Scenario: 补动作继承查询边界

- **WHEN** routine 生成需要补足 `warmup`、`training` 或 `stretch` section
- **THEN** 系统 MUST 优先从同一 candidate set 中选择满足该 section 的动作
- **AND** 若同一 candidate set 中缺少该 section 候选，系统 MUST 使用同一结构化查询边界重新补查或返回可恢复失败
- **AND** 系统 MUST NOT 从全量动作库补入没有通过本轮查询边界的动作

#### Scenario: AI 输出结构无效

- **WHEN** AI 输出的 routine 草稿未通过 Zod Schema、缺少必要 section、缺少动作执行参数，或违反服务端确定性契约边界
- **THEN** 系统 MUST 返回 `invalid_ai_output` 或等价的结构化失败结果
- **AND** AI Trace MUST 记录失败详情
- **AND** 聊天卡片 MUST NOT 展示可保存的错误草稿

#### Scenario: AI section 语义判断优先

- **WHEN** AI 将真实存在、属于本轮候选集合且满足本轮查询边界的动态活动、灵活性或拉伸动作放入 `warmup` 或 `stretch`
- **AND** 该动作不违反用户明确器械、权限或动作来源约束
- **THEN** 服务端 MUST 接受 AI 的 section 选择
- **AND** 服务端 MUST NOT 仅因 `allowedSections` 或等价本地推导元数据不匹配而拒绝草稿

#### Scenario: Routine 合理性 warning 不阻止展示

- **WHEN** routine 草稿通过 Schema、候选动作、查询边界和必要 section 校验
- **AND** 服务端发现训练量偏高、新手训练量偏高、休息偏短、section 语义分歧或用户历史偏好冲突
- **THEN** 服务端 MUST 将这些问题记录为 warning
- **AND** 聊天卡片 MUST 继续展示该 routine 草稿

## ADDED Requirements

### Requirement: Agent routine draft 工具必须绑定 candidate set 查询证据
系统 SHALL 要求 `generateRoutineDraft` 引用本轮已登记的 candidate set 查询证据，并将该证据传递给后续 validation、policy 和保存链路。

#### Scenario: 生成 routine draft
- **WHEN** Agent 调用 `generateRoutineDraft`
- **THEN** 输入 MUST 引用当前 run 中已登记的 `candidateSetId`
- **AND** 服务端 MUST 验证传入 `candidateExerciseIds` 来自该 candidate set
- **AND** 服务端 MUST 读取该 candidate set 的查询证据作为生成边界
- **AND** 服务端 MUST 验证该 candidate set 的 ToolResult 已满足对应 ToolRequest，例如 `satisfied=true` 或等价状态
- **AND** 如果 candidate set 的 result requirements 未满足，`generateRoutineDraft` MUST 返回可恢复失败

#### Scenario: 查询证据传递到 validation
- **WHEN** `generateRoutineDraft` 成功生成 draft
- **THEN** draft tool result MUST 保留 `candidateSetId` 和查询证据引用
- **AND** `validateRoutineDraft` MUST 使用同一查询证据校验最终动作

#### Scenario: Routine result requirements 继承
- **WHEN** `searchExercises` 的 candidate set 包含 section 覆盖、最少候选数量、器械、风险、难度或可用于 routine 的 result requirements
- **THEN** `generateRoutineDraft` MUST 继承这些 result requirements 作为 draft 生成边界
- **AND** draft result MUST 记录使用了哪些 candidateSetIds、哪些 section 由哪些候选覆盖、哪些 soft preferences 未满足
- **AND** 系统 MUST NOT 因 LLM 重新提交较宽的 `candidateExerciseIds` 而覆盖上游 result requirements

#### Scenario: 补查仍由 LLM 显式发起
- **WHEN** 同一 candidate set 缺少某个必要 section 或候选数量不足
- **THEN** `generateRoutineDraft` MUST 返回结构化失败或要求 Agent 用同一 hard constraints 和新的 result requirements 重新调用 `searchExercises`
- **AND** 自动补查如果发生在服务端内部，MUST 使用同一 normalized query input 和同一 hard filters，并把新 candidate set proof 登记到 trace
- **AND** 系统 MUST NOT 在没有 proof 的情况下从全量动作库补动作

#### Scenario: Draft 不能通过文案伪装满足约束
- **WHEN** draft 动作不满足 candidate set 的 hard constraints 或 result requirements
- **THEN** 系统 MUST 返回生成失败或 validation hard fail
- **AND** draft title、summary、coach notes 或 response writer MUST NOT 声称该 routine 满足未被 proof 证明的约束
