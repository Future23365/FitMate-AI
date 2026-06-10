# visible-training-proposal-validation Specification

## Purpose
TBD - created by archiving change decouple-visible-training-proposal-validation. Update Purpose after archive.
## Requirements
### Requirement: `visibleTrainingProposal` 必须基于数据库动作事实校验
系统 SHALL 在 `visibleTrainingProposal` 渲染、保存或写入聊天历史前，基于 PostgreSQL `Exercise` 事实校验最终 payload 中的每个 `exerciseId`。校验 MUST 不依赖具体业务 `toolName` 返回值作为动作合法性的唯一依据，也 MUST NOT 要求新生成训练卡片的每个动作都已经出现在当前 run 的动作查询结果中。

#### Scenario: 最终方案引用存在且发布态的动作
- **WHEN** Planner 返回 `final_answer.visibleOutputs[]`，其中包含 `outputType = "visibleTrainingProposal"`
- **AND** payload 中所有 `exerciseId` 都存在于数据库且 `isPublished = true`
- **THEN** 系统 MUST 允许继续执行 `visibleTrainingProposal` 的业务结构校验
- **AND** 系统 MUST 使用数据库中的 canonical 动作事实作为后续 renderer 和事实桥详情来源

#### Scenario: 数据库合法动作未出现在本轮 tool result
- **WHEN** Planner 返回 `final_answer.visibleOutputs[]`，其中包含 `outputType = "visibleTrainingProposal"`
- **AND** payload 中所有 `exerciseId` 都存在于数据库且 `isPublished = true`
- **AND** payload 中所有 `exerciseItems[*].section` 都被对应动作的数据库 `allowedSections` 覆盖
- **AND** 部分动作没有出现在当前 run 的 `toolResults.groups.<section>.exercises[]`
- **THEN** 系统 MUST 继续允许该输出进入 renderer 和事实桥流程
- **AND** 系统 MUST NOT 因缺少当前 run 动作来源而进入 terminal failure finalizer

#### Scenario: 最终方案引用不存在的动作
- **WHEN** `visibleTrainingProposal.exerciseItems[]` 中包含数据库不存在的 `exerciseId`
- **THEN** 系统 MUST 拒绝该 terminal output
- **AND** 拒绝结果 MUST 使用结构化错误表达缺失的 `exerciseId`
- **AND** 系统 MUST NOT 渲染、保存或持久化该 `visibleTrainingProposal`

#### Scenario: 最终方案引用未发布动作
- **WHEN** `visibleTrainingProposal.exerciseItems[]` 中包含 `isPublished != true` 的动作
- **THEN** 系统 MUST 拒绝该 terminal output
- **AND** 拒绝结果 MUST 表达该动作当前不可用于用户可见训练方案
- **AND** 系统 MUST NOT 通过 tool result 或历史事实绕过该发布态校验

### Requirement: `visibleTrainingProposal` 必须校验 section 边界
系统 SHALL 使用数据库动作事实中的 `allowedSections` 校验 `visibleTrainingProposal.exerciseItems[*].section`，确保最终训练方案中的每个动作只出现在可允许的 section 中。

#### Scenario: section 合法
- **WHEN** payload 中某个动作项的 `section` 存在于该动作的 `allowedSections`
- **THEN** 系统 MUST 接受该动作项进入后续渲染和事实桥流程

#### Scenario: section 不合法
- **WHEN** payload 中某个动作项的 `section` 不存在于该动作的 `allowedSections`
- **THEN** 系统 MUST 拒绝该 `visibleTrainingProposal`
- **AND** 拒绝结果 MUST 包含 `exerciseId`、输出的 `section` 和数据库允许的 `allowedSections`

### Requirement: `visibleTrainingProposal` validator 不得硬编码动作查询 toolName
系统 SHALL 让 `visibleTrainingProposal` validator 只依赖 payload 结构、数据库动作事实和受控 validator context，不得通过具体业务 `toolName` 分支决定某个 `exerciseId` 是否可用于最终训练方案。

