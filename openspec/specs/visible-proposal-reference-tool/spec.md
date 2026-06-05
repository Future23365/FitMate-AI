# visible-proposal-reference-tool Specification

## Purpose
TBD - created by archiving change extend-visible-proposal-reference-tool. Update Purpose after archive.
## Requirements
### Requirement: inspectVisibleTrainingProposals 必须同时支持 list_recent 和 read_recent 操作
系统 SHALL 将现有 `readRecentVisibleTrainingProposal` delete-only 重命名为 `inspectVisibleTrainingProposals`，并删除旧 toolName 注册、manifest、examples、trace/replay fixture 和测试引用，不保留 alias。`inspectVisibleTrainingProposals` SHALL 作为当前生产聊天中可见训练方案事实的只读入口，并通过显式 `operation` 区分 `list_recent` 和 `read_recent`。系统 SHALL NOT 新增独立 `listRecentVisibleTrainingProposals` tool 来承担同类事实查询能力。`read_recent` SHALL 使用统一 `ref` 字段表达要读取的可见事实引用。

#### Scenario: 使用同一个 tool 查询事实列表
- **WHEN** Planner 需要确认当前 actor 和 conversation 是否存在可引用的可见训练方案事实
- **THEN** `inspectVisibleTrainingProposals` MUST 支持 input 使用 `operation = "list_recent"` 完成最近事实列表查询
- **AND** 该调用 MUST 不需要 `ref`
- **AND** handler MUST 只查询当前 actor 和当前 conversation 可访问的事实索引

#### Scenario: 使用同一个 tool 读取具体事实
- **WHEN** Planner 需要复用某条可见训练方案事实
- **THEN** `inspectVisibleTrainingProposals` MUST 支持 input 使用 `operation = "read_recent"` 完成最近具体事实读取
- **AND** input MUST 提供当前 run 可见的真实 `ref`
- **AND** `ref.type` MUST 表达引用类型，例如 `fact_ref` 或 `message_id`
- **AND** `ref.value` MUST 复制当前 run 可见的真实引用值
- **AND** handler MUST 校验 actor、conversation、status、kind、schemaVersion 和 payload 边界后再返回成功结果

#### Scenario: 禁止隐式操作
- **WHEN** Planner 调用 `inspectVisibleTrainingProposals`
- **AND** input 缺少 `operation`、同时混用 `list_recent` 专用字段和 `read_recent` 专用字段，或使用未知 operation
- **THEN** input schema MUST 在 handler 执行前拒绝该调用
- **AND** runtime MUST 按结构化非法输入或 repair 边界处理

#### Scenario: 拒绝旧引用字段
- **WHEN** Planner 使用 `operation = "read_recent"`
- **AND** input 传入顶层 `factRef` 或顶层 `messageId`
- **THEN** input schema MUST 在 handler 执行前拒绝该调用
- **AND** repair feedback MUST 说明读取引用统一使用 `ref`
- **AND** repair feedback MUST 给出 `ref.type` 和 `ref.value` 的合法形状
- **AND** 服务端 MUST NOT 静默把顶层 `factRef` 或 `messageId` 转换为 `ref`

### Requirement: list_recent 必须只返回轻量事实索引
`inspectVisibleTrainingProposals(operation = "list_recent")` SHALL 返回当前可引用 `visibleTrainingProposal` 的轻量索引。`list_recent` MUST NOT 返回完整训练方案 payload，也 MUST NOT 产出当前 run 的 consumable resource。

#### Scenario: 返回最近可见训练方案索引
- **WHEN** `list_recent` 查询到当前 actor 和 conversation 可访问的事实
- **THEN** output MUST 使用 `status = "succeeded"` 和 `operation = "list_recent"`
- **AND** output MUST 包含 `facts[]`
- **AND** 每个 fact 摘要 MUST 至少包含 `factRef`、`messageId`、`proposalKind`、`status`、`visibleOutputSchemaVersion`、`factSchemaVersion`、section 摘要和可复用训练动作数量
- **AND** 如 output 包含 `reusableTrainingExercises[]`，字段范围 MUST 限制为 `exerciseId`、`order`、可展示名称和 section 摘要

#### Scenario: list_recent 不泄漏完整事实
- **WHEN** `list_recent` 返回 fact 摘要
- **THEN** output MUST NOT 包含完整 `visibleTrainingProposal.payload`
- **AND** output MUST NOT 包含完整 `prescription`、完整 `schedule`、完整 handler output、未进入用户可见方案的 tool 候选或跨用户数据
- **AND** output MUST NOT 暴露可被模型直接复制为新训练方案的完整动作事实

