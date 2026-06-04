## ADDED Requirements

### Requirement: Final answer 必须使用单一可见训练方案字段
训练推送类 `final_answer` SHALL 使用 `visibleTrainingProposal` 表达本轮实际展示给用户并可跨轮引用的训练方案。`visibleTrainingProposal.exerciseItems` SHALL 是动作推荐、编排和计划中的唯一动作事实源；用户可见正文 MUST NOT 作为动作事实源保存或渲染。

#### Scenario: 用户只要推荐一批动作
- **WHEN** 用户目标只需要获得一批可选训练动作
- **THEN** 模型 MUST 输出 `visibleTrainingProposal.exerciseItems`
- **AND** 每个动作项 MUST 使用 `section = "training"`
- **AND** 动作项 MUST 包含 `exerciseId` 和 `order`
- **AND** 动作项 MUST NOT 因只推荐动作而强制包含 `prescription`

#### Scenario: 用户要一套训练编排
- **WHEN** 用户目标需要一次可执行训练流程
- **THEN** 模型 MUST 输出包含 `warmup`、`training`、`stretch` 的 `visibleTrainingProposal.exerciseItems`
- **AND** 每个动作项 MUST 包含 `exerciseId`、`section`、`order` 和 `prescription`
- **AND** `training` 动作 MUST 作为该编排的主训练动作

#### Scenario: 用户基于上一轮动作要求编排
- **WHEN** 跨轮事实桥中存在上一轮可见 `visibleTrainingProposal` 的 `training` 动作
- **AND** 用户要求把上一轮动作编排成一次训练
- **THEN** 模型 MUST 复用这些 `training` 动作作为主训练
- **AND** 模型 MUST 只为补足编排查询或选择 `warmup` / `stretch` 动作
- **AND** 模型 MUST NOT 在用户未要求替换时丢弃上一轮 `training` 动作

#### Scenario: 用户要多天计划
- **WHEN** 用户目标需要多天训练安排
- **THEN** 模型 MUST 在同一个 `visibleTrainingProposal` 上输出 `schedule`
- **AND** `schedule.assignments` MUST 只表达指定周期内哪些天训练、哪些天休息
- **AND** 模型 MUST NOT 在 `schedule` 中为每天内嵌不同的完整 `exerciseItems`

### Requirement: 可见训练方案动作必须来自受控事实
系统 SHALL 校验 `visibleTrainingProposal.exerciseItems[*].exerciseId` 来自当前 run 已满足的 tool result 或当前用户可访问的跨轮事实桥，并且存在于动作数据库。服务端 SHALL 按 `exerciseId` 读取展示详情；模型 SHALL 只输出 id、section、order、处方和 schedule 等结构化决策。

#### Scenario: exerciseId 来自本轮 tool result
- **WHEN** 模型在 `visibleTrainingProposal.exerciseItems` 中输出 `exerciseId`
- **AND** 该 id 来自本轮 `satisfied = true` 的 `searchExerciseResources` 结果
- **THEN** 服务端 MUST 接受该 id 进入后续数据库存在性校验
- **AND** 服务端 MUST 能按该 id 读取动作详情用于渲染

#### Scenario: exerciseId 来自跨轮事实桥
- **WHEN** 模型在下一轮复用上一轮可见训练方案里的 `training` 动作
- **THEN** 服务端 MUST 校验这些 id 来自当前用户可访问的跨轮事实桥
- **AND** 服务端 MUST 校验这些 id 仍存在于动作数据库
- **AND** 服务端 MUST NOT 从自然语言摘要或正文反向推断动作 id

#### Scenario: exerciseId 未被受控事实支持
- **WHEN** `visibleTrainingProposal.exerciseItems` 包含不在本轮已满足 tool result 且不在可访问跨轮事实桥中的 `exerciseId`
- **THEN** 服务端 MUST 拒绝该 `final_answer` 的训练推送事实
- **AND** runtime MUST 进入结构化 repair、澄清或失败收口
- **AND** 系统 MUST NOT 展示或保存包含该 id 的训练方案

#### Scenario: 动作详情由服务端补全
- **WHEN** `visibleTrainingProposal` 通过结构和 id 校验
- **THEN** 服务端 MUST 按 `exerciseId` 从动作库读取动作名称、图片、肌群、器械和展示摘要
- **AND** 模型 MUST NOT 被要求在 `visibleTrainingProposal` 中复写完整动作详情

### Requirement: 编排处方必须绑定到动作项
`visibleTrainingProposal.exerciseItems[*].prescription` SHALL 只在需要可执行编排或计划时出现，并 SHALL 与同一个动作项绑定。系统 MUST NOT 使用独立的处方数组、按 index join 的处方表或正文描述作为动作执行参数事实源。

#### Scenario: 编排动作包含处方
- **WHEN** `visibleTrainingProposal` 表达一次可执行编排
- **THEN** 每个 `exerciseItems` 动作项 MUST 包含 `prescription.mode`
- **AND** 每个 `prescription.mode` MUST 只能是 `reps` 或 `duration`
- **AND** 每个处方 MUST 包含 `sets` 和 `target`

#### Scenario: 推荐动作不需要处方
- **WHEN** `visibleTrainingProposal` 只表达动作推荐
- **THEN** 服务端 MUST 接受缺少 `prescription` 的 `training` 动作项
- **AND** Response Renderer MUST 将该结果渲染为动作推荐而不是可执行编排

#### Scenario: 处方与动作分离
- **WHEN** 模型输出独立处方数组、正文处方或无法确定归属动作的执行参数
- **THEN** 服务端 MUST NOT 将这些内容作为 `visibleTrainingProposal` 的处方事实
- **AND** runtime MUST 进入结构化 repair、澄清或失败收口

