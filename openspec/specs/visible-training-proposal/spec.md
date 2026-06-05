# visible-training-proposal Specification

## Purpose
TBD - created by archiving change unify-visible-training-proposal. Update Purpose after archive.
## Requirements
### Requirement: Final answer 必须通过通用 visibleOutputs 承载训练方案
训练推送类 `final_answer` SHALL 使用通用 `visibleOutputs[]` 承载用户可见结构化输出。`visibleTrainingProposal` SHALL 作为 `visibleOutputs[]` 中 `outputType = "visibleTrainingProposal"` 的业务 payload 出现；用户可见正文 MUST NOT 作为动作、处方、编排或计划事实源保存或渲染。`agent-core` SHALL 只校验 visible output envelope 的通用结构，不得硬编码 `visibleTrainingProposal` 的健身业务字段。

#### Scenario: final_answer 输出训练方案
- **WHEN** 模型需要向用户推送动作推荐、训练编排或多天计划
- **THEN** 模型 MUST 输出 `final_answer.visibleOutputs[]`
- **AND** 对应 visible output MUST 使用 `outputType = "visibleTrainingProposal"`
- **AND** 对应 visible output MUST 使用 `schemaVersion = "1"`
- **AND** 训练方案结构 MUST 位于该 visible output 的 `payload` 字段
- **AND** `content` MUST 只用于解释、提醒或总结，不得作为训练事实源

#### Scenario: agent-core 处理 visible output envelope
- **WHEN** `final_answer.visibleOutputs[]` 进入 Agent action 校验
- **THEN** `agent-core` MUST 只校验 envelope 的通用字段、JSON 可序列化边界、数组大小和 terminal grounding
- **AND** `agent-core` MUST NOT 读取 `visibleTrainingProposal.payload.exerciseItems`、`kind`、`prescription` 或 `schedule` 的业务含义
- **AND** `agent-core` MUST NOT 按 `outputType = "visibleTrainingProposal"` 写业务分支

#### Scenario: 业务 validator 校验 visibleTrainingProposal
- **WHEN** visible output 使用 `outputType = "visibleTrainingProposal"`
- **THEN** terminal output validator registry MUST 调用训练方案业务 validator 校验 payload
- **AND** 校验失败 MUST 进入结构化 repair、澄清或失败收口
- **AND** 系统 MUST NOT 在校验失败后继续渲染或保存该训练方案

### Requirement: visibleTrainingProposal 必须声明 kind 并满足对应结构
`visibleTrainingProposal.payload` SHALL 声明 `kind = "exercise_selection" | "routine" | "plan"`。系统 SHALL 按模型声明的 `kind` 校验结构自洽性；服务端 MUST NOT 通过用户自然语言关键词、正则、同义词表或固定短句模板替模型判断或改写 kind。

#### Scenario: 用户只要推荐一批动作
- **WHEN** 模型判断用户目标只需要获得一批可选训练动作
- **THEN** `payload.kind` MUST 为 `exercise_selection`
- **AND** `payload.exerciseItems` 中每个动作项 MUST 使用 `section = "training"`
- **AND** 每个动作项 MUST 包含 `exerciseId` 和 `order`
- **AND** 动作项 MUST NOT 因只推荐动作而强制包含 `prescription`
- **AND** payload MUST NOT 包含 `schedule`

#### Scenario: 用户要一套训练编排
- **WHEN** 模型判断用户目标需要一次可执行训练流程
- **THEN** `payload.kind` MUST 为 `routine`
- **AND** `payload.exerciseItems` MUST 包含 `warmup`、`training`、`stretch` 三类 section
- **AND** 每个动作项 MUST 包含 `exerciseId`、`section`、`order` 和 `prescription`
- **AND** `training` 动作 MUST 作为该编排的主训练动作
- **AND** payload MUST NOT 包含 `schedule`

#### Scenario: 用户基于上一轮动作要求编排
- **WHEN** 跨轮事实桥中存在上一轮可见 `visibleTrainingProposal` 的 `training` 动作
- **AND** 模型判断用户要求把上一轮动作编排成一次训练
- **THEN** 模型 MUST 复用这些 `training` 动作作为主训练
- **AND** 模型 MUST 只为补足编排查询或选择 `warmup` / `stretch` 动作
- **AND** 模型 MUST NOT 在用户未要求替换时丢弃上一轮 `training` 动作

