# chat-routine-composition Specification

## Purpose
定义聊天页面推送单次训练编排的结构化数据、展示和保存要求，确保 AI routine 草稿使用热身、训练、拉伸三段式结构，并能无损保存为 `WorkoutRoutine`。
## Requirements
### Requirement: 聊天推送 routine 使用三段式草稿结构
聊天页面推送单次训练编排时，系统 SHALL 使用 routine 专用结构化草稿表达热身、训练和拉伸，不得继续用单日长期计划结构代表 routine。

#### Scenario: AI 生成单次训练编排
- **WHEN** 用户请求生成本次训练、动作组或训练流程，并且意图解析结果为 `routine`
- **THEN** 系统 MUST 生成 `kind = "routine"` 的 routine 草稿
- **AND** 草稿 MUST 包含 `warmup`、`training`、`stretch` 三个 section
- **AND** 草稿 MUST NOT 依赖 `WorkoutPlanDraft.days[0]` 表达单次训练编排

#### Scenario: 三段式结构缺失
- **WHEN** AI routine 草稿缺少 `warmup`、`training` 或 `stretch` 中任一 section
- **THEN** 服务端 MUST 判定草稿校验失败
- **AND** 系统 MUST NOT 将缺失 section 的草稿发送给聊天卡片保存

#### Scenario: Routine section 顺序
- **WHEN** 系统展示、保存或转换 routine 草稿
- **THEN** 系统 MUST 按 `warmup`、`training`、`stretch` 的顺序处理 section
- **AND** 系统 MUST NOT 让主训练循环重复热身或拉伸 section

### Requirement: Routine 草稿包含循环配置和动作执行参数
聊天推送的 routine 草稿 SHALL 将主训练循环配置和每个动作的执行参数作为服务端校验后的结构化字段。

#### Scenario: AI 输出 routine 循环配置
- **WHEN** AI 生成 routine 草稿
- **THEN** 草稿 MUST 包含 `trainingLoopRounds`
- **AND** 草稿 MUST 包含 `trainingLoopRestSeconds`
- **AND** `trainingLoopRounds` MUST 是服务端允许范围内的正整数
- **AND** `trainingLoopRestSeconds` MUST 是服务端允许范围内的非负整数

#### Scenario: AI 输出动作执行参数
- **WHEN** AI 生成 routine 草稿中的动作项
- **THEN** 每个动作项 MUST 包含 `exerciseId`、`section`、`mode`、`sets`、`target`、`setRestSeconds` 和 `transitionRestSeconds`
- **AND** `mode` MUST 只能是 `reps` 或 `duration`
- **AND** `target` MUST 表示单组次数或单组秒数
- **AND** 系统 MUST NOT 使用缺失组数、次数或休息信息的动作项生成可保存 routine

#### Scenario: 动作参数用于时长估算
- **WHEN** 系统计算 routine 草稿的预估时长
- **THEN** 系统 MUST 使用草稿中的动作执行参数和主训练循环配置
- **AND** 估算结果 MUST 与保存后 `WorkoutRoutine` 的估算逻辑保持一致

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

### Requirement: 聊天 routine 卡片展示三段式编排
聊天页面 SHALL 使用 routine 专用卡片展示 AI 推送的单次训练编排，使用户能检查阶段、循环和动作执行参数。

#### Scenario: 用户查看 routine 推送卡片
- **WHEN** 聊天消息包含 routine 草稿
- **THEN** 卡片 MUST 展示标题、目标、预估时长和主训练循环次数
- **AND** 卡片 MUST 按热身、训练、拉伸三段展示动作
- **AND** training section MUST 展示循环轮数和循环间休息

#### Scenario: 用户查看动作参数
- **WHEN** 用户查看 routine 卡片中的动作
- **THEN** 每个动作 MUST 展示动作名称、动作图片或占位图、器械或肌群摘要
- **AND** 每个动作 MUST 展示组数、次数或秒数、组间休息和动作过渡休息
- **AND** 如果动作有备注，卡片 MUST 展示该备注或提供可查看入口

#### Scenario: Routine 卡片保存状态
- **WHEN** 用户点击保存 routine
- **THEN** 卡片 MUST 展示保存中状态
- **AND** 保存成功后 MUST 展示成功状态并进入动作编排列表或编排页
- **AND** 保存失败时 MUST 展示可理解的错误反馈

### Requirement: 聊天推送 routine 保存全流程保持结构一致
聊天推送 routine 从 AI 草稿到保存为 `WorkoutRoutine` 的全流程 SHALL 保留 section、循环配置和动作执行参数。

