# agent-exercise-facet-contract Specification

## Purpose
TBD - created by archiving change fix-agent-exercise-facet-contract. Update Purpose after archive.
## Requirements
### Requirement: Agent 动作检索必须使用受控 facet 合同
Agent 通过动作检索 tool 查询动作候选或动作资源时，系统 SHALL 区分动作库真实 facet 和高层身体区域，不得要求模型把高层范围词写入精确肌群字段。

#### Scenario: 用户表达高层身体区域
- **WHEN** 用户请求“上肢”“下肢”“腿部”“核心”或“全身”训练
- **THEN** Agent MUST 使用 `bodyRegions` 表达高层身体区域
- **AND** Agent MUST NOT 将 `upper body`、`lower body`、`full body`、`腿部`、`下肢` 或等价范围词写入 `targetMuscles` 或 `muscle`

#### Scenario: 用户表达具体肌群
- **WHEN** 用户明确请求胸部、肩部、背部、肱二头肌、臀部、股四头肌、腘绳肌、小腿或腹部等具体训练重点
- **THEN** Agent MAY 使用动作库真实 `targetMuscles` 或 `muscle` facet
- **AND** `targetMuscles` 或 `muscle` MUST 使用动作库中存在的肌群字段值

### Requirement: 服务端必须确定性执行 bodyRegions
服务端 SHALL 只根据结构化 `bodyRegions` 枚举展开动作库真实肌群 facet，不得读取用户自然语言原文做语义重解释。

#### Scenario: bodyRegions 包含 lower_body
- **WHEN** 动作检索 tool 输入包含 `bodyRegions = ["lower_body"]`
- **THEN** 服务端 MUST 将其展开为动作库真实下肢肌群 facet
- **AND** 动作检索 MUST 能命中符合发布态、器械和 section 条件的下肢动作候选或动作资源

#### Scenario: 服务端执行区域映射
- **WHEN** 服务端展开 `bodyRegions`
- **THEN** 展开函数 MUST 只接收结构化枚举字段
- **AND** 展开函数 MUST NOT 接收 latest user message、conversationSummary 或其他自然语言文本作为输入

### Requirement: 动作空候选必须返回可恢复诊断
`searchExercises` 无法返回候选时，系统 SHALL 返回结构化诊断，说明是否可以 retry、哪些 facet 未匹配，以及可用于 retry 的候选 facet。

#### Scenario: targetMuscles 使用未知 facet
- **WHEN** `searchExercises` 输入包含动作库不存在的 `targetMuscles`
- **AND** 检索结果为空
- **THEN** 工具失败详情 MUST 包含 `unmatchedTargetMuscles`
- **AND** 工具失败详情 MUST 包含可用于下一次查询的 `suggestedTargetMuscles`
- **AND** 工具失败详情 MUST 标记该失败为可恢复

#### Scenario: equipment 使用未知 facet
- **WHEN** `searchExercises` 输入包含动作库不存在的器械 facet
- **AND** 检索结果为空
- **THEN** 工具失败详情 MUST 包含 `unmatchedEquipment`
- **AND** 工具失败详情 MUST 包含可用于下一次查询的 `suggestedEquipment`
- **AND** 工具失败详情 MUST 标记该失败为可恢复

#### Scenario: retry 后仍无候选
- **WHEN** Agent 已基于可恢复诊断重新调用 `searchExercises`
- **AND** 动作库仍无可用候选
- **THEN** Agent MAY 返回 `blocked`
- **AND** 用户可见回复 MUST 基于结构化失败原因说明当前无法生成

### Requirement: Agent 必须优先恢复可修正的动作检索失败
Agent 在生成 routine、plan 或 patch 所需候选时，系统 SHALL 对可恢复的 `searchExercises` 失败先重查，而不是立即结束为 `blocked`。

#### Scenario: routine 候选首次检索因未知 facet 失败
- **WHEN** 用户请求生成单次 routine
- **AND** 第一次 `searchExercises` 返回可恢复的未知 facet 诊断
- **THEN** Agent MUST 基于诊断重新调用 `searchExercises`
- **AND** Agent MUST NOT 在第一次可恢复失败后直接返回 `blocked`

