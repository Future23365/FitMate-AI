## Context

当前生产聊天已经具备 `visibleTrainingProposal`、跨 run 可见训练事实桥、`inspectVisibleTrainingProposals(read_recent)` 和 `searchExerciseResources`。两条最新 trace 说明这些能力单独可用，但模型在组合它们时缺少稳定的资源消费合同：

- 已导入的 `visible_training_proposal_fact` 既可能是继续使用的正向来源，也可能在替换场景中成为负向排除集合。当前合同没有清晰区分。
- `visible_training_proposal_fact` 和 `searchExerciseResources` result 都可能只覆盖部分 section。当前模型能看到部分边界，但没有把“事实覆盖能力决定最终 output kind”作为稳定决策步骤。
- `section_not_allowed` / `terminal_reference_invalid` 的 repair feedback 能指出具体错误，但还不足以指导模型恢复到“补缺失 section、降级到可支撑结构或澄清”的抽象路径。

按照项目边界，本 change 不能用服务端关键词、短句模板、具体 `toolName` 或字段组合替模型做语义判断。修复应放在模型可见 prompt、业务 tool manifest / observation、resource contract 和结构化 repair feedback 中。

## Goals / Non-Goals

**Goals:**

- 建立当前 run 可见训练资源的通用消费合同，区分正向消费、负向排除、派生、调整和澄清。
- 让 `visible_training_proposal_fact` 成为明确的正向可消费资源，同时暴露 section coverage 和 output support。
- 让 `searchExerciseResources` 明确表达查询结果只覆盖实际返回的 `groups.<section>`，并区分 `excludeExerciseIds` 与 `requiredExerciseIds` 的语义边界。
- 让终态校验失败的 repair feedback 可恢复，表达字段错误、资源覆盖缺口和可选恢复方向，但不指定固定 tool 调用顺序。
- 用回归测试覆盖原始 trace 和等价表达，证明修复覆盖问题类别，不把测试短句写入生产规则。

**Non-Goals:**

- 不新增针对“从中取几个动作”“重新生成”或等价短句的 prompt 规则。
- 不新增 `/api/chat`、Agent runtime、validator、tool handler 或 renderer 中的自然语言分流。
- 不新增专门处理某个动作数量、某个 `toolName` 组合或某个字段组合的业务 tool。
- 不修改数据库表结构、Prisma schema、外部 API 契约或用户权限模型。
- 不改变 `visibleTrainingProposal` 的核心 payload 字段名。

## Decisions

### 1. 把问题抽象为资源操作和资源覆盖，而不是用户短句

在通用 Agent prompt 中增加“引用资源操作”合同：模型引用已有对象时，需要基于可见上下文判断当前目标属于 `reuse`、`derive`、`modify`、`replace` 或 `clarify`。这些名称是模型推理标签，不进入服务端 action schema，也不由服务端根据用户原文判断。

备选方案是在服务端识别用户表达后改写 action 或 tool input。该方案被排除，因为它会违反“LLM 是自然语言语义理解来源，服务端只管契约”的边界。

### 2. 由 resource / observation 暴露 section coverage 和 output support

`inspectVisibleTrainingProposals(read_recent)` 成功后，model observation 应明确：

- `resourceType = "visible_training_proposal_fact"`
- resource role 是当前 run 可消费事实
- `availableSections`
- `missingSectionsForRoutineOrPlan`
- `supportsOutputKinds`
- `exerciseItems` 中哪些动作可作为正向来源

这些字段或等价投影用于表达事实覆盖能力，而不是指示固定下一步。模型仍自主选择继续查询、输出可支撑结构、澄清或失败收口。

### 3. `excludeExerciseIds` 只表达负向约束，`requiredExerciseIds` 只表达正向锚点

`searchExerciseResources` 的 manifest、schema description 和 observation 应明确：

- `excludeExerciseIds` 只用于替换、排除或避免重复。
- 已导入或已看到动作不是默认排除对象。
- `requiredExerciseIds` 可以把受控动作 id 带回动作查询结果，但只支撑返回的 section。
- 只有 `groups.<section>` 实际返回的动作才能支撑对应 section。

备选方案是新增一个“选择若干动作”的 tool。该方案暂不采用，因为当前失败来自资源消费合同不足，而不是缺少数据库查询能力。

### 4. Repair feedback 只提供可恢复合同，不替模型选流程

当 `visibleTrainingProposal` 校验失败时，repair observation 应表达：

- 稳定错误 code，例如 `section_not_allowed`
- 失败路径、`exerciseId`、输出 section、允许 section
- 当前已有事实覆盖哪些 section
- 若目标结构仍需要 `routine` / `plan`，缺少哪些 section
- 可恢复方向：继续获取缺失 section、输出当前事实可支撑结构、澄清或失败收口

feedback 不应包含“必须调用某个 tool”或“固定调用顺序”。

### 5. 测试按抽象层级组织

测试分四层：

- prompt / manifest tests：证明模型可见合同包含资源操作、正负向消费、section coverage 和 output support，且没有固定短句触发。
- tool-level tests：证明 `read_recent` 和 `searchExerciseResources` observation 投影正确。
- validator / repair tests：证明 section 校验失败和结构覆盖不足会进入可恢复 feedback。
- production replay / blackbox tests：用原始 trace 和等价表达验证模型不再把正向资源默认排除，也不会在缺 section 时伪造完整 `routine`。

## Risks / Trade-offs

- [Risk] 只增强模型可见合同仍可能被模型忽略。→ Mitigation：把同一边界分布在 prompt、manifest、observation 和 repair feedback，并补 production replay 测试。
- [Risk] Prompt 过长稀释重点。→ Mitigation：通用 prompt 只写资源操作和事实覆盖抽象，业务细节放在 tool manifest / observation。
- [Risk] `read_recent` observation 暴露更多动作摘要可能增加 token。→ Mitigation：只投影有限摘要和 coverage，不暴露完整 payload、完整数据库对象或内部 handler output。
- [Risk] repair feedback 过度指定流程。→ Mitigation：只表达事实缺口和可恢复方向，不写固定 `toolName`、固定 action 或固定调用顺序。

## Migration Plan

无需数据库迁移。实现后新 prompt、manifest、observation 和 repair feedback 随生产聊天下一次模型请求生效。

回滚方式是恢复本 change 修改的模型可见合同、observation 和 tests。由于不改数据库和 API，回滚不需要数据处理。

## Open Questions

无。
