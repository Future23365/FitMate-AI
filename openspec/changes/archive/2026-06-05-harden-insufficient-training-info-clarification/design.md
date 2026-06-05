## Context

当前 `/api/chat` 生产链路已经注册 `inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions` 和 `searchExerciseResources`，并通过 `final_answer.visibleOutputs[]` 渲染 `visibleTrainingProposal`。现有合同已经覆盖 section readiness、数据库动作事实和 refresh 引用边界，但仍存在两个关键缺口：

1. 模型可见 prompt 没有把“新训练输出的信息充分性”表达为首轮前置条件。模型可以在用户只给出笼统目标时，先查询宽泛动作事实，再输出训练卡片。
2. `visibleTrainingProposal` validator 只校验动作是否存在、发布态和 section 是否允许，没有复核这些动作是否来自当前 run 已满足的动作查询或可消费训练事实。只要模型碰巧输出数据库里存在的动作，随机卡片就可能通过校验。

本修复必须遵守 Agent 边界：服务端不根据用户原文、关键词、短句模板或 phrasing 判断语义；服务端只校验结构、权限、事实来源、resource 和 grounding。

## Goals / Non-Goals

**Goals:**

- 让模型在新生成训练结构前看到稳定的信息充分性合同，缺少关键条件时优先澄清或给可选方向。
- 让 `searchExerciseResources` 对无目标 broad query 返回诊断性未满足结果，阻止宽泛动作池支撑成功训练卡片。
- 让 `visibleTrainingProposal` 终态校验复核当前 run 事实来源，确保动作项来自 satisfied tool result 或 consumable resource。
- 保留模型自主选择 `tool_call`、`final_answer`、`ask_user` 和 `payload.kind` 的能力。
- 用 F03、F05、F12 及同类变体覆盖回归。

**Non-Goals:**

- 不新增 `/api/chat` 用户原文关键词路由、正则、同义词表或短句模板。
- 不新增训练生成 service、draft tool、隐藏默认计划或服务端动作编排。
- 不改变数据库 schema、Prisma migration、权限模型或 stream NDJSON 合同。
- 不要求所有训练建议都必须生成卡片；普通文本解释和可选方向仍允许。

## Decisions

### 1. 信息充分性放在模型可见 prompt，而不是服务端语义分流

默认 Agent prompt 增加通用规则：当本轮要新输出 `visibleTrainingProposal` 时，模型必须先确认当前对话、已导入事实或当前 tool results 能解释为什么选择这些动作和结构。缺少关键条件时，合法收口是 `ask_user`，或 `final_answer` 不带 `visibleOutputs`，只给可选方向和 `suggestedQuestions`。

取舍：这不会保证所有模型调用都一次成功，但它把正确行为放在模型实际可见合同里，避免服务端按“给我一套训练”这类短句做硬路由。

### 2. broad query 按结构化 input 判定 fulfillment，不读用户原文

`searchExerciseResources` handler 保持只读查询能力，但 `toFulfillment` 将检查结构化 input 的可解释约束。若输入除了默认 `suitabilities`、`published`、`sort` 外，没有 `q`、`category`、`level`、`force`、`mechanic`、`equipment`、`homeRequirement`、`muscle`、`muscles`、`goalTag`、`riskTag`、`requiredExerciseIds` 或 `excludeExerciseIds`，则返回 `satisfied=false`。

取舍：tool 仍可返回安全摘要和 diagnostics，便于模型解释“当前查询过宽”；但失败/未满足结果不能支撑成功 `final_answer`。这属于结构化 tool input 合同，不是自然语言关键词判断。

### 3. `visibleTrainingProposal` validator 复核当前 run 可消费动作事实

validator 在现有数据库校验前后补一层当前 run 来源校验：

- 从 `ok=true` 且 `fulfillment.satisfied=true` 的 `searchExerciseResources` projection 中收集 `groups.<section>.exercises[*].exerciseId`。
- 从 `ResourceStore` 中 `role=consumable` 且资源摘要含训练方案事实的 resource 收集 `exerciseItems[*].exerciseId + section`。
- `visibleTrainingProposal.exerciseItems[*]` 必须逐项命中当前 run 可消费事实来源；只存在于数据库、不存在于当前 run 事实来源时拒绝。

取舍：这比只改 prompt 更强，因为它封住了模型直接输出有效数据库 id 的绕过路径；同时不需要解释用户自然语言，也不修改 core validator 分发机制。

### 4. 测试覆盖生产合同而非只改黑盒 judge

回归测试分四类：

- prompt / manifest 测试：确认模型实际可见合同包含信息充分性、broad query 和可恢复收口规则。
- tool-level 测试：确认 broad query `fulfillment.satisfied=false`，且 observation 指导 `ask_user` 或补充约束。
- validator / production replay 测试：确认没有当前 run 可消费动作事实的 `visibleOutputs` 被拒绝，宽泛 tool result 也不能支撑成功卡片。
- 基础黑盒 fixture / judge 测试：F03、F05、F12 明确“不推送不可解释训练卡片”；如果出现训练卡片，即使有泛泛建议也不能判为通过。

## Risks / Trade-offs

- [Risk] 某些用户希望“随便来一个”的场景会更常被追问。→ Mitigation：允许无 `visibleOutputs` 的可选方向和 `suggestedQuestions`，用户点击或补充后再生成。
- [Risk] validator 来源校验可能拒绝测试中直接构造的可见输出。→ Mitigation：更新测试 fixture，使成功输出显式提供 satisfied tool result 或 consumable resource；保留数据库校验覆盖。
- [Risk] prompt 规则过多增加模型负担。→ Mitigation：只新增通用信息充分性合同，不枚举固定用户短句，不要求固定 tool 调用顺序。
- [Risk] broad query 仍会消耗一次 tool 调用后才发现不满足。→ Mitigation：prompt 同步要求缺条件时优先 `ask_user`；tool fulfillment 作为兜底，防止 broad result 继续支撑成功卡片。

## Migration Plan

1. 先更新 OpenSpec、prompt、tool fulfillment / observation 和 validator。
2. 更新相关单测和 production replay。
3. 运行 OpenSpec validate、tool-level / validator / chat-service / manual fixture 测试和 `npm run typecheck`。
4. 真实 LLM 黑盒需要用户明确允许消耗模型调用；本 change 先提供自动化合同验证。

## Open Questions

- 无。