#### Scenario: 重查获得候选
- **WHEN** Agent 重查 `searchExercises` 后获得候选集合
- **THEN** Agent MUST 继续调用 routine 或 plan 生成工具
- **AND** 后续 draft MUST 引用本轮成功的 `candidateSetId`

### Requirement: Routine 请求必须进入生成工具链
用户请求安排单次训练、训练编排或一套训练时，Agent SHALL 通过 routine 生成工具链产生结构化结果，不得用动作推荐候选加自由文本回答冒充 routine。

#### Scenario: 用户请求安排一套单次训练
- **WHEN** 用户请求“安排一套”“帮我练 30 分钟”或等价单次训练编排
- **THEN** Agent MUST 使用 `searchExercises` 的 `candidateUse = "routine"` 检索候选
- **AND** Agent MUST 在候选成功后调用 `generateRoutineDraft`
- **AND** Agent MUST NOT 仅引用 `searchExercises` 结果并以 `answered` 输出自由文本训练编排

#### Scenario: Agent 只完成动作推荐
- **WHEN** Agent 使用 `candidateUse = "recommendation"` 并以 `answered` 结束
- **THEN** 用户可见结果 MUST 表达动作推荐或候选动作
- **AND** 用户可见结果 MUST NOT 承诺已生成完整 routine、plan 或训练编排

### Requirement: Routine 生成工具必须容忍单次编排合同默认字段缺失
用户请求单次训练编排时，系统 SHALL 在 routine 工具边界为仅服务于结构校验的默认字段提供稳定默认值，避免模型已给出目标、时长和候选集合后仍因长期计划字段缺失而中断。

#### Scenario: generateRoutineDraft 缺少 experience 和 weeklyFrequency
- **WHEN** Agent 调用 `generateRoutineDraft`，并提供 `goal`、`sessionMinutes`、`candidateSetId` 和 `candidateExerciseIds`
- **AND** `intent` 缺少 `experience` 或 `weeklyFrequency`
- **THEN** routine 工具 MUST 以保守默认 `experience = "beginner"` 补齐单次编排参数
- **AND** routine 工具 MUST 以 `weeklyFrequency = 1` 补齐复用校验模型所需的长期计划字段
- **AND** 系统 MUST NOT 读取用户原文或用关键词重解释用户语义

#### Scenario: failed 终止结果使用旧式 replyContext
- **WHEN** Agent 返回 `status = "failed"` 且缺少 `failureCode`
- **AND** 结果包含旧式 `replyContext.reply`
- **THEN** 解析层 MUST 将结果归一为合法 `failed` 合同
- **AND** 系统 MUST NOT 因终止结果字段位置错误把原始工具失败二次覆盖为 `model_output_invalid`

### Requirement: Agent routine 检索必须表达分段器械边界

Agent 调用 `searchExercises(candidateUse = "routine")` 时，系统 SHALL 区分全局 hard filter、主训练器械边界和 warmup / stretch 补充边界。普通器械表达不得被默认解释为所有 section 都必须使用该器械。

#### Scenario: 普通器械表达
- **WHEN** 用户在 routine 请求中表达“有哑铃”“可以用哑铃”或等价可用器械
- **THEN** Agent MUST 将该器械视为 `training` 主训练候选约束或偏好
- **AND** `searchExercises` 的模型可见合同 MUST 提醒 Agent 不要默认把该器械作为 `warmup` / `stretch` 的全局 hard filter
- **AND** `searchExercises` 或后续 routine draft 工具 MUST 能用无器械受控补充候选满足 `warmup` / `stretch` 覆盖

#### Scenario: 全局 equipment 导致 section 覆盖风险
- **WHEN** Agent 传入全局 `filters.equipment.in` 且 `allowedSections` 同时包含 `warmup`、`training`、`stretch`
- **AND** `resultRequirements.sectionCoverage` 要求三段式覆盖
- **THEN** 系统 MUST 保留可诊断的 `appliedFilters`、`resultRequirementProof` 和 `controlledSupplementalCandidates`
- **AND** 后续 `generateRoutineDraft` MUST 使用这些结构化证据恢复分段，而不是要求用户补充已确认的无器械热身或拉伸信息

