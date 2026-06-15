## Context

生产 `/api/chat` 当前使用 `LangChain Agent Runtime + DeepSeek native tool_calls`，`searchExerciseResources` 是发布态 `Exercise` 动作库的只读事实查询 tool。前序 change 已经把 execution taxonomy 字段落库并迁移到动作查询 tool，但模型可见 input 仍直接暴露底层字段：`requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevelMax` 和 `noiseLevelMax`。

这些字段对 repository 很清晰，但对模型不够贴近用户语义。用户说“无器械”时，通常不是只表达 `requiresExternalEquipment = false`，还隐含不需要健身房固定设施、不需要搭档、不需要户外空间，最多允许地面或瑜伽垫。让模型直接组合底层字段会把产品语义和数据库事实耦合到模型输入里，也会扩大 schema description 的解释负担。

任务分类：已有业务 tool 合同调整 + 单个业务 tool 模型可见说明调整。`agent-tool-change-governance` 作为 primary skill 定执行边界；`agent-prompt-contract-governance` 作为 secondary 检查 tool description、schema description、model-visible summary 和 examples。该 change 不属于 Agent 主链迁移、framework migration、LangChain runtime 替换或 production tool catalog 重写，不触发历史回归审计。

## Goals / Non-Goals

**Goals:**

- 将 `searchExerciseResources` 的 execution taxonomy 模型可见输入收敛为少量用户语义字段。
- 让 `executionProfile` 表达常见执行场景：`no_equipment`、`home_support`、`small_equipment`、`gym_equipment`、`partner_required`、`outdoor_required`。
- 让 `equipmentScope` 区分“兼容用户可用器械”和“必须使用指定器械”。
- 让 `impactLimit` / `noiseLimit` 表达冲击与噪音上限，避免模型直接操作内部 `impactLevelMax` / `noiseLevelMax` 命名。
- 在服务端 adapter 中确定性映射高层字段到 `Exercise` execution taxonomy 查询条件。
- 保留 `searchExerciseResources` 的只读动作库事实查询职责、section-aware hard filter policy、受控候选数量、`requiredExerciseIds` 和 `excludeExerciseIds` 行为。
- 更新模型可见说明和测试，防止模型继续使用旧底层 taxonomy 字段。

**Non-Goals:**

- 不新增第二个动作查询 tool。
- 不修改 Prisma schema、migration 或动作回填数据。
- 不修改 `/api/chat`、LangChain runtime 主循环、provider payload、production response adapter、finalization tool 或 `submitVisibleTrainingProposal` validator。
- 不新增服务端自然语言关键词规则、正则、同义词表、短句模板、用户 phrasing 特判或 provider `tool_calls` 改写。
- 不把 `executionProfile` 的业务说明写进通用 Agent prompt；该说明只属于 `searchExerciseResources` 的 tool description / schema description / result summary。
- 不删除数据库底层 taxonomy 字段；它们继续作为 repository 内部查询事实和动作摘要事实存在。

## Decisions

### 1. 用 `executionProfile` 代替模型直接组合底层 taxonomy 字段

模型可见 `executionProfile` 使用以下枚举：

- `no_equipment`
- `home_support`
- `small_equipment`
- `gym_equipment`
- `partner_required`
- `outdoor_required`

服务端 adapter 将这些枚举确定性映射为 taxonomy where 条件：

