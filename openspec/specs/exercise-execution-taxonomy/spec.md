# exercise-execution-taxonomy Specification

## Purpose
TBD - created by archiving change add-exercise-execution-taxonomy. Update Purpose after archive.
## Requirements
### Requirement: `Exercise` 必须存储结构化执行条件 taxonomy
系统 SHALL 在 `Exercise` 数据模型中维护结构化执行条件 taxonomy 字段，用于承载动作是否需要外部训练器械、需要哪些器械、是否需要支撑物或特殊场地、准备复杂度、冲击程度和噪音程度。当前 change 只新增字段和 unknown-safe 语义，不要求现有动作完成 taxonomy 数据补齐；旧 `equipment` / `equipmentZh`、`homeRequirement` / `homeRequirementZh` 字段 SHALL 继续作为当前查询、历史导入、展示兼容和人工审查对照的事实来源。

#### Scenario: Prisma schema 新增执行条件字段
- **WHEN** 本 change 完成数据库阶段
- **THEN** `Exercise` MUST 包含可为空的 `requiresExternalEquipment Boolean?`
- **AND** `Exercise` MUST 包含 `requiredEquipmentTags String[] @default([])`
- **AND** `Exercise` MUST 包含 `supportRequirementTags String[] @default([])`
- **AND** `Exercise` MUST 包含 `setupComplexity String @default("unknown")`
- **AND** `Exercise` MUST 包含可为空的 `impactLevel String?`
- **AND** `Exercise` MUST 包含可为空的 `noiseLevel String?`

#### Scenario: 新字段默认值表达尚未补齐
- **WHEN** 本 change 的 migration 应用于已有 `Exercise` 行
- **THEN** `requiresExternalEquipment` MUST 为 `null`
- **AND** `requiredEquipmentTags` MUST 为空数组
- **AND** `supportRequirementTags` MUST 为空数组
- **AND** `setupComplexity` MUST 为 `unknown`
- **AND** `impactLevel` MUST 为 `null`
- **AND** `noiseLevel` MUST 为 `null`
- **AND** 系统 MUST NOT 将这些默认值解释为无外部训练器械、无支撑需求、零准备、低冲击或安静

#### Scenario: 发布动作允许 taxonomy 待补齐
- **WHEN** 某个 `Exercise.isPublished = true`
- **THEN** `requiresExternalEquipment` MAY 为 `null`
- **AND** `requiredEquipmentTags` 中每个值 MUST 属于共享 taxonomy 常量
- **AND** `supportRequirementTags` 中每个值 MUST 属于共享 taxonomy 常量
- **AND** `setupComplexity` MUST 属于共享 taxonomy 常量
- **AND** 非空 `impactLevel` MUST 属于共享 taxonomy 常量
- **AND** 非空 `noiseLevel` MUST 属于共享 taxonomy 常量

#### Scenario: 器械需求字段必须自洽
- **WHEN** 某个发布态 `Exercise` 写入 execution taxonomy
- **AND** `requiresExternalEquipment = false`
- **THEN** `requiredEquipmentTags` MUST 为空数组
- **AND** 当 `requiresExternalEquipment = true` 时，`requiredEquipmentTags` MUST 至少包含一个合法 tag
- **AND** 如果只能确定动作需要外部训练器械但无法细分器械类型，`requiredEquipmentTags` MUST 使用 `other_equipment`
- **AND** 当 `requiresExternalEquipment = null` 时，系统 MUST 将器械需求解释为未知
- **AND** 当前未回填阶段 MUST 使用 `requiresExternalEquipment = null` 且 `requiredEquipmentTags = []` 表达未知器械需求
- **AND** 系统 MUST NOT 用 `requiresExternalEquipment = false` 表达未知外部器械需求

#### Scenario: none 支撑条件必须互斥
- **WHEN** 某个发布态 `Exercise.supportRequirementTags` 包含 `none`
- **THEN** `supportRequirementTags` MUST 等于 `["none"]`
- **AND** `none` MUST NOT 与 `floor_or_mat`、`chair_or_wall`、`gym_fixture`、`partner` 或 `outdoor_space` 同时出现
- **AND** 空 `supportRequirementTags` MUST NOT 被解释为 `none`
- **AND** 空 `supportRequirementTags` MUST 表示当前数据源没有可断言的额外支撑/场地 tag

#### Scenario: unknown 不得伪装成低准备复杂度
- **WHEN** 某个动作的 `setupComplexity = "unknown"`
- **THEN** 系统 MUST 将其解释为准备复杂度未知
- **AND** 系统 MUST NOT 将其解释为 `zero_setup`、`floor_or_mat`、`home_support` 或其他低准备复杂度
- **AND** `impactLevel = null` MUST 表示冲击程度未知
- **AND** `noiseLevel = null` MUST 表示噪音程度未知

#### Scenario: 旧字段保留但不承担新查询合同
- **WHEN** seed、导入、后台展示、当前动作查询或人工审查读取动作数据
- **THEN** 系统 MAY 继续读取 `equipment` / `equipmentZh` 和 `homeRequirement` / `homeRequirementZh`
- **AND** 这些字段 MAY 用于当前查询、展示兼容或审查对照
- **AND** 本 change MUST NOT 迁移 `searchExerciseResources` 的模型可见输入合同、facet catalog、repository 查询或模型可见 observation 到新 taxonomy 字段
- **AND** 后续数据补齐和 tool 合同迁移 MUST 通过独立 change 处理

