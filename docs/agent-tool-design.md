# Agent Tool 设计：只读结构化动作查询 `searchExerciseResources`

本文设计一个新增业务 Agent tool：`searchExerciseResources`。

这个 tool 的职责是：接收 LLM 已经结构化后的动作库筛选条件，按当前 `Exercise` 数据库字段执行确定性筛选，并返回一组可用于普通问答的动作资源摘要。

本文只描述这个 tool 的合同，不表示系统只能注册这一个 tool。后续动作库统计、动作名称解析、动作详情读取、训练编排、草稿校验和保存能力应继续由各自单一职责 tool 承担。

## 设计结论

1. `searchExerciseResources` 是只读动作库查询 tool，不是训练生成 tool。
2. 这个 tool 对齐动作列表查询合同，主要服务“有哪些动作符合这些条件”这类事实查询。
3. 这个 tool 不替代执行型候选集合 builder。需要为 routine、plan、patch 生成候选集合时，应使用专门的候选集合 tool，并由该 tool 提供 `candidateSet` / fulfillment 证据。
4. 这个 tool 不负责单个动作详情解释。用户问“某个动作怎么做”时，应使用名称解析或详情读取 tool。
5. LLM 负责把用户自然语言理解为结构化入参；服务端只校验 schema、执行数据库筛选、返回事实投影。
6. 服务端不得通过关键词、正则、同义词表或用户原文特征改写 LLM 的高层语义判断。

## 与其他动作工具的边界

| 能力 | 应使用的 tool | `searchExerciseResources` 是否负责 |
| --- | --- | --- |
| 查询符合筛选条件的动作列表 | `searchExerciseResources` | 是 |
| 查询动作库总数、发布态数量、facet 统计 | `getExerciseLibrarySummary` 或等价统计 tool | 否 |
| 根据名称解析唯一动作 | `resolveExerciseByName` 或等价名称解析 tool | 否 |
| 读取某个动作的完整步骤和详情 | `getExerciseDetailByName` / `getExerciseById` 或等价详情 tool | 否 |
| 为 routine / plan / patch 构建可消费候选集合 | 执行型候选集合 tool | 否 |
| 生成训练编排、校验草稿、保存 artifact | 对应 draft / validate / policy / save tool | 否 |

## 设计原则

1. `searchExerciseResources` 只查动作库，不生成动作卡片、不生成训练编排、不校验草稿、不保存 artifact。
2. Tool 入参只包含当前动作列表查询支持的结构化筛选字段和排序字段。
3. Tool 不接收 `purpose`、`candidateUse`、`allowedExerciseIds`、`excludedExerciseIds`、`injuryLimitations`、`resultRequirements`、`rankingHints` 等消费侧或语义侧字段。
4. Tool 不接收 `limit`、`offset`、`page`、`pageSize` 等分页或数量控制参数；服务端内部使用固定最大返回数量保护，并在出参中明确 `maxReturned`、`totalMatches` 和 `truncated`。
5. Tool 默认只返回已发布动作。只有未来存在明确的管理员权限和 OpenSpec 设计时，才允许普通聊天 Agent 查询未发布动作。
6. Tool output 不默认完整回灌给模型或用户；实现时必须提供安全的 `toModelObservation` 和 `toUserProjection`。
7. Tool 成功执行后，普通事实回答应通过 `final_answer.usedRefs` 引用本轮 `satisfied=true` 的 `tool_result`。默认不产出可被下游训练生成链消费的 `candidate_set` resource。

## 当前支持的筛选字段来源

本设计以当前代码中的动作列表查询合同为准：

- `lib/shared/exercises/query-schema.ts`
- `lib/server/exercises/exercise-service.ts` 中的 `listExercises()`
- `prisma/schema.prisma` 中的 `Exercise` 模型字段

当前可用于 `searchExerciseResources` 的查询字段包括：

