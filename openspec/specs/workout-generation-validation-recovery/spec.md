# workout-generation-validation-recovery Specification

## Purpose
TBD - created by archiving change recover-workout-plan-validation-failures. Update Purpose after archive.
## Requirements
### Requirement: 训练草稿校验失败必须进入恢复流程

当 AI 生成的训练草稿没有通过服务端契约校验时，系统 SHALL 根据 hard contract error 类型进入自动修复或用户引导流程，而不是直接把所有校验失败作为终止型错误。训练合理性 warning SHALL 不作为校验失败进入恢复流程。

#### Scenario: 可恢复契约失败

- **WHEN** 训练草稿校验结果的 `errors` 包含用户明确约束下的 `session_too_long`、`session_too_short` 或 `weekly_frequency_mismatch`
- **THEN** 系统 MUST 将该失败标记为可恢复
- **AND** 系统 MUST 尝试自动修复一次或返回可继续对话的引导
- **AND** 系统 MUST NOT 展示未通过契约校验的训练草稿卡片

#### Scenario: 硬边界校验失败

- **WHEN** 训练草稿校验结果的 `errors` 包含动作 ID 不存在、动作不在候选集合、候选集合为空、缺少必要结构、payload 结构计数不一致或 Schema 解析失败
- **THEN** 系统 MUST 继续阻止该草稿展示或保存
- **AND** 系统 MAY 尝试一次结构修复
- **AND** 修复后仍失败时系统 MUST 返回明确的失败提示

#### Scenario: Warning 不触发失败恢复

- **WHEN** 训练草稿校验结果的 `errors` 为空
- **AND** `warnings` 包含 `day_estimate_mismatch`、`too_many_daily_sets`、`beginner_volume_high`、`rest_too_short`、`section_exercise_mismatch`、`day_similarity_high`、`consecutive_load_high` 或 `user_memory_constraint`
- **THEN** 系统 MUST NOT 将该草稿标记为 `plan_validation_failed`
- **AND** 系统 MUST NOT 进入自动修复或失败恢复流程
- **AND** 系统 MUST 允许草稿展示

#### Scenario: Unknown error 不被 warning 误分类

- **WHEN** 训练草稿校验结果的 `errors` 包含未列入可恢复集合的错误码
- **AND** `warnings` 包含一个或多个可恢复类 warning
- **THEN** 系统 MUST NOT 仅因这些 warning 将结果标记为 recoverable
- **AND** 系统 MUST 以 error 集合决定最终失败分类

#### Scenario: Section 语义分歧不进入失败恢复

- **WHEN** 训练草稿中的动作真实存在且属于本轮候选集合
- **AND** 草稿通过 Schema、必要结构、权限、用户明确约束和动作来源校验
- **AND** 服务端本地 section 元数据与 AI 输出 section 不一致
- **THEN** 系统 MUST NOT 将该分歧标记为 `plan_validation_failed`
- **AND** 系统 MUST NOT 展示要求用户补充目标、器械或时长的失败恢复提示

### Requirement: 校验失败后必须自动修复一次

系统 SHALL 在首次训练草稿校验失败后，把校验结果反馈给 LLM 并请求一次修复版草稿。

#### Scenario: 时长超出后的自动修复

- **WHEN** AI 生成的单次训练编排被估算为 49 分钟
- **AND** 用户目标时长为 30 分钟
- **THEN** 修复请求 MUST 明确要求模型压缩到 30 分钟附近
- **AND** 修复请求 MUST 要求减少动作数量、组数、循环轮数或休息配置
- **AND** 修复后的草稿 MUST 重新通过同一套服务端校验

#### Scenario: 自动修复通过

- **WHEN** 修复后的训练草稿通过服务端校验
- **THEN** 接口 MUST 返回修复后的有效草稿
- **AND** 前端 MUST 正常展示训练卡片

#### Scenario: 自动修复仍失败

- **WHEN** 修复后的训练草稿仍未通过服务端校验
- **THEN** 接口 MUST 返回结构化失败结果
- **AND** 结果 MUST 包含用户可理解的 `guidanceMessage`
- **AND** 结果 MUST 包含可继续对话的 `suggestedReplies`

### Requirement: 前端必须展示可继续对话的恢复引导

当前端收到可恢复的训练生成失败结果时，聊天页面 SHALL 展示“计划生成失败”以及可操作的引导文案，而不是只展示内部错误。

#### Scenario: 时长超出引导

- **WHEN** 训练生成失败结果标记为可恢复
- **AND** 主要原因是训练估算时长超过用户目标时长
- **THEN** 前端 MUST 展示类似“这版训练估算约 49 分钟，超过你原本的 30 分钟。你想压缩到 30 分钟，还是保留完整训练量？”的文案
- **AND** 前端 MUST 提供可点击或可复制的继续对话建议

#### Scenario: 用户继续选择

- **WHEN** 用户发送“压缩到 30 分钟”或等价选择
- **THEN** 后续意图解析 MUST 能把该选择视为对上一轮失败训练生成的调整请求
- **AND** 系统 MUST 使用已有目标、器械、经验和候选上下文重新生成

### Requirement: 目标时长不足必须进入恢复流程

当用户明确提供单次训练目标时长，而 AI 生成或修复后的训练草稿实际估算明显低于该目标时长时，系统 SHALL 将该结果视为可恢复契约失败，而不是直接展示可保存训练卡片。若目标时长来自默认值或 LLM 推断，系统 SHALL 仅记录 warning。

#### Scenario: Routine 实际时长明显不足且用户明确提供目标

- **WHEN** 用户明确提供单次训练目标时长为 40 分钟
- **AND** AI 生成的 routine 草稿通过结构解析
- **AND** 服务端按动作参数、休息和主训练循环估算实际时长为 25 分钟
- **THEN** 系统 MUST 产生 `session_too_short` 或等价的可恢复契约问题
- **AND** 系统 MUST NOT 展示该未补足的 routine 草稿卡片

#### Scenario: Routine 实际时长不足但目标来自默认或推断

- **WHEN** routine 草稿实际估算时长低于 `intent.sessionMinutes`
- **AND** `sessionMinutes` 来源是 `default` 或 `llm_inferred`
- **THEN** 系统 MUST NOT 产生阻止展示的 `session_too_short` error
- **AND** 系统 MAY 记录时长不足 warning

#### Scenario: 时长不足后的自动修复

- **WHEN** 训练草稿校验结果的 `errors` 包含 `session_too_short`
- **THEN** 系统 MUST 将该失败标记为可恢复
- **AND** 系统 MUST 尝试自动修复一次或返回可继续对话的引导
- **AND** 修复请求 MUST 明确要求模型补足到用户目标时长附近
- **AND** 修复请求 MUST 要求优先增加主训练容量，而不是只修改 `estimatedSessionMinutes`

#### Scenario: 时长不足修复仍失败

- **WHEN** 自动修复后的 routine 实际估算仍明显低于用户明确目标时长
- **THEN** 接口 MUST 返回结构化失败结果
- **AND** 结果 MUST 包含用户可理解的 `guidanceMessage`
- **AND** 结果 MUST 包含可继续对话的 `suggestedReplies`

