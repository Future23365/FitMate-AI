## Context

训练系统已经能生成 routine、plan 和 Patch，但动作候选缺少明确的训练阶段和角色语义。LLM 或检索层只知道动作“相关”，不等于动作可以放在某个 section 或用于某类替换。这个 change 负责把动作库升级为可供服务端规则判断的候选事实源。

## Goals / Non-Goals

**Goals:**

- 为动作定义可校验的阶段、角色、运动模式、难度、风险和替代关系。
- 让检索服务按 warmup、training、stretch 和替代关系输出候选池。
- 让 Validator 能拒绝非法 section、器械、难度、风险和候选外动作。
- 为 Patch、PlanEngine 和推荐刷新提供统一候选输入。

**Non-Goals:**

- 不实现向量检索或复杂 RAG；混合检索属于 `change-008-rag-hybrid-search`。
- 不重写长期计划展开逻辑；DomainPlanEngine 属于 `change-005-domain-plan-engine`。
- 不实现长期用户记忆和曝光去重；分别属于后续 change。

## Decisions

### Decision 1: 动作元数据服务端结构化

动作是否适合热身、主训练或拉伸必须由服务端字段表达，不能只靠 prompt 约束。`allowedSections`、`intensityRole` 和 `movementPattern` 是最低限度字段；`riskTags` 和 `contraindications` 用于用户限制和健康边界。

### Decision 2: 检索输出分池而不是单列表

`searchExercises` 返回 `ExerciseCandidatePools`，让编排层明确知道哪些候选能进入 warmup、training、stretch、regression、progression 或 substitution。这样后续计划生成和 Patch 不需要在各自模块重复拆分候选。

### Decision 3: 替代优先级先用显式关系

替换动作优先按 `substitutionGroupId`、`regressionExerciseIds`、`progressionExerciseIds`、`movementPattern`、`primaryMuscles`、`equipment`、`difficulty` 和 `allowedSections` 排序。显式替代关系比同肌群相关性更可靠。

### Decision 4: Validator 作为最终边界

即使候选服务已经过滤，保存或展示前仍由 Validator 重新校验 `exerciseId` 存在、候选来源、section 合法性、器械、难度和风险。候选不足时返回失败原因，不回填编造动作。

## Risks / Trade-offs

- [Risk] 现有动作库元数据不足。→ Mitigation: 先为核心动作补齐可用元数据，并为缺失字段提供保守默认，缺失关键字段的动作不进入高风险候选池。
- [Risk] 字段过多导致 seed 维护成本上升。→ Mitigation: 先落必要字段和批量校验脚本，后续再扩展更细粒度标签。
- [Risk] 过滤过严导致候选不足。→ Mitigation: 候选不足返回原因和可放宽条件，由后续推荐去重 change 统一处理放宽策略。
