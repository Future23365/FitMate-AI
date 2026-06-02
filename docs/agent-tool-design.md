# Agent Tool 基础设计：动作卡片与编排卡片

本文只描述基础闭环：用户通过聊天让系统推送动作卡片或训练编排卡片。设计不依赖当前已有实现，目标是重新固定 Agent tool 的职责边界：

> LLM 产出语义草稿，Tool 只做检索、校验、资源登记和保存。

## 设计结论

基础能力需要 4 个 tool：

| Tool | 类型 | 核心职责 |
| --- | --- | --- |
| `searchExerciseResources` | 检索 | 根据 LLM 给出的结构化条件检索数据库动作，登记 `candidateSetId` |
| `validateExerciseCardDraft` | 校验 + 资源登记 | 校验 LLM 写出的动作卡片草稿，登记 `exerciseCardDraftId` |
| `validateRoutineCardDraft` | 校验 + 资源登记 | 校验 LLM 写出的编排卡片草稿，登记 `routineCardDraftId` |
| `saveConversationCardArtifact` | 保存 | 从已登记 draft 恢复完整 payload，保存会话卡片 artifact/revision |

不建议把动作卡片和编排卡片的校验合并成一个 tool。动作卡片校验重点是候选动作、推荐理由和单项处方；编排卡片校验重点是 section、训练顺序、处方结构、总时长和动作覆盖。合并后 schema 会过宽，LLM 更容易把字段写错层级。

## 总体链路

```text
用户自然语言
  ↓
LLM 理解语义，决定需要动作卡片或编排卡片
  ↓
searchExerciseResources
  ↓
LLM 基于候选动作写语义草稿
  ↓
validateExerciseCardDraft / validateRoutineCardDraft
  ↓
saveConversationCardArtifact
  ↓
Response Writer 推送动作卡片 / 编排卡片
```

## 边界原则

1. LLM 是语义来源。用户目标、训练偏好、调整方向、卡片标题、推荐理由、编排意图都由 LLM 产出。
2. Tool 不读取用户原文做关键词判断，不根据自然语言改写 LLM 的高层语义。
3. Tool 只执行结构化入参表达的确定性操作，包括检索、存在性校验、权限校验、候选集合校验、结构校验、资源登记和保存。
4. Tool 成功结果必须返回可追踪资源 id，后续 tool 通过资源 id 消费服务端保存的完整 payload，而不是要求 LLM 重放大 JSON。
5. Tool 失败时返回结构化 diagnostics，LLM 可以据此重新检索、重写草稿或向用户澄清；Tool 不自动修复语义草稿。

## 隐式上下文

以下字段由服务端运行时注入，不允许 LLM 在 tool 入参中提供：

| 字段 | 含义 |
| --- | --- |
| `userId` | 当前用户 id，用于动作可见性、会话数据和 artifact 权限隔离 |
| `conversationId` | 当前会话 id，用于绑定本轮生成的卡片 artifact |
| `agentRunId` | 当前 Agent run id，用于约束资源只能在本轮或允许的会话上下文中消费 |
| `traceId` | 当前 AI trace id，用于记录 tool decision、tool result 和后续消费关系 |
| `locale` | 当前默认展示语言；LLM 可以在入参中要求输出语言，但最终权限和环境上下文来自服务端 |
| `now` | 服务端当前时间，用于 artifact revision、trace 和幂等判断 |

这些字段必须进入权限校验和 trace，但不应该进入 LLM 可写 schema。

## 通用 Tool Result 外壳

每个 tool 都应该返回统一外壳，便于 Agent runtime 判断结果是否可被后续步骤消费。

```ts
type AgentToolResultEnvelope<TOutput> = {
  toolResultId: string;
  toolName: string;
  status: "success" | "failed";
  satisfied: boolean;
  output?: TOutput;
  diagnostics?: AgentToolDiagnostic[];
  evidence: AgentToolEvidence;
  modelSummary: string;
  traceSummary: AgentToolTraceSummary;
};
```

### 通用出参字段说明

