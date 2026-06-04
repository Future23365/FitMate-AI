## ADDED Requirements

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
