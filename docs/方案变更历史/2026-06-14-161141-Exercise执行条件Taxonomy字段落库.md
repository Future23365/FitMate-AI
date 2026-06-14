# 2026-06-14 16:11:41 CST Exercise 执行条件 Taxonomy 字段落库

## 背景

当前动作库使用 `equipment` / `equipmentZh` 和 `homeRequirement` / `homeRequirementZh` 同时表达器械与执行环境。两个维度语义交叉，导致“自重”“无器械”“地面/瑜伽垫”“健身房器械”等事实容易被误读成同一个筛选口径。

## 原方案为什么不够清晰

旧字段仍有导入、展示、当前查询和人工审查价值，但它们不能稳定表达动作是否需要外部训练器械、是否需要固定设施或场地、准备复杂度、冲击程度和噪音程度。如果直接让后续查询继续从旧字段推断这些语义，会把数据缺失伪装成可执行事实。

## 调整思路

本次只先建立 `Exercise` execution taxonomy 的数据库落点和共享校验边界：

- `requiresExternalEquipment` 使用 nullable unknown 语义，不能用 `false` 表示未知。
- `requiredEquipmentTags` 和 `supportRequirementTags` 使用受控 tag 数组。
- `setupComplexity` 默认 `unknown`，且 `unknown` 不参与 `setupComplexityMax` 上限匹配。
- `impactLevel` 和 `noiseLevel` 使用 nullable 字段表达尚未补齐。
- 旧 `equipment` / `homeRequirement` 字段继续保留，当前查询和模型可见 tool 合同不迁移。

## 关键改动

- 在 `prisma/schema.prisma` 和 migration 中为 `Exercise` 增加 execution taxonomy 字段和索引。
- 新增 `lib/shared/exercises/execution-taxonomy.ts`，集中定义取值、中文说明、排序关系和 Zod 不变量校验。
- 扩展 `Exercise` 共享类型、列表 DTO、repository 映射和 fallback 预览对象，让 unknown-safe 字段可以稳定流转。
- 新增字段级测试，覆盖 migration 默认值、taxonomy 合法值、不变量和禁止派生布尔字段。
- 更新架构文档，明确当前 change 不回填动作数据，不调用 LLM 补齐，不迁移 `searchExerciseResources` 合同。

## 边界

本次没有新增数据回填脚本，没有修改 `data/exercises.zh.json`，没有根据旧字段推断新 taxonomy，也没有修改 LangChain runtime、provider payload、production response adapter、`/api/chat` 主链路或 `searchExerciseResources` 的模型可见合同。