#### Scenario: validator 处理最终动作来源
- **WHEN** validator 校验 `visibleTrainingProposal.exerciseItems[*].exerciseId`
- **THEN** validator MUST NOT 检查 `toolResult.toolName === "searchExerciseResources"`、`toolResult.toolName === "inspectVisibleTrainingProposals"` 或未来任意具体业务 toolName 来决定动作合法性
- **AND** validator MUST 通过数据库事实或等价注入的 canonical exercise fact resolver 校验动作

#### Scenario: 新增动作查询 tool 不需要修改 validator
- **WHEN** 后续新增任意动作查询、动作解析或候选推荐 tool
- **AND** 最终 `visibleTrainingProposal` 中的 `exerciseId` 通过数据库事实校验
- **AND** 新 tool 不改变 `visibleTrainingProposal` payload schema
- **THEN** 系统 MUST NOT 要求修改 `visibleTrainingProposal` validator 的 toolName 白名单

### Requirement: renderer 必须复用已校验动作详情
系统 SHALL 让 `visibleTrainingProposal` renderer 使用数据库校验阶段产生的 canonical 动作摘要，或使用同一个数据库事实读取服务补齐用户可见详情。renderer MUST NOT 通过具体 toolName 输出形态拼接训练卡片详情。

#### Scenario: renderer 补齐动作详情
- **WHEN** `visibleTrainingProposal` 已通过数据库动作事实校验
- **THEN** renderer MUST 使用已校验的 `exerciseId`、`nameZh`、`nameEn`、`equipmentZh`、`primaryMusclesZh`、`allowedSections` 和 `imageUrl` 等有限摘要生成用户可见事件
- **AND** renderer MUST NOT 暴露完整数据库对象、内部 service 对象或未脱敏 payload

#### Scenario: renderer 不读取具体 tool result
- **WHEN** renderer 渲染 `visibleTrainingProposal`
- **THEN** renderer MUST NOT 根据 `toolResult.toolName` 区分 `searchExerciseResources`、`inspectVisibleTrainingProposals` 或其他业务 tool 的输出形态
- **AND** renderer MUST NOT 因某个具体 tool result 缺失而拒绝已通过数据库校验的方案

### Requirement: 跨轮可见训练事实必须复核当前数据库
系统 SHALL 保留 `visible_training_proposal_fact` 作为跨 run 引用用户已见训练方案的服务端内部事实来源，但历史事实中的动作 MUST 在再次输出为 `visibleTrainingProposal` 前通过当前数据库事实校验。历史事实可以通过 `inspectVisibleTrainingProposals(operation = "list_recent")` 或等价服务端受控读取投影成模型可见业务事实；系统 MUST NOT 继续要求模型额外调用 `read_recent` 才能消费同一历史事实，也 MUST NOT 要求模型输出历史 `factRef`、`messageId`、`resourceId` 或 `toolResultId`。

#### Scenario: 历史方案动作仍可用
- **WHEN** Planner 通过 `inspectVisibleTrainingProposals(operation = "list_recent")` 或等价事实读取恢复历史 `visibleTrainingProposal`
- **AND** 历史方案中的动作当前仍存在、发布态可用且 section 合法
- **THEN** 系统 MAY 允许 Planner 在新的 `visibleTrainingProposal` 中复用这些 `exerciseId`

#### Scenario: 历史方案动作已不可用
- **WHEN** 历史方案中的某个动作已不存在、未发布或 section 不再合法
- **THEN** 系统 MUST 拒绝直接输出该历史方案
- **AND** 系统 MUST 返回可恢复的结构化失败、澄清或失败收口
- **AND** 系统 MUST NOT 因历史事实曾经展示过就绕过当前数据库校验

