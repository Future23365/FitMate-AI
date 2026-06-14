## ADDED Requirements

### Requirement: `Exercise` 必须存储结构化执行条件 taxonomy
系统 SHALL 在 `Exercise` 数据模型中维护结构化执行条件 taxonomy，用于确定性表达动作是否需要外部训练器械、需要哪些器械、是否需要支撑物或特殊场地、准备复杂度、冲击程度和噪音程度。该 taxonomy SHALL 与旧 `equipment` / `equipmentZh`、`homeRequirement` / `homeRequirementZh` 字段并存；旧字段 MAY 继续用于历史导入、展示兼容和人工审查对照，但 MUST NOT 作为模型可见动作查询输入合同。

#### Scenario: Prisma schema 新增执行条件字段
- **WHEN** 本 change 完成数据库阶段
- **THEN** `Exercise` MUST 包含 `requiresExternalEquipment Boolean @default(false)`
- **AND** `Exercise` MUST 包含 `requiredEquipmentTags String[] @default([])`
- **AND** `Exercise` MUST 包含 `supportRequirementTags String[] @default([])`
- **AND** `Exercise` MUST 包含 `setupComplexity String @default("unknown")`
- **AND** `Exercise` MUST 包含可为空的 `impactLevel String?`
- **AND** `Exercise` MUST 包含可为空的 `noiseLevel String?`

#### Scenario: 发布动作具备合法执行条件 taxonomy
- **WHEN** 某个 `Exercise.isPublished = true`
- **THEN** `requiresExternalEquipment` MUST 为布尔值
- **AND** `requiredEquipmentTags` 中每个值 MUST 属于共享 taxonomy 常量
- **AND** `supportRequirementTags` 中每个值 MUST 属于共享 taxonomy 常量
- **AND** `setupComplexity` MUST 属于共享 taxonomy 常量
- **AND** 非空 `impactLevel` MUST 属于共享 taxonomy 常量
- **AND** 非空 `noiseLevel` MUST 属于共享 taxonomy 常量

#### Scenario: 旧字段保留但不承担新查询合同
- **WHEN** seed、导入、后台展示或人工审查读取动作数据
- **THEN** 系统 MAY 继续读取 `equipment` / `equipmentZh` 和 `homeRequirement` / `homeRequirementZh`
- **AND** 这些字段 MAY 用于展示兼容或审查对照
- **AND** 新的模型可见动作查询合同 MUST NOT 依赖这些字段作为 Planner 可传 input
- **AND** 新的模型可见动作 observation MUST NOT 将这些字段作为动作执行条件事实暴露给 Planner

### Requirement: 执行条件 taxonomy 取值必须集中定义和校验
系统 SHALL 在共享模块中集中定义执行条件 taxonomy 的稳定取值、中文说明、排序关系和 Zod 校验边界。seed / 回填脚本、Prisma 数据访问、repository 查询、tool schema description、测试和文档 MUST 复用同一组 taxonomy 常量，不得在业务模块中复制散落的取值集合。

#### Scenario: 共享 taxonomy 模块提供稳定取值
- **WHEN** 本 change 完成实现
- **THEN** 系统 MUST 提供共享 taxonomy 模块
- **AND** 该模块 MUST 导出 `requiredEquipmentTags` 的受控取值集合
- **AND** 该模块 MUST 导出 `supportRequirementTags` 的受控取值集合
- **AND** 该模块 MUST 导出 `setupComplexity` 的受控取值集合和排序关系
- **AND** 该模块 MUST 导出 `impactLevel` 的受控取值集合
- **AND** 该模块 MUST 导出 `noiseLevel` 的受控取值集合
- **AND** 该模块 MUST 提供 Zod schema 或等价校验能力