| 字段 | 含义 |
| --- | --- |
| `toolResultId` | 本次 tool 执行结果 id。后续 tool 可以通过具体资源 id 消费结果，但 trace 仍应保留 `toolResultId` |
| `toolName` | 执行的 tool 名称 |
| `status` | 执行状态。`success` 表示 schema、权限和确定性执行通过；`failed` 表示本次结果不可直接作为写入依据 |
| `satisfied` | 本次 tool 是否满足 LLM 在入参中表达的结构化请求。`status = "success"` 但 `satisfied = false` 时，结果只能用于解释或澄清，不能作为 draft/save 依赖 |
| `output` | tool 成功时的结构化输出 |
| `diagnostics` | tool 失败或部分满足时的结构化诊断信息 |
| `evidence` | 执行证据，例如应用了哪些 hard filters、校验了哪些 resource id、保存了哪个 revision |
| `modelSummary` | 给下一轮 LLM 看的短摘要，只包含决策必要信息，不包含完整 payload |
| `traceSummary` | 给 trace/debug UI 使用的摘要，可以包含更多工程调试字段，但必须脱敏 |

### 通用 Diagnostic

```ts
type AgentToolDiagnostic = {
  path?: string;
  code:
    | "invalid_input"
    | "candidate_set_not_found"
    | "candidate_set_unsatisfied"
    | "exercise_not_found"
    | "exercise_not_in_candidate_set"
    | "draft_invalid"
    | "draft_not_found"
    | "validation_not_found"
    | "permission_denied"
    | "persistence_failed"
    | "needs_more_candidates";
  message: string;
  recoverable: boolean;
  suggestedNextTool?: "searchExerciseResources" | "validateExerciseCardDraft" | "validateRoutineCardDraft" | "saveConversationCardArtifact";
};
```

| 字段 | 含义 |
| --- | --- |
| `path` | 出错字段路径，例如 `items[0].exerciseId` 或 `routine.sections[1].exercises[2].prescription.sets` |
| `code` | 机器可读错误码 |
| `message` | 给 LLM 和 trace 使用的简短错误说明，不直接等同于用户可见文案 |
| `recoverable` | 是否可以通过重新检索、重写草稿或补字段恢复 |
| `suggestedNextTool` | 可选建议下一步 tool。它只能描述结构恢复路径，不能替 LLM 判断用户语义 |

## Tool 1：`searchExerciseResources`

### 功能

`searchExerciseResources` 根据 LLM 提供的结构化约束检索数据库动作，返回可被后续 draft 校验消费的候选集合。

这个 tool 只做检索和资源登记：

- 根据 `hardConstraints` 执行确定性过滤。
- 根据 `softPreferences` 做排序、加权或多样性处理。
- 返回 `candidateSetId`，服务端保存完整候选动作 payload。
- 给 LLM 返回精简候选摘要，供 LLM 写动作卡片或编排卡片草稿。

这个 tool 不做：

- 不判断用户到底是不是想练胸、减脂、康复或增肌。
- 不替 LLM 决定最终推荐哪些动作。
- 不生成卡片标题、推荐理由或训练编排。
- 不把泛化 `query` 当作唯一 hard filter 清空候选。

### 入参

```ts
type SearchExerciseResourcesInput = {
  purpose: "exercise_card" | "routine_card";
  candidateUse:
    | "exercise_recommendation"
    | "routine_warmup"
    | "routine_main"
    | "routine_accessory"
    | "routine_cooldown"
    | "routine_any";
  hardConstraints?: ExerciseHardConstraints;
  softPreferences?: ExerciseSoftPreferences;
  resultRequirements: ExerciseSearchResultRequirements;
};
```

#### 顶层参数说明

| 参数 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `purpose` | `"exercise_card" \| "routine_card"` | 是 | 本次检索服务于动作卡片还是编排卡片。它影响结果摘要形态和后续可消费场景，不代表 Tool 判断用户意图 |
| `candidateUse` | 枚举 | 是 | 候选集合用途。编排卡片可以按 warmup/main/cooldown 分多次检索 |
| `hardConstraints` | object | 否 | 必须严格满足的结构化条件。Tool 可以据此过滤数据库 |
| `softPreferences` | object | 否 | 偏好条件。Tool 可以用于排序、加权、多样性，不应作为硬拒绝依据 |
| `resultRequirements` | object | 是 | LLM 对候选数量、投影字段和多样性的要求 |

#### `ExerciseHardConstraints`

```ts
type ExerciseHardConstraints = {
  bodyRegions?: BodyRegion[];
  primaryMuscles?: string[];
  equipment?: string[];
  environment?: "home" | "gym" | "outdoor" | "any";
  level?: "beginner" | "intermediate" | "advanced";
  allowedExerciseIds?: string[];
  excludedExerciseIds?: string[];
  injuryLimitations?: string[];
  requiresNoEquipment?: boolean;
};
```