#### Scenario: 历史方案导入不替代最终输出
- **WHEN** `inspectVisibleTrainingProposals(operation = "list_recent")` 成功导入历史 `visibleTrainingProposal` 事实
- **THEN** 该事实 MAY 作为当前 run 的复用、派生或调整依据
- **AND** 最终新训练结构仍 MUST 由合法 `final_answer.visibleOutputs[]` 承载
- **AND** 最终新训练结构仍 MUST 通过当前数据库事实和结构校验

### Requirement: 数据库校验失败不得产生用户可见训练事实
系统 SHALL 在 `visibleTrainingProposal` 数据库事实校验失败时阻止用户可见训练事实输出，并将失败留在可诊断 trace / error 边界中。

#### Scenario: 校验失败阻止可见输出
- **WHEN** `visibleTrainingProposal` 数据库动作事实校验失败
- **THEN** Response Renderer MUST NOT 输出 `visible_output` 事件
- **AND** fact bridge MUST NOT 保存该 `visibleTrainingProposal`
- **AND** 聊天历史 MUST NOT 将该结构化输出记录为已展示训练事实

#### Scenario: 校验失败可诊断
- **WHEN** 数据库动作事实校验失败
- **THEN** trace 或等价诊断结果 MUST 记录稳定错误 code、失败的 `exerciseId` 摘要和失败阶段
- **AND** trace MUST NOT 记录完整数据库对象、secret 或跨用户 payload

### Requirement: section 校验失败必须提供模型可恢复的结构化诊断
系统 SHALL 在 `visibleTrainingProposal.exerciseItems[*].section` 不存在于该动作 `allowedSections` 时，返回可进入 repair observation 的结构化诊断。诊断 MUST 表达失败字段路径、`exerciseId`、模型输出的 `section`、数据库允许的 `allowedSections` 和稳定错误 code。系统 MUST NOT 在该诊断中替 Planner 指定必须调用的具体 tool 或固定 tool 调用顺序。

#### Scenario: section 不合法时反馈字段级 violation
- **WHEN** Planner 返回 `final_answer.visibleOutputs[]`
- **AND** 其中某个 `visibleTrainingProposal.exerciseItems[0]` 的 `exerciseId = "Pushups"`
- **AND** 该动作数据库事实的 `allowedSections = ["training"]`
- **AND** Planner 输出 `section = "warmup"`
- **THEN** 系统 MUST 拒绝该 `visibleTrainingProposal`
- **AND** 拒绝结果 MUST 包含 `code = "section_not_allowed"`
- **AND** 拒绝结果 MUST 包含指向 `visibleOutputs[0].payload.exerciseItems[0].section` 或等价位置的 `path`
- **AND** 拒绝结果 MUST 包含 `exerciseId = "Pushups"`、`section = "warmup"` 和 `allowedSections = ["training"]`
- **AND** 拒绝结果 MUST NOT 生成 `visible_output` 用户事件
- **AND** 拒绝结果 MUST NOT 保存 `visible_training_proposal_displayed` 事实

#### Scenario: section 诊断不替模型选择下一步
- **WHEN** 系统因 `section_not_allowed` 生成 terminal output validation failure
- **THEN** 诊断内容 MUST 只表达确定性失败事实和合同边界
- **AND** 诊断内容 MUST NOT 包含“必须调用 `searchExerciseResources`”或等价固定流程要求
- **AND** 诊断内容 MUST NOT 根据用户原文关键词、正则、同义词表或短句模板改写 Planner 的下一步 action

### Requirement: visibleTrainingProposal 校验失败必须提供结构化资源覆盖诊断
当 `visibleTrainingProposal` 终态输出因动作 section 不合法或缺少 `routine` / `plan` 必要主训练事实而失败时，系统 SHALL 提供可进入 repair observation 的结构化诊断。诊断 MUST 表达确定性失败事实、当前资源覆盖和缺失边界；诊断 MUST NOT 替 Planner 指定固定 tool、固定 action、固定回复或固定调用顺序。缺少 `warmup` 或 `stretch` 不再构成 terminal output hard validation failure，但系统仍 SHALL 保留当前输出的 section 覆盖摘要供 trace、metadata 或后续诊断使用。