#### Scenario: 用户要多天计划
- **WHEN** 模型判断用户目标需要多天训练安排
- **THEN** `payload.kind` MUST 为 `plan`
- **AND** `payload.exerciseItems` MUST 满足 `routine` 的动作和处方结构
- **AND** 模型 MUST 在同一个 payload 上输出 `schedule`
- **AND** `schedule.assignments` MUST 只表达指定周期内哪些天训练、哪些天休息
- **AND** 模型 MUST NOT 在 `schedule` 中为每天内嵌不同的完整 `exerciseItems`

### Requirement: 可见训练方案动作必须来自受控事实
系统 SHALL 校验 `visibleTrainingProposal.payload.exerciseItems[*].exerciseId` 来自当前 run 已满足的 tool result 或当前用户可访问的 `visible_training_proposal_fact`，并且存在于动作数据库。服务端 SHALL 按 `exerciseId` 读取展示详情；模型 SHALL 只输出 `exerciseId`、`section`、`order`、`prescription` 和 `schedule` 等结构化决策，不复写完整动作详情。

#### Scenario: exerciseId 来自本轮 tool result
- **WHEN** 模型在 `visibleTrainingProposal.payload.exerciseItems` 中输出 `exerciseId`
- **AND** 该 id 来自本轮 `satisfied = true` 的 `searchExerciseResources` 结果
- **THEN** 服务端 MUST 接受该 id 进入后续数据库存在性校验
- **AND** 服务端 MUST 能按该 id 读取动作详情用于渲染

#### Scenario: exerciseId 来自跨轮事实桥
- **WHEN** 模型在下一轮复用上一轮可见训练方案里的 `training` 动作
- **THEN** 服务端 MUST 校验这些 id 来自当前用户可访问的 `visible_training_proposal_fact`
- **AND** 服务端 MUST 校验这些 id 仍存在于动作数据库
- **AND** 服务端 MUST NOT 从自然语言摘要或正文反向推断动作 id

#### Scenario: exerciseId 未被受控事实支持
- **WHEN** `visibleTrainingProposal.payload.exerciseItems` 包含不在本轮已满足 tool result 且不在可访问 `visible_training_proposal_fact` 中的 `exerciseId`
- **THEN** 服务端 MUST 拒绝该 visible output
- **AND** runtime MUST 进入结构化 repair、澄清或失败收口
- **AND** 系统 MUST NOT 展示或保存包含该 id 的训练方案

#### Scenario: 动作详情由服务端补全
- **WHEN** `visibleTrainingProposal` 通过结构和 id 校验
- **THEN** 服务端 MUST 按 `exerciseId` 从动作库读取动作名称、图片、肌群、器械和展示摘要
- **AND** 模型 MUST NOT 被要求在 `visibleTrainingProposal` 中复写完整动作详情

### Requirement: 编排处方必须绑定到动作项并对齐执行字段
`visibleTrainingProposal.payload.exerciseItems[*].prescription` SHALL 只在 `kind = "routine"` 或 `kind = "plan"` 时出现，并 SHALL 与同一个动作项绑定。系统 MUST NOT 使用独立的处方数组、按 index join 的处方表、`restSeconds` 主合同字段或正文描述作为动作执行参数事实源。

#### Scenario: 编排动作包含处方
- **WHEN** `visibleTrainingProposal.payload.kind` 为 `routine` 或 `plan`
- **THEN** 每个 `exerciseItems` 动作项 MUST 包含 `prescription.mode`
- **AND** 每个 `prescription.mode` MUST 只能是 `reps` 或 `duration`
- **AND** 每个处方 MUST 包含 `sets` 和 `target`
- **AND** 每个处方 MUST 包含 `setRestSeconds` 和 `transitionRestSeconds`
- **AND** 数值边界 MUST 对齐当前训练草稿或执行模型的确定性 schema

#### Scenario: 推荐动作不需要处方
- **WHEN** `visibleTrainingProposal.payload.kind` 为 `exercise_selection`
- **THEN** 服务端 MUST 接受缺少 `prescription` 的 `training` 动作项
- **AND** Response Renderer MUST 将该结果渲染为动作推荐而不是可执行编排

#### Scenario: 处方与动作分离
- **WHEN** 模型输出独立处方数组、正文处方、`restSeconds` 主合同字段或无法确定归属动作的执行参数
- **THEN** 服务端 MUST NOT 将这些内容作为 `visibleTrainingProposal` 的处方事实
- **AND** runtime MUST 进入结构化 repair、澄清或失败收口

