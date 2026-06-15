## Context

当前生产聊天链路是 LangChain Agent Runtime 加业务 tool。`searchExerciseResources` 查询 Exercise 数据库并返回动作候选事实；这些事实用于可渲染动作卡片、动作图片、动作详情、`visibleTrainingProposal`、routine、plan 和训练执行界面的服务端校验。

现有合同已经收敛了一个重要边界：内部 `diagnostics`、命中统计和名称歧义诊断不能进入 Planner-visible summary，避免模型被“候选不足”“继续扩大查询”等调试信息诱导循环查询。但这个收敛也留下了另一个缺口：模型缺少稳定方式理解“动作库没有匹配资源”只是产品资源库事实，不是现实训练知识事实。

## Goals / Non-Goals

**Goals:**

- 让模型理解 Exercise 数据库是产品可渲染动作资源库，不是健身知识全集。
- 让空候选、点名动作未命中等结果可以支撑普通文本说明：“当前产品动作库没有匹配的可渲染资源”。
- 允许模型在不需要卡片、图片、结构化训练结果或训练执行项时，基于用户输入、上下文和通用训练知识回答普通文本建议。
- 保持结构化输出边界：任何要进入卡片、图片、`visibleTrainingProposal`、routine、plan 或训练执行界面的 `exerciseId` 仍必须来自数据库事实并通过服务端校验。
- 保持内部 `diagnostics` 不进入 Planner-visible summary。

**Non-Goals:**

- 不补全 Exercise 数据库内容。
- 不新增语义搜索、向量召回、同义词表、关键词分流或动作名称自动归一化。
- 不放宽 `visibleTrainingProposal`、routine、plan 或训练执行项的数据库动作校验。
- 不改变 `/api/chat`、LangChain runtime、provider payload、response adapter 或 renderer 的执行流程。

## Decisions

1. 在 prompt 中表达全局认知边界。

   默认 system prompt 负责告诉模型：通用训练知识可以来自模型自身能力、当前用户输入和上下文；产品动作资源库只负责可渲染资源和结构化训练输出的受控事实。这个边界放在通用 prompt 中，因为它影响普通文本回答和结构化输出之间的选择。

   备选方案是只改 `searchExerciseResources` description。该方案不足，因为未调用 tool 的普通知识问答也需要知道“不需要卡片就不必查询动作库”。

2. 在 `searchExerciseResources` Planner-visible summary 中增加受控 `resourceBoundary`。

   `resourceBoundary` 只表达资源库角色、空结果含义、普通文本知识边界和结构化输出边界。它不暴露 `diagnostics`、内部错误码、命中数、截断状态或“必须继续查询”的指令。

   备选方案是重新向 Planner 暴露 `diagnostics[]`。该方案会回退现有诊断隔离合同，容易重新诱发查询循环，因此不采用。

3. 点名动作未命中只投影为产品资源缺失事实。

   当内部诊断包含 `exercise_name_not_found` 时，summary 可以在 `resourceBoundary.missingExerciseNames` 中列出未命中的点名动作名称，用于支撑“当前动作库没有这个可渲染资源”的回答。该字段不是语义搜索结果，也不是现实动作存在性判断。

   备选方案是把所有名称诊断都投影给 Planner。该方案会暴露歧义、过宽和过滤冲突等调试细节，风险高于当前需求，因此只投影未命中的点名名称。

4. 用模型可见合同门禁保护新字段。

   `model-visible-contract-gate` 需要允许 `resourceBoundary` 下的新增字段，同时继续拒绝 `diagnostics`、命中统计、截断状态、名称歧义诊断和 readiness / workflow 文案。

## Risks / Trade-offs

- [Risk] 模型可能把普通文本建议误读为数据库动作事实。→ 在 prompt、tool description 和 summary 中同时说明：普通文本建议不能声称来自数据库；结构化卡片和训练输出必须使用数据库事实。
- [Risk] 新增 `missingExerciseNames` 可能被误用为语义不存在结论。→ 字段说明限定为“产品动作库当前没有匹配的可渲染资源”，测试覆盖不包含“现实不存在”表达。
- [Risk] 过多边界文案增加 token。→ 只新增短边界，不增加长 examples，不暴露全量 diagnostics。
- [Risk] 修改 prompt/tool description 触发历史回归。→ 通过 production catalog lint、model-visible contract gate 和 tool-level tests 验证。

## Migration Plan

1. 更新 OpenSpec delta 和 tasks。
2. 更新 prompt、tool description、Planner-visible summary 和 contract gate。
3. 补充回归测试并运行相关验证。
4. 不需要数据库迁移、用户数据迁移或运行时配置迁移。

## Open Questions

无。