| 参数 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `bodyRegions` | `BodyRegion[]` | 否 | 必须覆盖的身体区域，例如 `chest`、`back`、`legs`。Tool 只按动作元数据过滤，不判断用户语义是否正确 |
| `primaryMuscles` | `string[]` | 否 | 必须命中的主训练肌群。值应来自系统动作库肌群标识 |
| `equipment` | `string[]` | 否 | 允许使用的器械集合。Tool 应按数据库器械字段过滤 |
| `environment` | `"home" \| "gym" \| "outdoor" \| "any"` | 否 | 训练环境约束。`any` 表示不按环境过滤 |
| `level` | `"beginner" \| "intermediate" \| "advanced"` | 否 | 动作难度上限或目标难度。具体实现应定义为确定性枚举匹配或等级范围 |
| `allowedExerciseIds` | `string[]` | 否 | 候选必须限制在这些动作 id 内，常用于后续引用已有候选池 |
| `excludedExerciseIds` | `string[]` | 否 | 必须排除的动作 id |
| `injuryLimitations` | `string[]` | 否 | LLM 结构化提取的限制标签。Tool 只能按已有动作禁忌或限制元数据过滤，不生成医疗建议 |
| `requiresNoEquipment` | `boolean` | 否 | 是否强制徒手动作。为 `true` 时应与 `equipment` 做字段自洽校验 |

#### `ExerciseSoftPreferences`

```ts
type ExerciseSoftPreferences = {
  goals?: TrainingGoal[];
  movementPatterns?: string[];
  preferredEquipment?: string[];
  avoidRecentlyUsed?: boolean;
  diversity?: {
    byBodyRegion?: boolean;
    byMovementPattern?: boolean;
    byEquipment?: boolean;
  };
  query?: string;
};
```

| 参数 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `goals` | `TrainingGoal[]` | 否 | 训练目标偏好，例如 strength、hypertrophy、fat_loss、mobility。用于排序，不直接决定最终卡片内容 |
| `movementPatterns` | `string[]` | 否 | 偏好的动作模式，例如 squat、hinge、push、pull、carry、rotation |
| `preferredEquipment` | `string[]` | 否 | 偏好器械。区别于 `hardConstraints.equipment`，这里不应该硬过滤 |
| `avoidRecentlyUsed` | `boolean` | 否 | 是否降低近期已推荐或已训练动作的排序权重 |
| `diversity.byBodyRegion` | `boolean` | 否 | 是否尽量让返回结果覆盖不同身体区域 |
| `diversity.byMovementPattern` | `boolean` | 否 | 是否尽量覆盖不同动作模式 |
| `diversity.byEquipment` | `boolean` | 否 | 是否尽量覆盖不同器械 |
| `query` | `string` | 否 | LLM 给出的自然语言检索提示，只能用于文本召回或排序，不能覆盖结构化 hard constraints |

#### `ExerciseSearchResultRequirements`

```ts
type ExerciseSearchResultRequirements = {
  minCandidates?: number;
  maxCandidates: number;
  projection: "model_summary" | "card_ready_summary";
  includeAlternatives?: boolean;
};
```

| 参数 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `minCandidates` | `number` | 否 | LLM 期望的最少候选数量。无法满足时 Tool 返回 `satisfied = false` 和 diagnostics |
| `maxCandidates` | `number` | 是 | 返回给 LLM 的最大候选数量。服务端可设置上限防止 token 膨胀 |
| `projection` | `"model_summary" \| "card_ready_summary"` | 是 | 返回字段投影。`model_summary` 更瘦；`card_ready_summary` 可包含更多卡片展示所需摘要 |
| `includeAlternatives` | `boolean` | 否 | 是否要求候选中包含替代动作，供 LLM 在草稿中自行选择 |

### 出参

```ts
type SearchExerciseResourcesOutput = {
  candidateSetId: string;
  purpose: "exercise_card" | "routine_card";
  candidateUse: SearchExerciseResourcesInput["candidateUse"];
  totalMatched: number;
  returnedCount: number;
  candidates: ExerciseCandidateSummary[];
  appliedFilters: {
    hardConstraints: string[];
    softPreferences: string[];
  };
};
```

#### 出参字段说明