### Requirement: schedule 必须只表达同一编排的训练日和休息日
`visibleTrainingProposal.payload.schedule` SHALL 只在 `kind = "plan"` 时出现，并 SHALL 使用 `cycleLengthDays` 和 `assignments` 表达当前同一套编排在周期内的训练日 / 休息日安排。`assignments[*].cycleDayIndex` SHALL 从 1 开始，必须覆盖 `1..cycleLengthDays` 且不能重复；`assignments[*].type` 首版只允许 `training` 或 `rest`。

#### Scenario: plan 包含合法 schedule
- **WHEN** `visibleTrainingProposal.payload.kind` 为 `plan`
- **THEN** payload MUST 包含 `schedule.cycleLengthDays`
- **AND** payload MUST 包含 `schedule.assignments`
- **AND** `cycleDayIndex` MUST 覆盖 `1..cycleLengthDays`
- **AND** `cycleDayIndex` MUST NOT 重复
- **AND** `type` MUST 只能是 `training` 或 `rest`

#### Scenario: schedule 不得包含每日独立编排
- **WHEN** 模型输出 `schedule`
- **THEN** `schedule` MUST NOT 包含每日嵌套 `exerciseItems`
- **AND** `schedule` MUST NOT 复制多套不同 routine
- **AND** 渲染结果 MUST NOT 引入 payload 中不存在的每日独立编排

### Requirement: Response Renderer 和事实桥必须消费同一结构
系统 SHALL 从已校验的 `visibleOutputs[]` 渲染用户可见训练推送，并在确认本轮 assistant response 对用户可见后，将同一份 `visibleTrainingProposal` payload 保存为跨轮事实。跨轮事实桥 MUST NOT 保存与用户可见结构不同的一份动作列表。

#### Scenario: 渲染动作推荐
- **WHEN** `visibleOutputs[]` 包含 `outputType = "visibleTrainingProposal"` 且 payload `kind = "exercise_selection"`
- **THEN** Response Renderer MUST 输出动作推荐可消费事件或等价结构化投影
- **AND** 用户可见动作列表 MUST 来自 `payload.exerciseItems`

#### Scenario: 渲染训练编排
- **WHEN** `visibleTrainingProposal.payload.kind` 为 `routine`
- **THEN** Response Renderer MUST 按 `warmup`、`training`、`stretch` 顺序渲染编排
- **AND** 用户可见处方 MUST 来自同一动作项的 `prescription`

#### Scenario: 渲染训练计划
- **WHEN** `visibleTrainingProposal.payload.kind` 为 `plan`
- **THEN** Response Renderer MUST 在同一套编排基础上渲染训练日和休息日安排
- **AND** 渲染结果 MUST NOT 引入 payload 中不存在的每日独立编排

#### Scenario: 保存跨轮事实
- **WHEN** 本轮 `visibleTrainingProposal` 已通过校验并已进入用户可见 response
- **THEN** 跨轮事实桥 MUST 保存同一份 payload
- **AND** 下一轮 Agent 上下文 MUST 能投影最近可见训练方案的 `exerciseItems`、section 摘要和 `schedule` 摘要
- **AND** 跨轮事实桥 MUST NOT 从正文重新提取动作事实

#### Scenario: 候选 tool result 不得替代可见训练方案
- **WHEN** `searchExerciseResources` 返回动作候选、`warmup` 分组或 `stretch` 分组
- **THEN** 跨轮事实桥 MUST NOT 将这些候选结果直接保存为可复用训练方案
- **AND** 只有最终 `visibleTrainingProposal.payload.exerciseItems` 中真实出现的动作才能作为下一轮可引用的方案动作
- **AND** 未被最终方案选中的候选 MUST NOT 因曾出现在 tool result 中而被投影为“上一轮这套训练”

### Requirement: 旧动作推荐事实桥必须删除且不兼容读取
系统 SHALL 删除旧动作推荐事实桥主路径、旧 read tool、旧 run metadata 字段和旧模型可见说明。新 `visibleTrainingProposal` 合同 MUST NOT 使用 `exercise_recommendation_displayed`、`exercise_recommendation_fact`、`readRecentExerciseRecommendationFact`、`recentExerciseRecommendationFacts`、`displayedExerciseIds` 或 `displayedExercises` 作为新主路径、别名、兼容入口或模型可复制字段。