| `executionProfile` | 查询语义 | 数据库条件 |
| --- | --- | --- |
| `no_equipment` | 无外部器械，允许地面或瑜伽垫 | `requiresExternalEquipment = false`；`requiredEquipmentTags isEmpty`；`setupComplexity IN ("zero_setup", "floor_or_mat")`；`supportRequirementTags NOT hasSome ["chair_or_wall", "gym_fixture", "partner", "outdoor_space"]` |
| `home_support` | 居家可做，可用地面、垫子、椅子、墙面或台阶 | `requiresExternalEquipment = false`；`requiredEquipmentTags isEmpty`；`setupComplexity IN ("zero_setup", "floor_or_mat", "home_support")`；`supportRequirementTags NOT hasSome ["gym_fixture", "partner", "outdoor_space"]` |
| `small_equipment` | 需要可移动的小型训练器械 | `requiresExternalEquipment = true`；`setupComplexity = "small_equipment"`；`supportRequirementTags NOT hasSome ["gym_fixture", "partner", "outdoor_space"]` |
| `gym_equipment` | 需要健身房固定设施或典型健身房器械 | `setupComplexity = "gym_fixture"` OR `supportRequirementTags has "gym_fixture"` OR `requiredEquipmentTags hasSome ["machine", "cable"]` |
| `partner_required` | 需要搭档、保护者或人工辅助 | `setupComplexity = "partner"` OR `supportRequirementTags has "partner"` |
| `outdoor_required` | 需要户外或大面积开放空间 | `setupComplexity = "outdoor"` OR `supportRequirementTags has "outdoor_space"` |

替代方案是继续暴露 `requiresExternalEquipment`、`supportRequirementTags` 和 `setupComplexityMax`，只在 schema description 里解释组合方式。该方案实现量更小，但仍要求模型承担数据库字段组合逻辑，也无法把“无器械”的产品语义固定成稳定查询合同。

### 2. 用 `equipmentScope` 表达用户器械集合，而不是复用 `requiredEquipmentTags`

`equipmentScope` 结构：

```ts
{
  mode: "compatible_with_available" | "must_use_any";
  tags: ExerciseRequiredEquipmentTag[];
}
```

`mode = "compatible_with_available"` 表示用户可用器械集合，动作不能要求集合外的外部器械。数据库条件不是 `hasSome`，而是：

- 允许 `requiresExternalEquipment = false` 且 `requiredEquipmentTags isEmpty` 的动作；
- 或允许 `requiresExternalEquipment = true` 且 `requiredEquipmentTags` 不包含任何不可用 tag 的动作；
- 不可用 tag 由 canonical equipment tag 全集减去 `equipmentScope.tags` 得到；
- 当 `tags` 为空数组时，只匹配不需要外部器械的动作。

`mode = "must_use_any"` 表示用户明确想找会使用指定器械的动作。数据库条件为 `requiresExternalEquipment = true` 且 `requiredEquipmentTags hasSome equipmentScope.tags`。

选择该结构的原因是：用户说“我只有哑铃”和“给我找哑铃动作”不是同一个查询。旧 `requiredEquipmentTags` 只能表达动作要求哪些器械，不能表达用户可用器械集合是否是上限。

### 3. `impactLimit` 和 `noiseLimit` 保持模型语义，内部映射到等级上限

模型可见字段使用：

- `impactLimit?: "low" | "medium" | "high"`
- `noiseLimit?: "quiet" | "normal" | "loud"`

adapter 内部映射为：

- `impactLimit = "low"` -> `impactLevel IN ("low")`
- `impactLimit = "medium"` -> `impactLevel IN ("low", "medium")`
- `impactLimit = "high"` -> `impactLevel IN ("low", "medium", "high")`
- `noiseLimit = "quiet"` -> `noiseLevel IN ("quiet")`
- `noiseLimit = "normal"` -> `noiseLevel IN ("quiet", "normal")`
- `noiseLimit = "loud"` -> `noiseLevel IN ("quiet", "normal", "loud")`

`impactLevel = null` 和 `noiseLevel = null` 不匹配任何上限筛选。选择该方案是为了保留前序 taxonomy 的 unknown-safe 语义：未补齐不能被当作低冲击或安静。

### 4. 旧字段从模型可见 schema 删除，但保留内部查询字段

模型可见 schema 不再包含：

- `requiresExternalEquipment`
- `requiredEquipmentTags`
- `supportRequirementTags`
- `setupComplexityMax`
- `impactLevelMax`
- `noiseLevelMax`

