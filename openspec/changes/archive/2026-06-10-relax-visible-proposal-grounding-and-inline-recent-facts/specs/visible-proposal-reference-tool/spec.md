## ADDED Requirements

### Requirement: inspectVisibleTrainingProposals 必须通过 list_recent 直接提供可消费历史方案事实
系统 SHALL 将 `inspectVisibleTrainingProposals` 收敛为当前生产聊天中历史可见训练方案事实的单步只读入口。模型可见 input MUST 只暴露 `operation = "list_recent"`；系统 MUST NOT 要求 Planner 额外调用 `read_recent` 才能复用、派生、调整或替换当前 conversation 中已展示的 `visibleTrainingProposal`。模型可见 input / output / observation MUST NOT 要求或暴露可复制的 `factRef`、`messageId`、`resourceId` 或 `toolResultId`。

#### Scenario: 单步查询历史可见训练方案事实
- **WHEN** Planner 需要确认当前 actor 和 conversation 是否存在历史生成并已展示的 `visibleTrainingProposal`
- **THEN** `inspectVisibleTrainingProposals` MUST 支持 input 使用 `operation = "list_recent"` 完成查询
- **AND** 该调用 MUST 不需要 `ref`、`factRef`、`messageId`、`resourceId`、`cursor`、`limit` 或 `detailLevel`
- **AND** handler MUST 只查询当前 actor 和当前 conversation 可访问的事实
- **AND** 成功结果 MUST 可以由服务端内部登记当前 run 可消费 `visible_training_proposal_fact` resource
- **AND** 登记用内部 resource 引用 MUST NOT 暴露成模型需要复制或输出的字段

