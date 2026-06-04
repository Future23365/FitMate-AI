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

### Requirement: Routine 和 Plan 草稿必须由 Agent 工具生成并校验

系统 SHALL 通过 Agent 工具生成 routine 或 plan 草稿，并在展示、保存或回复成功前执行统一校验和恢复流程。

#### Scenario: Agent 生成 routine 草稿
- **WHEN** Agent 决定生成或重新生成单次训练
- **THEN** Agent MUST 调用 `generateRoutineDraft` 或等价工具
- **AND** draft MUST 使用结构化 goal、sessionMinutes、equipment、experience、preferences、avoidances、ContextPackage 摘要和 candidateSetId
- **AND** draft MUST 经过 `validateRoutineDraft` 通过后才能展示或保存

#### Scenario: Agent 生成 plan 草稿
- **WHEN** Agent 决定生成长期训练计划
- **THEN** Agent MUST 调用 `generatePlanDraft` 或等价工具
- **AND** draft MUST 使用结构化频率、周期、日程、ContextPackage 摘要和 candidateSetId
- **AND** draft MUST 经过 `validatePlanDraft` 通过后才能展示或保存

#### Scenario: 生成工具复用领域服务
- **WHEN** routine 或 plan 生成工具执行
- **THEN** 工具 MUST 复用 DomainPlanEngine、候选集合、时长估算、Validator、validation recovery 和 Policy 边界
- **AND** LLM MAY 参与非确定性排序、说明、草稿提案或修复建议
- **AND** 系统 MUST NOT 将完整训练结构生成完全外包给没有候选集合和领域校验依赖的单次 LLM 调用

#### Scenario: 校验失败
- **WHEN** draft 未通过服务端校验
- **THEN** Agent MUST 消费结构化失败原因并选择修复、重新查询候选、澄清或失败恢复
- **AND** 系统 MUST NOT 展示未通过校验的训练卡片

#### Scenario: 保存生成结果
- **WHEN** draft 通过 Validator 和 Policy 后需要展示或保存
- **THEN** 保存工具 MUST 引用 draftId、validationId、policyDecisionId 和候选集合来源
- **AND** 保存结果 MUST 返回 revisionId 或明确失败
- **AND** 最终回复和 artifact 事件 MUST 使用保存结果，而不是生成工具的自然语言承诺

### Requirement: 查询边界违反必须进入训练生成恢复流程
系统 SHALL 将训练草稿或 patch 违反 candidate set 查询边界视为确定性契约失败，并进入修复、重查或用户引导流程，而不是作为 warning 放过。

#### Scenario: Routine 违反查询边界
- **WHEN** routine 草稿中的动作存在于数据库并属于某个候选集合
- **AND** 该动作不满足候选集合查询证据中的 hard filters
- **THEN** 系统 MUST 将校验结果标记为失败
- **AND** 失败 MUST 包含可稳定识别的错误码，例如 `candidate_query_boundary_mismatch`
- **AND** 系统 MUST NOT 展示或保存该 routine 草稿

#### Scenario: Plan 违反查询边界
- **WHEN** plan 草稿中的动作存在于数据库并属于某个候选集合
- **AND** 该动作不满足候选集合查询证据中的 hard filters
- **THEN** 系统 MUST 将校验结果标记为失败
- **AND** 系统 MUST NOT 展示或保存该 plan 草稿

#### Scenario: Patch replacement 违反查询边界
- **WHEN** workout patch 的 `replacementExerciseId` 存在于数据库
- **AND** 该动作不满足 replacement 候选集合查询证据中的 hard filters
- **THEN** 系统 MUST 将 patch 校验标记为失败
- **AND** 系统 MUST NOT 保存该 patch revision

#### Scenario: 查询边界失败后的恢复
- **WHEN** 校验失败原因为 candidate set 查询边界违反
- **THEN** 系统 MUST 优先引导 Agent 使用同一业务目标重新调用 `searchExercises`
- **AND** 重新调用必须传入合法结构化 filters
- **AND** 系统 MUST NOT 通过改标题、改 summary 或忽略该 filter 来修复

#### Scenario: 结果要求失败后的恢复
- **WHEN** tool 或 validator 返回 `result_requirement_unmet`、`insufficient_candidates` 或等价失败
- **THEN** 恢复流程 MUST 把未满足的 result requirements、已执行 hard filters、可用 facet 和候选覆盖缺口提供给 Agent
- **AND** Agent 若要重查，MUST 显式提交新的 ToolRequest
- **AND** 如果新的 ToolRequest 放宽 hard constraints，必须由 LLM 明确表达为新的用户可解释选择或触发澄清
- **AND** 系统 MUST NOT 在同一次恢复中隐式删除 hard constraints 后继续生成成功 routine

#### Scenario: 查询边界不可满足
- **WHEN** 重新检索仍无法得到满足 hard filters 的足够候选
- **THEN** 系统 MUST 返回可继续对话的失败或澄清引导
- **AND** 系统 MUST NOT 用放宽后的候选伪装成满足原查询边界

#### Scenario: Tool 能力不支持后的恢复
- **WHEN** tool 返回 `unsupported_operation` 或 `unverifiable_result`
- **THEN** 恢复流程 MUST 优先引导 Agent 改用更合适的 tool、补结构化参数或向用户澄清
- **AND** 系统 MUST NOT 把 unsupported operation 当作空结果继续执行
- **AND** trace MUST 记录原始 tool、unsupported operation、推荐下一步和是否需要用户澄清