repository 内部可以继续使用这些字段，或新增一个内部 `ExecutionConstraintQuery` 对象承载 adapter 输出。旧字段不得继续出现在 tool description、schema description、examples、query summary、model-visible summary、user projection 的模型输入回显或 Planner 可复制字段里。trace summary 可以保留内部映射结果，但必须标记为服务端诊断事实，不能作为下一轮 Planner input 示例。

选择该方案的原因是：短期兼容旧字段会让模型在两个输入体系之间摇摆。由于 `searchExerciseResources` 是模型可见 tool 合同，旧字段保留兼容的收益小于语义混乱成本。

### 5. 字段冲突由 schema / adapter 拒绝，不由 handler 猜测

需要拒绝的冲突包括：

- `executionProfile = "no_equipment"` 时传入 `equipmentScope.mode = "must_use_any"`。
- `executionProfile = "home_support"` 时传入 `equipmentScope.mode = "must_use_any"`。
- `equipmentScope.tags` 为空且 `mode = "must_use_any"`。
- `equipmentScope.tags` 包含非 canonical equipment tag。
- 任何旧底层 taxonomy 字段出现在模型 tool input。

adapter 不根据用户原始自然语言补写字段，也不把旧字段转换为新字段。模型必须基于当前 tool schema 选择新字段。

## Risks / Trade-offs

- [Risk] 这是 breaking schema change，已有 tests、fixtures 或黑盒脚本可能仍发送底层 taxonomy 字段。  
  -> Mitigation：tasks 中要求补旧字段拒绝测试，并更新 production catalog / model-visible contract tests，确保模型不再看到旧字段。

- [Risk] `compatible_with_available` 查询需要“动作所需器械是用户可用器械的子集”，不能用简单 `hasSome` 表达。  
  -> Mitigation：使用 canonical tag 全集计算不可用 tag，再用 `NOT requiredEquipmentTags hasSome unavailableTags` 或等价 PostgreSQL array subset 条件实现；测试覆盖“只有哑铃”不返回弹力带动作。

- [Risk] `executionProfile = "small_equipment"` 和 `equipmentScope` 组合后结果可能较少。  
  -> Mitigation：0 条结果仍是合法 tool fact；模型可解释当前查询口径、追问或放宽条件，服务端不替模型改写查询语义。

- [Risk] trace summary 同时展示高层字段和内部 taxonomy 映射，可能被误认为模型可复制 input。  
  -> Mitigation：model-visible summary 只回显高层 query；内部 taxonomy mapping 只进入 trace diagnostic，不进入 Planner-visible schema 示例。

- [Risk] 与活动 change `clarify-exercise-query-clarification-contract` 都会触碰 `searchExerciseResources` 模型可见说明。  
  -> Mitigation：本 change 聚焦字段抽象和查询映射；澄清/停止条件文案在实现时需要按最终合并顺序 rebase，并通过 model-visible contract gate 防止重复或冲突说明。

## Migration Plan

1. 新增本 OpenSpec delta spec 和 tasks。
2. 新增 `executionProfile`、`equipmentScope`、`impactLimit`、`noiseLimit` 的 Zod schema 和类型。
3. 在 `searchExerciseResources` handler 入口加入高层执行条件 adapter，输出内部 repository 查询对象。
4. 更新 repository where 构造，支持 `executionProfile` 映射、`equipmentScope.compatible_with_available` subset 语义和 `equipmentScope.must_use_any` overlap 语义。
5. 更新 query summary、required id mismatch diagnostics、model-visible summary、user projection 和 trace summary。
6. 更新 tool description、schema description、facet catalog 和 model-visible contract gate。
7. 更新 tests 并运行验证。

回滚策略：如果新字段上线后查询效果异常，可以回滚本 change 的 tool schema / adapter / tests；数据库 taxonomy 字段、回填数据和既有 `Exercise` schema 无需回滚。

## Open Questions

- `gym_equipment` 是否应把 `barbell` 作为默认健身房器械条件纳入 `requiredEquipmentTags hasSome`。当前设计暂不默认纳入，避免把家用杠铃动作误判为必须健身房；如果业务希望更强健身房语义，应通过 `setupComplexity = "gym_fixture"` 或动作回填数据表达。