#### Scenario: 明确全程器械表达
- **WHEN** 结构化输入明确表示所有 section 都必须使用同一器械
- **THEN** 系统 MUST 保留该 hard constraint
- **AND** 如果无法满足 `sectionCoverage`，工具结果 MUST 提供稳定的结构化诊断或阻断原因
- **AND** 系统 MUST NOT 因默认无器械补充规则覆盖用户明确 hard constraint

### Requirement: searchExercises 必须保留部分满足候选诊断
当 `searchExercises` 用于 routine、plan 或 patch 的执行型候选集合，并且结构化过滤已经返回候选但 `resultRequirements` 未完全满足时，系统 SHALL 返回可诊断的 partial candidate set，而不是只返回不可解释的工具失败或丢弃候选证据。

#### Scenario: 候选非空但缺少 section 覆盖
- **WHEN** Agent 调用 `searchExercises(candidateUse = "routine")`
- **AND** hard filters 返回一个或多个候选动作
- **AND** `resultRequirements.sectionCoverage` 未满足
- **THEN** 工具结果 MUST 包含 candidate set 诊断、实际候选摘要和 `unmetResultRequirements`
- **AND** 工具结果 MUST 标记该 candidate set 为 partial 或 unsatisfied
- **AND** 工具结果 MUST NOT 被登记为可消费成功 candidate set

#### Scenario: Partial candidate 用于澄清
- **WHEN** `searchExercises` 返回 partial candidate set
- **THEN** Agent MAY 基于该诊断调用 `askClarification`
- **AND** 用户可见澄清 MUST 能说明哪些 section 或结果要求未满足
- **AND** 系统 MUST NOT 因澄清引用 partial candidate tool result 返回 `model_output_invalid`

#### Scenario: Partial candidate 被用于生成
- **WHEN** Agent 调用 `generateRoutineDraft`、`generatePlanDraft` 或 `proposeWorkoutPatch`
- **AND** 输入引用的 `candidateSetId` 来自 partial candidate set
- **THEN** 工具 MUST 返回结构化依赖失败
- **AND** 系统 MUST NOT 生成或保存训练 artifact

### Requirement: Routine 动作搜索必须支持 section-aware 器械边界
系统 SHALL 区分用户对主训练可用器械的表达和对所有 routine section 的硬性器械要求。除非用户明确要求所有环节使用同一器械，否则 `training` section MAY 使用用户器械作为 hard filter，`warmup` 和 `stretch` MAY 使用无器械或受控补充候选满足三段式结构。

#### Scenario: 用户说有哑铃
- **WHEN** 用户请求“上肢 30 分钟，有哑铃”或等价 routine
- **THEN** Agent MUST 将哑铃优先作为主训练候选约束
- **AND** 系统 MUST NOT 默认要求 warmup 和 stretch 候选也必须使用哑铃
- **AND** 系统 MUST 能通过无器械或受控补充候选补足 warmup / stretch

#### Scenario: 用户明确要求全程哑铃
- **WHEN** 用户明确要求热身、主训练和拉伸都必须使用哑铃
- **THEN** Agent MAY 将哑铃作为所有 section 的 hard constraint
- **AND** 如果动作库无法满足该约束，系统 MUST 返回 `needs_clarification` 或 `blocked`
- **AND** 系统 MUST NOT 静默放宽用户明确的全程器械要求

#### Scenario: 补充候选纳入证据
- **WHEN** 系统为 warmup 或 stretch 使用受控补充候选
- **THEN** 补充动作 MUST 来自数据库
- **AND** 补充动作 MUST 被纳入本轮 candidate evidence
- **AND** 后续 validation MUST 能证明 routine 中每个动作都属于原始候选或受控补充候选

