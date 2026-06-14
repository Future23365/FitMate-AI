## Context

当前 `Exercise` 数据模型中，执行条件主要由 `equipment` / `equipmentZh` 和 `homeRequirement` / `homeRequirementZh` 表达。`equipment` 更接近动作使用的器械类别，`homeRequirement` 更接近动作执行环境或支撑条件，但二者并不是互斥维度：例如 `equipmentZh = "自重"` 的动作仍可能需要单杠、双杠、上斜凳或其他健身房固定设施；`homeRequirementZh = "地面/瑜伽垫"` 也不等于完全无器械。

当前动作源数据共有 873 个动作，`equipmentZh = "自重"` 的动作有 172 个，其中 22 个同时标记为 `homeRequirementZh = "健身房器械"`。这说明旧字段无法独立承担“用户没有器械时能做什么”的精确筛选合同。继续把旧字段暴露给模型，会让模型把“无外部训练器械”“无健身房固定设施”“地面/瑜伽垫可完成”“家里可完成”等不同语义混在一起。

生产 `/api/chat` 已迁移到 `LangChain Agent Runtime + DeepSeek native tool_calls`，`searchExerciseResources` 是动作库只读事实查询 tool。本 change 只调整 `Exercise` 资源的数据 taxonomy、repository 查询和 tool 模型可见合同，不调整 LangChain runtime 主循环、provider payload、response adapter 或 `/api/chat` 主链路。

## Goals / Non-Goals

**Goals:**

- 在数据库层新增清晰的动作执行条件 taxonomy，稳定表达器械需求、支撑/场地需求、准备复杂度、冲击程度和噪音程度。
- 完成当前动作库回填，让 `searchExerciseResources` 可以直接基于新字段执行结构化数据库筛选。
- 将 `searchExerciseResources` 的模型可见 input schema、description、examples 和 observation 从旧 `equipment` / `homeRequirement` 字段迁移到新字段。
- 保留旧字段用于历史导入、展示兼容和人工审查对照，但不再把旧字段作为模型可见查询字段。
- 保持 AI 边界：模型负责理解用户语义并选择结构化 tool input，服务端只执行 schema 校验、数据库事实查询、受控投影和 trace。

**Non-Goals:**

- 不删除数据库中的旧 `equipment` / `equipmentZh`、`homeRequirement` / `homeRequirementZh` 字段。
- 不新增服务端自然语言关键词、正则、同义词表、短句模板或 provider `tool_calls` 改写逻辑。
- 不新增新的动作推荐打分模型、语义搜索能力、分页能力或训练生成 tool。
- 不改变 `submitVisibleTrainingProposal` 的最终动作数据库事实校验。
- 不把 `isNoEquipment`、`isHomeFriendly`、`needsMat`、`requiresGym`、`isLowFriction` 等可派生布尔值持久化为新的事实字段。

## Decisions

### 1. 新增执行条件 taxonomy 字段，而不是重命名旧字段

`Exercise` 新增以下字段：

- `requiresExternalEquipment Boolean @default(false)`：动作是否需要外部训练器械。
- `requiredEquipmentTags String[] @default([])`：需要的训练器械标签，例如 `dumbbell`、`barbell`、`resistance_band`、`machine`、`cable`、`kettlebell`、`medicine_ball`、`foam_roller`、`ez_bar`、`stability_ball`、`other_equipment`。
- `supportRequirementTags String[] @default([])`：非训练器械但影响执行的支撑/场地需求，例如 `none`、`floor_or_mat`、`chair_or_wall`、`gym_fixture`、`partner`、`outdoor_space`。
- `setupComplexity String @default("unknown")`：准备复杂度，例如 `zero_setup`、`floor_or_mat`、`home_support`、`small_equipment`、`gym_fixture`、`partner`、`outdoor`、`unknown`。
- `impactLevel String?`：冲击程度，例如 `low`、`medium`、`high`。
- `noiseLevel String?`：噪音程度，例如 `quiet`、`normal`、`loud`。

