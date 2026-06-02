## Context

黑盒报告暴露的失败可以归为三类：

1. 动作推荐类请求已经进入 Agent，但推荐卡片依赖 `answered.usedToolResultIds` 精确引用 `searchExercises` 结果；模型漏写引用时，服务端明明有 `candidateSetId` 也不会投影卡片。
2. routine/plan 生成工具链只覆盖“已有 artifact 的新 revision”，没有覆盖用户第一次要求生成 routine/plan 的新 artifact 创建；模型因此倾向停在自由文本 `answered` 或 `blocked`。
3. `generatePlanDraft` 强制要求 `sourceArtifact`，导致“给我一个 6 天训练计划”这类首轮长期计划无法从候选集合直接生成。

这次修复不回到旧 intent-first，也不新增服务端关键词意图纠偏。服务端只使用 Agent 已选择的工具结果、结构化 tool input、动作库 facet 和 artifact 写入合同做确定性收口。

## Goals / Non-Goals

**Goals:**
- 让成功的推荐候选工具结果稳定产生 `exercise_recommendation` artifact 事件。
- 让新 routine/plan artifact 可以通过 Agent 写工具创建，已有 artifact 仍走 revision。
- 让长期 plan 可在没有 source artifact 时由候选集合生成受控种子模板。
- 保持黑盒报告只统计用户可见训练卡片，避免把 Agent 状态当成额外卡片。
- 补充自动化测试覆盖这些回归点。

**Non-Goals:**
- 不恢复旧 `ResolvedChatIntent`、旧 `assistant_action` 或旧 action gate。
- 不让服务端基于用户原文关键词判断 intent。
- 不改变 `ConversationArtifact` 数据模型。
- 不改前端卡片 UI。

## Decisions

1. **推荐卡片投影以本轮 `candidateUse="recommendation"` 工具结果为事实源。**

   `buildExerciseRecommendationArtifactEvent()` 先使用 `usedToolResultIds` 找推荐结果；如果模型漏写引用，则退回本轮最后一个成功的 `searchExercises(candidateUse="recommendation")`。这个回退不读取用户原文，只使用模型已经选择的工具用途和服务端候选集合。

2. **动作 facet 规范化只处理工具入参到数据库 facet 的确定性映射。**

   `searchExercises` 的可恢复逻辑会把 `胸`、`胸肌`、`胸大肌` 等短 facet 映射到已有动作库 facet `胸部`，把 `腿`、`腿部` 映射到 lower body 展开。它不改变 Agent 的高层语义，只避免模型结构化工具入参和数据库 facet 命名差异导致 0 候选。

3. **保存工具同时支持新建 artifact 与创建 revision。**

   当 `sourceArtifactId` 存在时，继续调用 `createConversationArtifactRevision()` 并保持旧 revision 边界。当 `sourceArtifactId` 缺失且提供 `artifactKind` 时，保存工具调用 `createOrUpdateConversationArtifact()` 创建当前 session 的新 routine/plan artifact。

4. **新建 artifact policy 与 revision policy 分开表达。**

   `evaluatePolicy` 增加 `policyTarget="new_artifact"` 分支，用于首次创建聊天 artifact。它不需要历史 source artifact，但仍输出 `policyDecisionId`，供保存工具校验写入前置条件。

5. **直接 plan 生成使用候选集合种子模板。**

   `generatePlanDraft` 的 `sourceArtifact` 改为可选。缺少 source artifact 时，工具从本轮候选动作构造一个三段式 seed routine payload，再交给 `DomainPlanEngine` 展开长期 plan。所有动作仍来自 candidate set，生成结果仍经过 Validator。

6. **黑盒报告区分 Agent 状态和训练卡片。**

   训练卡片已出现时，`answer` 不再作为额外卡片类型参与“实际卡片类型”断言；普通无卡片回复仍可保留 `answer` 状态用于报告。

## Risks / Trade-offs

- [Risk] 推荐结果在模型漏写引用时仍被投影，可能让报告看起来比模型最终 JSON 更宽松。→ 回退只允许 `candidateUse="recommendation"` 的成功工具结果，不会从 answer-only 搜索生成卡片。
- [Risk] 新建 artifact 写入绕过 revision source。→ 新建路径必须提供 `artifactKind`、通过 draft validation、通过 policy，并绑定当前 `sessionId` 和 `userId`。
- [Risk] 没有 source artifact 的 plan 可能内容较通用。→ 仍使用候选集合构造 seed routine，并由 `DomainPlanEngine` 负责周期展开和 Validator 校验。