### Requirement: Response Renderer 和事实桥必须消费同一结构
系统 SHALL 从已校验的 `visibleTrainingProposal` 渲染用户可见训练推送，并在确认本轮 assistant response 对用户可见后，将同一份 `visibleTrainingProposal` 保存为跨轮事实。跨轮事实桥 MUST NOT 保存与用户可见结构不同的一份动作列表。

#### Scenario: 渲染动作推荐
- **WHEN** `final_answer.visibleTrainingProposal` 只包含 `training` 动作且无 `schedule`
- **THEN** Response Renderer MUST 输出动作推荐可消费事件或等价结构化投影
- **AND** 用户可见动作列表 MUST 来自 `visibleTrainingProposal.exerciseItems`

#### Scenario: 渲染训练编排
- **WHEN** `visibleTrainingProposal.exerciseItems` 包含 `warmup`、`training`、`stretch` 且动作项包含 `prescription`
- **THEN** Response Renderer MUST 按 `warmup`、`training`、`stretch` 顺序渲染编排
- **AND** 用户可见处方 MUST 来自同一动作项的 `prescription`

#### Scenario: 渲染训练计划
- **WHEN** `visibleTrainingProposal` 包含合法 `schedule`
- **THEN** Response Renderer MUST 在同一套编排基础上渲染训练日和休息日安排
- **AND** 渲染结果 MUST NOT 引入 `visibleTrainingProposal` 中不存在的每日独立编排

#### Scenario: 保存跨轮事实
- **WHEN** 本轮 `visibleTrainingProposal` 已通过校验并已进入用户可见 response
- **THEN** 跨轮事实桥 MUST 保存同一份 `visibleTrainingProposal`
- **AND** 下一轮 Agent 上下文 MUST 能投影最近可见训练方案的 `exerciseItems`、section 摘要和 `schedule` 摘要
- **AND** 跨轮事实桥 MUST NOT 从正文重新提取动作事实

### Requirement: 模型可见合同必须引导语义理解而非关键词分流
模型可见 prompt、schema summary、tool manifest、examples、observations 和 repair feedback SHALL 使用中文说明 `visibleTrainingProposal` 的作用、字段含义和逐步增强关系。说明 MUST 引导模型根据用户自然语言目标理解用户要动作、编排还是计划；系统 MUST NOT 在 prompt 或服务端中写入固定关键词、正则、同义词表或短句模板式分流规则。

#### Scenario: Prompt 描述动作推荐
- **WHEN** 构造模型可见输出合同
- **THEN** prompt MUST 说明一批可选动作使用 `visibleTrainingProposal.exerciseItems` 且默认 `section = "training"`
- **AND** prompt MUST NOT 写成依赖固定用户词语触发动作推荐的规则

#### Scenario: Prompt 描述编排
- **WHEN** 构造模型可见输出合同
- **THEN** prompt MUST 说明可执行训练流程需要在主训练动作基础上补充热身、拉伸和处方
- **AND** prompt MUST 引导模型保留已确定的主训练动作
- **AND** prompt MUST NOT 通过固定关键词列表判断用户是否要编排

#### Scenario: Prompt 描述计划
- **WHEN** 构造模型可见输出合同
- **THEN** prompt MUST 说明多天安排通过 `schedule.assignments` 表达
- **AND** prompt MUST 说明 `schedule` 复用当前同一套编排
- **AND** prompt MUST NOT 要求模型一次生成每天不同的完整编排

#### Scenario: 模型可见描述语言
- **WHEN** `visibleTrainingProposal` 相关说明出现在 prompt、schema description、examples、repair feedback、observations 或 compressed tool results 中
- **THEN** 描述性自然语言 MUST 使用中文
- **AND** `visibleTrainingProposal`、`exerciseItems`、`exerciseId`、`section`、`prescription`、`schedule`、`training`、`warmup`、`stretch` 等字段名和枚举值 MUST 保持英文原样

### Requirement: 训练方案生成必须遵循分阶段动作查询流程
Agent SHALL 根据当前可见事实和用户目标分阶段调用 `searchExerciseResources`。主训练动作 SHALL 先被确定；热身和拉伸 SHALL 围绕已确定的主训练动作补充；计划 SHALL 优先复用已有编排。

#### Scenario: 只推荐动作
- **WHEN** 用户目标只需要动作推荐
- **THEN** Agent MUST 调用 `searchExerciseResources` 查询 `training` 相关候选
- **AND** Agent MUST NOT 为该目标额外查询 `warmup` / `stretch`

#### Scenario: 直接生成编排
- **WHEN** 用户目标需要一次可执行编排
- **AND** 当前上下文没有可复用的 `training` 动作
- **THEN** Agent MUST 先调用 `searchExerciseResources` 查询并确定 `training` 动作
- **AND** Agent MUST 再调用 `searchExerciseResources` 查询 `suitabilities = ["warmup", "stretch"]`
- **AND** 第二次查询 MUST 基于已确定的主训练动作和用户目标补充结构

#### Scenario: 基于上一轮动作生成编排
- **WHEN** 当前上下文已有可访问的 `visibleTrainingProposal.training` 动作
- **AND** 用户要求基于这些动作编排训练
- **THEN** Agent MUST 复用已有 `training` 动作
- **AND** Agent MUST 只调用 `searchExerciseResources` 查询 `warmup` / `stretch` 候选

#### Scenario: 基于已有编排生成计划
- **WHEN** 当前上下文已有包含 `warmup`、`training`、`stretch` 和 `prescription` 的 `visibleTrainingProposal`
- **AND** 用户要求多天计划
- **THEN** Agent MUST 复用该编排
- **AND** Agent MUST 只生成或调整 `schedule`
- **AND** Agent MUST NOT 因生成计划而重新查询或替换动作，除非用户明确要求调整动作
