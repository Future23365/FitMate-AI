## Context

总方案把目标定义为可引用、可修订、可验证、可追踪的 AI 训练计划编排系统。`change-001` 到 `change-010` 已经完成第一批基础闭环：artifact 事实源、引用解析、局部 Patch、动作元数据分池、DomainPlanEngine、用户记忆、推荐去重、混合检索、Policy/Confirmation 和基础 Trace。

剩余缺口不是单点功能，而是横跨 AI 编排、未来日历写入、失败修复、回放评测和用户可见解释的第二阶段能力。旧 change 中多次明确暂不实现复杂 Agent runtime、完整 Replay、Eval Suite 和未来 schedule 批量写入；这些内容需要集中到 `011`，否则后续会分散成多个边界不一致的补丁。

## Goals / Non-Goals

**Goals:**

- 建立服务端多步编排层，统一串联 ReferenceResolver、受控工具、Patch、PlanEngine、Policy、Confirmation、Validator、Repair、Persistence 和 Response Writer。
- 让 future schedule 类 Patch 在确认后可以真实写入未来安排，同时继续保护已完成训练历史。
- 基于现有 `AiRunTrace` 建立 Replay Runner 和 Eval Suite，能复盘和回归验证关键 AI 决策链路。
- 将可恢复校验失败统一纳入 Repair Orchestrator，避免训练草稿、Patch 和计划展开各自写一套修复逻辑。
- 对用户主动表达的疼痛、不适或高风险信号进行训练边界分类，但不恢复默认健康问询阻断，也不生成医疗诊断。
- 统一 Response Writer，使解释、确认、失败恢复和变更摘要基于结构化结果生成。

**Non-Goals:**

- 不引入自由行动的 Agent；任何 LangGraph / Agents SDK 等 runtime 都必须受本 change 的工具 schema、Policy、Validator、Confirmation 和 Trace 约束。
- 不把 Replay 设计成完全重放模型 token 的系统；目标是复盘决策链路和关键输出，不保证随机模型输出逐 token 一致。
- 不引入独立评测平台或外部观测系统；第一版以本地脚本、fixture 和测试报告为主。
- 不修改已完成训练历史；只能基于历史创建新计划或修改未来安排。
- 不恢复“用户只说训练目标时必须先问健康信息”的阻断逻辑。

## Decisions

### Decision 1: 自定义 Orchestrator 优先于通用 Agent runtime

第一版新增 `AiTaskOrchestrator`，用显式 step graph 表达任务：intent、reference、tool_call、patch_proposal、policy_check、confirmation_gate、validation、repair、persistence、response_write。每个 step 都声明输入 schema、输出 schema、可重试策略、是否需要确认和 trace 摘要。

这样比直接引入通用 Agent runtime 更适合当前阶段：现有系统已经有强领域边界，真正需要的是稳定编排和可测试状态，而不是让模型自由决定工具链。

### Decision 2: Confirmation 后通过 checkpoint 续跑

需要确认的写操作不能在用户确认后重新让模型自由生成。Orchestrator 应保存或签名 checkpoint，绑定目标、scope、diff、工具版本、policy result 和 validator 摘要。用户确认后，从 checkpoint 继续执行 Policy 和 Validator 复核，再进入 persistence。

这能避免“确认的是 A，执行的是 B”，也让 trace 能串起确认前后的两轮对话。

### Decision 3: future schedule 写入只允许未来范围

`future_schedules` 不再停留在 blocked；通过 Policy、Confirmation 和 Validator 后，可以执行移动训练日、标记休息日、改变周频率和批量替换未来动作。写入必须生成明确 diff，保留原 schedule 的审计信息，并拒绝任何已完成 schedule 或 WorkoutSessionResult 修改。

这比继续只生成 artifact preview 更完整，但仍保持历史保护和用户确认边界。

### Decision 4: Repair 先确定性，后受控 LLM

Repair Orchestrator 先尝试确定性修复：替换候选外动作、调整组数/次数/休息、压缩时长、插入休息日、缩小 Patch scope。只有需要语义判断时，才让 LLM 在服务端候选和明确 schema 内选择。修复后必须重新跑 Validator。

这样可以复用已有训练草稿失败恢复经验，并避免每个模块各自绕过校验。

### Decision 5: Replay 与 Eval 共享 fixture

Replay Runner 使用真实 `AiRunTrace` 或 fixture 输入复盘一次 run 的关键决策；Eval Suite 使用同一类 fixture 批量断言期望行为。fixture 包含用户消息、artifact 摘要、必要 payload 快照、用户画像/记忆摘要、toolVersions、promptVersion、model 和期望断言。

Replay 面向排查单次问题，Eval 面向防回归；两者共享输入格式可以降低维护成本。

### Decision 6: 健康风险分类只响应用户主动表达

HealthRiskClassifier 只在用户主动说出疼痛、不适、伤病或高风险信号时运行。它输出训练约束和风险等级，用于候选过滤、强度调整、确认写入和用户文案边界；它不得把普通训练目标升级为健康问询阻断。

这保持安全边界，同时符合当前已移除 health safety gating 的产品行为。

### Decision 7: Response Writer 只消费结构化结果

用户可见回复应由 Response Writer 基于 Orchestrator final state 生成：成功摘要、确认问题、候选不足、修复失败、Policy blocked、健康边界提示和下一步建议。Response Writer 不直接读数据库、不重建 payload、不绕过 Policy。

这样能让用户文案与真实决策一致，也方便 Eval 对回复类型和建议选项做断言。

## Risks / Trade-offs

- [Risk] Orchestrator 范围过大导致一次实现过重。→ Mitigation: 先实现 step graph、checkpoint 和 future schedule 写入最小闭环，再扩展 Replay/Eval 场景。
- [Risk] Replay fixture 泄露大 payload 或用户私密信息。→ Mitigation: fixture 默认使用脱敏摘要，完整 payload 只保存当前 userId 可访问且经过 schema 校验的必要快照。
- [Risk] Eval 断言过细导致模型升级频繁失败。→ Mitigation: Eval 优先断言结构化决策、Policy、Validator、Patch scope 和候选来源，不断言完整自然语言。
- [Risk] Repair 自动修复改变用户意图。→ Mitigation: 修复必须记录 reason 和 diff；大幅改变 scope、强度或频率时转入 Confirmation。
- [Risk] 健康风险分类再次变成默认阻断。→ Mitigation: spec 明确只处理用户主动表达的风险信号，普通目标不得触发健康问询前置。