#### Scenario: 用户保存 AI 推送 routine
- **WHEN** 用户在聊天 routine 卡片点击保存
- **THEN** 系统 MUST 将 routine 草稿转换为 `WorkoutRoutine`
- **AND** 转换结果 MUST 保留 `trainingLoopRounds` 和 `trainingLoopRestSeconds`
- **AND** 转换结果 MUST 保留每个动作的 `section`、`mode`、`sets`、`target`、`setRestSeconds` 和 `transitionRestSeconds`
- **AND** 系统 MUST 通过 `/api/workout-routines` 保存该 `WorkoutRoutine`

#### Scenario: 保存后的 routine 用于训练执行
- **WHEN** 用户保存聊天推送 routine 并在动作编排或训练日历中使用它
- **THEN** 系统 MUST 能用保存后的 routine 生成包含热身、循环训练、拉伸的训练时间线
- **AND** 主训练循环次数 MUST 与聊天卡片展示一致

#### Scenario: 历史 routine 草稿不兼容
- **WHEN** 旧聊天历史中存在非 `kind = "routine"` 的单日计划式 routine 草稿
- **THEN** 系统 MAY 不恢复该旧草稿卡片
- **AND** 系统 MUST NOT 为旧草稿新增兼容转换层

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

### Requirement: Routine 生成必须由 Agent draft 工具触发

系统 SHALL 让聊天 routine 生成从 Agent routine draft / validation / policy / persistence 工具链触发，而不是从旧聊天意图、内部动作事件或 `workoutIntent` 触发。首次生成 routine 时，工具链 SHALL 能创建新的 conversation artifact；修改已有 routine 时才需要 source artifact revision。

#### Scenario: 用户请求单次训练
- **WHEN** Agent 判断用户请求应生成单次 routine
- **THEN** Agent MUST 通过 routine draft 工具、候选集合、Validator 和 Policy 形成可展示结果
- **AND** `AgentExecutionResult` MUST 引用对应 tool result、validationId、policyDecisionId 或 revisionId
- **AND** 系统 MUST NOT 通过旧 `workout_routine` intent 字段独立触发 routine 卡片

#### Scenario: 首次生成 routine
- **WHEN** 本轮 Agent 已生成并校验新的 routine draft
- **AND** 当前会话没有可作为 revision source 的 routine artifact
- **THEN** 保存工具 MUST 创建新的 `ConversationArtifact(kind = "routine")`
- **AND** artifact MUST 归属于当前 `userId` 和 `sessionId`
- **AND** 系统 MUST NOT 因缺少 `sourceArtifactId` 将首次生成降级为自由文本回答

#### Scenario: 修改已有 routine
- **WHEN** 本轮 Agent 基于已有 routine artifact 生成修订或 patch
- **THEN** 保存工具 MUST 校验 source artifact 可访问且 active
- **AND** 保存结果 MUST 创建新的 revision
- **AND** 系统 MUST NOT 覆盖旧 artifact payload

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

### Requirement: Routine 请求不得投影为动作推荐卡
聊天 routine 生成请求 SHALL 只展示 routine、artifact、失败或澄清结果，不得把中间动作候选投影为动作推荐卡。

#### Scenario: Agent 只引用 searchExercises 并输出 answered
- **WHEN** 用户请求生成单次训练编排
- **AND** Agent 结果只引用 `searchExercises` 工具结果
- **THEN** 系统 MUST NOT 投影 `exercise_recommendation` 卡片作为最终训练结果
- **AND** 系统 MUST 通过 Agent 决策约束促使下一轮使用 `generateRoutineDraft`

#### Scenario: 动作推荐卡 summary
- **WHEN** 系统确实投影 `exercise_recommendation` 卡片
- **THEN** 卡片 summary MUST 使用推荐卡摘要
- **AND** 卡片 summary MUST NOT 复制整段聊天正文

### Requirement: Routine Agent 工具链必须通过服务端资源解析 draft

聊天 routine 编排链路 SHALL 将 `generateRoutineDraft` 产出的完整 draft 作为本轮 Agent runtime 的服务端资源保存，并允许后续 validation、policy 和 artifact revision 工具通过资源 id 读取该 draft。模型 SHALL 只负责引用服务端登记的资源 id，不得被要求复写完整 routine draft payload。

#### Scenario: Draft 生成后进入校验
- **WHEN** `generateRoutineDraft` 成功返回 `draftId` 和完整 routine draft
- **AND** 模型随后调用 `validateRoutineDraft` 并提供同一 `draftId`
- **THEN** 服务端 MUST 从本轮 Agent tool results 中解析完整 draft
- **AND** 服务端 MUST 使用解析出的 draft 执行 routine 校验
- **AND** 系统 MUST NOT 要求模型在 `validateRoutineDraft` 输入中提交完整 `draft` 对象

