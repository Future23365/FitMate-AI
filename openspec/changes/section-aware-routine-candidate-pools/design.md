## Context

当前生产链路中，LLM 通过一次 `searchExercises(candidateUse="routine")` 获取 routine 候选，再调用 `generateRoutineDraft`。这个接口表面上支持 `allowedSections` 和 `sectionCoverage`，但实际输入仍是一组全局 filters。主训练的肌群、器械、难度和强度很容易被套到 warmup / stretch，或者模型只声明 `training` 覆盖，导致热身和拉伸补齐逻辑完全不触发。

已有规格已经要求 warmup / stretch 默认不继承主训练器械；这次设计的重点是把该规则从“补齐失败后的局部兜底”升级为 routine 候选生成的服务端结构化管线。

## Goals / Non-Goals

**Goals:**

- 保持 LLM 一次调用 `searchExercises(candidateUse="routine")`，由服务端内部拆分 `warmup`、`training`、`stretch` 候选池。
- 默认让 warmup / stretch 使用无器械或自重，且适合对应 section 的动作。
- 让 `candidateSetEvidence` 明确记录 section pool 来源，供 `generateRoutineDraft`、validation、policy 和 save 链路复用。
- 避免因为模型漏写 `warmup` / `stretch` 的 `sectionCoverage`，或把主训练 filters 作为全局约束，而阻断 routine 生成。

**Non-Goals:**

- 不让 LLM 分三次调用 warmup / training / stretch 搜索。
- 不新增 Prisma Schema、数据库迁移或外部 API 请求格式。
- 不修改动作库原始数据。
- 不新增服务端自然语言关键词判断；是否“全程同器械”仍应来自结构化模型输出、上下文事实或明确工具输入。
- 不放宽动作必须来自数据库、本轮候选集合和权限边界的要求。

## Decisions

### 1. 一次工具调用，服务端内部三池

`searchExercises(candidateUse="routine")` 继续对 Agent 暴露为一次工具调用，并返回一个 `candidateSetId`。服务端在执行阶段内部构建：

- `trainingPool`: 使用用户主训练相关 hard filters，包括 `bodyRegions`、`targetMuscles`、`equipment`、`levels`、`difficulty`、风险排除和目标偏好。
- `warmupPool`: 使用 `allowedSections=["warmup"]`，默认加无器械或自重边界；保留发布态、风险排除、居家边界，并可弱关联 `bodyRegions`。
- `stretchPool`: 使用 `allowedSections=["stretch"]`，默认加无器械或自重边界；保留发布态、风险排除、居家边界，并可弱关联 `bodyRegions`。

选择这个方案，而不是让 LLM 调三次，是因为三次工具调用会增加 token、loop 和失败面，并把一个 routine 候选事实源拆成多个资源，后续 `generateRoutineDraft`、validation 和 save 都更难做一致性校验。

### 2. 默认补全三段式 `sectionCoverage`

当 `candidateUse="routine"` 且请求会进入完整 routine 生成时，服务端必须将缺失的 section 覆盖归一化为默认值：

- `warmup.min = 1`
- `training.min` 保留模型请求值；若缺失则使用 routine 默认主训练候选下限
- `stretch.min = 1`

这不是覆盖用户语义，而是 routine 结构合同归一化。用户明确要求省略热身或拉伸不在本 change 范围内；当前产品 routine 仍以三段式结构为准。

### 3. `candidateSetEvidence.sectionPools` 成为分段事实

`candidateSetEvidence` 增加 `sectionPools`，记录每个 section 的候选 id、应用 filters、是否来自默认无器械边界，以及是否为受控补充。`controlledSupplementalCandidates` 可以继续保留，但 draft builder 应优先消费 `sectionPools`，再回退到已有 `controlledSupplementalCandidates`，最后才使用动作通用元数据推断。

这样可以避免“动态拉伸动作被通用元数据挪到 stretch，导致 warmup 缺失”这类二次分段错误，也能让 trace 展示服务端为什么认为某动作属于 warmup 或 stretch 候选。

### 4. 非 training section 的器械边界必须显式

默认规则：

- 用户说“无器械”或未指定器械时，warmup / stretch 使用无器械或自重候选。
- 用户说“有哑铃”“用弹力带训练”这类普通可用器械表达时，器械默认只约束 `trainingPool`。
- 用户明确要求“热身和拉伸也用弹力带”“全程都用哑铃”时，才把对应器械约束应用到 `warmupPool` 或 `stretchPool`。

实现上不应通过关键词在服务端二次理解用户原文，而应基于 Agent 传入的结构化 filters、section-scoped constraints 或已有确认事实决定。

### 5. 恢复提示必须指向 section-aware 重查

如果 routine 候选仍然缺少某个 section，工具 diagnostics 和 recoveryOptions 应说明缺的是哪个 section pool，并提示使用 section-aware routine candidate set，而不是“用同一 hard filters 重新查”。后者会诱导模型继续把主训练 filters 压到 warmup / stretch。

## Risks / Trade-offs

- [Risk] warmup / stretch 默认无器械可能与用户隐含偏好不一致。→ Mitigation: 只有明确全程同器械或明确 section 器械时才使用对应硬约束；普通可用器械表达按主训练处理。
- [Risk] section pool evidence 扩大工具输出结构。→ Mitigation: 保持一个 `candidateSetId`，只在 evidence / diagnostics 中增加结构化字段，避免改变后续资源合同。
- [Risk] 服务端分池会让排序逻辑更复杂。→ Mitigation: 先复用现有 hard filter 与 ranking profile，新增 section-specific filter builder，并用单测覆盖每个 section 的默认边界。
- [Risk] 只靠模型 prompt 仍可能传错输入。→ Mitigation: 关键归一化放在服务端，prompt 和工具说明只作为辅助。

## Migration Plan

1. 在 OpenSpec delta specs 中明确 `sectionPools`、三段式覆盖归一化和默认无器械 warmup / stretch 规则。
2. 实现 `searchExercises(candidateUse="routine")` 的 section-aware candidate plan 和 evidence 输出。
3. 调整 `generateRoutineDraft` 优先消费 `candidateSetEvidence.sectionPools`。
4. 更新工具说明、失败恢复提示和 trace diagnostics。
5. 补充自动化测试和最新日志回归场景。
6. 运行相关测试、`npm run typecheck` 和 `openspec validate section-aware-routine-candidate-pools --strict`。

## Open Questions

无。