### Requirement: searchExercises 诊断必须给出可恢复路径
当执行型候选集合未满足 `resultRequirements` 时，工具 SHALL 给出稳定、结构化、模型可读的恢复路径，供 Agent 选择 retry、澄清、blocked 或 failed。

#### Scenario: sectionCoverage 未满足
- **WHEN** `resultRequirements.sectionCoverage` 存在未满足项
- **THEN** diagnostics MUST 包含每个缺失 section 的 required / actual 数量
- **AND** diagnostics MUST 包含候选非空时可保留的候选摘要
- **AND** diagnostics MUST 标明该结果是否允许澄清或重查

#### Scenario: 结果要求完全无法满足
- **WHEN** hard filters 返回空候选或动作库无法满足用户明确 hard constraint
- **THEN** 工具 MUST 返回结构化失败
- **AND** diagnostics MUST 区分 `insufficient_candidates`、`invalid_parameter`、`result_requirement_unmet` 或等价稳定错误码
- **AND** Agent MUST 基于该结构化诊断选择 retry、澄清、blocked 或 failed

### Requirement: 执行型动作检索未指定器械时必须默认无器械

Agent 通过 `searchExercises` 构建可执行候选集合时，系统 SHALL 在没有正向可用器械或居家条件的结构化事实时默认使用无器械 / 自重边界。该默认只适用于 Agent 执行型候选用途，不得改变动作库页面、composer 或普通动作查询的默认行为。

#### Scenario: 推荐候选缺少器械条件
- **WHEN** Agent 调用 `searchExercises` 且 `candidateUse = "recommendation"`
- **AND** 输入、ContextPackage 和已确认用户记忆中都没有正向可用器械或居家条件
- **THEN** 系统 MUST 将候选集合限定为无器械或自重可用动作
- **AND** `candidateSetEvidence` 或等价诊断 MUST 能证明已执行该无器械边界

#### Scenario: Routine 候选缺少器械条件
- **WHEN** Agent 调用 `searchExercises` 且 `candidateUse = "routine"`
- **AND** 输入、ContextPackage 和已确认用户记忆中都没有正向可用器械或居家条件
- **THEN** 系统 MUST 默认使用无器械或自重候选边界
- **AND** 后续 `generateRoutineDraft` MUST 只能消费满足该边界的候选集合或服务端受控补充候选

#### Scenario: 用户明确提供可用器械
- **WHEN** Agent 输入或已确认上下文包含正向可用器械，例如 `filters.equipment.in`、`equipmentRequired`、`equipment` 或等价结构化事实
- **THEN** 系统 MUST 使用该器械边界构建候选集合
- **AND** 系统 MUST NOT 再叠加默认无器械边界覆盖用户明确可用器械

#### Scenario: 只有排除类器械条件
- **WHEN** Agent 输入只包含 `filters.equipment.notIn`、`equipmentAvoided` 或等价排除条件
- **AND** 没有正向可用器械或居家条件
- **THEN** 系统 MUST 保留排除条件并叠加默认无器械边界
- **AND** 系统 MUST NOT 将排除类条件解释成某个可用器械

#### Scenario: 服务端不得读取自然语言原文决定默认
- **WHEN** 服务端判断是否需要默认无器械
- **THEN** 判断 MUST 只基于 Agent 结构化输入、ContextPackage 中已确认事实、用户记忆或 candidate evidence
- **AND** 判断 MUST NOT 基于 latest user message、conversationSummary、关键词、正则、同义词表或短句模板重新解释用户语义

### Requirement: searchExerciseResources 必须支持多用途动作筛选
`searchExerciseResources` SHALL 支持使用结构化 `suitabilities` 查询适合指定用途的动作候选。`suitabilities` SHALL 允许一次请求多个用途，例如 `["warmup", "stretch"]`；服务端 SHALL 只根据结构化输入和动作库字段执行查询，不得读取用户自然语言原文重新判断用途。旧单值 `suitability` 字段 SHALL 删除，不保留别名或兼容输入。