#### Scenario: read_recent 不再是模型可见 operation
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` manifest 或 input schema
- **THEN** schema MUST NOT 向模型暴露 `operation = "read_recent"`
- **AND** examples MUST NOT 展示 `read_recent`
- **AND** repair feedback MUST NOT 要求模型通过 `read_recent.ref.value` 恢复
- **AND** 服务端 MAY 保留内部读取 helper，但该 helper MUST NOT 作为 Planner 可选择的 operation 暴露

#### Scenario: 禁止隐式操作和旧读取字段
- **WHEN** Planner 调用 `inspectVisibleTrainingProposals`
- **AND** input 缺少 `operation`、使用未知 operation、传入 `ref`、顶层 `factRef`、顶层 `messageId`、`resourceId`、`toolResultId`、`usedRefs` 或旧 `read_recent` 专用字段
- **THEN** input schema MUST 在 handler 执行前拒绝该调用
- **AND** runtime MUST 按结构化非法输入或 repair 边界处理
- **AND** repair feedback MUST 引导模型改用合法 `operation = "list_recent"`、`ask_user` 或失败收口

### Requirement: list_recent 必须返回受控压缩历史方案事实并登记 consumable resource
`inspectVisibleTrainingProposals(operation = "list_recent")` SHALL 查询当前 actor 和当前 conversation 中历史生成并已展示的 `visibleTrainingProposal` 事实。成功时，系统 MUST 返回足以支持复用、保留、替换、派生或调整的受控压缩事实，并将可消费事实登记为当前 run 的 `visible_training_proposal_fact` resource。

#### Scenario: 返回最近可消费训练方案事实
- **WHEN** `list_recent` 查询到当前 actor 和 conversation 可访问的历史 `visibleTrainingProposal` 事实
- **THEN** output MUST 使用 `status = "succeeded"` 和 `operation = "list_recent"`
- **AND** output MUST 包含 `facts[]`
- **AND** 每个 fact MUST 至少包含服务端生成的事实顺序或用户可理解标签、`proposalKind`、`status`、`visibleOutputSchemaVersion`、`factSchemaVersion` 和 section 摘要
- **AND** 每个可消费 fact MUST 包含受控压缩的 `exerciseItems`，字段至少覆盖 `exerciseId`、`section`、`order` 和 `prescription`
- **AND** 如历史方案包含 `schedule`，output MUST 包含足以复用或解释周期安排的受控 `schedule` 摘要
- **AND** output MAY 包含动作展示名、`allowedSections` 和必要有限详情
- **AND** output MUST NOT 包含可复制的 `factRef`、`messageId`、`resourceId`、`toolResultId`、`usedRefs` 或等价内部引用字段
- **AND** output MUST NOT 返回完整历史消息、完整 UI payload、完整 handler output、未展示候选或跨用户数据

#### Scenario: list_recent 登记 consumable resource
- **WHEN** `list_recent` 成功返回至少一条可消费历史方案事实
- **THEN** runtime MUST 将这些事实登记为当前 run 内可消费的 `visible_training_proposal_fact` resource 或等价可消费事实
- **AND** resource summary MUST 使用受控压缩事实，不得泄漏完整数据库对象、secret、跨用户 payload、未展示候选或模型可复制的内部引用 ID
- **AND** fulfillment MUST 表示该事实查询已满足
- **AND** observation MUST 说明这些业务事实已经由服务端读取并可作为复用、派生、保留、替换或调整依据
- **AND** observation MUST NOT 要求模型在最终 action 中引用内部 `resourceId` 或 `toolResultId`

#### Scenario: list_recent 空结果
- **WHEN** 当前 actor 和 conversation 没有可访问的历史 `visibleTrainingProposal` 事实
- **THEN** `list_recent` MUST 返回 `status = "succeeded"`、`operation = "list_recent"` 和空 `facts[]`
- **AND** fulfillment MUST 表示本次事实状态查询已完成
- **AND** runtime MUST NOT 登记 consumable `visible_training_proposal_fact` resource
- **AND** 该结果 MAY 作为模型解释当前没有可引用方案、向用户澄清或转为新请求处理的事实依据
- **AND** 该结果 MUST NOT 被伪装成已导入历史方案事实

#### Scenario: 不可访问或无效历史事实
- **WHEN** 历史方案引用不存在、跨用户、跨 conversation、已归档、状态不可读、schemaVersion 不兼容、payload 无效或读取异常
- **THEN** tool MUST 返回结构化失败 output 或在 facts 中排除该事实并记录诊断
- **AND** runtime MUST NOT 将无效事实登记为 consumable resource
- **AND** trace MUST 记录稳定结构化失败边界
- **AND** 失败结果 MUST NOT 支撑成功训练方案刷新或可见训练方案生成

### Requirement: list_recent 模型可见说明必须减少历史事实读取分支
`inspectVisibleTrainingProposals` 的模型可见说明 SHALL 表达：当 Planner 需要当前会话历史可见训练方案事实时，只需调用 `operation = "list_recent"`；该调用会由服务端读取、校验并导入可消费事实。说明 MUST NOT 把任意固定自然语言短语写成强制 tool 调用条件。

#### Scenario: manifest 描述单步历史事实读取
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` manifest
- **THEN** `description`、`whenToUse`、schema description 或 examples MUST 说明 `list_recent` 用于查询并导入当前会话历史已展示的 `visibleTrainingProposal` 事实
- **AND** 说明 MUST 表达该 tool 可用于了解上一套 `exerciseItems`、section 摘要、处方和计划结构
- **AND** 说明 MUST 表达读取成功后事实可作为当前 run 的复用、派生、保留、替换或调整依据
- **AND** 说明 MUST 表达该 tool 本身不生成最终新训练方案
- **AND** 说明 MUST 使用中文描述业务含义，`inspectVisibleTrainingProposals`、`operation`、`list_recent`、`visibleTrainingProposal`、`exerciseItems` 保持英文原样