| 字段 | 含义 |
| --- | --- |
| `candidateSetId` | 服务端登记的候选集合 id。后续 validate tool 必须通过它校验 `exerciseId` 来源 |
| `purpose` | 回显本次候选集合服务的卡片类型 |
| `candidateUse` | 回显候选用途，用于防止 warmup 候选被误消费为 main 候选等场景 |
| `totalMatched` | 应用 hard constraints 后数据库命中的总数量 |
| `returnedCount` | 返回给 LLM 的候选数量 |
| `candidates` | 给 LLM 的候选摘要，不包含完整数据库 payload |
| `appliedFilters.hardConstraints` | 实际执行的硬过滤说明 |
| `appliedFilters.softPreferences` | 实际参与排序或加权的软偏好说明 |

#### `ExerciseCandidateSummary`

```ts
type ExerciseCandidateSummary = {
  exerciseId: string;
  name: string;
  bodyRegions: BodyRegion[];
  primaryMuscles: string[];
  equipment: string[];
  level: "beginner" | "intermediate" | "advanced";
  movementPatterns: string[];
  estimatedMinutes?: number;
  matchEvidence: string[];
};
```

| 字段 | 含义 |
| --- | --- |
| `exerciseId` | 数据库动作 id。LLM 写草稿时只能引用这个 id |
| `name` | 动作名称，用于 LLM 组织卡片文案 |
| `bodyRegions` | 动作覆盖身体区域 |
| `primaryMuscles` | 主训练肌群 |
| `equipment` | 动作所需器械 |
| `level` | 动作难度 |
| `movementPatterns` | 动作模式标签 |
| `estimatedMinutes` | 单个动作常规耗时估计，主要服务编排草稿 |
| `matchEvidence` | 为什么这个动作进入候选集合的确定性证据摘要，不是推荐理由 |

## Tool 2：`validateExerciseCardDraft`

### 功能

`validateExerciseCardDraft` 校验 LLM 写出的动作卡片草稿，并把通过校验的完整草稿登记为服务端资源。

这个 tool 只做：

- 校验 `candidateSetId` 存在、属于当前用户/会话/Agent run，并且用途允许生成动作卡片。
- 校验每个 `exerciseId` 存在且来自候选集合。
- 校验卡片标题、推荐理由、处方字段、排序字段等结构合法。
- 登记 `exerciseCardDraftId` 和 `validationId`，供保存 tool 消费。

这个 tool 不做：

- 不替 LLM 选择动作。
- 不判断推荐理由是否“语义正确”。
- 不根据用户原文重写卡片标题、理由或处方。
- 不把候选外动作静默替换成候选内动作。

### 入参

```ts
type ValidateExerciseCardDraftInput = {
  candidateSetId: string;
  card: ExerciseCardDraft;
  validationOptions?: ExerciseCardValidationOptions;
};
```

#### 顶层参数说明

| 参数 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `candidateSetId` | `string` | 是 | `searchExerciseResources` 返回的候选集合 id |
| `card` | `ExerciseCardDraft` | 是 | LLM 写出的动作卡片草稿 |
| `validationOptions` | object | 否 | 校验选项，只能影响确定性校验严格度，不影响语义选择 |

#### `ExerciseCardDraft`

```ts
type ExerciseCardDraft = {
  title: string;
  summary?: string;
  selectionMode: "single" | "multiple";
  items: ExerciseCardDraftItem[];
};
```

| 参数 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `title` | `string` | 是 | 卡片标题，由 LLM 根据用户目标生成 |
| `summary` | `string` | 否 | 卡片摘要，用于解释本组动作的整体用途 |
| `selectionMode` | `"single" \| "multiple"` | 是 | 卡片是单动作推荐还是多动作推荐 |
| `items` | `ExerciseCardDraftItem[]` | 是 | 动作卡片条目。每个条目必须引用候选集合内的 `exerciseId` |

#### `ExerciseCardDraftItem`

```ts
type ExerciseCardDraftItem = {
  exerciseId: string;
  displayName?: string;
  role: "primary" | "alternative" | "supplemental";
  reason: string;
  prescription?: ExercisePrescription;
  priority: number;
  cautions?: string[];
};
```