#### Scenario: 新事实桥命名
- **WHEN** 系统实现 `visibleTrainingProposal` 跨轮保存和读取
- **THEN** 事实 kind、resourceType、读取 tool 和 run metadata 命名 MUST 表达可见训练方案语义
- **AND** 新主路径 SHOULD 使用 `visible_training_proposal_displayed`、`visible_training_proposal_fact`、`readRecentVisibleTrainingProposal` 和 `recentVisibleTrainingProposals`
- **AND** 系统 MUST NOT 使用旧动作推荐事实桥命名承载新 payload

#### Scenario: 旧事实不兼容读取
- **WHEN** 旧 `exercise_recommendation_*` 事实或旧 `displayedExerciseIds` payload 存在
- **THEN** 新 fact bridge MUST NOT 读取、转换、迁移或投影这些旧事实
- **AND** 模型可见上下文 MUST NOT 暴露旧事实引用或旧字段
- **AND** 旧 read tool MUST NOT 注册到生产聊天 ToolRegistry

#### Scenario: 旧字段残留检查
- **WHEN** 实现完成本 change
- **THEN** 测试或架构扫描 MUST 证明模型可见 prompt、tool manifest、schema summary、examples、observations、compressed tool results、repair feedback、production registry 和新事实桥主路径中不存在旧字段残留

### Requirement: 模型可见合同必须引导语义理解而非关键词分流
模型可见 prompt、schema summary、tool manifest、examples、observations 和 repair feedback SHALL 使用中文说明 `visibleOutputs[]`、`visibleTrainingProposal` 的作用、字段含义和逐步增强关系。说明 MUST 引导模型根据用户自然语言目标理解用户要动作、编排还是计划；系统 MUST NOT 在 prompt 或服务端中写入固定关键词、正则、同义词表或短句模板式分流规则。

#### Scenario: Prompt 描述动作推荐
- **WHEN** 构造模型可见输出合同
- **THEN** prompt MUST 说明一批可选动作使用 `outputType = "visibleTrainingProposal"` 且 `payload.kind = "exercise_selection"`
- **AND** prompt MUST 说明动作推荐默认 `section = "training"`
- **AND** prompt MUST NOT 写成依赖固定用户词语触发动作推荐的规则

#### Scenario: Prompt 描述编排
- **WHEN** 构造模型可见输出合同
- **THEN** prompt MUST 说明可执行训练流程使用 `payload.kind = "routine"`
- **AND** prompt MUST 说明可执行训练流程需要在主训练动作基础上补充热身、拉伸和处方
- **AND** prompt MUST 引导模型保留已确定的主训练动作
- **AND** prompt MUST NOT 通过固定关键词列表判断用户是否要编排

#### Scenario: Prompt 描述计划
- **WHEN** 构造模型可见输出合同
- **THEN** prompt MUST 说明多天安排使用 `payload.kind = "plan"`
- **AND** prompt MUST 说明多天安排通过 `schedule.assignments` 表达
- **AND** prompt MUST 说明 `schedule` 复用当前同一套编排
- **AND** prompt MUST NOT 要求模型一次生成每天不同的完整编排

#### Scenario: 模型可见描述语言
- **WHEN** `visibleOutputs` 或 `visibleTrainingProposal` 相关说明出现在 prompt、schema description、examples、repair feedback、observations 或 compressed tool results 中
- **THEN** 描述性自然语言 MUST 使用中文
- **AND** `visibleOutputs`、`outputType`、`visibleTrainingProposal`、`payload`、`kind`、`exerciseItems`、`exerciseId`、`section`、`prescription`、`schedule`、`training`、`warmup`、`stretch` 等字段名和枚举值 MUST 保持英文原样

### Requirement: 训练方案生成必须遵循分阶段动作证据流程
Agent SHALL 基于当前可见事实、tool manifest、observations、用户目标和模型自主推理组合 `visibleTrainingProposal`。主训练动作 SHALL 先被确定；热身和拉伸 SHALL 围绕已确定的主训练动作补充；`routine` SHALL 由 `warmup` / `training` / `stretch` 三类动作和处方组成；`plan` SHALL 在同一套编排上增加 `schedule.assignments`。系统 MUST NOT 用服务端规则、固定关键词、固定工具调用次数或固定工具调用顺序替代模型决策；但模型可见合同 MUST 阻止 `routine` / `plan` 目标在可继续补事实时降级成纯动作推荐。