| 字段 | 来源 | 说明 |
| --- | --- | --- |
| `q` | `exerciseListQuerySchema.q` | 文本搜索 |
| `category` | `Exercise.category/categoryZh` | 动作分类 |
| `suitabilities` | `Exercise.allowedSections` / `getExerciseSuitability()` | 动作用途数组，按 warmup / training / stretch 分组查询 |
| `level` | `Exercise.level/levelZh` | 难度 |
| `force` | `Exercise.force/forceZh` | 发力类型 |
| `mechanic` | `Exercise.mechanic/mechanicZh` | 动作机制 |
| `equipment` | `Exercise.equipment/equipmentZh` | 器械 |
| `homeRequirement` | `Exercise.homeRequirement/homeRequirementZh` | 居家条件 |
| `muscles` | `Exercise.primaryMuscles/primaryMusclesZh/secondaryMuscles/secondaryMusclesZh` | 真实肌群 facet 数组，单个肌群也使用一项数组 |
| `goalTag` | `Exercise.goalTags` | 目标标签 |
| `riskTag` | `Exercise.riskTags` | 风险标签 |
| `published` | `Exercise.isPublished` | 是否已发布，默认 `true` |
| `sort` | `exerciseSortSchema` | 排序 |

## Tool：`searchExerciseResources`

### 功能

`searchExerciseResources` 接收结构化动作筛选参数，按当前动作库支持的字段查询 `Exercise` 数据，并返回动作资源列表和查询摘要。

这个 tool 只做：

- 校验查询参数结构、字段和枚举。
- 根据查询参数筛选动作数据。
- 返回服务端实际执行的筛选摘要。
- 返回内部截断后的动作资源摘要。
- 返回总命中数量和截断状态。

这个 tool 不做：

- 不判断用户真实训练意图。
- 不区分推荐卡片、编排卡片、替换动作或计划生成。
- 不接收 `allowedExerciseIds` / `excludedExerciseIds` 这类候选消费约束。
- 不接收 `injuryLimitations` 这类自然语言风险语义字段。
- 不接收 `requiresNoEquipment` 这类重复语义字段；自重或无器械应通过 `equipment` / `equipmentZh` 或 `homeRequirement` / `homeRequirementZh` 表达。
- 不生成 `candidateSetId`。
- 不产出可被 draft、validation、policy 或 save 消费的候选集合 resource。
- 不保存、发布或登记任何会话 artifact。
- 不直接生成前端 `responseEvent` 或业务卡片事件。

### 入参

```ts
type SearchExerciseResourcesInput = {
  q?: string;
  category?: string;
  suitabilities?: Array<"warmup" | "training" | "stretch">;
  level?: string;
  force?: string;
  mechanic?: string;
  equipment?: string;
  homeRequirement?: string;
  muscles?: string[];
  goalTag?: string;
  riskTag?: string;
  excludeExerciseIds?: string[];
  requiredExerciseIds?: string[];
  published?: boolean;
  sort?: "name_asc" | "name_desc" | "level_asc" | "level_desc" | "category_asc" | "category_desc";
};
```

### 入参字段说明

| 参数 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `q` | `string` | 否 | 文本搜索关键字。按动作库可检索文本做确定性匹配，不是语义向量召回 |
| `category` | `string` | 否 | 动作分类筛选，对应 `Exercise.category` 或 `Exercise.categoryZh` |
| `suitabilities` | `Array<"warmup" \| "training" \| "stretch">` | 否 | 动作用途数组；省略时按 `training` 查询，多个用途会分别返回 `groups.<section>` |
| `level` | `string` | 否 | 难度筛选，对应 `Exercise.level` 或 `Exercise.levelZh` |
| `force` | `string` | 否 | 发力类型筛选，对应 `Exercise.force` 或 `Exercise.forceZh` |
| `mechanic` | `string` | 否 | 动作机制筛选，对应 `Exercise.mechanic` 或 `Exercise.mechanicZh` |
| `equipment` | `string` | 否 | 器械可用性或器械类别筛选；`no_equipment` / `无器械` 表示不需要外部器械 |
| `homeRequirement` | `string` | 否 | 环境、场地或支撑条件筛选；不表示器械可用性 |
| `muscles` | `string[]` | 否 | 一个或多个真实肌群 facet 的 OR 查询数组；单个肌群也写成一项数组，不使用 `muscle` |
| `goalTag` | `string` | 否 | 目标标签筛选，对应 `Exercise.goalTags` |
| `riskTag` | `string` | 否 | 风险标签筛选，对应 `Exercise.riskTags`；这里只查标签，不做伤病语义判断 |
| `excludeExerciseIds` | `string[]` | 否 | 明确替换、排除或避免重复时使用的负向动作 id 列表，只能来自当前 run 可见事实或用户明确排除 |
| `requiredExerciseIds` | `string[]` | 否 | 正向查询锚点；当前 run 已有受控发布态动作 id 时，让这些动作优先进入对应 `groups.<section>.exercises` |
| `published` | `boolean` | 否 | 是否只返回已发布动作；缺省为 `true` |
| `sort` | 枚举 | 否 | 排序方式；缺省为 `name_asc` |