#### Scenario: examples 只展示 list_recent
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` examples
- **THEN** examples MUST 包含完整 `{ type: "tool_call", toolName: "inspectVisibleTrainingProposals", input: { operation: "list_recent" } }`
- **AND** examples MUST NOT 包含 `read_recent`
- **AND** examples MUST NOT 包含可复制的 fake `factRef`、`messageId`、`resourceId`、`toolResultId`、`usedRefs` 或其他内部引用值

#### Scenario: 不写固定短语强制调用
- **WHEN** 模型可见说明描述替换、刷新、省略表达、指代或上下文继续请求
- **THEN** 说明 MUST 表达由模型基于上下文、可见事实和 tool result 自主判断是否调用本 tool
- **AND** 说明 MUST NOT 表达成用户说“换一批”“重新来一套”“不要这个”或其他固定短语时必须调用本 tool
- **AND** 服务端 MUST NOT 根据这些短语选择是否调用 `inspectVisibleTrainingProposals`

### Requirement: list_recent observation 必须表达导入事实和终态边界
`inspectVisibleTrainingProposals(operation = "list_recent")` 的模型 observation SHALL 描述当前 actor 和 conversation 中历史 `visibleTrainingProposal` 业务事实的可用性、服务端内部读取状态和终态边界。Observation MUST NOT 替模型判断用户意图，也 MUST NOT 规定模型在某个用户短语、空结果或字段组合条件下输出固定答案。

#### Scenario: list_recent observation 表达可消费事实
- **WHEN** `inspectVisibleTrainingProposals(operation = "list_recent")` 成功返回历史方案事实并进入下一轮 Planner 输入
- **THEN** model observation MUST 表达 `facts[]` 是当前 actor 和 conversation 可访问的历史 `visibleTrainingProposal` 事实集合
- **AND** model observation MUST 表达可用业务事实已经由服务端读取和校验
- **AND** model observation MUST NOT 暴露导入 resource 的 `resourceId`、`resourceType`、`role` 或要求模型引用这些内部字段
- **AND** model observation MUST 表达该事实可作为 reuse、derive、modify、replace 或 preserve 的正向来源
- **AND** model observation MUST 表达是否转成排除或替换依据由 Planner 基于用户目标判断

#### Scenario: list_recent observation 表达终态边界
- **WHEN** `list_recent` 成功导入历史事实
- **THEN** observation MUST 表达该 tool 只读取和导入历史事实
- **AND** observation MUST 表达最终新训练结构仍必须由合法 `final_answer.visibleOutputs[]` 承载
- **AND** observation MUST 表达最终新训练结构仍必须通过 `visibleTrainingProposal` validator
- **AND** observation MUST NOT 暗示 runtime 会在 `final_answer` 后继续自动查询、生成、渲染或保存训练结构

#### Scenario: observation 不重复通用终态长规则
- **WHEN** `inspectVisibleTrainingProposals` observation 暴露给 Planner
- **THEN** observation MUST NOT 复制 system prompt 中完整 `AgentAction` 输出格式说明
- **AND** observation MUST NOT 复制完整 `visibleTrainingProposal.payload.kind` 选择指南
- **AND** observation MUST NOT 把某个用户短语、空结果或字段组合写成固定 answer、固定 `payload.kind` 或固定 tool flow

## MODIFIED Requirements

### Requirement: inspectVisibleTrainingProposals 必须具备自动化验证
系统 SHALL 为收敛后的 `inspectVisibleTrainingProposals` 提供 tool-level、manifest、production chat 和 architecture boundary 验证。

#### Scenario: Tool 单测覆盖 list_recent 单步读取
- **WHEN** 实现收敛后的 `inspectVisibleTrainingProposals`
- **THEN** tool-level tests MUST 直接覆盖 handler、`executeTool` 或当前真实 runtime 执行入口
- **AND** tests MUST 覆盖 `list_recent` 成功、`list_recent` 空结果、`list_recent` 权限隔离、跨用户、跨会话、schemaVersion 不兼容、payload 无效和 store 异常结构化归一
- **AND** tests MUST 证明 `list_recent` 成功时产出当前 run 可消费 `visible_training_proposal_fact` resource
- **AND** tests MUST 证明无可访问事实、无效事实或失败结果不会产出 consumable resource

#### Scenario: 模型可见合同测试
- **WHEN** production registry 序列化 tool manifest
- **THEN** tests MUST 断言 manifest 包含 `inspectVisibleTrainingProposals` 和 `operation = "list_recent"` 的中文说明
- **AND** tests MUST 断言 manifest 不包含旧 `readRecentVisibleTrainingProposal`
- **AND** tests MUST 断言 manifest 不包含 `operation = "read_recent"`
- **AND** tests MUST 断言 manifest 不包含可直接复制的占位 `factRef`、`messageId`、`resourceId`、`toolResultId` 或 `usedRefs`
- **AND** tests MUST 断言 manifest 不把固定自然语言短语表达成强制 tool 调用条件

#### Scenario: 生产聊天回归覆盖同类省略表达
- **WHEN** production chat replay 测试覆盖省略、指代或上下文断裂表达
- **THEN** tests MUST 至少包含原始失败表达和一个等价语义变体
- **AND** tests MUST 覆盖无可见训练方案时模型可以 `list_recent` 后合法收口
- **AND** tests MUST 覆盖有可见训练方案时模型可以通过一次 `list_recent` 获得可消费事实后再选择是否调用 `searchExerciseResources`
- **AND** tests MUST 证明 `/api/chat` 没有基于用户原文新增服务端语义分流

### Requirement: list_recent observation 必须表达事实边界而非答案模板
`inspectVisibleTrainingProposals(operation = "list_recent")` 的模型可见 observation SHALL 描述当前 actor 和 conversation 中历史 `visibleTrainingProposal` 事实的事实边界、可消费性和空结果含义。Observation MUST NOT 替模型判断用户意图，也 MUST NOT 规定模型在某个用户短语、空结果或字段组合条件下输出固定答案。

#### Scenario: list_recent 空索引表达可见事实状态
- **WHEN** `inspectVisibleTrainingProposals(operation = "list_recent")` 返回空 `facts[]`
- **THEN** model projection MUST 表达 `facts[]` 是当前可见的历史 `visibleTrainingProposal` 事实集合
- **AND** model projection MUST 表达空数组只表示当前可见事实中没有这类历史训练方案对象
- **AND** model projection MUST 表达该结果可作为模型推理、解释缺少引用对象或向用户澄清的事实依据
- **AND** model projection MUST 表达该结果不能支撑成功训练方案刷新、替换、调整或历史方案复用

#### Scenario: observation 不写固定用户短语或答案模板
- **WHEN** production registry 或 runtime 将 `list_recent` observation 暴露给 Planner
- **THEN** 模型可见内容 MUST NOT 包含 `换一批`、`再来一组`、`不要这个` 或等价固定用户短语作为使用条件
- **AND** 模型可见内容 MUST NOT 包含“如果用户这样说就这样回答”的答案模板
- **AND** 模型可见内容 MUST NOT 要求固定 `final_answer`、`ask_user`、`searchExerciseResources` 或其他 tool 调用顺序

#### Scenario: observation 引导模型结合上下文自行决定下一步
- **WHEN** `list_recent` observation 暴露给 Planner
- **THEN** 模型可见内容 MUST 表达该结果只提供事实边界
- **AND** 模型可见内容 MUST 表达若本轮目标依赖历史训练方案事实，模型应结合本轮用户请求、最近对话和其他 observations / tool results 自行决定复用、派生、替换、继续查询、追问或失败收口
- **AND** 模型可见内容 MUST 表达只有用户已经提供足够独立生成所需目标和约束时，才可作为新请求处理
- **AND** 模型可见内容中的描述性自然语言 MUST 使用中文，`operation`、`list_recent`、`facts`、`visibleTrainingProposal` 等技术标识 MUST 保持英文原样

### Requirement: inspectVisibleTrainingProposals 模型说明必须支持训练方案刷新判断
`inspectVisibleTrainingProposals` 的模型可见说明 SHALL 表达该 tool 能读取当前会话中用户已经看到的 `visibleTrainingProposal` 事实，使 Planner 可以了解上一套方案的结构、处方、计划和已展示动作，再自主决定是否查询替代动作、调整结构、澄清或失败收口。说明 MUST NOT 把任意固定自然语言短语写成强制 tool 调用条件。

#### Scenario: Manifest 描述刷新可用事实
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` manifest
- **THEN** `description`、`whenToUse`、schema description 或 examples MUST 说明该 tool 可用于读取上一套用户可见训练方案事实
- **AND** 说明 MUST 表达读取事实的业务用途包括了解上一套 `exerciseItems`、section 摘要、处方和计划结构，用于后续自主规划
- **AND** 说明 MUST 表达读取成功后该事实会作为当前 run 可消费事实导入
- **AND** 说明 MUST 使用中文描述业务含义，`inspectVisibleTrainingProposals`、`visibleTrainingProposal`、`exerciseItems`、`list_recent` 保持英文原样

