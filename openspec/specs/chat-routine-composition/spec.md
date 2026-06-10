# chat-routine-composition Specification

## Purpose
定义聊天页面推送单次训练编排的结构化数据、展示和保存要求，确保 AI routine 草稿使用热身、训练、拉伸三段式结构，并能无损保存为 `WorkoutRoutine`。
## Requirements
### Requirement: 聊天推送 routine 使用三段式草稿结构
聊天页面推送单次训练编排时，系统 SHALL 使用 routine 专用结构化草稿表达已生成的训练 section，不得继续用单日长期计划结构代表 routine。草稿 MUST 至少包含 `training` section；`warmup` 和 `stretch` 若由模型生成则 MUST 以结构化 section 展示，若缺失则系统 MUST NOT 伪造动作补齐。

#### Scenario: AI 生成单次训练编排
- **WHEN** 用户请求生成本次训练、动作组或训练流程，并且意图解析结果为 `routine`
- **THEN** 系统 MUST 生成 `kind = "routine"` 的 routine 草稿
- **AND** 草稿 MUST 至少包含 `training` section
- **AND** 草稿 MAY 包含模型实际生成的 `warmup` 或 `stretch` section
- **AND** 草稿 MUST NOT 依赖 `WorkoutPlanDraft.days[0]` 表达单次训练编排

#### Scenario: training 结构缺失
- **WHEN** AI routine 草稿缺少 `training` section
- **THEN** 服务端 MUST 判定草稿校验失败
- **AND** 系统 MUST NOT 将缺少主训练 section 的草稿发送给聊天卡片保存

#### Scenario: support section 缺失
- **WHEN** AI routine 草稿包含合法 `training` section
- **AND** 草稿缺少 `warmup`、`stretch` 或两者
- **THEN** routine 草稿 schema MUST 接受该结构
- **AND** 聊天卡片 MUST 展示已存在的 section
- **AND** 系统 MUST NOT 自动生成或插入缺失 support section 的动作

#### Scenario: Routine section 顺序
- **WHEN** 系统展示、保存或转换 routine 草稿
- **THEN** 系统 MUST 按 `warmup`、`training`、`stretch` 的相对顺序处理已存在的 section
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

### Requirement: Routine draft 必须使用受控补充 section evidence

聊天 routine 生成 SHALL 将 `searchExercises` 返回的 `controlledSupplementalCandidates.section` 视为本轮候选集合的结构化分段证据。`generateRoutineDraft` 构造三段式 routine 时，MUST 优先使用该 evidence 放置受控补充动作，而不得仅用动作通用元数据重新分段导致必要 section 缺失。

#### Scenario: 受控补充动作被用于 warmup
- **WHEN** `searchExercises(candidateUse = "routine")` 返回 `candidateSetEvidence.controlledSupplementalCandidates`，其中某个数据库动作的 `section = "warmup"`
- **AND** Agent 调用 `generateRoutineDraft` 并引用同一 `candidateSetId`
- **THEN** routine draft MUST 将该动作作为 `warmup` 候选使用
- **AND** 系统 MUST NOT 因该动作通用元数据同时偏向 `stretch` 而返回 `candidate_set_missing_warmup`

#### Scenario: 受控补充动作被用于 stretch
- **WHEN** `searchExercises(candidateUse = "routine")` 返回 `candidateSetEvidence.controlledSupplementalCandidates`，其中某个数据库动作的 `section = "stretch"`
- **AND** Agent 调用 `generateRoutineDraft` 并引用同一 `candidateSetId`
- **THEN** routine draft MUST 将该动作作为 `stretch` 候选使用
- **AND** 后续 `validateRoutineDraft` MUST 能通过 `candidateSetEvidence` 证明该动作属于本轮受控补充边界

### Requirement: Routine 热身和拉伸默认不继承主训练器械要求

当用户只表达可用器械或主训练器械偏好时，聊天 routine 生成 SHALL 默认把该器械用于 `training` 主训练候选边界。`warmup` 和 `stretch` SHALL 默认允许无器械或自重受控补充动作，系统不得要求用户再次确认热身和拉伸是否也使用主训练器械。

