## Context

当前 `searchExercises` 已能在 routine 候选不足时生成 `controlledSupplementalCandidates`，并把补充动作加入 `candidateSetEvidence.exerciseIds`。但最新 trace 中，`generateRoutineDraft` 仍在候选集合包含 `Dynamic_Back_Stretch`、`Dynamic_Chest_Stretch` 且 evidence 标记它们用于 `warmup` 的情况下报 `candidate_set_missing_warmup`。

根因是 draft builder 重新按动作元数据选择 section：拉伸类动态动作被 `selectRoutineSectionForRequiredExercise()` 放入 `stretch`，没有读取上游受控补充证据里的 `section`。同时，缺失 section 的本地补齐仍优先匹配 `intent.equipment`，导致普通“有哑铃”继续影响 warmup / stretch。

## Goals / Non-Goals

**Goals:**

- 让 `generateRoutineDraft` 使用 `candidateSetEvidence.controlledSupplementalCandidates` 作为 section 分段事实源。
- 让 warmup / stretch 的服务端补齐默认优先无器械或自重动作，不再默认匹配用户主训练器械。
- 保持所有动作仍来自数据库和当前 candidate set evidence，后续 Validator / Policy / save 仍走现有资源合同。
- 用单测复现最新日志中的失败路径，证明用户给出无器械热身/拉伸后不再重复追问或 `timeout`。

**Non-Goals:**

- 不新增服务端自然语言关键词判断，不根据用户原文重写 intent。
- 不修改 Prisma Schema、数据库数据模型或 `/api/chat` 外部请求格式。
- 不放宽 candidate set、validation、policy 或 artifact 保存边界。
- 不做真实浏览器验证、不启动 dev server。

## Decisions

### 1. 受控补充 evidence 优先于通用元数据分段

`buildRoutineDraftFromCandidates()` 增加可选 `candidateSetEvidence` 参数，从 `controlledSupplementalCandidates` 构建 `exerciseId -> section` 映射。若当前动作命中该映射，draft builder 使用 evidence section；否则继续使用现有 `selectRoutineSectionForRequiredExercise()`。

选择这个方案，而不是把所有动态拉伸元数据改成 warmup，是因为同一个动作在不同 candidate set 中可能被服务端用作不同 section 的受控补充。evidence 是本轮结构化工具结果，更贴近当前候选合同。

### 2. 缺失 warmup / stretch 时优先无器械补齐

`pickSupplementalExerciseForSection()` 对 `warmup` 和 `stretch` 不再优先匹配 `intent.equipment`，而是先选无器械 / 自重动作，再回退到任一符合 section 的候选。`training` 仍保留现有器械匹配优先级。

这样可以表达“有哑铃”默认作用于主训练，而不会让热身和拉伸再次被哑铃硬约束污染。用户明确要求全程同器械时，仍可通过 search filters / candidate set evidence 把可用候选限制在该边界内。

### 3. 工具说明补充 section-aware 输入提示

`searchExercises` 模型可见说明补充：routine 场景中，普通器械约束应写入 training 候选边界；warmup / stretch 默认允许无器械受控补充。prompt 已有类似规则，但工具说明也要同步，减少模型在 schema 层反复输出全局 `equipment.in`。

## Risks / Trade-offs

- [Risk] evidence section 与动作元数据不一致时可能让拉伸动作进入 warmup。→ Mitigation: 只接受服务端 `controlledSupplementalCandidates` 中的结构化 section，且 Validator 继续用 candidate evidence 校验补充动作边界。
- [Risk] 用户确实想全程使用哑铃时被默认放宽。→ Mitigation: 本改动不绕过 candidate set；若上游 search 明确把 warmup/stretch 也限制为哑铃且 evidence 满足，draft builder 仍只能使用该候选边界内动作。
- [Risk] 只改 prompt 可能短期更快但不稳定。→ Mitigation: 这次改服务端 draft builder 和测试，prompt 只做辅助说明。

## Migration Plan

1. 更新 OpenSpec delta specs 和 tasks。
2. 调整 `workout-tools.ts` 的 routine draft builder，消费 `candidateSetEvidence.controlledSupplementalCandidates`。
3. 调整 warmup / stretch 本地补齐器械优先级。
4. 补充 `agent-orchestrator` 和 `exercise-service` 回归测试。
5. 运行相关测试、`npm run typecheck` 和 `openspec validate relax-routine-phase-equipment-boundaries --strict`。

## Open Questions

无。