#### Scenario: section_not_allowed 反馈允许 section
- **WHEN** `visibleTrainingProposal.exerciseItems[*].section` 不存在于该动作数据库 `allowedSections`
- **THEN** validation failure MUST 包含稳定 code `section_not_allowed`
- **AND** validation failure MUST 包含失败字段路径、`exerciseId`、模型输出的 `section` 和数据库允许的 `allowedSections`
- **AND** repair observation MUST 表达该动作不能放入模型输出的 section
- **AND** 系统 MUST NOT 渲染或保存该 `visibleTrainingProposal`

#### Scenario: routine 或 plan 缺少 training 时反馈缺口
- **WHEN** Planner 输出 `payload.kind = "routine"` 或 `payload.kind = "plan"`
- **AND** `exerciseItems` 未覆盖 `training` section
- **THEN** validation failure 或 repair observation MUST 表达缺失 `training`
- **AND** repair observation MUST 表达当前输出覆盖哪些 section
- **AND** repair observation MUST 表达当前可见事实覆盖哪些 section

#### Scenario: routine 或 plan 仅缺少 support section 时不 hard fail
- **WHEN** Planner 输出 `payload.kind = "routine"` 或 `payload.kind = "plan"`
- **AND** `exerciseItems` 覆盖 `training` section
- **AND** `exerciseItems` 缺少 `warmup`、`stretch` 或两者
- **AND** payload schema、`prescription`、`schedule`、数据库动作事实和 `allowedSections` 均合法
- **THEN** terminal output validator MUST NOT 因缺少 `warmup` 或 `stretch` 拒绝该 `visibleTrainingProposal`
- **AND** 系统 MUST NOT 自动生成、选择或补入缺失的 support section 动作

#### Scenario: Repair feedback 不替模型选择下一步
- **WHEN** 系统生成 terminal output validation repair feedback
- **THEN** feedback MUST NOT 包含固定用户短语作为触发条件
- **AND** feedback MUST NOT 包含“必须调用 `searchExerciseResources`”或等价固定 tool 流程
- **AND** feedback MUST NOT 根据具体 `toolName` 和字段组合改写 Planner 的语义目标

### Requirement: repair budget 耗尽前必须保留可恢复诊断
系统 SHALL 在 repair budget 允许的范围内向 Planner 暴露足够的字段级和资源覆盖诊断，使模型能够修正结构而不是重复输出不可支撑方案。

#### Scenario: 第一次校验失败进入 repair observation
- **WHEN** `visibleTrainingProposal` 终态校验失败
- **AND** repair budget 尚未耗尽
- **THEN** 下一轮 Planner 输入 MUST 包含结构化 invalid action observation
- **AND** observation MUST 包含失败 code、失败路径和可恢复边界摘要
- **AND** observation MUST NOT 泄漏完整数据库对象、secret 或跨用户 payload

#### Scenario: repair 耗尽后不输出无效方案
- **WHEN** repair budget 已耗尽
- **AND** 最新 terminal action 仍未通过 `visibleTrainingProposal` 校验
- **THEN** Response Renderer MUST NOT 输出 `visible_output`
- **AND** fact bridge MUST NOT 保存该无效方案
- **AND** 最终响应 MUST 以安全错误边界收口

### Requirement: routine / plan section 覆盖失败必须可恢复收口

系统 SHALL 在 `visibleTrainingProposal` 的 `payload.kind = "routine"` 或 `payload.kind = "plan"` 但 `exerciseItems` 未覆盖 `training` section 时，拒绝该 terminal output，并提供足够结构化诊断供 repair 或用户安全失败收口使用。系统 MUST NOT 因正文中出现训练建议而绕过结构化 `training` section 校验。缺少 `warmup` 或 `stretch` 时，系统 MUST NOT 从正文解析、补全或保存缺失动作事实，也 MUST NOT 因该缺失直接拒绝已经合法的训练方案。

#### Scenario: routine 缺少 training