| 参数 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `exerciseId` | `string` | 是 | 被推荐动作 id，必须来自 `candidateSetId` |
| `displayName` | `string` | 否 | LLM 想展示的动作名。Tool 可校验长度，但不把它当数据库事实 |
| `role` | `"primary" \| "alternative" \| "supplemental"` | 是 | 条目在动作卡片中的角色。`primary` 是主推荐，`alternative` 是替代动作，`supplemental` 是补充动作 |
| `reason` | `string` | 是 | LLM 生成的推荐理由。Tool 只校验存在、长度和安全边界，不判断语义准确性 |
| `prescription` | `ExercisePrescription` | 否 | 可选动作处方，例如组数、次数、时长、休息 |
| `priority` | `number` | 是 | 展示排序，数值越小越靠前 |
| `cautions` | `string[]` | 否 | LLM 生成的注意事项。Tool 只做长度、安全和禁止医疗诊断边界校验 |

#### `ExercisePrescription`

```ts
type ExercisePrescription = {
  sets?: number;
  reps?: {
    min?: number;
    max?: number;
    text?: string;
  };
  durationSeconds?: number;
  restSeconds?: number;
  tempo?: string;
  intensity?: {
    rpe?: number;
    text?: string;
  };
};
```

| 参数 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `sets` | `number` | 否 | 建议组数 |
| `reps.min` | `number` | 否 | 最少次数 |
| `reps.max` | `number` | 否 | 最多次数 |
| `reps.text` | `string` | 否 | LLM 需要表达非数字次数时使用，例如 `尽量保持动作质量` |
| `durationSeconds` | `number` | 否 | 单组或单次持续秒数，适合平板支撑、拉伸等动作 |
| `restSeconds` | `number` | 否 | 组间休息秒数 |
| `tempo` | `string` | 否 | 节奏说明，例如 `3-1-1` |
| `intensity.rpe` | `number` | 否 | RPE 强度，必须在确定范围内 |
| `intensity.text` | `string` | 否 | 强度文字说明 |

#### `ExerciseCardValidationOptions`

```ts
type ExerciseCardValidationOptions = {
  allowAlternatives?: boolean;
  maxItems?: number;
  requirePrescription?: boolean;
};
```

| 参数 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `allowAlternatives` | `boolean` | 否 | 是否允许 `role = "alternative"` 的条目 |
| `maxItems` | `number` | 否 | 最大条目数，防止卡片过长 |
| `requirePrescription` | `boolean` | 否 | 是否要求每个条目都包含 `prescription` |

### 出参

```ts
type ValidateExerciseCardDraftOutput = {
  exerciseCardDraftId: string;
  validationId: string;
  candidateSetId: string;
  acceptedExerciseIds: string[];
  rejectedExerciseIds: string[];
  cardSummary: {
    title: string;
    itemCount: number;
    primaryExerciseIds: string[];
  };
  warnings: AgentToolDiagnostic[];
};
```

#### 出参字段说明

| 字段 | 含义 |
| --- | --- |
| `exerciseCardDraftId` | 服务端登记的动作卡片草稿 id。保存 tool 只能通过这个 id 恢复完整 payload |
| `validationId` | 本次校验 id。保存时必须一起传入，防止未校验草稿被保存 |
| `candidateSetId` | 本草稿消费的候选集合 id |
| `acceptedExerciseIds` | 校验通过并进入草稿资源的动作 id |
| `rejectedExerciseIds` | 因不存在、越权或不在候选集合中被拒绝的动作 id |
| `cardSummary.title` | 校验通过后的卡片标题 |
| `cardSummary.itemCount` | 卡片条目数量 |
| `cardSummary.primaryExerciseIds` | 主推荐动作 id |
| `warnings` | 不阻止保存的结构化警告，例如缺少可选处方、替代动作过多 |

## Tool 3：`validateRoutineCardDraft`

### 功能

`validateRoutineCardDraft` 校验 LLM 写出的训练编排卡片草稿，并把通过校验的完整草稿登记为服务端资源。

这个 tool 只做：

- 校验 `candidateSetIds` 存在、可访问，且属于当前 Agent run 可消费资源。
- 校验所有 `exerciseId` 存在并来自允许的候选集合。
- 校验 section 结构、动作顺序、处方字段、预计时长和重复动作边界。
- 登记 `routineCardDraftId` 和 `validationId`。

这个 tool 不做：

- 不根据用户原文补 warmup、main 或 cooldown。
- 不替换不合适动作。
- 不根据关键词判断用户是不是要减脂、增肌或康复。
- 不把动作编排成另一套语义目标。

如果校验发现动作不足或 section 缺失，Tool 应返回 diagnostics，LLM 决定是重新检索、重写草稿，还是向用户澄清。

### 入参