#### Scenario: run metadata 只暴露可见训练方案索引
- **WHEN** `/api/chat` 构造 `AgentRunInput`
- **AND** 当前 actor 和 conversation 存在最近可见训练方案事实
- **THEN** `run.metadata.recentVisibleTrainingProposals` MUST 只包含可引用索引摘要
- **AND** 每个摘要 MUST NOT 包含 `exerciseItems`、`prescription`、`schedule`、`exerciseDetails`、图片、肌群、器械或完整展示详情
- **AND** 需要完整方案事实时，模型 MUST 通过 `inspectVisibleTrainingProposals(operation = "read_recent")` 导入当前 run 的 `visible_training_proposal_fact`

#### Scenario: list_recent 空结果
- **WHEN** 当前 actor 和 conversation 没有可访问的可见训练方案事实
- **THEN** `list_recent` MUST 返回 `status = "succeeded"`、`operation = "list_recent"` 和空 `facts[]`
- **AND** fulfillment MUST 表示本次事实状态查询已完成
- **AND** 该结果 MUST 能作为模型解释当前没有可引用方案或向用户澄清的事实依据
- **AND** 该结果 MUST NOT 支撑成功训练方案生成

### Requirement: read_recent 必须导入当前 run 可消费事实
`inspectVisibleTrainingProposals(operation = "read_recent")` SHALL 读取 `list_recent` 或真实上下文暴露的具体事实，并在成功时把该事实作为当前 run 可消费事实导入。`read_recent` 失败 MUST 结构化归一，不能退化为通用 `handler_error`。

#### Scenario: 成功读取并导入事实
- **WHEN** `read_recent` 收到当前 run 可见的真实 `ref`
- **AND** `ref.type` 和 `ref.value` 指向当前 run 可见的 `factRef`、`messageId` 或当前实现支持的等价引用
- **AND** 当前 actor 有权访问该事实
- **AND** 事实 status、kind、schemaVersion 和 payload 可被当前实现支持
- **THEN** tool MUST 返回 `status = "succeeded"` 和 `operation = "read_recent"`
- **AND** runtime MUST 将该事实登记为当前 run 内可消费的 `visible_training_proposal_fact` resource 或等价可消费事实
- **AND** observation MUST 说明该事实已导入当前 run，后续不要重复读取同一引用

#### Scenario: 拒绝不可访问或无效引用
- **WHEN** `read_recent` 引用不存在、跨用户、跨会话、已归档、状态不可读、schemaVersion 不兼容、payload 无效或引用不唯一
- **THEN** tool MUST 返回结构化失败 output
- **AND** fulfillment MUST 表示 `satisfied = false`
- **AND** runtime MUST NOT 登记 consumable resource
- **AND** 失败结果 MUST NOT 支撑成功训练方案刷新或可见训练方案生成

#### Scenario: fact store 异常结构化归一
- **WHEN** `read_recent` 或 `list_recent` 的事实存储读取抛出异常
- **THEN** tool MUST 捕获异常并返回稳定结构化失败 code
- **AND** trace MUST 记录该结构化失败边界
- **AND** runtime MUST NOT 将其记录为通用 `handler_error`

### Requirement: 模型可见合同必须表达 list_recent / read_recent 的规划方式
`inspectVisibleTrainingProposals` 的模型可见说明 SHALL 让模型知道它可以先查询最近事实列表，再决定是否读取事实、查询动作库、澄清或普通回复。说明 MUST NOT 把任意固定自然语言短语写成强制 tool 调用条件。

#### Scenario: manifest 说明 list_recent 使用场景
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` manifest
- **THEN** `description`、`whenToUse`、schema description 或 examples MUST 说明 `list_recent` 用于查询当前会话是否存在可引用的用户可见训练方案事实
- **AND** 说明 MUST 表达 `list_recent` 只返回事实索引，不导入完整事实
- **AND** 说明 MUST 使用中文描述业务含义，`operation`、`list_recent`、`read_recent`、`factRef`、`messageId` 和 `visibleTrainingProposal` 保持英文原样

#### Scenario: manifest 说明 read_recent 使用场景
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` manifest
- **THEN** 模型可见说明 MUST 表达 `read_recent` 只用于读取 `list_recent` 或真实上下文中出现的具体 `factRef` / `messageId`
- **AND** examples MUST NOT 暴露容易被照抄成真实引用的占位 `factRef`
- **AND** examples MUST 先展示 `operation = "list_recent"`，再展示从 `list_recent` result 复制真实引用进行 `operation = "read_recent"` 的关系

#### Scenario: 不写固定短语路由
- **WHEN** 模型可见说明描述刷新、省略表达、指代不明或上下文引用场景
- **THEN** 说明 MUST 表达“由模型基于上下文和 tool result 自主判断”
- **AND** 说明 MUST NOT 表达成用户说出“换一批”“再来一组”“不要这个”或其他固定短语时必须调用某个 tool
- **AND** 服务端 MUST NOT 根据这些短语选择 `list_recent`、`read_recent` 或 `searchExerciseResources`

