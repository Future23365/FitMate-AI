## Context

当前 `Exercise` 数据模型中，执行条件主要由 `equipment` / `equipmentZh` 和 `homeRequirement` / `homeRequirementZh` 表达。`equipment` 更接近动作使用的器械类别，`homeRequirement` 更接近动作执行环境或支撑条件，但二者并不是互斥维度：例如 `equipmentZh = "自重"` 的动作仍可能需要单杠、双杠、上斜凳或其他健身房固定设施；`homeRequirementZh = "地面/瑜伽垫"` 也不等于完全无器械。

当前动作源数据共有 873 个动作，`equipmentZh = "自重"` 的动作有 172 个，其中 22 个同时标记为 `homeRequirementZh = "健身房器械"`。这说明旧字段无法独立承担“用户没有器械时能做什么”的精确筛选合同。继续把旧字段暴露给模型，会让模型把“无外部训练器械”“无健身房固定设施”“地面/瑜伽垫可完成”“家里可完成”等不同语义混在一起。

生产 `/api/chat` 已迁移到 `LangChain Agent Runtime + DeepSeek native tool_calls`，`searchExerciseResources` 是动作库只读事实查询 tool。本 change 只调整 `Exercise` 资源的数据库 taxonomy 字段、共享 taxonomy 常量和类型边界，不调整动作查询 repository、tool 模型可见合同、LangChain runtime 主循环、provider payload、response adapter 或 `/api/chat` 主链路。

## Goals / Non-Goals

**Goals:**

- 在数据库层新增清晰的动作执行条件 taxonomy 字段，先为后续数据补齐和查询迁移提供稳定落点。
- 使用 `null`、空数组和 `unknown` 表达“尚未补齐”，避免旧动作在字段创建后被误判为无外部器械、零准备、低冲击或安静。
- 新增共享 taxonomy 常量、中文说明、排序关系和 Zod 校验边界，供当前字段校验和后续回填 / tool 迁移复用。
- 保留旧字段用于当前查询、历史导入、展示兼容和人工审查对照。
- 保持 AI 边界：当前 change 不新增大模型数据补齐脚本，不新增服务端自然语言分流，也不改变生产 Agent tool 调用策略。

**Non-Goals:**

- 不删除数据库中的旧 `equipment` / `equipmentZh`、`homeRequirement` / `homeRequirementZh` 字段。
- 不回填当前 873 条动作的 execution taxonomy 数据。
- 不新增调用大模型补齐 `impactLevel`、`noiseLevel`、细粒度器械或执行条件的脚本。
- 不输出人工审查报告；后续数据补齐 change 可单独设计审查产物。
- 不迁移 `searchExerciseResources` 的模型可见 input schema、description、examples、facet catalog、observation、trace 或 repository 查询。
- 不新增服务端自然语言关键词、正则、同义词表、短句模板或 provider `tool_calls` 改写逻辑。
- 不新增新的动作推荐打分模型、语义搜索能力、分页能力或训练生成 tool。
- 不改变 `submitVisibleTrainingProposal` 的最终动作数据库事实校验。
- 不把 `isNoEquipment`、`isHomeFriendly`、`needsMat`、`requiresGym`、`isLowFriction` 等可派生布尔值持久化为新的事实字段。

## Decisions

### 1. 新增执行条件 taxonomy 字段，而不是重命名旧字段

`Exercise` 新增以下字段：

- `requiresExternalEquipment Boolean?`：动作是否需要外部训练器械；`null` 表示尚未补齐，不能解释为 `false`。
- `requiredEquipmentTags String[] @default([])`：需要的训练器械标签，例如 `dumbbell`、`barbell`、`resistance_band`、`machine`、`cable`、`kettlebell`、`medicine_ball`、`foam_roller`、`ez_bar`、`stability_ball`、`other_equipment`。
- `supportRequirementTags String[] @default([])`：非训练器械但影响执行的支撑/场地需求，例如 `none`、`floor_or_mat`、`chair_or_wall`、`gym_fixture`、`partner`、`outdoor_space`。
- `setupComplexity String @default("unknown")`：准备复杂度，例如 `zero_setup`、`floor_or_mat`、`home_support`、`small_equipment`、`gym_fixture`、`partner`、`outdoor`、`unknown`。
- `impactLevel String?`：冲击程度，例如 `low`、`medium`、`high`。
- `noiseLevel String?`：噪音程度，例如 `quiet`、`normal`、`loud`。

选择该方案的原因是：旧字段仍有导入、展示和兼容价值，直接删除或重命名会扩大迁移风险，也会丢失人工审查线索。新增正交字段可以让新查询合同立即清晰，同时保留旧数据用于校对。

`requiresExternalEquipment` 必须可为空。若使用 `Boolean @default(false)`，现有 873 条动作在 migration 后会被写成“不需要外部训练器械”，这会把数据缺失伪装成可执行事实。当前 change 只建字段不回填，因此默认必须表达 unknown。

替代方案：直接把 `homeRequirement` 扩展成更多枚举。该方案仍会把器械和环境混在一个字段里，无法表达“自重但需要单杠/双杠”这类组合，因此不采用。

### 2. 使用字符串字段配合共享 taxonomy 常量，不使用 Prisma enum

taxonomy 取值在 TypeScript 中集中定义，例如 `lib/shared/exercises/execution-taxonomy.ts`，并通过 Zod schema、Prisma 数据访问、共享类型、测试以及后续 seed / 回填脚本、repository 输入校验共享。Prisma 层使用 `String` / `String[]`，不使用数据库 enum。

选择该方案的原因是：动作 taxonomy 仍会随着数据审查继续细化。数据库 enum 每次增减取值都需要 migration，容易把小范围数据分类调整变成数据库结构变更；字符串字段加集中常量能保持强类型边界，又降低演进成本。