```ts
type ValidateRoutineCardDraftInput = {
  candidateSetIds: string[];
  routine: RoutineCardDraft;
  validationOptions?: RoutineCardValidationOptions;
};
```

#### 顶层参数说明

| 参数 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `candidateSetIds` | `string[]` | 是 | 本编排草稿允许消费的候选集合 id。可以包含 warmup/main/cooldown 多次检索结果 |
| `routine` | `RoutineCardDraft` | 是 | LLM 写出的训练编排草稿 |
| `validationOptions` | object | 否 | 校验选项，只影响确定性结构校验 |

#### `RoutineCardDraft`

```ts
type RoutineCardDraft = {
  title: string;
  goalSummary: string;
  estimatedSessionMinutes?: number;
  sections: RoutineSectionDraft[];
  notes?: string[];
};
```

| 参数 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `title` | `string` | 是 | 编排卡片标题，由 LLM 生成 |
| `goalSummary` | `string` | 是 | 本套训练编排的目标摘要，由 LLM 生成 |
| `estimatedSessionMinutes` | `number` | 否 | LLM 估计的整套训练时长。Tool 可与处方估算时长做确定性一致性检查 |
| `sections` | `RoutineSectionDraft[]` | 是 | 训练段落，例如热身、主训练、放松 |
| `notes` | `string[]` | 否 | LLM 生成的整体注意事项。Tool 只做安全边界和长度校验 |

#### `RoutineSectionDraft`

```ts
type RoutineSectionDraft = {
  sectionId: string;
  kind: "warmup" | "main" | "accessory" | "cooldown" | "mobility" | "stretch";
  title: string;
  intent: string;
  order: number;
  exercises: RoutineExerciseDraft[];
};
```

| 参数 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `sectionId` | `string` | 是 | LLM 生成的段落本地 id，用于 diagnostics 定位 |
| `kind` | 枚举 | 是 | 段落类型。Tool 只校验枚举合法性和结构边界 |
| `title` | `string` | 是 | 段落标题 |
| `intent` | `string` | 是 | 段落训练意图说明，由 LLM 生成 |
| `order` | `number` | 是 | 段落排序 |
| `exercises` | `RoutineExerciseDraft[]` | 是 | 本段落中的动作列表 |

#### `RoutineExerciseDraft`

```ts
type RoutineExerciseDraft = {
  exerciseId: string;
  sourceCandidateSetId?: string;
  role: "warmup" | "primary" | "secondary" | "accessory" | "cooldown" | "stretch";
  order: number;
  prescription: ExercisePrescription;
  coachingNote?: string;
};
```

| 参数 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `exerciseId` | `string` | 是 | 编排中使用的数据库动作 id，必须来自 `candidateSetIds` 中的某个候选集合 |
| `sourceCandidateSetId` | `string` | 否 | LLM 声明该动作来自哪个候选集合。缺省时 Tool 可在 `candidateSetIds` 中查找，但不能跨越未声明资源 |
| `role` | 枚举 | 是 | 动作在编排中的角色。它是草稿结构，不是 Tool 对用户语义的判断 |
| `order` | `number` | 是 | 动作在当前 section 内的排序 |
| `prescription` | `ExercisePrescription` | 是 | 动作处方。编排卡片中应必填，方便估算时长和渲染卡片 |
| `coachingNote` | `string` | 否 | LLM 生成的执行提示 |

#### `RoutineCardValidationOptions`

```ts
type RoutineCardValidationOptions = {
  targetMinutes?: number;
  allowedSectionKinds?: RoutineSectionDraft["kind"][];
  allowDuplicateExercises?: boolean;
  requireWarmup?: boolean;
  requireCooldown?: boolean;
};
```

| 参数 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `targetMinutes` | `number` | 否 | 目标训练时长。Tool 可以用确定性估算检查偏差，但不能据此重写编排 |
| `allowedSectionKinds` | `RoutineSectionDraft["kind"][]` | 否 | 本次允许出现的 section 类型 |
| `allowDuplicateExercises` | `boolean` | 否 | 是否允许同一 `exerciseId` 在不同 section 重复出现 |
| `requireWarmup` | `boolean` | 否 | 是否要求包含 warmup section |
| `requireCooldown` | `boolean` | 否 | 是否要求包含 cooldown、mobility 或 stretch 收尾 section |

### 出参