#### Scenario: Metadata 仍只是状态摘要
- **WHEN** 模型可见上下文包含 `run.metadata.recentVisibleTrainingProposals`
- **THEN** 模型可见说明 MUST 表达 metadata 只提供当前会话是否存在历史可见方案的轻量状态摘要
- **AND** 模型可见说明 MUST 表达完整可消费历史方案事实需要通过当前 run 的 `inspectVisibleTrainingProposals(operation = "list_recent")` 获得
- **AND** 模型可见说明 MUST NOT 鼓励模型从 metadata 猜测完整 `exerciseItems`、`prescription` 或 `schedule`

#### Scenario: 不写固定短语强制调用
- **WHEN** 模型可见说明描述替换、刷新、省略表达、指代或上下文继续请求
- **THEN** 说明 MUST 表达由模型基于上下文、可见事实和 tool result 自主判断是否调用本 tool
- **AND** 说明 MUST NOT 表达成用户说“换一批”“重新来一套”“不要这个”或其他固定短语时必须调用本 tool
- **AND** 服务端 MUST NOT 根据这些短语选择 `list_recent`

### Requirement: run metadata 不得暴露可复制的 visibleTrainingProposal 业务引用
系统 SHALL 在 `/api/chat` 构造 `AgentRunInput` 时，将 `run.metadata.recentVisibleTrainingProposals` 投影为轻量状态摘要。该 metadata MAY 表达最近可见方案的 kind、status、schemaVersion、createdAt、proposalKind、section 摘要和可复用 training 数量；MUST NOT 暴露完整可消费事实、完整 `exerciseItems`、`prescription`、`schedule`、`exerciseDetails`、`factRef`、`messageId` 或可被模型直接当作当前 run grounding 的内部 resource id。