#### Scenario: 用户有哑铃但未要求全程哑铃
- **WHEN** 用户请求“上肢 30 分钟，有哑铃，帮我安排一套”或等价 routine
- **THEN** 系统 MUST 优先为 `training` 选择哑铃候选动作
- **AND** 系统 MUST 默认允许 `warmup` 和 `stretch` 使用无器械或自重动作
- **AND** 系统 MUST NOT 仅因为动作库缺少哑铃热身或哑铃拉伸动作而再次询问用户是否接受无器械热身/拉伸

#### Scenario: 用户明确指定热身和拉伸无器械
- **WHEN** 用户已回答“热身用无器械，拉伸用无器械，训练阶段全部用哑铃动作”或等价表达
- **THEN** Agent MUST 继续生成 routine draft、validation、policy 或 artifact 保存链路
- **AND** 系统 MUST NOT 继续发起同类澄清
- **AND** 系统 MUST NOT 因 `candidate_set_missing_warmup` 或等价 section coverage 错误终止为通用失败

#### Scenario: 用户明确要求全程同器械
- **WHEN** 用户明确要求热身、主训练和拉伸全部使用同一器械
- **THEN** 系统 MAY 将该器械作为所有 section 的 hard constraint
- **AND** 若动作库无法满足该边界，系统 MUST 返回 `needs_clarification`、`blocked` 或 `failed`
- **AND** 系统 MUST NOT 静默放宽用户明确的全程器械要求

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

### Requirement: 未指定器械的 routine 必须默认无器械

用户请求生成单次训练 routine 时，若当前消息、已确认上下文和用户记忆中都没有正向可用器械或居家条件，系统 SHALL 默认按无器械 / 自重训练生成。该默认 SHALL 同时体现在动作候选集合、routine intent、draft、validation evidence 和保存后的 artifact 摘要中。

#### Scenario: 目标和时长已足够但未指定器械
- **WHEN** 用户输入“今天练胸30分钟”或等价单次 routine 请求
- **AND** Agent 没有读取到正向可用器械或居家条件
- **THEN** 系统 MUST 使用无器械或自重候选生成 routine
- **AND** `generateRoutineDraft` 的 `intent.equipment` 或等价字段 MUST 表达无器械 / 自重边界
- **AND** 系统 MUST NOT 因缺少器械条件追问用户

#### Scenario: 用户明确提供可用器械
- **WHEN** 用户输入“我有哑铃，今天练胸30分钟”或等价 routine 请求
- **THEN** 系统 MUST 使用哑铃或动作库真实等价器械 facet 构建 routine 候选
- **AND** routine intent、draft 和保存后的 artifact MUST 保留该器械边界
- **AND** 系统 MUST NOT 用默认无器械覆盖用户明确可用器械

#### Scenario: 当前消息覆盖历史器械
- **WHEN** 已确认上下文中存在可用器械事实
- **AND** 当前用户消息明确表示“今天不用器械”“没有器械”或等价无器械条件
- **THEN** 当前消息的无器械条件 MUST 覆盖历史器械事实
- **AND** 本轮 routine MUST 使用无器械或自重候选生成

#### Scenario: 历史确认器械仍可使用
- **WHEN** 当前用户消息没有提到器械
- **AND** 同一会话或用户记忆中存在已确认的正向可用器械事实
- **THEN** 系统 MAY 使用该已确认器械作为 routine 候选边界
- **AND** 系统 MUST NOT 在该事实仍有效时自动改成默认无器械

### Requirement: 目标明确的聊天 routine 请求必须稳定完成三段式编排
聊天入口处理目标明确的单次训练编排请求时，Agent SHALL 在动作候选足够的情况下生成包含热身、主训练和拉伸的 `routine` 可见输出；候选不足或关键约束不足时 SHALL 给出可恢复的缺口说明或澄清，而不是返回安全错误、动作列表或让用户自行组合。