#### Scenario: 模型误传局部 draft payload
- **WHEN** `generateRoutineDraft` 成功返回 `draftId` 和完整 routine draft
- **AND** 模型调用 `validateRoutineDraft` 时提供同一 `draftId`
- **AND** 模型额外提交了不完整或字段形状不匹配的 `draft` 对象
- **THEN** 服务端 MUST NOT 使用该模型提交的 `draft` 作为校验事实源
- **AND** 服务端 MUST 继续从本轮 Agent tool results 中解析完整 draft
- **AND** 系统 MUST NOT 因模型误传的 partial `draft` 字段返回 `schema_validation_failed`

#### Scenario: Draft 资源不存在
- **WHEN** 模型调用 `validateRoutineDraft`、`evaluatePolicy` 或 `saveConversationArtifactRevision` 时引用不存在的 `draftId`
- **THEN** 服务端 MUST 返回结构化工具失败
- **AND** 系统 MUST NOT 展示或保存 routine 卡片
- **AND** AI Trace MUST 记录资源解析失败的工具名和资源 id

#### Scenario: 候选集合不匹配
- **WHEN** 模型调用 `validateRoutineDraft` 时提供的 `candidateSetId` 与 draft 生成时登记的候选集合不一致
- **THEN** 服务端 MUST 返回结构化依赖失败
- **AND** 系统 MUST NOT 用不匹配的候选集合继续校验或保存 routine

#### Scenario: 校验和策略通过后写入 artifact
- **WHEN** routine draft 已通过 `validateRoutineDraft`
- **AND** Policy 允许展示或进入可确认展示边界
- **AND** 模型调用 `saveConversationArtifactRevision` 引用对应 `draftId`、`validationId` 和 `policyDecisionId`
- **THEN** 服务端 MUST 使用已登记的 draft payload 写入 `ConversationArtifact`
- **AND** 聊天回复 MUST 包含可供前端渲染 routine 卡片的 artifact / revision 证据
- **AND** 系统 MUST NOT 退化为仅返回自由文本编排

### Requirement: Routine 候选搜索不得被泛化 query 硬清零

聊天 routine / plan 编排链路 SHALL 以结构化动作候选边界作为可执行候选集事实来源。当 `searchExercises` 请求用于 routine 或 plan 生成，并且已经提供结构化候选边界时，系统不得因为泛化 `query` 的 hybrid 召回未命中而丢弃全部结构化候选。

#### Scenario: Routine 搜索带泛化 query 和结构化边界
- **WHEN** Agent 调用 `searchExercises` 且 `candidateUse` 为 `routine`
- **AND** 输入包含 `bodyRegions`、`equipmentRequired` 或 `allowedSections` 等结构化边界
- **AND** 输入同时包含类似 `上肢训练` 的泛化 `query`
- **THEN** 服务端 MUST 先按结构化边界执行 hard filters
- **AND** 服务端 MUST NOT 要求该泛化 `query` 在单个动作文本或向量召回中命中后才保留候选
- **AND** 若 hard filters 后存在可用候选，系统 MUST 返回候选集合并允许 Agent 继续调用 `generateRoutineDraft`

#### Scenario: Recommendation 搜索仍保留 query 召回约束
- **WHEN** Agent 调用 `searchExercises` 且 `candidateUse` 为 `recommendation`
- **AND** 输入包含自然语言 `query`
- **THEN** 服务端 MAY 继续使用 query hybrid match 约束候选召回
- **AND** 系统 MUST NOT 因 routine / plan 的放宽规则改变 recommendation 搜索语义

### Requirement: 基于推荐 artifact 的 routine 必须保留推荐动作集合

当 Agent 通过结构化工具决策把 routine 生成绑定到 `exercise_recommendation` artifact 时，系统 SHALL 将该 artifact 中的主要 `exerciseIds` 作为 required candidate boundary。服务端 MUST 校验 artifact 归属、artifact kind、required 动作来源和最终 draft 覆盖，不得用重新裸搜得到的候选集合替代用户引用的推荐动作集合。

#### Scenario: 用户要求使用已显示推荐动作生成 routine