#### Scenario: 查询 warmup 和 stretch 候选
- **WHEN** Agent 调用 `searchExerciseResources` 且输入包含 `suitabilities = ["warmup", "stretch"]`
- **THEN** 工具 MUST 查询适合热身和拉伸用途的动作候选
- **AND** 工具结果 MUST 能区分 `warmup` 候选和 `stretch` 候选
- **AND** 工具 MUST NOT 要求 Agent 分别调用两个不同 tool 查询热身和拉伸

#### Scenario: 查询 training 候选
- **WHEN** Agent 调用 `searchExerciseResources` 获取主训练动作候选
- **THEN** 工具 input MUST 使用 `suitabilities = ["training"]` 或省略用途后由模型可见合同明确解释默认查询主训练候选
- **AND** 工具 MUST 返回可作为 `section = "training"` 的动作候选
- **AND** 工具结果 MUST 保留每个候选的 `exerciseId`
- **AND** `exerciseId` MUST 使用动作库主键

#### Scenario: 不支持的 suitabilities
- **WHEN** Agent 输入包含工具 schema 不允许的 `suitabilities` 值
- **THEN** 工具 input schema MUST 拒绝该调用
- **AND** runtime MUST 将该错误作为结构化 tool input 错误处理
- **AND** 服务端 MUST NOT 用自然语言兜底解释该值

#### Scenario: 旧 suitability 字段被删除
- **WHEN** Agent 输入仍使用旧字段 `suitability`
- **THEN** 工具 input schema MUST 拒绝该调用
- **AND** model-visible schema summary、examples、repair feedback 和 tests MUST NOT 继续把 `suitability` 表达成可用字段
- **AND** 系统 MUST NOT 在 handler 中把 `suitability` 自动转换为 `suitabilities`

### Requirement: 模型可见候选必须统一使用 exerciseId
`searchExerciseResources` 的模型可见 observation、分组候选、examples 和 schema summary SHALL 统一使用 `exerciseId` 表达可复制到 `visibleTrainingProposal.payload.exerciseItems[*].exerciseId` 的动作主键。内部 repository 或数据库字段可以继续使用 `id`，但模型可见候选 MUST NOT 同时暴露 `id` 和 `exerciseId` 两套可复制字段。

#### Scenario: 返回 training 候选
- **WHEN** `searchExerciseResources` 成功返回主训练候选
- **THEN** 模型可见 observation 中每个候选 MUST 包含 `exerciseId`
- **AND** 模型可见 observation 中候选 MUST NOT 暴露可复制的 `id` 字段
- **AND** manifest MUST 说明 `exerciseId` 可以被 `visibleTrainingProposal.payload.exerciseItems` 引用

#### Scenario: 返回 warmup / stretch 分组候选
- **WHEN** `searchExerciseResources` 成功返回 `suitabilities = ["warmup", "stretch"]` 的结果
- **THEN** 模型可见 observation MUST 包含 `warmup` 分组
- **AND** 模型可见 observation MUST 包含 `stretch` 分组
- **AND** 每个分组中的候选 MUST 包含可用于 `visibleTrainingProposal.payload.exerciseItems[*].exerciseId` 的 `exerciseId`
- **AND** 每个分组中的候选 MUST NOT 暴露可复制的 `id` 字段

#### Scenario: 字段命名 repair
- **WHEN** 模型输出 `visibleTrainingProposal` 时使用 `id` 代替 `exerciseId`
- **THEN** terminal output validation MUST 拒绝该 payload
- **AND** repair feedback MUST 用中文说明候选主键必须写入 `exerciseId`
- **AND** 服务端 MUST NOT 自动把 `id` 改写为 `exerciseId`

### Requirement: warmup / stretch 查询结果必须按用途分组投影
当 `searchExerciseResources` 查询多个 `suitabilities` 时，工具输出给模型的候选 SHALL 按用途分组。分组投影 SHALL 保留候选 `exerciseId` 和必要摘要，帮助模型围绕已确定主训练动作选择热身和拉伸。