选择该方案的原因是：旧字段仍有导入、展示和兼容价值，直接删除或重命名会扩大迁移风险，也会丢失人工审查线索。新增正交字段可以让新查询合同立即清晰，同时保留旧数据用于校对。

替代方案：直接把 `homeRequirement` 扩展成更多枚举。该方案仍会把器械和环境混在一个字段里，无法表达“自重但需要单杠/双杠”这类组合，因此不采用。

### 2. 使用字符串字段配合共享 taxonomy 常量，不使用 Prisma enum

taxonomy 取值在 TypeScript 中集中定义，例如 `lib/shared/exercises/execution-taxonomy.ts`，并通过 Zod schema、seed 校验、repository 输入校验和测试共享。Prisma 层使用 `String` / `String[]`，不使用数据库 enum。

选择该方案的原因是：动作 taxonomy 仍会随着数据审查继续细化。数据库 enum 每次增减取值都需要 migration，容易把小范围数据分类调整变成数据库结构变更；字符串字段加集中常量能保持强类型边界，又降低演进成本。

替代方案：使用 Prisma enum。该方案在取值稳定后可以考虑，但当前阶段会增加迁移成本，因此不采用。

### 3. 不持久化可派生布尔字段

不新增 `isNoEquipment`、`isHomeFriendly`、`needsMat`、`requiresPartner`、`requiresGym`、`isLowFriction` 等字段。这些语义由稳定 taxonomy 派生：

- “无外部训练器械”由 `requiresExternalEquipment = false` 表达。
- “不需要健身房固定设施”由 `supportRequirementTags` 不包含 `gym_fixture` 表达。
- “只需要地面/瑜伽垫”由 `requiresExternalEquipment = false` 且 `supportRequirementTags` 为 `floor_or_mat` 或等价低准备需求表达。
- “低门槛候选”由 `requiresExternalEquipment`、`supportRequirementTags`、`setupComplexity`、`impactLevel` 和 `noiseLevel` 在查询策略中组合派生。

选择该方案的原因是：派生布尔字段容易与源 taxonomy 漂移，后续每次修订 taxonomy 都要同步多个冗余字段。

### 4. 回填分为确定性映射和人工审查清单

第一轮回填采用确定性映射：

- `equipmentZh = "自重"` → `requiresExternalEquipment = false`、`requiredEquipmentTags = []`。
- 其他 `equipmentZh` 按映射表写入 `requiredEquipmentTags`，并设置 `requiresExternalEquipment = true`。
- `homeRequirementZh = "无器械"` → `supportRequirementTags = ["none"]`。
- `homeRequirementZh = "地面/瑜伽垫"` → `supportRequirementTags = ["floor_or_mat"]`。
- `homeRequirementZh = "椅子/墙面/支撑物"` → `supportRequirementTags = ["chair_or_wall"]`。
- `homeRequirementZh = "健身房器械"` → `supportRequirementTags = ["gym_fixture"]`。
- `homeRequirementZh = "搭档辅助"` → `supportRequirementTags = ["partner"]`。
- `homeRequirementZh = "户外场地"` → `supportRequirementTags = ["outdoor_space"]`。
- `homeRequirementZh = "居家小器械"` → `setupComplexity = "small_equipment"`，不写入 `supportRequirementTags`；具体小器械由 `equipmentZh` 映射到 `requiredEquipmentTags`。

对于 `equipmentZh = "自重"` 且 `homeRequirementZh = "健身房器械"` 的动作，回填结果应保留 `requiresExternalEquipment = false`，但写入 `supportRequirementTags = ["gym_fixture"]`，避免把单杠、双杠、上斜凳等固定设施误当作“家中无器械可完成”。

`impactLevel` 和 `noiseLevel` 不应通过不可靠名称关键词批量猜测；可以先保持 `null`，只对可确定动作或人工审查后的动作补齐。