### 精确 facet 可用值摘要

`searchExerciseResources` 的精确 facet 字段会直接匹配数据库字段，不做服务端同义词或旧别名改写。模型可见说明和 examples 必须使用当前动作库真实值。

| 字段 | 当前可用值摘要 |
| --- | --- |
| `level` | `beginner` / `初级`、`intermediate` / `中级`、`expert` / `高级` |
| `equipment` | `no_equipment` / `无器械`、`body only` / `自重`、`dumbbell` / `哑铃`、`barbell` / `杠铃`、`bands` / `弹力带`、`machine` / `固定器械`、`cable` / `绳索器械`、`kettlebells` / `壶铃`、`medicine ball` / `药球`、`exercise ball` / `健身球`、`foam roll` / `泡沫轴`、`e-z curl bar` / `EZ 曲杆`、`other` / `其他` |
| `homeRequirement` | `floor` / `地面/瑜伽垫`、`support` / `椅子/墙面/支撑物`、`small_equipment` / `居家小器械`、`gym_equipment` / `健身房器械`、`partner` / `搭档辅助`、`outdoor` / `户外场地` |

### 入参默认值

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `published` | `true` | 普通聊天默认只查询可面向用户展示的动作 |
| `sort` | `"name_asc"` | 默认按中文动作名升序 |

### 出参

```ts
type SearchExerciseResourcesOutput = {
  status: "succeeded";
  query: {
    suitabilities: Array<"warmup" | "training" | "stretch">;
    sort: "name_asc" | "name_desc" | "level_asc" | "level_desc" | "category_asc" | "category_desc";
    published: true;
    appliedFilters: SearchExerciseAppliedFilter[];
    muscles?: string[];
    excludeExerciseIds?: string[];
    requiredExerciseIds?: string[];
    totalMatches: number;
    returnedCount: number;
    maxReturned: number;
    truncated: boolean;
    excludedCount: number;
  };
  groups: Partial<Record<"warmup" | "training" | "stretch", {
    suitability: "warmup" | "training" | "stretch";
    totalMatches: number;
    returnedCount: number;
    truncated: boolean;
    exercises: SearchExerciseResource[];
  }>>;
  diagnostics: Array<{
    suitability: "warmup" | "training" | "stretch";
    code: string;
    message: string;
    exerciseId?: string;
    conflictFields?: string[];
  }>;
};
```

### 出参字段说明

| 字段 | 含义 |
| --- | --- |
| `status` | 成功状态，固定为 `succeeded` |
| `query.suitabilities` | 本次查询的用途数组 |
| `query.sort` | 本次实际使用的排序方式 |
| `query.published` | 本次实际使用的发布态口径 |
| `query.appliedFilters` | 服务端实际执行的筛选条件摘要 |
| `query.muscles` | 本次使用的真实肌群 facet 数组 |
| `query.excludeExerciseIds` | 本次应用的负向排除动作 id |
| `query.requiredExerciseIds` | 本次应用的正向锚点动作 id |
| `query.totalMatches` | 筛选后总命中数量 |
| `query.returnedCount` | 本次返回给模型和用户投影的动作数量 |
| `query.maxReturned` | 服务端内部最大返回数量 |
| `query.truncated` | 是否因为内部最大返回数量被截断 |
| `query.excludedCount` | 因 `excludeExerciseIds` 被排除的命中数量 |
| `groups` | 按 `groups.<section>` 分组的动作资源摘要列表 |
| `diagnostics` | 指定动作未命中、未发布、section 冲突、排除冲突或筛选不匹配等结构化诊断 |

#### `SearchExerciseAppliedFilter`