#### Scenario: 禁止散落 taxonomy 取值
- **WHEN** repository、tool schema、seed、测试或文档需要引用执行条件 taxonomy
- **THEN** 代码 MUST 从共享 taxonomy 模块读取取值和说明
- **AND** 业务模块 MUST NOT 复制独立的 `requiredEquipmentTags`、`supportRequirementTags`、`setupComplexity`、`impactLevel` 或 `noiseLevel` 字面量集合
- **AND** 新增 taxonomy 取值 MUST 同步更新共享常量、校验、回填测试和模型可见说明

### Requirement: 回填必须把旧字段映射到新 taxonomy 并输出审查边界
系统 SHALL 提供一次性回填流程，将当前动作库中的 `equipmentZh` 和 `homeRequirementZh` 映射到新的执行条件 taxonomy。回填 MUST 区分训练器械和支撑/场地需求；无法可靠确定的字段 MUST 保持 `null` 或 `unknown`，并进入人工审查清单，不得通过服务端自然语言关键词规则猜测。

#### Scenario: equipmentZh 确定训练器械需求
- **WHEN** 回填处理某个动作
- **AND** `equipmentZh = "自重"`
- **THEN** `requiresExternalEquipment` MUST 设置为 `false`
- **AND** `requiredEquipmentTags` MUST 设置为空数组

#### Scenario: 非自重 equipmentZh 映射器械标签
- **WHEN** 回填处理某个动作
- **AND** `equipmentZh` 是可映射的非自重器械值
- **THEN** `requiresExternalEquipment` MUST 设置为 `true`
- **AND** `requiredEquipmentTags` MUST 写入对应的 taxonomy tag
- **AND** `requiredEquipmentTags` MUST NOT 使用 `equipmentZh` 原始中文值作为模型可见 tag

#### Scenario: homeRequirementZh 映射支撑或场地需求
- **WHEN** 回填处理某个动作
- **THEN** `homeRequirementZh = "无器械"` MUST 映射为 `supportRequirementTags = ["none"]`
- **AND** `homeRequirementZh = "地面/瑜伽垫"` MUST 映射为 `supportRequirementTags = ["floor_or_mat"]`
- **AND** `homeRequirementZh = "椅子/墙面/支撑物"` MUST 映射为 `supportRequirementTags = ["chair_or_wall"]`
- **AND** `homeRequirementZh = "健身房器械"` MUST 映射为 `supportRequirementTags = ["gym_fixture"]`
- **AND** `homeRequirementZh = "搭档辅助"` MUST 映射为 `supportRequirementTags = ["partner"]`
- **AND** `homeRequirementZh = "户外场地"` MUST 映射为 `supportRequirementTags = ["outdoor_space"]`

#### Scenario: 自重但需要健身房固定设施
- **WHEN** 回填处理某个动作
- **AND** `equipmentZh = "自重"`
- **AND** `homeRequirementZh = "健身房器械"`
- **THEN** `requiresExternalEquipment` MUST 保持 `false`
- **AND** `requiredEquipmentTags` MUST 保持为空数组
- **AND** `supportRequirementTags` MUST 包含 `gym_fixture`
- **AND** 该动作 MUST NOT 被新 taxonomy 表达为家中零准备可完成动作

#### Scenario: 不可靠字段进入人工审查
- **WHEN** 回填无法确定某个动作的 `impactLevel`、`noiseLevel` 或更细粒度 taxonomy
- **THEN** 系统 MUST 保持该字段为 `null` 或 `unknown`
- **AND** 回填报告 MUST 记录需要人工审查的动作 id、旧字段值和缺失 taxonomy 类型
- **AND** 回填 MUST NOT 基于动作名称关键词、用户原文、短句模板或自然语言同义词表猜测不可确定字段

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

#### Scenario: 查询语义由 taxonomy 派生
- **WHEN** repository 需要筛选无外部训练器械动作
- **THEN** repository MUST 使用 `requiresExternalEquipment = false`
- **AND** repository MAY 结合 `supportRequirementTags` 和 `setupComplexity` 排除 `gym_fixture` 或其他用户明确不接受的执行条件
- **AND** repository MUST NOT 读取冗余派生布尔字段作为事实来源