#### Scenario: 只推荐动作
- **WHEN** 用户目标只需要动作推荐
- **THEN** Agent MUST 查询或复用 `training` 相关候选证据
- **AND** Agent SHOULD NOT 为该目标额外查询 `warmup` / `stretch`
- **AND** 最终 `visibleTrainingProposal.payload.kind` MAY 为 `exercise_selection`
- **AND** payload MUST NOT 包含 `prescription` 或 `schedule`

#### Scenario: 直接生成编排
- **WHEN** 用户目标需要一次可执行编排
- **AND** 当前上下文没有可复用的 `training` 动作
- **THEN** Agent MUST 先查询并确定 `training` 动作证据
- **AND** Agent MUST 再查询或选择 `suitabilities = ["warmup", "stretch"]` 的候选
- **AND** 后续查询 MUST 基于已确定的主训练动作和用户目标补充结构
- **AND** 最终 `visibleTrainingProposal.payload.kind` MUST 为 `routine`
- **AND** 最终 payload MUST 包含 `warmup`、`training`、`stretch` 三类 `exerciseItems`
- **AND** 每个动作项 MUST 绑定 `prescription`

#### Scenario: 直接生成多天计划
- **WHEN** 用户目标需要周期、多天、频次、训练日 / 休息日安排或跨天训练计划
- **AND** 当前上下文没有可复用的完整 `routine` 或 `plan`
- **THEN** Agent MUST 先查询并确定 `training` 动作证据
- **AND** Agent MUST 再查询或选择 `warmup` / `stretch` 动作证据
- **AND** Agent MUST 将 `warmup`、`training`、`stretch` 三类动作组合成同一套带 `prescription` 的编排
- **AND** Agent MUST 在同一个 `visibleTrainingProposal.payload` 中输出 `schedule`
- **AND** 最终 `visibleTrainingProposal.payload.kind` MUST 为 `plan`
- **AND** `schedule.assignments` MUST 表达周期内 `training` / `rest` 日
- **AND** `schedule` MUST NOT 内嵌每天不同的完整动作编排

#### Scenario: 基于上一轮动作生成编排
- **WHEN** 当前上下文已有可访问的 `visibleTrainingProposal.training` 动作
- **AND** 用户要求基于这些动作编排训练
- **THEN** Agent MUST 复用已有 `training` 动作
- **AND** Agent MUST 只补充 `warmup` / `stretch` 候选，除非用户明确要求替换主训练动作
- **AND** Agent MUST NOT 在用户未要求替换时丢弃上一轮 `training` 动作

#### Scenario: 基于已有编排生成计划
- **WHEN** 当前上下文已有包含 `warmup`、`training`、`stretch` 和 `prescription` 的 `visibleTrainingProposal`
- **AND** 用户要求多天计划
- **THEN** Agent MUST 复用该编排
- **AND** Agent MUST 只生成或调整 `schedule`
- **AND** Agent MUST NOT 因生成计划而重新查询或替换动作，除非用户明确要求调整动作

#### Scenario: plan 或 routine 目标不得降级为 exercise_selection
- **WHEN** 模型根据用户目标、上下文和可见合同判断最终结构应为 `routine` 或 `plan`
- **AND** 当前 run 只具备 `training` 动作事实
- **AND** 当前可见 tools 可继续查询缺失的 `warmup` / `stretch` 动作事实
- **THEN** Agent MUST 优先继续查询或选择缺失 section 的动作事实
- **AND** Agent MUST NOT 因当前只查到 `training` 动作就输出 `payload.kind = "exercise_selection"` 来替代 `routine` 或 `plan`
- **AND** Agent MUST NOT 把 `content` 中的自然语言处方或计划说明当作结构事实源

#### Scenario: plan 事实不足时不伪造结构
- **WHEN** 用户目标需要 `plan`
- **AND** 当前可见 tools 不可用、缺失 section 查询未命中、必要约束不足或动作事实无法支撑合法结构
- **THEN** Agent MUST 使用 `ask_user`、失败收口或不伪造结构事实的解释
- **AND** Agent MUST NOT 编造未获得的 `exerciseId`
- **AND** Agent MUST NOT 把 `groups.training` 中且 `allowedSections` 不包含 `warmup` / `stretch` 的动作写入 `warmup` 或 `stretch`
- **AND** Agent MUST NOT 输出不完整但伪装成功的 `plan`