#### Scenario: 直接 routine 请求生成完整编排
- **WHEN** 用户提供足以解释单次 routine 的目标、部位或训练形式，并提供或可合理沿用单次训练关键约束
- **AND** 发布态动作库可按当前结构化约束返回 `training`、`warmup` 和 `stretch` 候选
- **THEN** Agent MUST 生成 `visibleTrainingProposal.payload.kind = "routine"`
- **AND** routine MUST 包含 `warmup`、`training`、`stretch` 三类动作项
- **AND** routine MUST 为每个动作项绑定处方字段
- **AND** 用户可见结果 MUST NOT 是安全错误、纯动作推荐或要求用户自行组合的正文

#### Scenario: 缺失 section 候选可恢复
- **WHEN** 用户目标需要 routine
- **AND** 当前结构化约束下缺少 `warmup`、`training` 或 `stretch` 候选
- **THEN** Agent MUST 说明具体缺少的候选类型或约束冲突
- **AND** Agent MUST 给出可恢复下一步，例如放宽器械、场地、难度、目标肌群或继续澄清
- **AND** Agent MUST NOT 展示未通过 section / 动作事实 / 处方校验的 routine 卡片

#### Scenario: 同类语义变体进入同一能力边界
- **WHEN** 用户请求“居家背部 30 分钟训练”“胸部 20 分钟无器械训练”“循环胸部训练”或等价表达
- **THEN** 这些样例 MUST 只作为回归测试覆盖同类 routine 目标
- **AND** 生产实现 MUST NOT 以这些具体短语作为服务端触发条件

### Requirement: 聊天训练编排必须按目标语义选择输出结构
聊天入口处理训练相关请求时，Agent SHALL 按用户目标语义选择 `exercise_selection`、`routine` 或 `plan`。当用户目标需要一次可执行训练或多天计划时，候选足够的情况下不得停留在动作列表；候选不足时应给出可恢复缺口说明。

#### Scenario: 单次训练语义进入 routine 边界
- **WHEN** 用户目标语义需要一套训练、一次训练、当次训练、某目标或部位的单次训练、某个时长内完成训练、循环训练、居家或无器械单次训练，且不是只询问动作清单
- **AND** 当前动作库可返回 `warmup`、`training`、`stretch` 候选
- **THEN** Agent MUST 生成 `visibleTrainingProposal.payload.kind = "routine"`
- **AND** routine MUST 包含 `warmup`、`training`、`stretch` 三类动作项和处方
- **AND** 用户可见结果 MUST NOT 只是动作推荐、`exercise_selection`、正文动作列表或用户自行组合建议

#### Scenario: 多天或频次语义进入 plan 边界
- **WHEN** 用户目标语义包含每周频次、周期长度、多天安排、训练日 / 休息日安排、每周几练、连续几周目标或长期训练计划
- **AND** 当前动作库可返回支撑训练结构的候选
- **THEN** Agent SHOULD 生成 `visibleTrainingProposal.payload.kind = "plan"`
- **AND** plan MUST 包含可校验训练结构和 `schedule.assignments`
- **AND** 用户可见结果 MUST NOT 只是动作推荐、`exercise_selection`、正文动作列表或只承诺下一轮再生成计划

#### Scenario: 动作清单语义保留 exercise_selection
- **WHEN** 用户目标语义只需要动作推荐、动作清单、动作库查询、动作替代候选或动作事实说明
- **THEN** Agent MAY 输出 `visibleTrainingProposal.payload.kind = "exercise_selection"` 或普通文本
- **AND** Agent MUST NOT 因本 change 固定补查 `warmup` / `stretch`
- **AND** Agent MUST NOT 强制输出 `routine` 或 `plan`

#### Scenario: 代表性样例只用于回归测试
- **WHEN** 回归测试覆盖“居家背部 30 分钟训练”“胸部 20 分钟无器械训练”“循环胸部训练”“每周 3 练，每次 25 分钟”或等价表达
- **THEN** 这些样例 MUST 只作为测试覆盖同类语义边界
- **AND** 生产实现 MUST NOT 以这些具体短语作为服务端触发条件

