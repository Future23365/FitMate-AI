# Agent Tool 设计：`searchExerciseResources`

本文只保留一个 Agent tool：`searchExerciseResources`。

这个 tool 的唯一职责是：根据当前动作数据库和动作列表查询接口已经支持的筛选字段，筛选并返回动作数据。

## 设计原则

1. `searchExerciseResources` 只查动作库，不生成动作卡片、不生成训练编排、不校验草稿、不保存 artifact。
2. LLM 负责把用户自然语言理解成结构化查询参数；服务端只执行这些参数对应的确定性数据库筛选。
3. Tool 入参只包含当前动作查询已支持的字段，不引入候选裁剪、历史排除、伤病语义判断、卡片用途或编排用途。
4. Tool 失败只返回结构化查询错误；不建议下一个 tool，也不替 LLM 决定后续流程。

## 当前支持的筛选字段来源

本设计以当前代码中的动作列表查询合同为准：

- `lib/shared/exercises/query-schema.ts`
- `prisma/schema.prisma` 中的 `Exercise` 模型字段

当前可用于 `searchExerciseResources` 的查询字段包括：

| 字段 | 来源 | 说明 |
| --- | --- | --- |
| `q` | `exerciseListQuerySchema.q` | 文本搜索 |
| `category` | `Exercise.category/categoryZh` | 动作分类 |
| `suitability` | `Exercise.allowedSections` | 动作用途适配度 |
| `level` | `Exercise.level/levelZh` | 难度 |
| `force` | `Exercise.force/forceZh` | 发力类型 |
| `mechanic` | `Exercise.mechanic/mechanicZh` | 动作机制 |
| `equipment` | `Exercise.equipment/equipmentZh` | 器械 |
| `homeRequirement` | `Exercise.homeRequirement/homeRequirementZh` | 居家条件 |
| `muscle` | `Exercise.primaryMuscles/secondaryMuscles` 及中文字段 | 肌群 |
| `goalTag` | `Exercise.goalTags` | 目标标签 |
| `riskTag` | `Exercise.riskTags` | 风险标签 |
| `published` | `Exercise.isPublished` | 是否已发布 |
| `sort` | `exerciseSortSchema` | 排序 |
| `limit` / `offset` | `exerciseListQuerySchema` | 数量与偏移 |

## Tool：`searchExerciseResources`

### 功能

`searchExerciseResources` 接收结构化动作查询参数，按当前动作库支持的字段查询 `Exercise` 数据，并返回动作列表。

这个 tool 只做：

- 校验查询参数结构、枚举值、分页数量。
- 根据查询参数筛选动作数据。
- 返回动作数据和本次查询摘要。

这个 tool 不做：

- 不判断用户真实训练意图。
- 不区分动作卡片、编排卡片、替换动作或计划生成。
- 不接收 `allowedExerciseIds` / `excludedExerciseIds` 这类候选消费约束。
- 不接收 `injuryLimitations` 这类自然语言风险语义字段。
- 不接收 `requiresNoEquipment` 这类重复语义字段；徒手或无器械应通过 `equipment` 或 `homeRequirement` 表达。
- 不生成 `candidateSetId`。
- 不保存、发布或登记任何会话 artifact。

### 入参

```ts
type SearchExerciseResourcesInput = {
  q?: string;
  category?: string;
  suitability?: "warmup" | "training" | "stretch";
  level?: string;
  force?: string;
  mechanic?: string;
  equipment?: string;
  homeRequirement?: string;
  muscle?: string;
  goalTag?: string;
  riskTag?: string;
  published?: boolean;
  sort?: "name_asc" | "name_desc" | "level_asc" | "level_desc" | "category_asc" | "category_desc";
  limit?: number;
  offset?: number;
};
```

### 入参字段说明

