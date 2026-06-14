## Context

生产 `/api/chat` 已迁移到 LangChain Agent Runtime 和 DeepSeek native `tool_calls`。训练卡片、动作推荐、单次训练和多天计划统一通过 `submitVisibleTrainingProposal` 提交 `visibleTrainingProposal` payload，再由服务端 validator 校验并投影给前端。

当前代码已经有 `exercise_selection`、`routine`、`plan` 的模型可见说明，但系统 prompt 中“具体动作集合必须提交为 `exercise_selection`”的表达比 `routine` / `plan` 的选择规则更强，且 `submitVisibleTrainingProposal` 的 tool description 与 schema description 使用长句描述互斥关系。模型在 repair 轮容易把缺少 `prescription` 的 `routine` 改成不等价的 `exercise_selection`。

本次根据用户要求不修改通用 tool wrapper 的 schema 失败反馈，也不修改服务端 validator 的错误消息。

## Goals / Non-Goals

**Goals:**

- 去掉通用 system prompt 对 `exercise_selection` 的默认偏置。
- 在 `submitVisibleTrainingProposal` 的 tool description 中用稳定、互斥的 `Kind Selection` 合同表达 `exercise_selection`、`routine`、`plan` 的选择边界。
- 在 schema description 中补齐 `kind`、`prescription`、`schedule` 的条件必填和禁止关系，让模型在看到 schema 时也能区分结构。
- 更新合同级测试，覆盖生产模型可见 prompt、tool description 和 schema description。

**Non-Goals:**

- 不修改 LangChain runtime 主循环、production response adapter、`/api/chat` route 或 tool catalog 注册列表。
- 不新增服务端关键词、正则、同义词、短句模板或基于用户原文的语义分流。
- 不放宽 `visibleTrainingProposal` validator，不允许 `exercise_selection` 包含 `warmup` / `stretch`。
- 不修改通用 `tool_schema_invalid` repair feedback 文案。

## Decisions

### 1. 通用 system prompt 只保留高层结构化交付边界

系统 prompt 只负责说明：具体数据库动作条目不能只靠正文替代结构化训练结果；结构化训练结果的具体形态以当前结构化收口 tool 的 description/schema 为准。

不在 system prompt 中维护完整 `kind` 选择表，因为现有 `agent-llm-prompt-configuration` spec 要求默认 prompt 不承载具体业务 output type 的完整 payload 规则。这样既能消除 `exercise_selection` 偏置，也不会把单个业务 tool 的结构细节升格成通用 prompt。

### 2. `submitVisibleTrainingProposal` 承载完整 kind 判别合同

`Kind Selection` 放在 tool description 中，使用互斥条目说明：

- `exercise_selection` 只用于纯主训练动作推荐集合。
- `routine` 用于单次可执行训练，可以包含 `warmup` / `training` / `stretch`，每个动作项必须带 `prescription`。
- `plan` 用于多天或周期训练计划，需要 `schedule`，每个动作项必须带 `prescription`。

这属于单个业务 tool 模型可见说明，放在 tool description 层级最合适。

### 3. schema description 只补字段关系，不改变 schema

`visibleTrainingProposalPayloadSchema`、`visibleTrainingExerciseItemSchema`、`visibleTrainingPrescriptionSchema` 和 `visibleTrainingScheduleSchema` 增加描述性说明，强调条件必填和禁止关系。`prescription` 字段仍保持 schema 层 optional，由 `superRefine` 按 `kind` 进行条件校验；这样不会改变 TypeScript 类型或 validator 行为。

### 4. 测试断言合同级关键词而非完整长句

测试只断言关键合同存在，例如 `Kind Selection`、`exercise_selection` 只能 `training`、`routine` 需要 `prescription`、`plan` 需要 `schedule`。避免把长篇自然语言逐字绑定成脆弱测试。

## Risks / Trade-offs

- [Risk] system prompt 收敛后，模型更依赖 tool/schema description 理解业务结构。
  → Mitigation：生产 tool catalog 和 model-visible contract gate 测试必须验证 `submitVisibleTrainingProposal` description/schema description 真实进入模型可见输入。

- [Risk] 不修改失败反馈后，repair 轮仍可能不够强。
  → Mitigation：本次按用户要求排除该项；先通过首轮模型可见合同降低错误概率，后续若仍复现，再单独讨论 repair feedback change。

- [Risk] 过度强调 `warmup` / `stretch` 可能让纯动作推荐被误升为 `routine`。
  → Mitigation：`Kind Selection` 明确 `exercise_selection` 的合法范围是纯主训练动作推荐集合，不包含处方、日程或可执行训练编排。
