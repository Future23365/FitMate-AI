## Why

当前动作库同时使用 `equipment` / `equipmentZh` 和 `homeRequirement` / `homeRequirementZh` 表达器械与执行环境，两个字段语义交叉，导致“无器械”既可能被理解为自重动作，也可能被理解为完全不需要场地、固定设施或支撑物。`searchExerciseResources` 因此需要在旧字段之间做兼容解释，模型也会看到容易误用的筛选口径，出现已经补充完整条件后仍反复查询、或把健身房固定设施动作混入无器械推荐的现象。

本 change 先收敛数据库结构：在 `Exercise` 上新增明确的动作执行条件 taxonomy 字段，并用 unknown-safe 默认值避免旧动作被误标。当前 change 不负责现有动作数据回填、不调用大模型补齐字段，也不把 `searchExerciseResources` 的模型可见合同切换到新字段；数据补齐和 tool 合同迁移后续单独处理。

## What Changes

- 新增动作执行条件 taxonomy 字段，用稳定字段承载“是否需要外部训练器械”“需要哪些器械”“是否需要地面/瑜伽垫、椅子/墙面、健身房固定设施、搭档或户外空间”等执行条件。
- 新字段使用 `null`、空数组和 `unknown` 表达“尚未补齐”，避免字段创建后把旧动作错误解释成无器械、低准备、低冲击或安静。
- 保留 `equipment` / `equipmentZh`、`homeRequirement` / `homeRequirementZh` 作为当前查询、历史导入、展示和兼容字段；当前 change 不迁移 `searchExerciseResources` 的模型可见输入字段。
- 新增共享 taxonomy 常量与校验边界，供 Prisma 数据访问、共享类型、后续 seed / 回填脚本、repository、tool schema description、测试和文档复用。
- 固定 taxonomy 不变量：已补齐的 `requiresExternalEquipment` 与 `requiredEquipmentTags` 必须自洽，`supportRequirementTags = ["none"]` 必须与其他支撑/场地 tag 互斥，`setupComplexityMax` 的排序与 `unknown` 处理必须由共享 taxonomy 模块定义。
- 将现有动作数据回填、LLM 辅助字段补齐、人工审查报告、旧 `equipment` / `homeRequirement` 模型可见合同替换和 `facetCatalog.executionTaxonomy` 迁移剥离到后续独立 change。
- 不新增服务端自然语言关键词规则、正则、同义词表、固定短句模板、provider `tool_calls` 改写、LangChain runtime 主循环分支或 `/api/chat` 主链路分流。
- 本 change 不改变当前动作推荐或动作查询行为；实施时不应并行引入只依赖旧 `equipment` / `homeRequirement` 的低门槛默认策略。

## Capabilities

### New Capabilities

- `exercise-execution-taxonomy`: 维护动作执行条件 taxonomy、数据库字段、unknown-safe 默认值、共享枚举/常量和字段级校验边界。

### Modified Capabilities

- 无。`searchExerciseResources` 的模型可见输入、repository 查询、facet catalog、observation、trace 和 projection 迁移不在当前 change 范围内。

## Impact

- 影响数据模型与数据：
  - `prisma/schema.prisma`
  - Prisma migration
  - 现有 `Exercise` 行会获得 unknown-safe 默认值，但不在本 change 中补齐真实 taxonomy 数据
- 影响共享类型与领域常量：
  - `lib/shared/exercises/types.ts`
  - 新增或调整 `lib/shared/exercises/*taxonomy*` 等共享 taxonomy 模块
- 影响测试：
  - Prisma / migration / taxonomy 字段默认值测试
  - 共享 taxonomy 常量与校验测试
- 不影响：
  - 当前 `searchExerciseResources` 模型可见 input schema、description、examples、model observation、user projection 和 trace summary
  - 当前动作 repository 查询行为
  - seed / 数据回填脚本
  - `data/exercises.zh.json` 或等价动作源数据内容
  - LangChain runtime 主循环
  - model factory provider payload
  - production response adapter 主流程
  - `/api/chat` 主链路
  - `submitVisibleTrainingProposal` 的最终动作数据库事实校验