### Requirement: 执行条件 taxonomy 取值必须集中定义和校验
系统 SHALL 在共享模块中集中定义执行条件 taxonomy 的稳定取值、中文说明、排序关系和 Zod 校验边界。Prisma 数据访问、共享类型、测试、文档以及后续 seed / 回填脚本、repository 查询和 tool schema description MUST 复用同一组 taxonomy 常量，不得在业务模块中复制散落的取值集合。

#### Scenario: 共享 taxonomy 模块提供稳定取值
- **WHEN** 本 change 完成实现
- **THEN** 系统 MUST 提供共享 taxonomy 模块
- **AND** 该模块 MUST 导出 `requiredEquipmentTags` 的受控取值集合
- **AND** 该模块 MUST 导出 `supportRequirementTags` 的受控取值集合
- **AND** 该模块 MUST 导出 `setupComplexity` 的受控取值集合和排序关系
- **AND** 该模块 MUST 导出 `impactLevel` 的受控取值集合
- **AND** 该模块 MUST 导出 `noiseLevel` 的受控取值集合
- **AND** 该模块 MUST 提供 Zod schema 或等价校验能力

#### Scenario: setupComplexity 排序关系固定
- **WHEN** repository、tool schema description、测试或文档引用 `setupComplexityMax`
- **THEN** 共享 taxonomy 模块 MUST 导出排序关系 `zero_setup < floor_or_mat < home_support < small_equipment < gym_fixture < partner < outdoor`
- **AND** `unknown` MUST NOT 参与小于等于排序
- **AND** 使用 `setupComplexityMax` 查询时，repository MUST 只匹配已知且排序不高于上限的 `setupComplexity`
- **AND** 未传入 `setupComplexityMax` 时，repository MUST NOT 因 `setupComplexity = "unknown"` 自动排除动作

#### Scenario: 禁止散落 taxonomy 取值
- **WHEN** Prisma 数据访问、共享类型、测试、文档或后续 repository、tool schema、seed、回填脚本需要引用执行条件 taxonomy
- **THEN** 代码 MUST 从共享 taxonomy 模块读取取值和说明
- **AND** 业务模块 MUST NOT 复制独立的 `requiredEquipmentTags`、`supportRequirementTags`、`setupComplexity`、`impactLevel` 或 `noiseLevel` 字面量集合
- **AND** 新增 taxonomy 取值 MUST 同步更新共享常量、校验和相关测试；后续回填或模型可见说明如已存在，也 MUST 同步更新

### Requirement: 当前 change 不得补齐现有动作 taxonomy 数据
系统 SHALL 将现有动作数据补齐、LLM 辅助判断、人工审查报告、旧字段到新字段映射脚本和 `searchExerciseResources` 合同迁移排除在当前 change 之外。当前 change 只能建立字段、共享常量、unknown-safe 默认值和字段级校验边界。

#### Scenario: 不新增旧字段回填脚本
- **WHEN** 本 change 完成实现
- **THEN** 系统 MUST NOT 新增一次性脚本把当前动作库中的 `equipmentZh` 或 `homeRequirementZh` 映射到 execution taxonomy 字段
- **AND** seed / 导入流程 MUST NOT 基于旧字段推断 execution taxonomy
- **AND** 当前 `data/exercises.zh.json` 或等价动作源数据 MUST NOT 因本 change 批量写入 execution taxonomy 值

#### Scenario: 不新增 LLM 辅助补齐流程
- **WHEN** 本 change 完成实现
- **THEN** 系统 MUST NOT 新增调用大模型判断 `impactLevel`、`noiseLevel`、细粒度器械或执行条件的脚本、route、service 或 tool
- **AND** 系统 MUST NOT 在服务端运行时基于用户原文、动作名称关键词、短句模板或自然语言同义词表推断 execution taxonomy
- **AND** 后续如需 LLM 辅助补齐，MUST 通过独立 change 设计输入事实、结构化输出、校验、审查和写库策略

### Requirement: 派生执行语义不得持久化为冗余布尔字段
系统 SHALL 通过 `requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexity`、`impactLevel` 和 `noiseLevel` 派生“低门槛”“无器械”“适合居家”“需要瑜伽垫”“需要健身房固定设施”等查询语义，不得新增会与 taxonomy 漂移的冗余事实字段。

#### Scenario: 不新增派生布尔字段
- **WHEN** 本 change 修改 `Exercise` 数据模型
- **THEN** 系统 MUST NOT 新增 `isNoEquipment`
- **AND** 系统 MUST NOT 新增 `isHomeFriendly`
- **AND** 系统 MUST NOT 新增 `needsMat`
- **AND** 系统 MUST NOT 新增 `requiresPartner`
- **AND** 系统 MUST NOT 新增 `requiresGym`
- **AND** 系统 MUST NOT 新增 `isLowFriction`

#### Scenario: 后续查询语义不得依赖冗余字段
- **WHEN** 后续 change 将动作查询迁移到 execution taxonomy
- **THEN** 查询语义 MUST 从 `requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexity`、`impactLevel` 和 `noiseLevel` 派生
- **AND** 查询实现 MUST NOT 读取冗余派生布尔字段作为事实来源
