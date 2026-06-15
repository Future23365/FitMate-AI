## Context

生产 `/api/chat` 当前使用 `LangChain Agent Runtime + DeepSeek native tool_calls`，`searchExerciseResources` 是发布态 `Exercise` 动作库的只读事实查询 tool。前序 change `add-exercise-execution-taxonomy` 已经新增 execution taxonomy 字段和共享常量，但明确不迁移 `searchExerciseResources` 的模型可见合同或查询逻辑。

当前 tool 输入仍包含 `equipment` / `homeRequirement`。这两个旧字段语义交叉：`equipment = "no_equipment"` 被映射到自重动作，`homeRequirement` 同时混有环境、支撑物、居家和健身房条件。现在数据库已有回填后的 taxonomy，继续让模型使用旧字段会绕开真实分类事实。

任务分类：已有业务 tool 合同调整 + 单个业务 tool 模型可见说明调整。`agent-tool-change-governance` 作为 primary skill 定执行边界；`agent-prompt-contract-governance` 作为 secondary 检查 tool description、schema description 和 model-visible summary。

## Goals / Non-Goals

**Goals:**

- 将 `searchExerciseResources` 的执行条件筛选从旧 `equipment` / `homeRequirement` 输入迁移到 execution taxonomy 输入。
- 让 repository 在数据库层下推 taxonomy filters，不做全表读取或内存语义判断。
- 让 Planner 可见的 tool description、schema description、facet catalog 和 tool result summary 只表达稳定资源事实和输入来源。
- 让 `requiredExerciseIds`、user projection 和 trace summary 同步使用 taxonomy conflict fields。
- 保持只读动作库查询职责，不生成训练卡片、不保存结果、不替模型判断最终训练方案是否 ready。

**Non-Goals:**

- 不修改 Prisma schema、migration 或已回填数据。
- 不修改 `/api/chat`、LangChain runtime 主循环、provider payload、production response adapter 或 finalization tool 通用合同。
- 不新增服务端自然语言关键词规则、正则、同义词表、短句模板、用户 phrasing 特判或 provider `tool_calls` 改写。
- 不把 execution taxonomy 迁移写进通用 Agent prompt；业务边界只写入 `searchExerciseResources` 的 tool description / schema description / result summary。
- 不删除 UI 动作库中旧 `equipment` / `homeRequirement` 展示或筛选路径；本 change 只迁移 Agent 查询 tool。

## Decisions

### 1. 直接迁移模型可见输入字段，而不是继续兼容旧输入

`searchExerciseResources` 的模型可见 input schema 移除 `equipment` 和 `homeRequirement`，新增：

- `requiresExternalEquipment?: boolean`
- `requiredEquipmentTags?: ExerciseRequiredEquipmentTag[]`
- `supportRequirementTags?: ExerciseSupportRequirementTag[]`
- `setupComplexityMax?: ExerciseKnownSetupComplexity`
- `impactLevelMax?: ExerciseImpactLevel`
- `noiseLevelMax?: ExerciseNoiseLevel`

选择该方案的原因是：旧字段本身就是本次问题来源。继续给模型暴露旧字段或长期 alias 会让模型在两个语义体系之间摇摆，也会让后续测试同时维护两套合同。

替代方案是保留 `equipment = "no_equipment"` 并在 handler 中转换为 `requiresExternalEquipment = false`。该方案短期 diff 较小，但会延续旧字段误导，不符合当前阶段优先清晰合同的原则。

### 2. `requiredEquipmentTags` / `supportRequirementTags` 使用 `hasSome` 语义

当模型传入多个 tag 时，repository 查询包含任一 tag 的动作。`requiresExternalEquipment = false` 与任何 `requiredEquipmentTags` 同时出现时由 input schema 拒绝；`supportRequirementTags = ["none"]` 不能与其他 support tag 同时出现。

选择 `hasSome` 的原因是：用户常见表达是“有哑铃或弹力带都行”“需要地面或椅子支撑的动作”，它更适合作为候选召回 filter。若未来需要“必须同时满足全部 tag”，应新增明确字段，不复用当前输入。

### 3. 上限类字段排除未知值

`setupComplexityMax` 使用现有 `exerciseSetupComplexityRank`。本 change 新增 `exerciseImpactLevelRank` 和 `exerciseNoiseLevelRank`，让 `impactLevelMax` / `noiseLevelMax` 也按稳定排序过滤。数据库中 `setupComplexity = "unknown"`、`impactLevel = null`、`noiseLevel = null` 都不匹配上限筛选。

选择该方案的原因是：unknown-safe 语义是前序 taxonomy change 的核心不变量。未知数据不能被误当成低准备、低冲击或安静。

### 4. 输出暴露有限 `executionTaxonomy` 事实

内部 `ExerciseResourceSummary`、tool output schema、model-visible summary、user projection 和 trace summary 都携带有限 `executionTaxonomy` 对象。模型可见动作摘要保留 `exerciseId`、名称、肌群、图片、旧中文展示字段和 taxonomy；不暴露完整数据库对象、instructions、embedding、placement eligibility 或 handler output。

选择该方案的原因是：模型需要基于候选事实解释推荐理由或继续构造结构化输出。只给输入字段而不给结果事实，会迫使模型从旧中文字段推断 execution 条件。

### 5. 只修改业务 tool 和 repository，不修改 runtime

本 change 的能力边界完全落在 `searchExerciseResources` 业务 tool。LangChain runtime、provider payload、response adapter、`/api/chat` 和 finalization validator 不需要新增通用扩展点。

## Risks / Trade-offs

- [Risk] 旧黑盒或测试仍传 `equipment` / `homeRequirement`。  
  → Mitigation：schema 明确拒绝旧字段，production catalog tests 断言旧字段不再暴露；必要时更新测试输入到 taxonomy 字段。

- [Risk] taxonomy 字段回填不完整导致筛选结果变少。  
  → Mitigation：unknown / null 不匹配低门槛上限筛选，避免误推荐；如果用户约束过强，tool 返回空候选或 diagnostics，由模型解释或澄清。

- [Risk] 模型把 `requiredEquipmentTags` 当作用户拥有器械清单或最终方案承诺。  
  → Mitigation：schema description 明确它是候选召回 filter，不是最终展示数量、不是保存结果，也不替代 final validator。

- [Risk] 结果 summary 暴露过多执行统计导致模型循环补查。  
  → Mitigation：沿用 model-visible contract gate，Planner-visible summary 不回显 `returnedCount`、`truncated`、`candidateCountPerSection`、`filterApplications` 或 `zeroMatchMuscles`。

## Migration Plan

1. 新增 OpenSpec delta spec 和 tasks。
2. 更新共享 taxonomy rank helper。
3. 更新 repository search input、facet catalog、where 构造、projection 和 required id mismatch 判断。
4. 更新 `searchExerciseResources` input schema、description、summary、user projection、trace summary。
5. 更新 tool-level 和 production catalog / model-visible contract tests。
6. 运行 `openspec validate migrate-exercise-resource-execution-taxonomy --strict`、相关 `npm test` 和 `npm run typecheck`。

回滚策略：如果 taxonomy 查询迁移出现问题，可回滚本 change 的 tool schema / repository 改动，数据库字段和回填数据无需回滚。由于本 change 不修改 runtime 或 production route，回滚范围局限于业务 tool。