- **WHEN** Planner 返回 `final_answer.visibleOutputs[]`
- **AND** 某个 `visibleTrainingProposal.payload.kind = "routine"`
- **AND** `payload.exerciseItems` 不包含 `training` section
- **THEN** terminal output validation MUST 拒绝该 `visibleTrainingProposal`
- **AND** validation failure MUST 包含稳定诊断 code，例如 `section_coverage_missing`
- **AND** validation failure MUST 表达 `payloadKind`、失败 path、当前输出覆盖 section 和缺失 `training`
- **AND** Response Renderer MUST NOT 输出该 `visible_output`
- **AND** fact bridge MUST NOT 保存该 `visibleTrainingProposal`

#### Scenario: 正文建议不能替代结构化 training 动作事实

- **WHEN** Planner 在 `final_answer.content` 中写出主训练动作、处方或训练安排
- **AND** 对应 `visibleTrainingProposal.payload.exerciseItems` 缺少可校验的 `training` 动作项
- **THEN** 系统 MUST 将该输出视为结构化训练方案缺少必要主训练事实
- **AND** 系统 MUST NOT 将正文内容解析、补全或保存成结构化动作事实
- **AND** 系统 MUST NOT 根据正文自然语言自动生成缺失的 `exerciseId`、`section`、`prescription` 或 `schedule`

#### Scenario: 缺少 warmup 或 stretch 不触发 validation failure

- **WHEN** Planner 返回 `payload.kind = "routine"` 或 `"plan"`
- **AND** `payload.exerciseItems` 包含合法 `training` 动作项和必要 `prescription`
- **AND** `payload.exerciseItems` 缺少 `warmup` 或 `stretch`
- **THEN** 业务 terminal output validator MUST 继续校验数据库动作事实、`allowedSections`、`prescription` 和 `schedule`
- **AND** 若这些确定性校验通过，系统 MUST 允许该 `visibleTrainingProposal` 渲染和保存
- **AND** 系统 MUST NOT 因 support section 缺失进入 terminal failure finalizer

### Requirement: 当前 run 动作来源缺失不得阻断数据库合法训练卡片
系统 SHALL 将 `visibleTrainingProposal` 动作项的当前 run 来源匹配结果作为 provenance diagnostic，而不是新生成训练卡片的 hard fail。只要 `exerciseId` 通过数据库存在性、发布态、可访问性和 section 边界校验，系统 MUST NOT 因该动作未出现在当前 run 的 `toolResults.groups.<section>.exercises[]` 或 consumable resource 中而拒绝该 `visibleTrainingProposal`。

#### Scenario: 数据库合法但未出现在当前 run 动作来源
- **WHEN** Planner 返回 `final_answer.visibleOutputs[]`，其中包含 `outputType = "visibleTrainingProposal"`
- **AND** payload 中某个 `exerciseItems[*].exerciseId` 存在于数据库、发布态可用且当前用户可访问
- **AND** 该动作项的 `section` 存在于数据库 `allowedSections`
- **AND** 该 `exerciseId + section` 未出现在当前 run 可收集的动作来源中
- **THEN** terminal output validation MUST NOT 因 `current_run_source_missing` 拒绝该 `visibleTrainingProposal`
- **AND** 系统 MAY 在 validation metadata、trace 或等价诊断中记录缺少当前 run 来源
- **AND** 该诊断 MUST NOT 阻止 Response Renderer 输出已通过数据库事实校验的训练卡片

#### Scenario: provenance diagnostic 不替模型选择下一步
- **WHEN** 系统记录当前 run 来源缺失诊断
- **THEN** 诊断内容 MUST 只表达哪些 `exerciseId + section` 未在本轮来源集合中出现
- **AND** 诊断内容 MUST NOT 要求模型固定调用 `searchExerciseResources`、`inspectVisibleTrainingProposals` 或其他具体业务 `toolName`
- **AND** 诊断内容 MUST NOT 根据用户原文关键词、正则、同义词表或短句模板改写 Planner 的 action