```ts
type SearchExerciseAppliedFilter = {
  field: keyof SearchExerciseResourcesInput;
  value: string | boolean | string[];
};
```

| 字段 | 含义 |
| --- | --- |
| `field` | 被执行的查询字段 |
| `value` | 被执行的查询值 |

#### `SearchExerciseResource`

```ts
type SearchExerciseResource = {
  id: string;
  nameZh: string;
  nameEn: string;
  category?: string | null;
  categoryZh?: string | null;
  level?: string | null;
  levelZh?: string | null;
  force?: string | null;
  forceZh?: string | null;
  mechanic?: string | null;
  mechanicZh?: string | null;
  equipment?: string | null;
  equipmentZh?: string | null;
  homeRequirement: string;
  homeRequirementZh: string;
  primaryMuscles: string[];
  primaryMusclesZh: string[];
  secondaryMuscles: string[];
  secondaryMusclesZh: string[];
  allowedSections: string[];
  goalTags: string[];
  riskTags: string[];
  imageUrls: string[];
  isPublished: boolean;
};
```

### 动作字段说明

| 字段 | 含义 |
| --- | --- |
| `id` | 动作 id |
| `nameZh` | 中文动作名 |
| `nameEn` | 英文动作名 |
| `category` / `categoryZh` | 动作分类 |
| `level` / `levelZh` | 动作难度 |
| `force` / `forceZh` | 发力类型 |
| `mechanic` / `mechanicZh` | 动作机制 |
| `equipment` / `equipmentZh` | 器械 |
| `homeRequirement` / `homeRequirementZh` | 居家条件 |
| `primaryMuscles` / `primaryMusclesZh` | 主肌群 |
| `secondaryMuscles` / `secondaryMusclesZh` | 辅助肌群 |
| `allowedSections` | 动作用途适配度，例如 `warmup`、`training`、`stretch` |
| `goalTags` | 目标标签 |
| `riskTags` | 风险标签 |
| `imageUrls` | 动作图片 URL |
| `isPublished` | 是否已发布 |

## Fulfillment 与资源边界

`searchExerciseResources` 是只读事实查询 tool。默认设计如下：

```ts
type SearchExerciseResourcesFulfillment = {
  satisfied: boolean;
  summary: string;
};
```

规则：

1. 查询参数合法、数据库读取完成，表示 tool output 的 `status` 可以是 `succeeded`，但不代表用户筛选目标已经被满足。
2. `query.totalMatches > 0` 时，fulfillment 应为 `satisfied = true`，可以通过 `final_answer.usedRefs: [{ type: "tool_result", id: "..." }]` 支撑普通 `final_answer`。
3. `query.totalMatches = 0` 时，fulfillment 仍表示已完成事实查询，可用于说明当前发布态动作库没有匹配结果；如果 input 过宽或缺少可解释约束，fulfillment 应为 `satisfied = false`，只能用于失败解释、澄清或后续重查。
4. 数据库不可用、handler exception 或 output schema 失败应由 Executor 归一为 failed `ToolResult`，不得伪装成成功 output。
5. 默认不登记 ResourceStore resource。final answer 使用 `usedRefs` 引用本轮成功且 `satisfied=true` 的 `tool_result`。
6. 如果未来需要让其他 tool 消费该查询结果，必须新增专用 resource type，并通过 OpenSpec 明确它不是 `candidate_set`，也不能被 routine / plan / patch 链路误消费。

## 模型观察与用户投影

实现时应提供安全投影：

### `toModelObservation`

模型可见摘要应包含：

- `toolResultId`
- `totalMatches`
- `returnedCount`
- `truncated`
- `excludedCount`
- `availableSections`
- `sectionSummary`
- `missingSectionsForRoutineOrPlan`
- `supportsOutputKinds`
- `appliedFilters`
- 按 `groups.<section>` 分组的有限动作摘要：`exerciseId`、`nameZh`、`nameEn`、`equipmentZh`、`homeRequirementZh`、`primaryMusclesZh`、`allowedSections`

模型可见摘要不应包含：

- 完整动作库。
- 内部数据库对象。
- 训练生成候选证据。
- 与当前查询无关的 handler 诊断细节。

### `toUserProjection`

用户可见投影应包含：