### 5. 模型可见查询合同只暴露新 taxonomy

`searchExerciseResources` 的模型可见 input schema 不再包含 `equipment` 和 `homeRequirement`。模型应使用以下受控字段表达执行条件：

- `equipmentAvailability?: "no_external_equipment" | "external_equipment_required"`。
- `requiredEquipmentTags?: string[]`，表示查询动作本身所需的训练器械 tag，默认按“至少命中一个 tag”筛选；它不是用户完整器械库存白名单。
- `supportRequirementTags?: string[]`。
- `setupComplexityMax?: string` 或等价准备复杂度上限。
- `impactLevel?: string`。
- `noiseLevel?: string`。

模型可见 description 需要说明：

- 用户表达“没有器械/徒手/无外部器械”时，使用 `equipmentAvailability = "no_external_equipment"`。
- 用户表达“不去健身房/没有单杠双杠/家里做”时，使用 `supportRequirementTags` 或 `setupComplexityMax` 排除 `gym_fixture` 等支撑条件。
- 用户表达“地面/瑜伽垫可以”时，使用 `supportRequirementTags = ["floor_or_mat"]` 或等价字段。
- 用户表达“不要跳/低冲击”时，使用 `impactLevel`。
- 用户表达“晚上/公寓/不要吵”时，使用 `noiseLevel`。

这些说明属于 `searchExerciseResources` tool 的局部模型可见合同，不写入通用 Agent prompt，也不作为服务端自然语言分流规则。

### 6. Handler output 可以保留内部诊断，model observation 必须收口

`searchExerciseResources` handler output 和 trace 可以保留完整 `query.totalMatches`、旧字段审查线索或内部 diagnostics；但传给模型的 observation 只暴露模型需要继续推理的事实：

- 新 taxonomy 查询口径和返回动作摘要。
- `returnedCount`、`truncated`、zero-result 状态和必要 diagnostics。
- 新 taxonomy 动作事实字段。

模型可见 observation 不暴露旧 `equipment` / `equipmentZh`、`homeRequirement` / `homeRequirementZh`，也不把完整 `totalMatches` 作为模型继续优化查询的诱导信号。若需要调试完整命中数，使用 trace summary 或开发日志。

### 7. Taxonomy 不变量和 `setupComplexity` 排序固定在共享模块

新增 taxonomy 字段必须满足以下不变量：

- `requiresExternalEquipment = false` 时，`requiredEquipmentTags` 必须为空数组。
- `requiresExternalEquipment = true` 时，`requiredEquipmentTags` 必须至少包含一个合法 tag；无法细分但确定需要外部器械时使用 `other_equipment`，不得保持空数组。
- `supportRequirementTags = ["none"]` 只表示可确定无额外支撑/场地需求，并且必须与 `floor_or_mat`、`chair_or_wall`、`gym_fixture`、`partner`、`outdoor_space` 互斥。
- `supportRequirementTags = []` 表示当前数据源不能断言额外支撑/场地需求，不等同于 `["none"]`，也不得被模型或 repository 当作“零支撑需求”。
- `impactLevel = null`、`noiseLevel = null` 和 `setupComplexity = "unknown"` 表示该事实未知，不表示低冲击、安静或低准备复杂度。

`setupComplexityMax` 使用共享 taxonomy 模块导出的排序：

`zero_setup < floor_or_mat < home_support < small_equipment < gym_fixture < partner < outdoor`

`unknown` 不参与“小于等于”比较。repository 在收到 `setupComplexityMax` 时默认只返回已知且排序不高于上限的动作；没有传入 `setupComplexityMax` 时不得因为 `unknown` 自动排除动作。选择该方案的原因是：未知事实不能被当作低门槛候选，否则会再次把数据缺失伪装成执行条件满足。

### 8. 旧 `agent-exercise-resource-query-tool` spec 必须同步替换