替代方案：使用 Prisma enum。该方案在取值稳定后可以考虑，但当前阶段会增加迁移成本，因此不采用。

### 3. 不持久化可派生布尔字段

不新增 `isNoEquipment`、`isHomeFriendly`、`needsMat`、`requiresPartner`、`requiresGym`、`isLowFriction` 等字段。这些语义由稳定 taxonomy 派生：

- “无外部训练器械”由 `requiresExternalEquipment = false` 表达。
- “不需要健身房固定设施”由 `supportRequirementTags` 不包含 `gym_fixture` 表达。
- “只需要地面/瑜伽垫”由 `requiresExternalEquipment = false` 且 `supportRequirementTags` 为 `floor_or_mat` 或等价低准备需求表达。
- “低门槛候选”由 `requiresExternalEquipment`、`supportRequirementTags`、`setupComplexity`、`impactLevel` 和 `noiseLevel` 在查询策略中组合派生。

选择该方案的原因是：派生布尔字段容易与源 taxonomy 漂移，后续每次修订 taxonomy 都要同步多个冗余字段。

### 4. 当前 change 不补齐旧数据，也不切换 tool 查询合同

本 change 只为 execution taxonomy 建立数据库落点和共享取值，不把当前 873 条动作的旧字段映射到新字段。现有动作在 migration 后应保持：

- `requiresExternalEquipment = null`。
- `requiredEquipmentTags = []`。
- `supportRequirementTags = []`。
- `setupComplexity = "unknown"`。
- `impactLevel = null`。
- `noiseLevel = null`。

这些值只表达“尚未补齐”，不得被当前业务代码、后续 repository、tool schema description、模型可见 observation 或用户投影解释为“无外部训练器械”“无支撑需求”“零准备”“低冲击”或“安静”。

数据补齐应在后续独立 change 中处理。后续 change 可以选择确定性脚本、LLM 辅助脚本、人工审查报告或分阶段写库策略，但不应反向扩大当前字段落库 change。

### 5. Taxonomy 不变量和 `setupComplexity` 排序固定在共享模块

新增 taxonomy 字段必须满足以下不变量：

- `requiresExternalEquipment = false` 时，`requiredEquipmentTags` 必须为空数组。
- `requiresExternalEquipment = true` 时，`requiredEquipmentTags` 必须至少包含一个合法 tag；无法细分但确定需要外部器械时使用 `other_equipment`，不得保持空数组。
- `requiresExternalEquipment = null` 时表示器械需求未知；在当前未回填阶段，`requiredEquipmentTags` 必须为空数组，后续一旦写入器械 tag 必须同步把 `requiresExternalEquipment` 写为 `true`。
- `supportRequirementTags = ["none"]` 只表示可确定无额外支撑/场地需求，并且必须与 `floor_or_mat`、`chair_or_wall`、`gym_fixture`、`partner`、`outdoor_space` 互斥。
- `supportRequirementTags = []` 表示当前数据源不能断言额外支撑/场地需求，不等同于 `["none"]`，也不得被模型或 repository 当作“零支撑需求”。
- `impactLevel = null`、`noiseLevel = null` 和 `setupComplexity = "unknown"` 表示该事实未知，不表示低冲击、安静或低准备复杂度。

`setupComplexityMax` 使用共享 taxonomy 模块导出的排序：

`zero_setup < floor_or_mat < home_support < small_equipment < gym_fixture < partner < outdoor`

`unknown` 不参与“小于等于”比较。repository 在收到 `setupComplexityMax` 时默认只返回已知且排序不高于上限的动作；没有传入 `setupComplexityMax` 时不得因为 `unknown` 自动排除动作。选择该方案的原因是：未知事实不能被当作低门槛候选，否则会再次把数据缺失伪装成执行条件满足。

## Risks / Trade-offs

- [Risk] 新字段上线后一段时间内没有真实 taxonomy 数据。
  → Mitigation：字段使用 unknown-safe 默认值；当前 change 不迁移 `searchExerciseResources` 查询合同，也不让模型把新字段当作可用事实。

- [Risk] 字符串字段可能写入未知 taxonomy 值。
  → Mitigation：共享常量、Zod 校验、Prisma 数据访问边界和字段级测试共同阻止未知值写入；后续回填脚本必须复用同一常量。

- [Risk] 旧字段继续存在，后续开发者可能误用。
  → Mitigation：在共享类型注释和 docs 中明确旧字段仍是当前查询事实来源；新字段只有完成数据补齐和 tool 迁移后才作为模型可见查询事实。

## Migration Plan

1. 数据库阶段：
   - 新增 Prisma 字段和 migration。
   - 新增共享 taxonomy 常量、类型和 Zod 校验。
   - 更新共享类型 / DTO，使新字段能以 unknown-safe 默认值流转。
   - 确认 seed / 导入流程不会基于旧字段推断新 taxonomy；如果输入数据没有显式 taxonomy 值，保持 `null`、`[]` 或 `unknown`。
   - 增加字段默认值和 taxonomy 常量测试。
2. 验证阶段：
   - 运行 `openspec validate add-exercise-execution-taxonomy --strict`。
   - 运行 Prisma / migration / taxonomy 字段相关测试。
   - 运行 `npm run typecheck`，必要时运行 `npm test`。

## Rollback Strategy

如果新增字段或共享 taxonomy 常量出现问题，可以先让业务代码继续忽略这些字段，保留当前 `searchExerciseResources` 旧字段查询行为。由于本 change 不回填旧数据、不切换 tool 合同，回滚风险主要集中在 Prisma migration 和共享类型；必要时通过后续 migration 调整字段定义。

## Open Questions

- 无。数据回填、LLM 辅助补齐和 tool 查询合同迁移均后续单独处理。
