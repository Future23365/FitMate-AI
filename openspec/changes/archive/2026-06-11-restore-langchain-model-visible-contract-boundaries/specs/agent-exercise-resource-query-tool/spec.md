## MODIFIED Requirements

### Requirement: `searchExerciseResources` 投影必须保护模型、用户和 trace 边界
系统 SHALL 为 `searchExerciseResources` 提供安全模型观察、用户投影和 trace summary，避免完整 handler output 默认外泄。模型可见 observation MUST 只表达动作库查询事实、section 分组事实、有限动作摘要、查询口径、覆盖摘要和确定性 diagnostics；MUST NOT 暴露业务目标满足度、最终交付指令、下一步 tool 调用指导或固定 workflow。

#### Scenario: 模型观察只包含安全事实摘要
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** 模型可见 observation MUST 包含查询事实，例如 `query`、`filters`、`totalMatches`、`returnedCount`、`truncated` 和应用的数据库 facet 摘要
- **AND** 模型可见 observation MAY 包含 `groups`、`sectionSummary`、`availableSections`、`missingSections` 和 `diagnostics`
- **AND** 模型可见 observation MUST 只包含有限动作摘要字段，例如 `exerciseId`、`nameZh`、`nameEn`、`equipmentZh`、`primaryMusclesZh` 和 `allowedSections`
- **AND** 模型可见 observation MUST NOT 包含完整数据库对象、完整 handler output、内部 service 对象、训练候选 evidence 或与本次查询无关的诊断 payload
- **AND** 模型可见 observation MUST NOT 包含 `fulfillment`、`satisfied`、`supportsOutputKinds`、`visibleDeliveryBoundary`、`supportSectionCompletionBoundary`、`routinePlanCompositionBoundary` 或等价字段

#### Scenario: 用户投影不生成训练卡片
- **WHEN** Response Renderer 或等价用户投影处理 `searchExerciseResources` 结果
- **THEN** 用户可见投影 MUST 只表达查询口径、命中数量、截断状态和可展示动作摘要
- **AND** 用户可见投影 MUST NOT 生成 routine 卡片、plan 卡片、patch 卡片、保存成功事件或任意旧兼容业务事件

#### Scenario: Trace summary 可诊断且脱敏
- **WHEN** `searchExerciseResources` 被 production Agent 调用
- **THEN** trace MUST 记录 toolName、toolResultId、输入摘要、`totalMatches`、`returnedCount`、`truncated`、duration 和 failureCode
- **AND** trace MUST NOT 记录完整 handler output、数据库连接对象、secret、跨用户 payload 或未经摘要的大 payload

### Requirement: `searchExerciseResources` 模型可见说明必须表达业务边界
系统 SHALL 在 tool manifest、schema 描述、examples、facet catalog 或 observation 中为模型提供 `searchExerciseResources` 的使用边界，且不得把该 tool 的业务特例写入通用 Agent prompt。该边界 SHALL 表达 tool 只接受数据库真实 facet；高层自然语言目标由模型基于 `facetCatalog`、上下文和可见事实自主选择结构化字段。该边界 MUST NOT 表达业务目标满足度，也 MUST NOT 将查询结果包装成结构化训练交付流程。

#### Scenario: Manifest 说明何时使用和何时不用
- **WHEN** Agent 构造 Planner 可见 tool manifest
- **THEN** `searchExerciseResources` 的模型可见说明 MUST 表达它适用于查询符合结构化数据库 facet 的发布态动作列表
- **AND** 模型可见说明 MUST 表达所有 facet 值应优先来自 `facetCatalog`
- **AND** 模型可见说明 MUST 表达它不适用于生成训练、保存结果、读取单个动作完整详情、解析唯一动作名、统计全库 facet 或构建 routine / plan / patch 候选集合
- **AND** 模型可见说明 MUST NOT 表达成功结果通过 `satisfied=true`、`fulfillment.satisfied=true` 或等价业务目标满足度支撑普通回答
- **AND** 模型可见说明 MUST NOT 表达 failed、非法输入、0 条结果或候选不足通过 `satisfied=false`、`fulfillment.satisfied=false` 或等价业务目标未满足字段进入下一步
- **AND** 模型可见说明 MUST NOT 表达 `supportsOutputKinds`、`supportsSuccessfulVisibleOutputs`、`finalAnswerSupport` 或等价业务输出可行性判断
- **AND** 模型可见说明 MUST NOT 把自然语言短语写成固定 facet 选择规则
- **AND** 通用 Agent prompt MUST NOT 新增 `searchExerciseResources` toolName 特例或服务端关键词路由规则