本 change 不是在旧 `equipment` / `homeRequirement` 合同上补充新字段，而是替换模型可见执行条件合同。因此归档前必须同步修改既有 `agent-exercise-resource-query-tool` spec 中仍要求以下内容的段落：

- `equipment = "no_equipment"` 作为模型可见 input。
- `homeRequirement` 作为模型可见 input。
- `facetCatalog.equipment` / `facetCatalog.homeRequirements` 作为 Planner 可用执行条件 catalog。
- 模型可见 observation 暴露完整 `query.totalMatches`。

新的模型可见 catalog 应保留肌群、分类、难度、目标、风险、section 等数据库 facet，同时通过 `facetCatalog.executionTaxonomy` 或等价结构暴露 `equipmentAvailability`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexity`、`impactLevel` 和 `noiseLevel` 的受控取值与中文说明。

## Risks / Trade-offs

- [Risk] 第一轮回填存在动作分类不准确。  
  → Mitigation：回填脚本输出人工审查清单，尤其关注 `自重 + 健身房器械`、`其他`、`居家小器械`、`impactLevel` / `noiseLevel` 为空的动作；测试只要求确定性字段和可审查边界，不强行猜测不可确定语义。

- [Risk] 字符串字段可能写入未知 taxonomy 值。  
  → Mitigation：共享常量、Zod 校验、seed 校验、repository 输入 schema 和数据质量测试共同阻止未知值进入发布动作。

- [Risk] 旧字段继续存在，后续开发者可能误用。  
  → Mitigation：在共享类型注释、tool schema、repository tests 和 model-visible contract gate 中明确旧字段不得作为模型可见输入或 observation 字段。

- [Risk] 删除模型可见 `equipment` / `homeRequirement` 会影响已有 prompt examples。  
  → Mitigation：同一 change 中同步更新 tool description、schema description、examples、catalog 测试和黑盒/contract gate 测试，确保模型看到的是新字段。

- [Risk] 不向模型暴露完整 `totalMatches` 会减少模型对全库规模的判断。  
  → Mitigation：模型仍可看到 `returnedCount`、`truncated` 和 zero-result 事实；完整命中数保留在 trace / handler output 供调试，不作为规划输入。

## Migration Plan

1. 数据库阶段：
   - 新增 Prisma 字段和 migration。
   - 新增共享 taxonomy 常量、类型和 Zod 校验。
   - 更新 seed / 回填脚本，基于旧字段写入新字段，并输出人工审查报告。
   - 增加数据质量测试，确保发布动作的新 taxonomy 字段合法且关键字段不缺失。
2. Tool 合同阶段：
   - 更新 `searchExerciseResources` input schema，移除模型可见 `equipment` / `homeRequirement`，新增新 taxonomy 输入字段。
   - 更新 repository，将新 taxonomy 输入转换为数据库 `where` 条件。
   - 更新 tool description、schema description、examples、model observation、user projection 和 trace summary。
   - 更新 model-visible contract gate、production catalog、handler / repository 单测。
3. 验证阶段：
   - 运行 `openspec validate add-exercise-execution-taxonomy --strict`。
   - 运行 Prisma / seed / taxonomy 数据质量测试。
   - 运行 `searchExerciseResources` 相关 tool 单测和 catalog / contract gate 测试。
   - 运行 `npm run typecheck`，必要时运行 `npm test`。

## Rollback Strategy

如果数据库阶段上线后发现 taxonomy 回填存在严重问题，可以先让 `searchExerciseResources` 继续使用旧字段，保留新增字段不参与模型可见合同；修正回填后再进入 Tool 合同阶段。如果 Tool 合同阶段出现模型调用失败，可回滚 tool schema / description / repository 查询映射，同时保留数据库新增字段和回填数据，避免回滚数据库结构。

## Open Questions

- `impactLevel` 和 `noiseLevel` 第一轮只对人工可确定动作补齐，还是允许保守为空并在后续数据审查中逐步完善。
