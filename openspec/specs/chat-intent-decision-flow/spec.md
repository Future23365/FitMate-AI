# chat-intent-decision-flow Specification

## Purpose
TBD - created by archiving change unify-chat-intent-decision-flow. Update Purpose after archive.
## Requirements
### Requirement: 聊天主链路必须产出唯一 resolved intent
系统 SHALL 在每轮 `/api/chat` 请求中产出一个唯一的 resolved intent，作为用户回复、内部动作事件、卡片生成、trace 和持久化的共同执行契约。

#### Scenario: 用户请求可执行训练结果
- **WHEN** 用户提出动作推荐、单次 routine、长期 plan 或已有 artifact 调整请求
- **THEN** 系统 MUST 产出一个 resolved intent
- **AND** resolved intent MUST 同时表达 `type`、`action.kind`、`action.shouldTrigger`、`responseMode`、训练意图字段、缺失字段和用户可见建议
- **AND** resolved intent MUST 表达关键字段来源、引用需求和服务端引用解析结果
- **AND** 后续回复生成和卡片生成 MUST 使用该 resolved intent

#### Scenario: 系统存在旧版 intent 字段
- **WHEN** 系统仍需要兼容旧的 `type`、`workoutIntent`、`canTriggerAction` 或 `suggestedReplies`
- **THEN** 这些字段 MUST 从 resolved intent 派生
- **AND** 系统 MUST NOT 让旧字段成为另一个可独立触发卡片的事实来源

### Requirement: resolved intent 必须提供共享的结构化 action contract
系统 SHALL 使用共享 schema 表达 resolved intent 和 assistant action 事件，避免服务端、前端和生成接口各自解释训练意图。

#### Scenario: 服务端发送 assistant action 事件
- **WHEN** `/api/chat` 决定本轮需要触发结构化动作
- **THEN** assistant action 事件 MUST 携带 resolved action、可校验的 workout intent、字段来源和引用解析结果
- **AND** assistant action 事件 MUST NOT 只携带无法校验的 `intent: unknown`

#### Scenario: resolved action 覆盖用户可观察动作
- **WHEN** 用户请求动作推荐、routine、plan、patch、动作替换、动作讲解或普通回答
- **THEN** `action.kind` MUST 使用共享枚举表达对应动作
- **AND** 枚举 MUST 至少覆盖 `exercise_recommendation`、`workout_routine`、`workout_plan`、`workout_patch`、`exercise_replacement`、`exercise_explanation` 和 `none`

#### Scenario: action 不可执行
- **WHEN** resolved action 因缺失信息、引用不可用或硬边界无法执行
- **THEN** resolved intent MUST 记录 `action.blockingMissingFields` 或等价阻断原因
- **AND** 用户回复和 trace MUST 使用该结构化原因解释本轮为什么不触发生成

### Requirement: resolved intent 必须区分澄清回复和生成后调整建议
系统 SHALL 将缺信息澄清和生成后可选调整建议拆成不同语义，避免建议阻断用户明确可执行需求。

#### Scenario: 用户请求可执行计划且条件足够
- **WHEN** 用户明确请求可执行训练结果
- **AND** resolved intent 具备生成所需核心字段
- **THEN** `action.shouldTrigger` MUST 为 `true`
- **AND** `responseMode` MUST 为 `generate_directly` 或 `generate_with_suggestions`
- **AND** 系统 MUST 使用 `adjustmentReplies` 或等价字段表达生成后的可选调整建议
- **AND** 系统 MUST NOT 使用澄清回复阻断本次生成

#### Scenario: 用户请求缺少必要信息
- **WHEN** 用户请求训练结果但缺少目标、引用对象、器械/场地、时长、频率或其他当前动作必需字段
- **THEN** `action.shouldTrigger` MUST 为 `false`
- **AND** `responseMode` MUST 为 `ask_clarification`
- **AND** 系统 MUST 使用 `clarificationReplies` 或等价字段给出用户可直接发送的补充选项
- **AND** 系统 MUST NOT 同时触发训练卡片生成