| 参数 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `q` | `string` | 否 | 文本搜索关键字。可匹配动作名称、分类、肌群、器械、说明或可检索文本 |
| `category` | `string` | 否 | 动作分类筛选，对应 `Exercise.category` 或 `Exercise.categoryZh` |
| `suitability` | `"warmup" \| "training" \| "stretch"` | 否 | 动作用途适配度筛选，对应 `Exercise.allowedSections` |
| `level` | `string` | 否 | 难度筛选，对应 `Exercise.level` 或 `Exercise.levelZh` |
| `force` | `string` | 否 | 发力类型筛选，对应 `Exercise.force` 或 `Exercise.forceZh` |
| `mechanic` | `string` | 否 | 动作机制筛选，对应 `Exercise.mechanic` 或 `Exercise.mechanicZh` |
| `equipment` | `string` | 否 | 器械筛选，对应 `Exercise.equipment` 或 `Exercise.equipmentZh` |
| `homeRequirement` | `string` | 否 | 居家条件筛选，对应 `Exercise.homeRequirement` 或 `Exercise.homeRequirementZh` |
| `muscle` | `string` | 否 | 肌群筛选，对应 `primaryMuscles`、`primaryMusclesZh`、`secondaryMuscles`、`secondaryMusclesZh` |
| `goalTag` | `string` | 否 | 目标标签筛选，对应 `Exercise.goalTags` |
| `riskTag` | `string` | 否 | 风险标签筛选，对应 `Exercise.riskTags` |
| `published` | `boolean` | 否 | 是否只返回已发布动作，对应 `Exercise.isPublished` |
| `sort` | 枚举 | 否 | 排序方式。缺省由服务端使用默认排序 |
| `limit` | `number` | 否 | 返回数量上限。服务端必须设置最大值保护 |
| `offset` | `number` | 否 | 查询偏移量，用于分页 |

### 出参

```ts
type SearchExerciseResourcesOutput = {
  total: number;
  returnedCount: number;
  limit: number;
  offset: number;
  sort: "name_asc" | "name_desc" | "level_asc" | "level_desc" | "category_asc" | "category_desc";
  appliedFilters: SearchExerciseAppliedFilter[];
  exercises: SearchExerciseResource[];
};
```

### 出参字段说明

| 字段 | 含义 |
| --- | --- |
| `total` | 满足筛选条件的动作总数 |
| `returnedCount` | 本次实际返回的动作数量 |
| `limit` | 本次实际使用的返回数量上限 |
| `offset` | 本次实际使用的偏移量 |
| `sort` | 本次实际使用的排序方式 |
| `appliedFilters` | 服务端实际执行的筛选条件摘要 |
| `exercises` | 动作数据列表 |

#### `SearchExerciseAppliedFilter`

```ts
type SearchExerciseAppliedFilter = {
  field: keyof SearchExerciseResourcesInput;
  value: string | boolean | number;
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
| `allowedSections` | 动作用途适配度，例如 warmup、training、stretch |
| `goalTags` | 目标标签 |
| `riskTags` | 风险标签 |
| `imageUrls` | 动作图片 URL |
| `isPublished` | 是否已发布 |

## 错误返回

```ts
type SearchExerciseResourcesError = {
  status: "failed";
  code: "invalid_input" | "invalid_enum" | "invalid_pagination" | "database_unavailable";
  field?: keyof SearchExerciseResourcesInput;
  message: string;
};
```

| 字段 | 含义 |
| --- | --- |
| `status` | 固定为 `failed` |
| `code` | 机器可读错误码 |
| `field` | 出错字段 |
| `message` | 错误说明 |

## 示例

### 查询徒手腿部训练动作

```ts
{
  "q": "腿部",
  "equipment": "徒手",
  "level": "beginner",
  "published": true,
  "sort": "name_asc",
  "limit": 12,
  "offset": 0
}
```

### 查询适合热身的动作

```ts
{
  "suitability": "warmup",
  "homeRequirement": "居家",
  "published": true,
  "limit": 10
}
```

### 查询带风险标签的动作

```ts
{
  "riskTag": "knee",
  "published": true,
  "limit": 20
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
| `injuryLimitations` | 这是自然语言风险语义，不应由检索 tool 判断 |
| `requiresNoEquipment` | 与 `equipment` / `homeRequirement` 重复，应使用已有筛选字段表达 |
| `movementPatterns` | 当前动作列表查询 schema 未暴露该筛选字段，基础 tool 不先设计 |
| `rankingHints` | 当前目标是按数据库支持字段筛选，不设计额外排序提示 |

## 最小可验收标准

1. 系统只注册 `searchExerciseResources` 这一个 Agent tool。
2. Tool 入参只包含当前动作查询支持的筛选、排序和分页字段。
3. Tool 不返回 `candidateSetId`，只返回筛选得到的动作数据。
4. Tool 不生成卡片、不校验草稿、不保存 artifact、不输出 `responseEvent`。
5. Tool 对未知字段、非法枚举和非法分页返回结构化错误。
