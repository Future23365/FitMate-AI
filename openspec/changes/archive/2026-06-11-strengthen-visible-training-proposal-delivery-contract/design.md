## Context

生产 `/api/chat` 当前使用 LangChain Agent Runtime、DeepSeek native `tool_calls` 和 production LangChain tool catalog。失败 trace 显示模型已执行 `searchExerciseResources` 并获得动作事实，但最终只通过结构化 final response 返回正文和建议问题，没有调用 `submitVisibleTrainingProposal`，因此 `validatedVisibleOutputs` 为 0，response adapter 没有输出 `visible_output`。

当前服务端终态校验已经不应要求模型证明 `exerciseId` 来自当前 run 可消费 tool result；`submitVisibleTrainingProposal` 应由服务端数据库事实复核动作存在、发布态和 `allowedSections`。因此本修复只收紧模型可见交付合同，不恢复 current-run 可消费事实门槛。

## Goals / Non-Goals

**Goals:**

- 让模型可见输入明确：动作候选 / 动作推荐卡片应通过 `visibleTrainingProposal(kind="exercise_selection")` 交付。
- 让 `submitVisibleTrainingProposal` 的 description / schema description 清晰区分 `exercise_selection`、`routine`、`plan` 的用途、必填字段、禁止字段和成功输出含义。
- 让 `searchExerciseResources` 的 model observation 明确：查询结果是 section-scoped 动作事实来源，不是最终训练卡片；需要用户可见训练结果时应由结构化收口 tool 交付。
- 保持服务端语义中立，不根据用户短句、关键词、具体 phrasing 或业务字段组合改写 provider `tool_calls`。
- 用自动化测试证明模型可见合同覆盖动作候选卡片，同时没有重新引入 current-run 可消费事实门槛。

**Non-Goals:**

- 不修改前端卡片渲染、chat client、response adapter 或 `/api/chat` route。
- 不新增服务端自然语言路由、关键词判断、正则、同义词表或短句模板。
- 不修改 `visibleTrainingProposal` validator 的数据库事实校验策略。
- 不新增业务 tool，不修改 production tool catalog 白名单。
- 不把具体用户原话写进生产 prompt 规则；具体用户输入只进入回归测试样例。

## Decisions

### 1. 修复放在模型可见合同，不放在 response adapter

`visible_output` 当前由 response adapter 从已校验 `validatedVisibleOutputs` 投影出来。若在 response adapter 看到 `searchExerciseResources` 就自动生成卡片，会绕过模型结构化交付、服务端 validator 的现有边界，也会把普通动作解释误投影成卡片。

因此本次只修改 prompt / tool description / schema description / tool result summary，让模型自主调用 `submitVisibleTrainingProposal`。response adapter 继续只投影已校验可见输出。

### 2. `exercise_selection` 的职责写入 finalization tool 局部说明

默认 system prompt 只保留通用交付规则：正文不能替代结构化训练结果，结构化训练结果必须通过当前可见 finalization tool 和服务端 validator。`visibleTrainingProposal` 的具体 `payload.kind` 语义不写入通用 prompt，而写入 `submitVisibleTrainingProposal` 的 description 和 schema description：

- `exercise_selection` 表示动作候选 / 动作推荐卡片，只包含 `training` section 动作项，不输出 `prescription` 或 `schedule`。
- `routine` 表示单次训练编排，每个动作项需要 `prescription`。
- `plan` 表示多日或周期计划，需要 `schedule`。

这样符合 Prompt 定策略、Schema 定形状、Tool 定能力、Validator 守边界的分层。

### 3. 动作事实来源改为“模型可见且数据库可复核”

旧表述“当前 run 可见且可消费”容易把历史 current-run resource gate 带回终态校验。本次统一改为：模型构造 `exerciseItems[].exerciseId` 时应使用模型可见的受控动作事实，例如成功动作查询结果、已导入的可见训练事实或等价受控数据库事实；服务端最终用数据库事实复核，不要求模型传递内部 `factRef`、`messageId`、`toolResultId` 或证明 current-run provenance。

这保留“不得编造 exerciseId”的模型约束，同时不恢复已经移除的服务端 current-run 消费门槛。

### 4. 搜索 tool observation 只说明事实边界

`searchExerciseResources` 仍然只是动作事实查询 tool。它的 observation 可以说明 `groups.<section>.exercises[]` 能作为 `visibleTrainingProposal.exerciseItems[]` 的动作事实来源，也可以说明查询结果没有生成卡片。它不应告诉模型某个用户短句必须选择某个 `payload.kind`，也不应把自己描述成训练卡片生成器。

## Risks / Trade-offs

- [Risk] DeepSeek `toolChoice: auto` 仍可能偶发选择纯文本收口。
  Mitigation: 通过更清晰的 tool affordance、output meaning 和 regression tests 降低漂移；若后续仍不稳定，再讨论独立的通用 final grounding / repair 机制，而不是服务端短语分流。

- [Risk] prompt 规则过多会把业务流程塞回 system prompt。
  Mitigation: system prompt 只保留一条通用结构化交付规则；业务结构细节放在 `submitVisibleTrainingProposal` description / schema description。

- [Risk] 测试过度绑定具体文案。
  Mitigation: 测试断言稳定合同关键词和禁止项，例如 `exercise_selection`、`validatedVisibleOutputs`、不包含 current-run 可消费事实门槛，而不是断言完整中文段落。

## Migration Plan

1. 新增 OpenSpec delta，声明模型可见交付合同和搜索 observation 边界。
2. 更新 system prompt、`submitVisibleTrainingProposal` description / schema description、`searchExerciseResources` model observation。
3. 更新最窄相关测试。
4. 运行 OpenSpec 校验、相关 tool / catalog / runtime 测试和 TypeScript 检查。
