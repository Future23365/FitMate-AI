# 2026-06-11 21:24:55 CST LangChain 具体动作事实推卡合同收紧

## 背景

LangChain 主链迁移后，`searchExerciseResources` 可以稳定查到数据库动作事实，但同类“推荐动作”对话有时只返回正文列表，有时会调用 `submitVisibleTrainingProposal` 推送卡片。trace 证明前端和 renderer 没坏，问题在模型可见合同允许模型把库内具体动作既当作普通文本说明，也当作结构化训练输出。

## 原方案为什么不够稳定

上一版合同把准入条件写成“用户目标是否要获取可展示、可后续引用或可继续调整的训练动作集合”。这个描述仍然依赖模型对用户问法的理解：同一句“推荐几个动作”可能被理解为动作集合交付，也可能被理解为筛选结果说明。

## 调整思路

本次把判断中心从“用户怎么问”改为“模型最终回答准备展示什么事实”：

- 如果最终回答要向用户呈现一个或多个具体训练动作，并且这些动作来自模型可见、可被服务端数据库复核的受控动作事实，就应通过 `submitVisibleTrainingProposal` 交付 `visibleTrainingProposal.kind = "exercise_selection"`。
- `fitmate_final_response.content` 只负责解释推荐理由、动作注意事项、对比说明、训练建议或补充说明。
- 动作教学、训练知识解释、动作原理或差异解释、空结果或条件不足说明，如果不展示具体数据库动作条目，仍可以只走正文。

## 关键改动

- 更新 LangChain system prompt，把结构化收口准入改为“最终回答呈现可校验数据库动作事实”。
- 更新 `submitVisibleTrainingProposal` description 和 schema description，明确 `exercise_selection` 承载库内具体动作集合。
- 更新 prompt / tool description 测试，防止规则退回用户短句、关键词或服务端语义分流。

## 边界

服务端不解析 `content` 中的动作名，不根据关键词补卡，也不把 `searchExerciseResources` 改成卡片生成器。模型仍负责基于当前可见动作事实自主选择 tool calling，服务端只做 schema、数据库事实和可渲染性校验。