- 查询口径。
- 命中数量和是否截断。
- 可展示动作摘要。

用户可见投影不应直接生成训练卡片、routine 卡片、plan 卡片或保存结果事件。

## 错误处理

错误不作为成功 output 的 union 分支返回。实现时按 Agent core 统一错误边界处理：

| 场景 | 处理方式 |
| --- | --- |
| 未知字段 | `inputSchema.strict()` 拒绝，进入 `INVALID_TOOL_INPUT` |
| 非法 `suitabilities` / `sort` 枚举 | `inputSchema` 拒绝，进入 `INVALID_TOOL_INPUT` |
| 字符串过长或类型错误 | `inputSchema` 拒绝，进入 `INVALID_TOOL_INPUT` |
| 数据库不可用 | handler 失败，由 Executor 归一为 failed `ToolResult` |
| output 不符合 schema | Executor 返回 `INVALID_TOOL_OUTPUT` |

## 示例

### 查询自重股四头肌训练动作

```ts
{
  "equipment": "no_equipment",
  "muscles": ["股四头肌"],
  "suitabilities": ["training"],
  "published": true,
  "sort": "name_asc"
}
```

### 查询多个真实肌群训练动作

```ts
{
  "muscles": ["股四头肌", "腘绳肌"],
  "suitabilities": ["training"],
  "published": true,
  "sort": "name_asc"
}
```

### 查询适合热身的无器械动作

```ts
{
  "suitabilities": ["warmup"],
  "equipment": "no_equipment",
  "published": true
}
```

### 查询带高冲击风险标签的动作

```ts
{
  "riskTag": "high_impact",
  "published": true
}
```

### 查询弹力带动作

```ts
{
  "equipment": "bands",
  "published": true,
  "sort": "category_asc"
}
```

## 不支持的入参

以下字段不属于当前 `searchExerciseResources` 设计：

| 字段 | 不支持原因 |
| --- | --- |
| `purpose` | 这是后续消费场景，不是动作数据库筛选字段 |
| `candidateUse` | 这是后续消费场景，不是动作数据库筛选字段 |
| `allowedExerciseIds` | 这是候选裁剪或引用约束，不是基础动作库筛选字段 |
| `excludedExerciseIds` | 这是消费侧排除逻辑，不是基础动作库筛选字段 |
| `muscle` | 旧单值肌群字段已收敛为 `muscles`；单个肌群也使用一项数组 |
| `bodyRegions` | 高层身体区域不属于真实数据库 facet；模型应基于 `facetCatalog.muscles` 选择真实肌群 |
| `injuryLimitations` | 这是自然语言风险语义，不应由检索 tool 判断 |
| `requiresNoEquipment` | 与 `equipment` 重复；无外部器械应使用 `equipment = "no_equipment"` 或 `equipment = "无器械"` |
| `resultRequirements` | 这是执行型候选集合的履约合同，不属于动作列表查询 |
| `movementPatterns` | 当前动作列表查询 schema 未暴露该筛选字段，基础 tool 不先设计 |
| `rankingHints` | 当前目标是按数据库支持字段筛选，不设计额外排序提示 |
| `limit` / `offset` / `page` / `pageSize` | 分页和数量控制不暴露给 LLM；服务端内部自行保护最大返回量 |

## 最小可验收标准

1. 本 change 只新增或实现 `searchExerciseResources` 这一个结构化动作查询 tool，不把它写成系统唯一 tool。
2. Tool 入参只包含当前动作列表查询支持的结构化筛选字段和排序字段。
3. Tool 缺省只查询 `published = true` 的动作。
4. Tool 不返回 `candidateSetId`，不产出 `candidate_set` resource。
5. Tool 不生成卡片、不校验草稿、不保存 artifact、不输出业务 `responseEvent`。
6. Tool 出参必须包含 `totalMatches`、`returnedCount`、`maxReturned` 和 `truncated`。
7. Tool 对未知字段和非法枚举通过 schema 拒绝。
8. Tool 必须提供安全的模型观察和用户投影，不能把完整 handler output 默认暴露给模型或用户。
9. Tool-level tests 必须直接覆盖 handler 或 `executeTool` 成功路径、schema 拒绝、空结果、默认发布态口径、截断摘要、projection / redaction 和失败归一化。