#### Scenario: metadata summary 不包含完整可消费事实
- **WHEN** 当前 actor 和 conversation 存在最近用户可见 `visibleTrainingProposal` 事实
- **AND** `/api/chat` 构造生产 `AgentRunInput`
- **THEN** `run.metadata.recentVisibleTrainingProposals[]` MUST NOT 包含完整 `exerciseItems`
- **AND** `run.metadata.recentVisibleTrainingProposals[]` MUST NOT 包含完整 `prescription`
- **AND** `run.metadata.recentVisibleTrainingProposals[]` MUST NOT 包含完整 `schedule`
- **AND** metadata MUST NOT 包含 `exerciseDetails`、动作图片详情、`factRef`、`messageId` 或当前 run registered `resourceId`
- **AND** 如模型需要具体历史方案事实，MUST 通过本轮 `inspectVisibleTrainingProposals(operation = "list_recent")` 获取

## REMOVED Requirements

### Requirement: inspectVisibleTrainingProposals 必须同时支持 list_recent 和 read_recent 操作
**Reason**: `read_recent` 暴露给模型后增加了二阶段读取和 ref 选择失败面；历史方案事实读取应由 `list_recent` 一次完成。
**Migration**: 使用 `inspectVisibleTrainingProposals(operation = "list_recent")` 直接查询并导入当前 run 可消费历史方案事实。

### Requirement: list_recent 必须只返回轻量事实索引
**Reason**: `list_recent` 只返回轻量索引会迫使模型再调用 `read_recent`，与减少模型操作分支的目标冲突。
**Migration**: `list_recent` 改为返回受控压缩历史方案事实，并登记 consumable `visible_training_proposal_fact` resource。

### Requirement: read_recent 必须导入当前 run 可消费事实
**Reason**: 可消费事实导入职责迁移到 `list_recent`，不再保留模型可见 `read_recent` operation。
**Migration**: 服务端内部读取 helper 可以保留，但 Planner 只使用 `list_recent`。

### Requirement: 模型可见合同必须表达 list_recent / read_recent 的规划方式
**Reason**: 模型不再需要规划 `list_recent -> read_recent` 的二阶段流程。
**Migration**: 模型可见合同改为表达 `list_recent` 单步读取和导入历史方案事实。

### Requirement: read_recent 成功结果必须说明可用于差异化刷新
**Reason**: 差异化刷新所需事实现在由 `list_recent` 成功 observation 表达。
**Migration**: 使用 `list_recent observation 必须表达导入事实和终态边界` 覆盖同类边界。

### Requirement: visible proposal read/import observation 必须表达终态边界
**Reason**: 该 requirement 绑定 `read_recent` observation；终态边界改由 `list_recent` observation 承载。
**Migration**: 使用新的 `list_recent observation 必须表达导入事实和终态边界` requirement。

### Requirement: list_recent 索引引用不得作为 terminal resource grounding
**Reason**: `list_recent` 不再只是 diagnostic index；成功时会登记可消费历史方案 resource。
**Migration**: `factRef` / `messageId` / `resourceId` / `toolResultId` 不再作为模型可见 grounding 字段；`list_recent` 产出的当前 run registered resource 只由服务端内部用于 provenance、trace 和后续受控处理。

### Requirement: `inspectVisibleTrainingProposals` 模型可见说明必须聚焦引用事实边界
**Reason**: 旧 requirement 围绕 `list_recent / read_recent` 引用边界；新合同不再暴露 `read_recent`。
**Migration**: 使用 `list_recent 模型可见说明必须减少历史事实读取分支`。

### Requirement: `inspectVisibleTrainingProposals` observation 必须保留真实引用事实并压缩重复说明
**Reason**: 旧 requirement 同时覆盖 `list_recent` 索引和 `read_recent` 导入状态；导入状态已迁移到 `list_recent`。
**Migration**: 使用 `list_recent observation 必须表达导入事实和终态边界`。

### Requirement: read_recent ref 模型可见来源必须只指向本轮 list_recent
**Reason**: 模型可见 `read_recent.ref` 输入被移除，已不需要为它定义来源合同。
**Migration**: `list_recent` 不需要模型传入 ref；服务端从 actor 和 conversation 推导权限边界。