```ts
type ValidateRoutineCardDraftOutput = {
  routineCardDraftId: string;
  validationId: string;
  candidateSetIds: string[];
  acceptedExerciseIds: string[];
  rejectedExerciseIds: string[];
  routineSummary: {
    title: string;
    sectionCount: number;
    exerciseCount: number;
    estimatedMinutes: number;
    sectionSummaries: RoutineSectionSummary[];
  };
  warnings: AgentToolDiagnostic[];
};
```

#### 出参字段说明

| 字段 | 含义 |
| --- | --- |
| `routineCardDraftId` | 服务端登记的编排卡片草稿 id。保存 tool 只能通过这个 id 恢复完整 payload |
| `validationId` | 本次校验 id。保存时必须一起传入 |
| `candidateSetIds` | 本草稿消费的候选集合 id 列表 |
| `acceptedExerciseIds` | 校验通过并进入编排草稿的动作 id |
| `rejectedExerciseIds` | 因不存在、越权或不在候选集合中被拒绝的动作 id |
| `routineSummary.title` | 编排卡片标题 |
| `routineSummary.sectionCount` | 训练段落数量 |
| `routineSummary.exerciseCount` | 动作数量 |
| `routineSummary.estimatedMinutes` | Tool 根据处方确定性估算的训练时长 |
| `routineSummary.sectionSummaries` | 每个 section 的结构摘要 |
| `warnings` | 不阻止保存的结构化警告，例如时长偏差、重复动作、缺少可选 notes |

#### `RoutineSectionSummary`

```ts
type RoutineSectionSummary = {
  sectionId: string;
  kind: RoutineSectionDraft["kind"];
  title: string;
  exerciseCount: number;
  exerciseIds: string[];
  estimatedMinutes: number;
};
```

| 字段 | 含义 |
| --- | --- |
| `sectionId` | 对应草稿 section id |
| `kind` | section 类型 |
| `title` | section 标题 |
| `exerciseCount` | section 内动作数量 |
| `exerciseIds` | section 内动作 id 列表 |
| `estimatedMinutes` | section 的确定性估算时长 |

## Tool 4：`saveConversationCardArtifact`

### 功能

`saveConversationCardArtifact` 把已校验、已登记的动作卡片草稿或编排卡片草稿保存为会话 artifact/revision，并返回 Response Writer 可以推送给用户的卡片引用。

这个 tool 只做：

- 根据 `draftId` 和 `validationId` 从服务端当前 run 资源中恢复完整 payload。
- 校验 draft、validation、candidate set、用户、会话和 Agent run 的归属关系。
- 保存 `ConversationArtifact` 和对应 revision。
- 返回用户可见卡片事件所需的安全投影。

这个 tool 不做：

- 不接收完整卡片 payload。
- 不允许 LLM 直接写数据库字段。
- 不重新校验或改写 LLM 的语义内容。
- 不绕过 validation 保存草稿。

### 入参

```ts
type SaveConversationCardArtifactInput = {
  draftKind: "exercise_card" | "routine_card";
  draftId: string;
  validationId: string;
  artifactTitle?: string;
  publishMode: "push_to_chat";
  idempotencyKey?: string;
};
```

#### 入参字段说明

| 参数 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `draftKind` | `"exercise_card" \| "routine_card"` | 是 | 要保存的草稿类型。必须与 `draftId` 对应资源类型一致 |
| `draftId` | `string` | 是 | `exerciseCardDraftId` 或 `routineCardDraftId` |
| `validationId` | `string` | 是 | 对应 validate tool 返回的校验 id |
| `artifactTitle` | `string` | 否 | 保存到 artifact 的标题。缺省时使用 draft 标题 |
| `publishMode` | `"push_to_chat"` | 是 | 基础闭环只支持推送到当前聊天 |
| `idempotencyKey` | `string` | 否 | 幂等键，用于避免同一 Agent run 重复保存同一张卡片 |

### 出参

```ts
type SaveConversationCardArtifactOutput = {
  artifactKind: "exercise_card" | "routine_card";
  artifactId: string;
  revisionId: string;
  validationId: string;
  draftId: string;
  responseEvent: ConversationCardResponseEvent;
  savedSummary: {
    title: string;
    itemCount?: number;
    sectionCount?: number;
    exerciseCount: number;
  };
};
```

#### 出参字段说明