### Requirement: 服务端必须校验 resolved intent 内部一致性
系统 SHALL 在触发任何内部动作前校验 resolved intent 的结构化字段是否自洽。

#### Scenario: 回复模式和触发状态冲突
- **WHEN** resolved intent 的 `responseMode` 为 `ask_clarification`
- **AND** `action.shouldTrigger` 为 `true`
- **THEN** 系统 MUST 判定该 resolved intent 存在冲突
- **AND** 系统 MUST NOT 直接触发任何卡片生成

#### Scenario: 缺失字段和触发状态冲突
- **WHEN** resolved intent 的 `missingActionFields` 非空
- **AND** `action.shouldTrigger` 为 `true`
- **THEN** 系统 MUST 判定该 resolved intent 存在冲突
- **AND** 系统 MUST NOT 直接触发任何卡片生成

#### Scenario: 意图类型和动作类型冲突
- **WHEN** resolved intent 的 `type`、`workoutIntent.intentType` 和 `action.kind` 表达不同训练结果类型
- **THEN** 系统 MUST 判定该 resolved intent 存在冲突
- **AND** 系统 MUST NOT 在冲突修复前调用下游 artifact generator

#### Scenario: 引用对象不可用但动作依赖引用
- **WHEN** resolved intent 的 action 需要基于历史 artifact 生成、修改或讲解
- **AND** ReferenceResolver 返回 `not_found` 或 `ambiguous`
- **THEN** 系统 MUST 将该结果视为不可执行
- **AND** 系统 MUST 进入澄清回复或引用选择流程

#### Scenario: patch、替换或讲解动作依赖历史内容
- **WHEN** resolved intent 的 `action.kind` 为 `workout_patch`、`exercise_replacement` 或依赖 artifact 的 `exercise_explanation`
- **THEN** resolved intent MUST 声明引用需求
- **AND** 服务端 MUST 在调用下游修改或讲解流程前校验引用已解析为当前用户可访问 artifact

### Requirement: 冲突 resolved intent 必须经过一次 repair 或降级为澄清
系统 SHALL 在 resolved intent 出现结构冲突时调用一次 LLM repair，并在 repair 失败后停止卡片生成。

#### Scenario: repair 后 resolved intent 通过门控
- **WHEN** 初始 resolved intent 未通过一致性门控
- **AND** LLM repair 返回的 resolved intent 通过一致性门控
- **THEN** 系统 MUST 使用 repair 后的 resolved intent 继续执行
- **AND** trace MUST 记录原始冲突、repair 请求和 repair 结果

#### Scenario: repair 后仍冲突
- **WHEN** 初始 resolved intent 未通过一致性门控
- **AND** LLM repair 返回的 resolved intent 仍未通过一致性门控
- **THEN** 系统 MUST 将本轮降级为 `action.shouldTrigger = false`
- **AND** `responseMode` MUST 为 `ask_clarification`
- **AND** 系统 MUST NOT 触发任何卡片生成

### Requirement: 生成型 artifact 必须由服务端聊天编排闭环生成
系统 SHALL 在服务端聊天主链路中完成生成型 artifact 的触发、生成、校验和结果汇总，前端不得成为第二个编排器。

#### Scenario: resolved intent 要求生成 artifact
- **WHEN** 最终 resolved intent 的 `action.shouldTrigger` 为 `true`
- **AND** `action.kind` 为 `exercise_recommendation`、`workout_routine`、`workout_plan`、`workout_patch` 或等价生成型动作
- **THEN** 服务端 chat orchestrator MUST 调用对应 artifact generation service
- **AND** 服务端 MUST 在同一轮 `/api/chat` 编排中校验 artifact 结果
- **AND** 前端 MUST NOT 在 `/api/chat` 完成后再自行调用生成接口来补齐该 artifact

