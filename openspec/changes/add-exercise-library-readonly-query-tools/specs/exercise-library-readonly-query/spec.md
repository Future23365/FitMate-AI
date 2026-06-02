## ADDED Requirements

### Requirement: 动作库统计必须通过只读工具查询
系统 SHALL 提供受控动作库统计读取能力，使 Agent 能回答当前动作库数量、发布态数量和基础动作库概览问题。

#### Scenario: 查询动作库总数
- **WHEN** 用户询问当前数据库、动作库或系统中有多少个动作
- **THEN** Agent MUST 调用动作库统计只读工具读取当前 `Exercise` 事实
- **AND** 最终回复 MUST 返回来自工具结果的总动作数
- **AND** 系统 MUST NOT 用静态 seed 记忆、历史总结或模型常识回答实时数据库数量

#### Scenario: 查询发布态动作数量
- **WHEN** 用户询问可推荐、已发布或当前可用动作数量
- **THEN** 动作库统计工具 MUST 返回发布态动作数量或等价可用动作数量
- **AND** 回复 MUST 明确该数字对应的统计口径

#### Scenario: 查询动作库概览
- **WHEN** 用户询问动作库有哪些类型、器械或肌群覆盖
- **THEN** 动作库统计工具 MUST 返回受限 facet 统计摘要
- **AND** 回复 MUST 只展示工具结果中包含的 facet 和计数
- **AND** 回复 MUST NOT 编造动作库不存在的分类、器械或肌群计数

### Requirement: 按名称查询动作详情必须先解析动作库记录
系统 SHALL 支持用户通过中文名、英文名或动作 id 查询单个动作详情，并在回答前将该名称解析为数据库中存在的动作记录。

#### Scenario: 中文动作名唯一命中
- **WHEN** 用户询问“俯卧撑怎么做”或等价单个动作详情问题
- **THEN** Agent MUST 使用动作名称解析或详情读取只读工具定位动作库记录
- **AND** 工具结果 MUST 返回唯一 `exerciseId`、动作名称和数据库详情摘要
- **AND** 最终回复 MUST 引用该工具结果并以 `answered` 收口

#### Scenario: 英文动作名唯一命中
- **WHEN** 用户使用英文动作名、动作 id 或动作库 source id 询问动作怎么做
- **THEN** 名称解析工具 MUST 能在受控字段中查找匹配动作
- **AND** 成功时 MUST 返回对应数据库动作详情

#### Scenario: 动作名称存在歧义
- **WHEN** 用户输入的动作名称匹配多个动作
- **THEN** 系统 MUST 返回 `needs_clarification` 或等价澄清结果
- **AND** 澄清内容 MUST 列出有限数量的候选动作名称
- **AND** 系统 MUST NOT 静默选择第一个候选并伪装成唯一命中

#### Scenario: 动作不存在
- **WHEN** 名称解析工具无法在动作库中找到匹配动作
- **THEN** Agent MUST 返回明确的未找到说明或可恢复建议
- **AND** 系统 MUST NOT 编造动作流程、exerciseId 或推荐卡片

### Requirement: 动作详情回答必须基于数据库流程并允许 LLM 润色
系统 SHALL 使用动作库中的结构化动作事实回答“怎么做”类问题，并允许 LLM 在不改变事实的前提下润色表达。

#### Scenario: 回复动作执行流程
- **WHEN** 动作详情工具返回 `instructionsZh` 或等价步骤字段
- **THEN** 最终回复 MUST 覆盖这些数据库步骤的核心流程
- **AND** LLM MAY 将步骤组织成更自然的中文说明
- **AND** LLM MUST NOT 添加工具结果中不存在的器械、动作阶段或训练参数作为事实

#### Scenario: 回复动作基础信息
- **WHEN** 动作详情工具返回器械、目标肌群、难度、图片或安全提示字段
- **THEN** 最终回复 MAY 展示这些字段的用户可读摘要
- **AND** 每个具体字段值 MUST 来自工具结果

#### Scenario: 数据库步骤缺失
- **WHEN** 命中的动作记录缺少 `instructionsZh` 或可展示流程
- **THEN** 回复 MUST 明确说明动作库当前缺少完整步骤
- **AND** 如使用 LLM 解释通用做法，必须标注其不是数据库流程
- **AND** 系统 MUST NOT 把 LLM 补写内容伪装成动作库原始步骤

#### Scenario: 详情问答不生成训练结果
- **WHEN** 用户只询问某个动作怎么做或动作详情
- **THEN** 系统 MUST NOT 生成 routine、plan、patch 或 conversation artifact
- **AND** 聊天流 MUST NOT 推送动作推荐卡片，除非用户明确请求推荐或替代动作