### Requirement: inspectVisibleTrainingProposals 必须具备自动化验证
系统 SHALL 为扩展后的 `inspectVisibleTrainingProposals` 提供 tool-level、manifest、production chat 和 architecture boundary 验证。

#### Scenario: Tool 单测覆盖 list_recent / read_recent
- **WHEN** 实现扩展后的 `inspectVisibleTrainingProposals`
- **THEN** tool-level tests MUST 直接覆盖 handler、`executeTool` 或当前真实 runtime 执行入口
- **AND** tests MUST 覆盖 `list_recent` 成功、`list_recent` 空结果、`list_recent` 权限隔离、`read_recent` 成功、`read_recent` 无效引用、`read_recent` 跨用户、`read_recent` 跨会话、schemaVersion 不兼容、payload 无效和 store 异常结构化归一
- **AND** tests MUST 证明 `list_recent` 不产出 consumable resource，`read_recent` 成功才产出可消费事实

#### Scenario: 模型可见合同测试
- **WHEN** production registry 序列化 tool manifest
- **THEN** tests MUST 断言 manifest 包含 `inspectVisibleTrainingProposals`、`operation = "list_recent"` 和 `operation = "read_recent"` 的中文说明
- **AND** tests MUST 断言 manifest 不包含旧 `readRecentVisibleTrainingProposal`
- **AND** tests MUST 断言 manifest 不包含可直接复制的占位 `factRef`
- **AND** tests MUST 断言 manifest 不把固定自然语言短语表达成强制 tool 调用条件

#### Scenario: 生产聊天回归覆盖同类省略表达
- **WHEN** production chat replay 测试覆盖省略、指代或上下文断裂表达
- **THEN** tests MUST 至少包含原始失败表达和一个等价语义变体
- **AND** tests MUST 覆盖无可见训练方案时模型可以 `list_recent` 后合法收口
- **AND** tests MUST 覆盖有可见训练方案时模型可以 `list_recent` / `read_recent` 后再选择是否调用 `searchExerciseResources`
- **AND** tests MUST 证明 `/api/chat` 没有基于用户原文新增服务端语义分流

### Requirement: list_recent observation 必须表达事实边界而非答案模板
`inspectVisibleTrainingProposals(operation = "list_recent")` 的模型可见 observation SHALL 描述当前 actor 和 conversation 中可引用 `visibleTrainingProposal` 事实索引的事实边界。Observation MUST NOT 替模型判断用户意图，也 MUST NOT 规定模型在某个用户短语、空结果或字段组合条件下输出固定答案。

#### Scenario: list_recent 空索引表达可见事实状态
- **WHEN** `inspectVisibleTrainingProposals(operation = "list_recent")` 返回空 `facts[]`
- **THEN** model projection MUST 表达 `facts[]` 是当前可见、可引用的 `visibleTrainingProposal` 事实索引集合
- **AND** model projection MUST 表达空数组只表示当前可见事实中没有这类引用对象
- **AND** model projection MUST 表达该结果可作为模型推理、解释缺少引用对象或向用户澄清的事实依据
- **AND** model projection MUST 表达该结果不能支撑成功训练方案刷新、替换、调整或新训练方案生成

#### Scenario: observation 不写固定用户短语或答案模板
- **WHEN** production registry 或 runtime 将 `list_recent` observation 暴露给 Planner
- **THEN** 模型可见内容 MUST NOT 包含 `换一批`、`再来一组`、`不要这个` 或等价固定用户短语作为使用条件
- **AND** 模型可见内容 MUST NOT 包含“如果用户这样说就这样回答”的答案模板
- **AND** 模型可见内容 MUST NOT 要求固定 `final_answer`、`ask_user`、`read_recent` 或 `searchExerciseResources` 调用顺序

#### Scenario: observation 引导模型结合上下文自行决定下一步
- **WHEN** `list_recent` observation 暴露给 Planner
- **THEN** 模型可见内容 MUST 表达该结果只提供事实边界
- **AND** 模型可见内容 MUST 表达若本轮目标依赖该引用对象，模型应结合本轮用户请求、最近对话和其他 observations / tool results 自行决定解释缺少引用对象、追问、请求补充目标或失败收口
- **AND** 模型可见内容 MUST 表达只有用户已经提供足够独立生成所需目标和约束时，才可作为新请求处理，且不得宣称这是对不可见已有对象的刷新、替换或调整
- **AND** 模型可见内容中的描述性自然语言 MUST 使用中文，`operation`、`list_recent`、`read_recent`、`facts`、`visibleTrainingProposal` 等技术标识 MUST 保持英文原样