### Requirement: visibleTrainingProposal 刷新必须优先替换用户已看到动作
`visibleTrainingProposal` 的刷新语义 SHALL 以用户可见结果为边界：当用户基于上一套可见训练方案要求替换、重新来一套、不满意或同类继续请求时，新方案 SHOULD 保留原目标和约束，并优先替换上一套用户已看到的 `exerciseItems`。系统 MUST NOT 通过服务端关键词、正则、同义词表或短句模板替模型判断刷新语义。

#### Scenario: 刷新一次训练编排
- **WHEN** 当前会话存在上一套用户可见 `payload.kind = "routine"` 的 `visibleTrainingProposal`
- **AND** 模型判断用户目标是替换上一套一次训练编排
- **THEN** 新 `visibleTrainingProposal.payload.kind` SHOULD 仍为 `routine`，除非用户目标明确改变
- **AND** 新 `payload.exerciseItems` SHOULD 保留原目标、器械、难度、时长和 `warmup` / `training` / `stretch` 结构约束
- **AND** 新 `payload.exerciseItems` SHOULD 优先排除上一套用户已看到动作
- **AND** 系统 MUST NOT 在服务端根据用户原文强制选择刷新 action 或 tool

#### Scenario: 刷新多天训练计划
- **WHEN** 当前会话存在上一套用户可见 `payload.kind = "plan"` 的 `visibleTrainingProposal`
- **AND** 模型判断用户目标是替换上一套计划
- **THEN** 新 `visibleTrainingProposal.payload.kind` SHOULD 仍为 `plan`，除非用户目标明确改变
- **AND** 新 payload SHOULD 保留原计划目标、周期、训练日 / 休息日结构和可执行编排边界
- **AND** 新 payload SHOULD 优先替换上一套用户已看到动作，再组成完整 `warmup` / `training` / `stretch` 和 `schedule.assignments`
- **AND** 新 payload MUST NOT 仅复制上一套 `exerciseItems` 并声称已经换新

#### Scenario: 刷新动作推荐
- **WHEN** 当前会话存在上一套用户可见 `payload.kind = "exercise_selection"` 的 `visibleTrainingProposal`
- **AND** 模型判断用户目标是换一批动作推荐
- **THEN** 新 `visibleTrainingProposal.payload.kind` SHOULD 仍为 `exercise_selection`，除非用户目标明确升级为 `routine` 或 `plan`
- **AND** 新 `exerciseItems` SHOULD 优先排除上一套用户已看到 training 动作
- **AND** 新结果 MUST NOT 排除上一轮未展示给用户的内部候选

#### Scenario: 候选不足或用户要求保留动作
- **WHEN** 用户明确要求保留上一套中的某些动作
- **OR** 在当前目标、器械、难度、section、时长或计划约束下没有足够替代动作
- **THEN** 模型 MAY 复用部分已展示动作
- **AND** 模型 SHOULD 在 `content` 中说明保留或复用的原因
- **AND** 系统 MUST NOT 为了满足“完全换新”而接受不存在、未发布或不被受控事实支撑的 `exerciseId`

### Requirement: visibleTrainingProposal 刷新事实必须来自受控可见事实
系统 SHALL 以用户已经看到的 `visibleTrainingProposal.payload.exerciseItems` 作为刷新排除的事实边界。模型 MAY 通过当前 run 可见事实、受控 read/import tool result 或当前 satisfied 动作查询结果构造新方案，但 MUST NOT 从自然语言正文、trace 摘要、未展示内部候选或未导入的历史 payload 中猜测动作事实。

#### Scenario: 排除集合来源
- **WHEN** 模型刷新上一套 `visibleTrainingProposal`
- **THEN** 默认排除集合 SHOULD 只来自上一套用户可见 `payload.exerciseItems[*].exerciseId`
- **AND** 未进入上一套用户可见 payload 的 tool 候选 MUST NOT 默认进入排除集合
- **AND** 服务端 MUST NOT 从 assistant 自然语言正文反向重建排除集合

#### Scenario: 新方案动作来源
- **WHEN** 模型输出刷新后的 `visibleTrainingProposal.payload.exerciseItems`
- **THEN** 每个 `exerciseId` MUST 继续来自当前 run 已满足的动作事实来源或当前用户可访问的 `visible_training_proposal_fact`
- **AND** 服务端 MUST 继续复核数据库存在性、发布态和 section 边界
- **AND** 刷新语义 MUST NOT 放宽既有 `visibleTrainingProposal` validator