| 字段 | 含义 |
| --- | --- |
| `artifactKind` | 保存后的卡片类型 |
| `artifactId` | 会话 artifact id |
| `revisionId` | artifact revision id。前端渲染和后续引用应以它为稳定版本事实 |
| `validationId` | 本次保存消费的校验 id |
| `draftId` | 本次保存消费的草稿 id |
| `responseEvent` | Response Writer 可以推送给前端的安全卡片事件 |
| `savedSummary.title` | 保存后的卡片标题 |
| `savedSummary.itemCount` | 动作卡片条目数量，动作卡片时返回 |
| `savedSummary.sectionCount` | 编排卡片 section 数量，编排卡片时返回 |
| `savedSummary.exerciseCount` | 卡片内动作总数 |

#### `ConversationCardResponseEvent`

```ts
type ConversationCardResponseEvent = {
  type: "conversation_card";
  cardKind: "exercise_card" | "routine_card";
  artifactId: string;
  revisionId: string;
  title: string;
  renderResourceId: string;
};
```

| 字段 | 含义 |
| --- | --- |
| `type` | 前端事件类型。基础闭环固定为 `conversation_card` |
| `cardKind` | 前端需要渲染的卡片类型 |
| `artifactId` | 会话 artifact id |
| `revisionId` | artifact revision id |
| `title` | 用户可见卡片标题 |
| `renderResourceId` | 前端读取卡片渲染数据的资源 id。它应指向服务端保存后的安全投影，而不是 LLM 原始输出 |

## 典型调用示例

### 推送动作卡片

```text
1. LLM 调用 searchExerciseResources
   purpose = "exercise_card"
   candidateUse = "exercise_recommendation"

2. LLM 基于 candidates 写 ExerciseCardDraft

3. LLM 调用 validateExerciseCardDraft
   candidateSetId = 上一步返回的 candidateSetId

4. LLM 调用 saveConversationCardArtifact
   draftKind = "exercise_card"
   draftId = validateExerciseCardDraft.output.exerciseCardDraftId
   validationId = validateExerciseCardDraft.output.validationId

5. Response Writer 根据 responseEvent 推送动作卡片
```

### 推送编排卡片

```text
1. LLM 调用 searchExerciseResources
   purpose = "routine_card"
   candidateUse = "routine_warmup"

2. LLM 调用 searchExerciseResources
   purpose = "routine_card"
   candidateUse = "routine_main"

3. LLM 调用 searchExerciseResources
   purpose = "routine_card"
   candidateUse = "routine_cooldown"

4. LLM 基于多个 candidateSetId 写 RoutineCardDraft

5. LLM 调用 validateRoutineCardDraft
   candidateSetIds = [warmupCandidateSetId, mainCandidateSetId, cooldownCandidateSetId]

6. LLM 调用 saveConversationCardArtifact
   draftKind = "routine_card"
   draftId = validateRoutineCardDraft.output.routineCardDraftId
   validationId = validateRoutineCardDraft.output.validationId

7. Response Writer 根据 responseEvent 推送编排卡片
```

## 不纳入基础闭环的 Tool

以下能力后续可以加，但不应该混进“推送动作卡片和编排卡片”的基础 tool：

| Tool | 暂不纳入原因 |
| --- | --- |
| `generateRoutineDraft` | 名称和职责暗示 Tool 生成语义草稿，容易违背“LLM 产出语义草稿” |
| `recommendExercises` | 名称暗示 Tool 决定推荐结果，应该拆成检索和 LLM 草稿 |
| `repairRoutineDraft` | 修复语义草稿应由 LLM 根据 diagnostics 重写，Tool 不做语义修复 |
| `resolveExistingCardReference` | 用于修改上一张卡片或引用历史卡片，不是首次推送基础闭环 |
| `validateCardPatchDraft` | 用于修改已有卡片，不是首次生成 |
| `evaluatePolicy` | 用户确认、风险策略、长期计划保存等高影响写入再引入；当前仅推送会话卡片可以先不纳入 |

## 最小可验收标准

1. LLM 可以通过 `searchExerciseResources` 拿到数据库动作候选。
2. 动作卡片只能引用候选集合中的 `exerciseId`。
3. 编排卡片所有动作都必须来自已声明的 `candidateSetIds`。
4. 通过 validate 的草稿必须登记为服务端资源，并返回 draft id 和 validation id。
5. 保存 tool 只能消费 draft id 和 validation id，不能消费 LLM 重放的完整 payload。
6. Response Writer 只消费 `saveConversationCardArtifact` 返回的 `responseEvent` 和 artifact/revision 引用。
7. 任一 tool 失败时必须返回结构化 diagnostics，后续写入不能消费失败或未满足的资源。