- **WHEN** Agent 决策将本轮 routine 生成绑定到一个当前用户可访问的 `exercise_recommendation` artifact
- **AND** 该 artifact 包含 1 个或多个主要 `exerciseIds`
- **THEN** `generateRoutineDraft` 输入 MUST 包含 `sourceArtifactId` 或等价 artifact 来源字段
- **AND** `generateRoutineDraft` 输入 MUST 包含来自该 artifact 的 `requiredExerciseIds`
- **AND** 服务端 MUST 校验全部 `requiredExerciseIds` 来自该 artifact 的 index 或 payload

#### Scenario: 生成 artifact-bound routine

- **WHEN** `generateRoutineDraft` 接收到合法的 `sourceArtifactId` 和 `requiredExerciseIds`
- **THEN** routine draft MUST 包含全部 required 动作
- **AND** required 动作 MAY 按服务端 routine section 规则重新分配顺序和阶段
- **AND** 系统 MUST NOT 因缺少热身或拉伸阶段而丢弃 required 动作

#### Scenario: 推荐动作缺少必要阶段

- **WHEN** required 动作集合不足以覆盖 `warmup`、`training` 或 `stretch` 必要 section
- **THEN** 服务端 MAY 从数据库动作库中补充必要阶段动作
- **AND** 补充动作 MUST 被加入最终 `candidateExerciseIds`
- **AND** 后续 Validator、Policy 和保存链路 MUST 使用包含 required 与 supplemental 动作的最终候选边界

#### Scenario: required 动作来源不合法

- **WHEN** `generateRoutineDraft` 输入的 `requiredExerciseIds` 不属于 `sourceArtifactId` 对应 artifact
- **OR** `sourceArtifactId` 不属于当前用户
- **OR** `sourceArtifactId` 不是可作为动作来源的推荐 artifact
- **THEN** 服务端 MUST 返回结构化工具失败
- **AND** 系统 MUST NOT 生成或保存 routine artifact

#### Scenario: 无 artifact 绑定的从零 routine

- **WHEN** Agent 没有结构化绑定已有推荐 artifact
- **THEN** 系统 MAY 继续通过 `searchExercises(candidateUse="routine")` 获取候选集合
- **AND** 服务端 MUST 继续校验草稿动作存在于数据库并属于本轮候选边界

### Requirement: Routine 卡片不得由旧 trigger JSON 触发
系统 SHALL 删除前端新聊天流中基于旧 trigger JSON 的 routine 或训练卡片触发路径。Routine 卡片 MUST 来自 Agent routine draft / validation / policy / persistence 工具链和 `AgentExecutionResult`。

#### Scenario: assistant 回复包含旧 trigger JSON
- **WHEN** 新聊天运行的 assistant 文本中包含 `workout_plan_trigger`、`workout_routine` 或其他历史遗留 trigger JSON
- **THEN** 前端 MUST NOT 将该文本解析成 routine 卡片
- **AND** routine 卡片 MUST 只由 `agent_execution_result`、artifact 事件、done metadata 或等价 Agent-first 事件触发

#### Scenario: 历史 routine 草稿需要展示
- **WHEN** 历史消息中存在旧 trigger JSON 或非 Agent-first routine 草稿
- **THEN** 系统 MAY 做纯展示兼容或忽略该旧草稿
- **AND** 系统 MUST NOT 为历史 trigger 新增生产执行兼容层

### Requirement: Artifact-bound routine 生成必须支持旧推荐 revision
系统 SHALL 在基于已有 `exercise_recommendation` artifact 的动作生成 routine 时，接受当前用户可访问的旧 recommendation revision id，并恢复到 active payload 后校验 required 动作来源。

#### Scenario: 推荐 artifact 旧 revision 生成 routine
- **WHEN** 用户要求将 recent artifact summary 中的动作做成一套 routine
- **AND** Agent 调用 `generateRoutineDraft` 时传入 `sourceArtifactId` 和 `requiredExerciseIds`
- **AND** `sourceArtifactId` 已经是 superseded artifact 但可恢复到同 lineage active recommendation artifact
- **THEN** 服务端 MUST 使用 active recommendation payload 校验 `requiredExerciseIds`
- **AND** 所有 required 动作都属于 active recommendation payload 时 MUST 继续生成 routine 草稿
- **AND** 系统 MUST NOT 因 requested artifact status 为 superseded 而退回自由文本回答

#### Scenario: required 动作不属于 active 推荐 payload
- **WHEN** `generateRoutineDraft` 恢复到 active recommendation payload
- **AND** 输入的 `requiredExerciseIds` 中存在不属于该 payload 的动作 id
- **THEN** 服务端 MUST 返回结构化 `invalid_dependency` 或等价失败
- **AND** 系统 MUST NOT 用裸搜候选替代用户指定 artifact 动作集合

