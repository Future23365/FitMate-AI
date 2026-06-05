## ADDED Requirements

### Requirement: `searchExerciseResources` 模型可见说明必须聚焦 tool 独有边界
系统 SHALL 将 `searchExerciseResources` 的 `description`、`whenToUse`、`whenNotToUse`、schema description 和 examples 收敛为动作事实查询 tool 的独有能力说明。模型可见说明 MUST 保留输入字段、facet、section-scoped 动作事实来源和查询结果消费边界；MUST NOT 重复完整通用 terminal final answer 规则。

#### Scenario: manifest 保留动作事实查询边界
- **WHEN** production registry 序列化 `searchExerciseResources` manifest
- **THEN** manifest MUST 表达该 tool 只读查询发布态动作事实
- **AND** manifest MUST 表达它不生成 `visibleTrainingProposal`、`routine`、`plan`、`prescription`、`schedule`、保存结果或用户记忆
- **AND** manifest MUST 表达 `groups.<section>.exercises[]` 是 section-scoped 动作事实来源
- **AND** manifest MUST 表达 `exerciseItems[*].section` 应与使用的 `groups.<section>` 和动作 `allowedSections` 保持一致
- **AND** manifest MUST 保持描述性自然语言为中文，`searchExerciseResources`、`groups`、`section`、`allowedSections`、`visibleTrainingProposal` 等技术标识保持英文原样

#### Scenario: manifest 不重复通用终态长规则
- **WHEN** production registry 序列化 `searchExerciseResources` manifest
- **THEN** manifest MUST NOT 逐段重复 system prompt 中关于 `final_answer.content` 不触发后续自动 tool 调用的完整说明
- **AND** manifest MUST NOT 逐段重复 system prompt 中关于 `usedRefs`、resource id、diagnostic result 和 terminal validator 的完整通用规则
- **AND** manifest 可以用短句说明“最终训练结构由 `final_answer.visibleOutputs[]` 承载”，但不得把该短句扩展成跨 tool 通用终态规则全集

#### Scenario: schema description 保留字段独有含义
- **WHEN** `searchExerciseResources` input schema 被转成 Planner 可见 JSON Schema
- **THEN** `suitabilities` description MUST 保留 `warmup`、`training`、`stretch` 的字段含义
- **AND** `equipment` description MUST 保留 `no_equipment` 或 `无器械` 的 tool 合同层稳定查询语义
- **AND** `homeRequirement` description MUST 保留其只表达环境、场地或支撑条件
- **AND** `requiredExerciseIds` description MUST 表达正向锚点含义
- **AND** `excludeExerciseIds` description MUST 表达负向排除含义
- **AND** schema description MUST NOT 承担 `visibleTrainingProposal` 全局输出选择指南

### Requirement: `searchExerciseResources` examples 必须保留关键输入例子并删除长篇解释
系统 SHALL 为 `searchExerciseResources` 保留少量对模型调用最有帮助的合法 input examples。Examples MUST 展示结构化字段如何填写，而不是解释整套终态输出流程。

#### Scenario: examples 覆盖核心查询形态
- **WHEN** production registry 序列化 `searchExerciseResources` examples
- **THEN** examples MUST 至少覆盖一个受约束动作查询输入
- **AND** examples MUST 覆盖需要补齐 `warmup` / `stretch` section 的合法查询输入，除非 system prompt 和 observation 已通过其他可测试方式完整覆盖该链路
- **AND** 如保留 `requiredExerciseIds` example，example MUST 使用符合当前 schema 的发布态动作 id 形状
- **AND** examples MUST NOT 包含 `bodyRegions`、`muscle`、`limit`、`page`、fake `factRef` 或其他非 input schema 字段

#### Scenario: examples 不变成意图分类表
- **WHEN** examples 描述查询输入
- **THEN** examples MUST NOT 表达用户说某个固定短语时必须选择某个 `payload.kind`
- **AND** examples MUST NOT 表达用户说某个固定短语时必须调用某个 tool
- **AND** examples MUST NOT 承诺 `searchExerciseResources` 自己生成 routine、plan、训练卡片、处方或日程

### Requirement: `searchExerciseResources` observation 必须保留动态事实并压缩重复说明
系统 SHALL 在 `searchExerciseResources` 的模型 observation 中继续暴露真实 tool result 才能确定的动态事实。Observation MUST 以结构化字段和短边界表达可恢复方向，MUST NOT 复制完整 system prompt 或 manifest 长段。

#### Scenario: observation 保留 section coverage 事实
- **WHEN** `searchExerciseResources` 执行成功并进入下一轮 Planner 输入
- **THEN** model observation MUST 包含或等价表达 `availableSections`
- **AND** model observation MUST 包含或等价表达 `sectionSummary`
- **AND** model observation MUST 包含或等价表达 `missingSectionsForRoutineOrPlan`
- **AND** model observation MUST 包含或等价表达 `supportsOutputKinds`
- **AND** model observation MUST 表达当前结果不能伪造成未返回 section 的动作事实

#### Scenario: observation 用短边界替代长篇终态重复
- **WHEN** `missingSectionsForRoutineOrPlan` 非空
- **THEN** model observation MUST 表达当前结果不能支撑成功 `routine` 或 `plan` visible output
- **AND** model observation MUST 提供有限可恢复方向，例如继续查询缺失 section、澄清、失败收口或输出当前事实可支撑结构
- **AND** model observation MUST NOT 复制 system prompt 中关于 `AgentAction`、`usedRefs`、resource id 和 final answer 终态的完整长规则

#### Scenario: observation 保留查询特异性和排除状态
- **WHEN** `searchExerciseResources` 执行成功
- **THEN** model observation MUST 表达本次查询是否过宽或已包含可解释结构化约束
- **AND** model observation MUST 表达 `requiredExerciseIds` 是否作为正向锚点实际使用
- **AND** model observation MUST 表达 `excludeExerciseIds` 是否作为负向排除实际使用
- **AND** model observation MUST NOT 根据用户原文替模型判断资源操作类型