#### Scenario: 查询结果事实可用于模型自主推理
- **WHEN** `searchExerciseResources` 返回动作列表、空列表或部分 section 覆盖
- **THEN** 模型可见说明 MUST 表达该结果是当前查询口径下的数据库事实
- **AND** 模型可见说明 MAY 表达 `groups.<section>.exercises[]` 中的动作属于该 section 分组下的动作事实
- **AND** 模型可见说明 MAY 表达 `allowedSections` 是动作可进入哪些 section 的数据库事实
- **AND** 模型可见说明 MUST NOT 表达缺少某 section 时模型必须继续调用 `searchExerciseResources`
- **AND** 模型可见说明 MUST NOT 表达若要交付用户可见结果就必须继续调用 `submitVisibleTrainingProposal`

### Requirement: `searchExerciseResources` 模型观察必须表达动作事实可组合边界
系统 SHALL 让 `searchExerciseResources` 的模型可见 observation 表达当前 tool result 提供了哪些动作事实、当前查询实际覆盖哪些 section、哪些 section 没有由本次查询返回，以及有哪些确定性 diagnostics。Observation MUST NOT 将 tool result 表达为最终 `visibleTrainingProposal`，也 MUST NOT 指挥模型继续查询、提交结构化收口或按固定顺序补齐 section。

#### Scenario: Observation 表达可用动作事实
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation MUST 表达当前结果提供动作库事实
- **AND** model observation MUST 表达当前结果只覆盖实际返回的 section
- **AND** model observation MAY 表达 `groups.<section>.exercises[]` 中的动作是该 section 分组下返回的动作事实
- **AND** model observation MUST NOT 将 tool result 表达为已经生成的最终 `visibleTrainingProposal`

#### Scenario: Observation 表达结构缺口但不替模型选择下一步
- **WHEN** 模型可见 observation 描述 `searchExerciseResources` 的 section 覆盖或缺口
- **THEN** observation MAY 表达 `availableSections` 和 `missingSections`
- **AND** observation MAY 表达 `prescription`、`schedule` 和最终 `payload.kind` 不是该 tool 的输出事实
- **AND** observation MUST NOT 要求模型按照固定调用顺序继续调用 tool
- **AND** observation MUST NOT 要求模型补查 `warmup`、`stretch`、`training` 或其他固定 section
- **AND** observation MUST NOT 要求模型通过结构化收口工具提交当前结果

### Requirement: `searchExerciseResources` examples 必须展示查询能力而非意图分类
系统 SHALL 将 `searchExerciseResources` examples 限定为合法结构化查询输入示例，避免把 examples 变成自然语言意图到输出结构、下一步 tool 或固定 workflow 的映射。

#### Scenario: Examples 只描述 tool 输入
- **WHEN** Agent 序列化 `searchExerciseResources` examples 给 Planner
- **THEN** examples MUST 展示如何填写结构化查询字段，例如 `suitabilities`、`equipment`、`homeRequirement`、`level`、`muscles`、`requiredExerciseIds` 或 `excludeExerciseIds`
- **AND** examples MUST 使用符合当前 schema 的 input
- **AND** examples MUST NOT 说明用户出现某个固定短语时必须选择某个 `visibleTrainingProposal.payload.kind`
- **AND** examples MUST NOT 承诺 tool 自己会生成最终训练方案、处方、日程、结构化收口或保存结果
- **AND** examples MUST NOT 指导模型在查询后必须调用某个具体 tool
