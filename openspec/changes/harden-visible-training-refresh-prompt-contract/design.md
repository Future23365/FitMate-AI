## Context

最新 trace 中，`run.messages` 已正确包含 `user: 换一批`，`run.metadata.recentVisibleTrainingProposals` 也只暴露轻量索引，没有完整 `exerciseItems`、`prescription` 或图片 payload。Planner 仍然把请求处理成“按原始 20 分钟徒手全身训练需求重新生成”，并以相同排序调用 `searchExerciseResources`；两次查询的 `excludedCount = 0`，因此数据库返回同一批靠前动作。

这说明当前缺口不是 hydration、去重或完整历史 payload 泄漏，而是模型可见合同没有表达清楚：当用户基于上一套 `visibleTrainingProposal` 要求替换、重新来一套或表达不满意时，编排 / 计划刷新应优先替换上一套用户已看到的动作，同时保留原目标和约束。

## Goals / Non-Goals

**Goals:**

- 在模型实际可见的 AgentAction system prompt 中表达 `visibleTrainingProposal` 的刷新语义：刷新编排或计划时，目标是保留原目标、器械、难度、时长和结构约束，同时优先替换已展示 `exerciseItems`。
- 在 `visibleTrainingProposal` 规格中补齐刷新结果要求，覆盖 `exercise_selection`、`routine` 和 `plan`，尤其是 `routine` / `plan` 不应只按同一条件和同一排序重新输出重复动作。
- 在 `inspectVisibleTrainingProposals` 与 `searchExerciseResources` 的模型可见说明中补齐能力边界：前者用于读取当前会话可见训练方案事实，后者可基于已知排除集合查询替代动作。
- 继续保持 Agent-first：模型决定是否读取事实、是否查询动作库、是否澄清或失败收口；服务端只提供事实入口、tool schema、权限校验、结构校验和 trace。
- 用自动化测试验证模型可见合同包含刷新语义和禁止服务端分流边界。

**Non-Goals:**

- 不新增 `refreshVisibleTrainingProposal`、`generateRoutineDraft`、`generatePlanDraft` 或任何专用刷新 tool。
- 不在 `/api/chat`、Agent core、renderer、tool handler 中根据“换一批”“重新来一套”“不要这个”等自然语言短语选择 tool 或改写 action。
- 不要求固定 tool 调用次数、固定 tool 调用顺序，或把某个短语写成必须调用 `inspectVisibleTrainingProposals` / `searchExerciseResources`。
- 不把完整上一套方案重新塞进 `run.metadata.recentVisibleTrainingProposals`。
- 不改变 `visibleTrainingProposal` payload schema、数据库模型或权限模型。

## Decisions

### 1. 用结果语义约束刷新，而不是 tool 顺序约束刷新

本 change 的核心是让模型看到业务结果要求：刷新上一套可见训练方案时，新的 `visibleTrainingProposal.exerciseItems` 应优先与上一套用户已看到动作产生实质差异。系统 prompt 应表达“保留目标和约束，优先换动作，再重新组成完整结构”。

不写成“用户说换一批就必须调用某个 tool”。工具选择仍由 Planner 基于当前上下文、可见 metadata、tool manifest 和 observations 决定。这样既能支持 `exercise_selection`，也能支持 `routine` / `plan`，并避免把自然语言理解重新搬回服务端。

### 2. 通用 prompt 写稳定业务结构语义，tool manifest 写能力边界

`agent-llm-prompt-config.ts` 是 Planner 首轮一定能看到的合同入口，适合表达 `visibleTrainingProposal` 的稳定结构语义：刷新动作推荐、一次编排或多天计划时，应优先替换上一套可见动作，不应仅重复原始需求。

`inspectVisibleTrainingProposals` 和 `searchExerciseResources` 的 manifest 则负责表达能力边界：

- `inspectVisibleTrainingProposals` 能读取当前会话中用户已经看到的 `visibleTrainingProposal` 事实，但不负责生成新方案。
- `searchExerciseResources` 能查询替代动作，并可用 `excludeExerciseIds` 排除用户已看到或明确要求排除的动作，但不生成最终方案。

### 3. 允许复用用户明确要求保留或候选不足的动作

“换一批”默认应优先替换上一套已展示动作，但不是绝对禁止复用所有动作。若用户明确要求保留某些点名动作，或在严格器械、难度、section、时长约束下候选不足，模型可以复用部分动作，但必须在 `content` 中解释原因，不能假装已经完全换新。

这比硬性要求 `exerciseItems` 零重叠更稳，避免在小候选集场景下把模型逼成编造动作或失败循环。

### 4. 测试聚焦模型可见合同和生产 replay 边界

实现阶段应补充以下验证：

- prompt config 测试断言 system prompt 包含 `visibleTrainingProposal` 刷新语义、保留目标约束、优先替换已展示动作、候选不足说明，并且不包含固定 tool 调用或服务端关键词分流规则；
- manifest 测试断言 `inspectVisibleTrainingProposals` / `searchExerciseResources` 的中文说明覆盖刷新能力边界和 `excludeExerciseIds` 来源；
- production chat replay 测试覆盖有 recent proposal 时，Planner 可选择读取事实、查询替代动作并输出差异化 `visibleTrainingProposal`；无 recent proposal 时可澄清或失败收口；
- 架构扫描确认 `/api/chat`、Agent core、renderer 没有新增自然语言分流。

## Risks / Trade-offs

- [Risk] prompt 过度强调换动作，导致用户只是微调处方时模型也换掉动作。
  Mitigation: 规则限定为“用户要求替换、重新来一套、不满意或同类继续请求”；若用户明确只改组数、时长、顺序或处方，应保留动作并调整对应字段。

- [Risk] 模型仍可能不知道要读取上一套事实。
  Mitigation: 在 tool manifest 中表达读取可见方案事实的能力边界，并通过测试确保 `recentVisibleTrainingProposals` 的索引提示与 `inspectVisibleTrainingProposals` 说明一致；不通过服务端强制选 tool。

- [Risk] 候选不足时无法完全替换。
  Mitigation: prompt 和规格允许模型说明候选不足、询问是否放宽条件或复用用户明确保留动作，但禁止在未说明的情况下重复旧方案并称为“换一批”。

- [Risk] 规则被写成固定短语触发。
  Mitigation: spec 明确禁止固定短语到 tool 或 action 的映射；测试断言 prompt / manifest 不包含“必须调用某 tool”的短语规则。