### Requirement: inspectVisibleTrainingProposals 模型说明必须支持训练方案刷新判断
`inspectVisibleTrainingProposals` 的模型可见说明 SHALL 表达该 tool 能读取当前会话中用户已经看到的 `visibleTrainingProposal` 事实，使 Planner 可以了解上一套方案的结构和已展示动作，再自主决定是否查询替代动作、调整结构、澄清或失败收口。说明 MUST NOT 把任意固定自然语言短语写成强制 tool 调用条件。

#### Scenario: Manifest 描述刷新可用事实
- **WHEN** production registry 序列化 `inspectVisibleTrainingProposals` manifest
- **THEN** `description`、`whenToUse`、schema description 或 examples MUST 说明该 tool 可用于读取上一套用户可见训练方案事实
- **AND** 说明 MUST 表达读取事实的业务用途包括了解上一套 `exerciseItems`、section 摘要和计划结构，用于后续自主规划
- **AND** 说明 MUST 使用中文描述业务含义，`inspectVisibleTrainingProposals`、`visibleTrainingProposal`、`exerciseItems`、`list_recent`、`read_recent` 保持英文原样

#### Scenario: Metadata 和 list_recent 仍只是索引
- **WHEN** 模型可见上下文包含 `run.metadata.recentVisibleTrainingProposals`
- **OR** Planner 调用 `operation = "list_recent"`
- **THEN** 模型可见说明 MUST 表达这些内容只提供可引用索引或摘要
- **AND** 模型可见说明 MUST 表达完整历史方案事实需要通过当前 run 可见的受控读取结果获得
- **AND** 模型可见说明 MUST NOT 鼓励模型从 metadata 或 `list_recent` 猜测完整 `exerciseItems`

#### Scenario: 不写固定短语强制调用
- **WHEN** 模型可见说明描述替换、刷新、省略表达、指代或上下文继续请求
- **THEN** 说明 MUST 表达由模型基于上下文、可见事实和 tool result 自主判断是否调用本 tool
- **AND** 说明 MUST NOT 表达成用户说“换一批”“重新来一套”“不要这个”或其他固定短语时必须调用本 tool
- **AND** 服务端 MUST NOT 根据这些短语选择 `list_recent` 或 `read_recent`

### Requirement: read_recent 成功结果必须说明可用于差异化刷新
`inspectVisibleTrainingProposals(operation = "read_recent")` 成功后的模型 observation SHALL 说明读取到的事实可以作为当前 run 中差异化刷新、动作保留、动作排除或结构调整的依据，但该 tool 本身不生成新方案。

#### Scenario: Observation 描述当前 run 事实用途
- **WHEN** `read_recent` 成功
- **THEN** 模型 observation MUST 表达该可见训练方案事实已经导入当前 run
- **AND** observation MUST 表达 Planner 可以基于其中已展示动作决定保留、排除、替换、查询新动作、调整结构、澄清或失败收口
- **AND** observation MUST 表达最终新方案仍必须由 `final_answer.visibleOutputs[]` 承载
- **AND** observation MUST NOT 表达该 tool 已经生成刷新后的方案

### Requirement: visible proposal read/import observation 必须表达终态边界
`inspectVisibleTrainingProposals` 的模型可见说明和 `read_recent` observation SHALL 表达：该 tool 只读取当前会话中用户已经看到的 `visibleTrainingProposal` 事实，并将其作为当前 run 可消费事实导入；它不生成新的最终训练结构，不代表本轮已经完成编排、刷新、保存或渲染。

#### Scenario: read_recent 成功不代表最终训练输出完成
- **WHEN** `inspectVisibleTrainingProposals(operation = "read_recent")` 成功
- **THEN** model observation MUST 表达该结果只是导入当前 run 可消费事实
- **AND** observation MUST 表达最终训练结构仍必须由合法 `final_answer.visibleOutputs[]`、grounded `final_answer` 或后续合法 action 承载
- **AND** observation MUST NOT 暗示 runtime 会在 `final_answer` 后继续自动查询或生成训练结构

#### Scenario: 需要后续事实时继续合法 action
- **WHEN** read/import 后模型判断目标仍需要额外动作事实、section、处方或 schedule
- **THEN** 模型可见说明 MUST 引导 Planner 自主选择继续合法 `tool_call`、使用 `ask_user` 澄清或明确失败收口
- **AND** 模型可见说明 MUST NOT 要求固定调用 `searchExerciseResources`
- **AND** 模型可见说明 MUST NOT 把任意用户短句写成必须调用本 tool 或另一个 tool 的条件

#### Scenario: 业务名只出现在 tool 局部说明
- **WHEN** 本 change 涉及 `visibleTrainingProposal`、`inspectVisibleTrainingProposals` 或 `read_recent`
- **THEN** 这些业务名 MUST 只作为 tool manifest、schema description、observation projection、resource contract 或测试样例出现
- **AND** 通用 Agent core MUST NOT 因这些业务名新增语义分支

