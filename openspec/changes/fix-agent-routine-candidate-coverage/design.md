## Context

当前 `/api/chat` routine 生成已经走 Tool-first Agent：模型先调用 `searchExercises(candidateUse="routine")`，再调用 `generateRoutineDraft`、`validateRoutineDraft`、`evaluatePolicy` 和 `saveConversationArtifactRevision`。最新 trace 中，模型传给 `generateRoutineDraft` 的 `candidateExerciseIds` 包含用户列出的 8 个动作，但服务端草稿生成器固定为 `warmup / training / stretch` 各选 1 个动作，导致最终 routine 只保留 2 个唯一动作。

现有实现还有一个阶段推断问题：`inferExerciseMetadata()` 把 `伸展 / extension` 统一作为拉伸信号，导致“弹力带髋伸展 / hip extension”这类臀部力量动作可能被当作 stretch 候选。Validator 目前已把 section 语义分歧降级为 warning，因此修复重点不应回到服务端语义硬判，而是让动作元数据和 routine 草稿生成更符合动作库事实。

## Goals / Non-Goals

**Goals:**

- 用户或 Agent 明确传入的 routine 候选动作必须全部进入生成草稿。
- 缺少热身或拉伸动作时，系统可以从受控动作库候选中补齐三段式 routine。
- 主训练支持多个动作项，组数和休息由服务端稳定生成，避免只生成 1 个训练动作。
- 修正 `髋伸展 / hip extension` 被误判为 stretch 的元数据推断。
- 保持所有保存动作都来自数据库，并通过候选集合和 Validator 校验。

**Non-Goals:**

- 不引入任意 SQL 或让 LLM 自由编造 `exerciseId`。
- 不把 section 语义分歧重新升级为 hard fail。
- 不改变 routine 卡片 UI 或持久化表结构。
- 不重写完整动作检索排序系统。

## Decisions

1. `generateRoutineDraft` 以传入 `candidateExerciseIds` 作为必须保留集合。

   这些 id 表示用户指定动作或模型已决定用于 routine 的动作。服务端不得再按三段式阶段挑选静默丢弃它们。实现上会先按动作库读取这些 id，去重后全部分配到 section：允许 warmup 的动作进入 warmup，仅允许 stretch 的动作进入 stretch，其余默认进入 training。这样保持确定性，也避免服务端重新解释用户自然语言。

2. 补充动作仍必须来自受控动作库。

   如果必须保留集合缺少 warmup 或 stretch，生成器可以从动作库中按当前器械、阶段和基础安全条件补充 1 个动作。补充动作会加入 draft 的 `candidateExerciseIds` 输出，并作为后续 `validateRoutineDraft` 的候选集合输入；保存前仍按 `outside_candidate_exercise_id` 规则校验。该做法等价于“让 LLM/Agent 补充动作”的受控版本：模型可以继续通过 `searchExercises` 扩大候选，服务端兜底只能选数据库中可验证动作。

3. 主训练训练量按动作数量生成。

   training section 可以包含多个动作项。新手默认每个主训练动作 2 组，非新手 3 组；保留现有 `trainingLoopRounds` 和休息配置。热身和拉伸保持 duration 模式并只补齐必要阶段。这样比单纯放大 `trainingLoopRounds` 更可读，也更符合“把这批动作编成训练”的用户请求。

4. 元数据推断区分拉伸词和力量动作词。

   `stretch / 拉伸 / 放松 / mobility` 仍作为 stretch 信号；中文 `伸展` 和英文 `extension` 只有在没有明显力量训练上下文时才作为 stretch 信号。若同时命中 `hip extension / 髋伸展 / back extension / leg extension` 等力量动作模式，默认保留 training。

## Risks / Trade-offs

- [Risk] 训练动作过多可能让新手训练量偏高。→ 保持 Validator 的 `too_many_daily_sets`、`beginner_volume_high` warning，并通过测试覆盖总组数边界。
- [Risk] 自动补充动作可能不完全符合用户想练的肌群。→ 补充动作只用于缺失的热身或拉伸阶段，主训练不自动增加未指定动作；补充仍优先同器械和通用低风险动作。
- [Risk] 现有测试依赖 3 个 section 各 1 个 item。→ 更新测试为检查 section 存在和指定动作覆盖，而不是固定 item 数量。
- [Risk] `candidateExerciseIds` 含义从“输入候选”扩展为“最终生成候选边界”。→ 通过 tool output 和 validation resource 持续传递扩展后的候选列表，保证保存链路仍可证明来源。

## Migration Plan

1. 更新 OpenSpec delta spec 和任务清单。
2. 调整 `generateRoutineDraft` 的草稿构建函数和输出候选 id。
3. 调整动作元数据推断规则。
4. 补充单测并运行相关测试、typecheck。
5. 更新方案变更历史和项目演变历程。