#### Scenario: 返回分组候选
- **WHEN** `searchExerciseResources` 成功返回多个 suitability 的结果
- **THEN** 模型可见 observation MUST 按每个请求用途返回分组
- **AND** 每个分组 MUST 表达该分组对应的 `warmup`、`training` 或 `stretch` 用途
- **AND** 每个分组中的候选 MUST 包含可用于 `visibleTrainingProposal.payload.exerciseItems[*].exerciseId` 的 `exerciseId`

#### Scenario: 某个用途候选为空
- **WHEN** 查询结果只满足部分 `suitabilities`
- **THEN** 工具结果 MUST 返回已满足用途的候选分组
- **AND** 工具结果 MUST 返回缺失用途的结构化诊断
- **AND** Agent MUST 基于该诊断选择重查、澄清或失败收口

#### Scenario: 分组投影不得泄漏完整内部结果
- **WHEN** 工具把 handler 输出投影给模型
- **THEN** observation MUST 只包含模型选择动作所需的安全摘要
- **AND** observation MUST NOT 泄漏数据库内部字段、未脱敏 trace payload 或仅供服务端诊断的数据

### Requirement: searchExerciseResources 必须保持只读动作事实查询职责
`searchExerciseResources` SHALL 只负责返回动作库中存在的候选事实、分组摘要和结构化诊断。该 tool MUST NOT 生成最终编排、处方、计划、跨轮事实或用户可见训练卡片。

#### Scenario: Tool 返回候选而非编排
- **WHEN** Agent 调用 `searchExerciseResources` 查询动作候选
- **THEN** 工具结果 MUST 表达候选动作事实
- **AND** 工具结果 MUST NOT 包含最终 `visibleTrainingProposal`
- **AND** 工具结果 MUST NOT 决定动作的最终 `order`、`prescription` 或 `schedule`

#### Scenario: Tool 不保存跨轮事实
- **WHEN** `searchExerciseResources` 成功返回候选
- **THEN** 工具 MUST NOT 将候选自动写入跨轮事实桥
- **AND** 跨轮事实桥 MUST 只保存通过 final answer visible output 校验并实际对用户可见的 `visibleTrainingProposal`

#### Scenario: Tool 不执行语义编排
- **WHEN** 用户自然语言目标可能是动作推荐、编排或计划
- **THEN** 服务端 MUST NOT 通过 `searchExerciseResources` handler 判断最终业务形态
- **AND** 模型 MUST 负责基于用户目标和 tool 结果输出合法 `visibleTrainingProposal`

### Requirement: searchExerciseResources 模型可见合同必须说明分阶段查询
`searchExerciseResources` 的模型可见 manifest、schema description、examples 和 observation SHALL 用中文说明分阶段查询原则：先确定 `training` 主训练动作，再在需要编排时基于主训练动作查询 `warmup` / `stretch` 候选。说明 MUST 描述目标差异和字段含义，MUST NOT 写成固定关键词触发规则。

#### Scenario: Manifest 说明 training 查询
- **WHEN** 构造 `searchExerciseResources` 的模型可见 manifest
- **THEN** manifest MUST 说明该 tool 可用于查询主训练动作候选
- **AND** manifest MUST 说明返回的 `exerciseId` 可被 `visibleTrainingProposal.payload.exerciseItems` 引用
- **AND** manifest MUST 使用中文描述业务含义

#### Scenario: Manifest 说明 warmup / stretch 查询
- **WHEN** 构造 `searchExerciseResources` 的模型可见 manifest 或 schema summary
- **THEN** manifest MUST 说明 `suitabilities = ["warmup", "stretch"]` 用于围绕已确定主训练动作补充热身和拉伸候选
- **AND** manifest MUST 说明返回结果按 `warmup` 和 `stretch` 分组
- **AND** manifest MUST NOT 写成“用户说固定词语就调用某个流程”的规则

#### Scenario: Observation 说明分组含义
- **WHEN** `searchExerciseResources` 返回 warmup / stretch 分组 observation
- **THEN** observation MUST 用中文说明每个分组的用途
- **AND** `toolName`、`suitabilities`、`warmup`、`stretch`、`training`、`exerciseId` 等执行合同标识 MUST 保持英文原样

