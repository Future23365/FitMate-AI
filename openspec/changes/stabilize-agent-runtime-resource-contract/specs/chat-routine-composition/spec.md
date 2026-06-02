## ADDED Requirements

### Requirement: Routine 生成必须使用可消费候选集合
聊天 routine 生成 SHALL 只使用 runtime 登记为可消费的 candidate set。Partial、failed、diagnostic 或 feedback 型候选结果 MAY 用于解释和澄清，但 MUST NOT 进入 routine draft、validation、policy 或 persistence 链路。

#### Scenario: 使用可消费 candidate set 生成 routine
- **WHEN** `searchExercises(candidateUse = "routine")` 返回可消费 candidate set
- **THEN** `generateRoutineDraft` MAY 引用该 `candidateSetId`
- **AND** routine draft MUST 继续通过 validation、policy 和 save 工具链形成可展示 artifact

#### Scenario: 使用 partial candidate set 生成 routine
- **WHEN** `searchExercises(candidateUse = "routine")` 返回 partial candidate set
- **AND** Agent 调用 `generateRoutineDraft` 引用该 `candidateSetId`
- **THEN** 系统 MUST 返回结构化依赖失败
- **AND** 聊天页面 MUST NOT 展示 routine 卡片

#### Scenario: Partial candidate 转澄清
- **WHEN** routine candidate set 因缺少 warmup 或 stretch 覆盖而 partial
- **THEN** Agent MAY 返回 `needs_clarification`
- **AND** 回复 MUST 给出用户可选择的下一步，例如允许无器械热身/拉伸、用户指定动作或调整要求

### Requirement: Routine 主训练器械约束不得错误压到所有 section
当用户表达可用器械时，聊天 routine 生成 SHALL 默认把该器械作为主训练优先或硬约束，不得默认要求 warmup 和 stretch 也必须使用该器械。除非用户明确要求全程同器械，系统应允许无器械或受控补充动作满足热身和拉伸 section。

#### Scenario: 上肢哑铃 routine 请求
- **WHEN** 用户发送“今天想练上肢，30 分钟，有哑铃，帮我安排一套”或等价请求
- **THEN** 系统 MUST 能找到上肢哑铃主训练候选
- **AND** 系统 MUST 尝试用无器械或受控补充候选补足 warmup 和 stretch
- **AND** 最终结果 MUST 是 routine artifact、`needs_clarification`、`blocked` 或 `failed`
- **AND** 最终结果 MUST NOT 是 `model_output_invalid`

#### Scenario: 动作库缺少哑铃热身拉伸动作
- **WHEN** 主训练候选满足哑铃上肢要求
- **AND** 动作库缺少满足哑铃器械约束的 warmup 或 stretch 候选
- **THEN** 系统 MUST NOT 直接判定整个 routine 搜索不可用
- **AND** 系统 MUST 使用 section-aware 补齐或返回可理解澄清

#### Scenario: 用户要求全程使用哑铃
- **WHEN** 用户明确要求所有 section 都使用哑铃
- **AND** 动作库无法满足 warmup 或 stretch
- **THEN** 系统 MUST 返回 `needs_clarification` 或 `blocked`
- **AND** 回复 MUST 说明缺失的是全程哑铃热身或拉伸候选

### Requirement: Routine 执行链不得以自由文本 answered 逃逸
聊天 routine 生成链路 SHALL 在进入候选、draft、validation、policy 或 save 后保持结构化收口。系统 MUST NOT 允许模型通过普通 `answered` 文本宣称训练已生成、正在生成或稍后展示。

#### Scenario: Draft 已生成但未保存
- **WHEN** 本轮已经成功执行 `generateRoutineDraft`
- **AND** 模型返回 `answered`，正文声称训练已生成或请用户查看
- **THEN** runtime MUST 拒绝该终止结果或生成可恢复 feedback
- **AND** Agent MUST 继续执行 validation / policy / save，或返回 `needs_clarification`、`blocked`、`failed`

#### Scenario: Policy 已通过但未保存
- **WHEN** routine draft 已通过 validation 和 policy
- **AND** 当前 run 尚无 `saveConversationArtifactRevision` 成功结果
- **THEN** Agent MUST 继续调用保存工具
- **AND** Agent MUST NOT 用 `answered` 文本承诺已生成 routine 卡片

#### Scenario: 候选不足需要用户决定
- **WHEN** routine 候选或 section 覆盖不足
- **THEN** Agent MUST 使用 `needs_clarification`、`blocked` 或 `failed`
- **AND** Agent MUST NOT 输出自由文本训练编排作为替代 routine

### Requirement: Routine partial 和澄清结果必须有用户可继续操作的建议
当 routine 生成因 partial candidate、section 覆盖不足或用户约束冲突无法继续时，系统 SHALL 返回可继续对话的 `assistantSuggestions`，避免用户只看到通用失败。

#### Scenario: 缺少 warmup 和 stretch 覆盖
- **WHEN** routine 候选缺少 warmup 或 stretch
- **THEN** `needs_clarification` 或 `blocked` 结果 MUST 包含至少一个用户可点击或可发送的建议
- **AND** 建议 MUST 对应当前阻断原因，例如允许无器械补齐、提供热身/拉伸动作或调整器械要求

#### Scenario: 无可恢复建议
- **WHEN** 系统无法提供安全、明确的继续操作建议
- **THEN** 结果 MUST 返回 `blocked` 或 `failed`
- **AND** 回复 MUST 说明无法继续的确定性原因
- **AND** 系统 MUST NOT 伪造可执行训练内容