#### Scenario: artifact 生成中需要展示进度
- **WHEN** artifact 生成需要较长时间
- **THEN** 服务端 MAY 通过流式事件返回 `intent_resolved`、`artifact_generating`、`artifact_validated`、`artifact_failed` 或等价状态
- **AND** 这些事件 MUST 表达服务端编排状态，而不是要求前端发起生成的命令

#### Scenario: 专用生成接口仍然存在
- **WHEN** `/api/ai/workout-plan` 或等价专用生成接口仍保留
- **THEN** 该接口 MAY 用于调试、兼容或服务端内部复用
- **AND** 生产聊天主链路 MUST NOT 依赖前端调用该接口完成本轮 artifact 生成
- **AND** 该接口 MUST NOT 重新判断本轮是否应该生成 artifact

### Requirement: 用户回复必须基于 resolved intent 和 artifact 结果生成
系统 SHALL 使用最终 resolved intent 和 artifact 生成结果产出用户可见回复，避免回复内容与内部动作不一致。

#### Scenario: artifact 生成成功
- **WHEN** resolved intent 要求触发卡片生成
- **AND** artifact generator 返回通过校验的推荐、routine、plan 或 patch 结果
- **THEN** 用户回复 MUST 描述已经按 resolved intent 处理的结果
- **AND** 用户回复 MAY 提供 `adjustmentReplies` 对应的可选调整方向
- **AND** 用户回复 MUST NOT 再询问用户是否要生成同一个结果

#### Scenario: artifact 生成失败
- **WHEN** resolved intent 要求触发卡片生成
- **AND** artifact generator 返回失败或可恢复错误
- **THEN** 用户回复 MUST 基于失败结果给出恢复引导或澄清选项
- **AND** 用户回复 MUST NOT 承诺已经生成成功
- **AND** 系统 MUST NOT 展示未通过校验的 artifact

#### Scenario: resolved intent 要求澄清
- **WHEN** resolved intent 的 `responseMode` 为 `ask_clarification`
- **THEN** 用户回复 MUST 只追问缺失信息或引用对象
- **AND** 系统 MUST NOT 在同一轮返回训练卡片

### Requirement: 前端不得从自然语言回复正文二次提取卡片触发
聊天前端 SHALL 只展示服务端返回的 resolved action、生成状态和 artifact 结果，不得自行触发 artifact 生成。

#### Scenario: 回复正文包含类似生成承诺的文字
- **WHEN** 服务端自然语言回复中出现“安排”、“整理”、“生成”或等价表达
- **AND** 服务端 resolved action 未要求触发卡片
- **THEN** 前端 MUST NOT 仅凭回复正文调用训练卡片生成接口

#### Scenario: 服务端返回 resolved action 和生成状态
- **WHEN** 服务端返回 `action.shouldTrigger = true`
- **THEN** 前端 MUST 展示服务端返回的生成状态或 artifact 结果
- **AND** 前端 MUST NOT 使用该 action、resolved intent 或 referenceResolution 自行调用对应生成流程
- **AND** 前端 MUST NOT 重新解析回复正文来决定 action 类型

#### Scenario: 历史消息包含旧 trigger JSON
- **WHEN** 历史 assistant 消息正文包含 `workout_plan_trigger`、`workout_routine_trigger`、`exercise_recommendation_trigger` 或等价旧 trigger JSON
- **THEN** 展示层 MAY 清理这些旧 trigger block 以避免用户看到内部协议
- **AND** 聊天 hook、上下文摘要和新一轮决策 MUST NOT 将这些正文 trigger JSON 当作最新训练意图事实来源

### Requirement: 聊天编排必须在适用场景进入只读 tool loop
系统 SHALL 在聊天意图解析、用户记忆构建和引用解析之后，按 resolved intent 和上下文缺口决定是否进入只读 LLM tool loop。

#### Scenario: 用户请求需要补查只读上下文
- **WHEN** 用户询问历史计划细节、动作详情、推荐原因、训练卡片解释或其他需要数据库只读上下文的问题
- **THEN** `/api/chat` MUST 允许进入只读 tool loop
- **AND** 首版 tool loop 输出 MUST 只作为最终自然语言回复的只读上下文

#### Scenario: 首版允许进入 tool loop 的场景
- **WHEN** 用户请求属于历史 artifact 解释、动作详情补查、推荐理由解释或计划理由解释
- **AND** 当前上下文不足以可靠回答
- **AND** `ENABLE_READONLY_LLM_TOOLS = "true"`
- **THEN** `/api/chat` MAY 进入只读 tool loop 补查上下文
- **AND** tool loop 结果 MUST 只作为最终自然语言回复上下文

#### Scenario: 用户请求可由现有确定性分支完成
- **WHEN** resolved intent 已经能由现有引用解析、Patch、动作讲解或卡片生成流程确定性完成
- **THEN** 系统 MAY 跳过只读 tool loop
- **AND** 系统 MUST 保持现有确定性流程的行为边界

#### Scenario: 生成型主流程不进入 tool loop
- **WHEN** 用户请求触发 `workout_plan`、`routine`、`exercise_recommendation` 或 `workout_patch` 的生成、保存、替换或应用流程
- **THEN** 系统 MUST 使用 resolved intent、ReferenceResolver、候选选择、Validator、PolicyEngine、ConfirmationGate 和对应 generator 决定执行路径
- **AND** 系统 MUST NOT 让只读 tool loop 改变 `action.shouldTrigger` 或生成型 artifact 内容

#### Scenario: 引用解析需要用户澄清
- **WHEN** ReferenceResolver 返回 `ambiguous` 或 `not_found`
- **THEN** `/api/chat` MUST 继续返回引用澄清或新生成引导
- **AND** 系统 MUST NOT 进入只读 tool loop 替用户选择候选或猜测 artifactId

#### Scenario: 确定性写流程已处理请求
- **WHEN** WorkoutPatchEngine、Validator、PolicyEngine、ConfirmationGate 或 artifact generator 已经产出确定性结果
- **THEN** 系统 MUST 使用该结果继续回复、确认或失败恢复
- **AND** 系统 MUST NOT 再通过只读 tool loop 重新判断是否触发同一动作

### Requirement: 只读 tool loop 不得绕过 resolved intent 门控
系统 SHALL 将只读 tool loop 作为补查上下文阶段，而不是第二套动作触发决策来源。

#### Scenario: tool loop 返回可用上下文
- **WHEN** 只读 tool loop 成功返回 tool context bundle
- **THEN** 系统 MUST 继续以最终 resolved intent 决定是否触发卡片、Patch 或澄清
- **AND** tool context bundle MUST NOT 单独触发训练 artifact 生成
- **AND** tool context bundle MUST NOT 直接传入 artifact generator 用于决定训练内容

#### Scenario: tool loop 与 resolved intent 冲突
- **WHEN** 工具结果暗示的动作类型与 resolved intent 的 `action.kind` 冲突
- **THEN** 系统 MUST 以 resolved intent 门控为准
- **AND** 必要时 MUST 进入澄清、repair 或确定性回退

### Requirement: 聊天回复必须显式消费只读工具上下文
系统 SHALL 在最终回复生成时把本轮可用的只读工具摘要作为受控上下文，而不是让模型凭空引用数据库内容。

#### Scenario: 工具上下文用于最终回复
- **WHEN** 只读 tool loop 返回动作、artifact 或候选摘要
- **THEN** 最终回复模型请求 MUST 包含摘要化后的 tool context bundle
- **AND** 回复内容 MUST 与工具结果和 resolved intent 保持一致
- **AND** trace MUST 能显示该 bundle 已进入最终回复模型请求

#### Scenario: 工具上下文不可用
- **WHEN** 只读 tool loop 未执行、失败或没有返回可用结果
- **THEN** 最终回复 MUST 只基于当前 prompt、conversationSummary、recent artifact summary 和现有服务端上下文
- **AND** 回复 MUST NOT 声称已经读取未成功读取的数据库内容

