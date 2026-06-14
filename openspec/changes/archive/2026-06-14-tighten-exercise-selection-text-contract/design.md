## Context

当前生产 `/api/chat` 使用 LangChain Agent Runtime 和 DeepSeek native tool_calls。训练卡片、动作推荐、单次训练和多天计划都通过 `submitVisibleTrainingProposal` 进行结构化收口和服务端校验。

本次 trace 暴露的直接问题有两层：
- 第一次 `submitVisibleTrainingProposal` 使用 `payload.kind = "exercise_selection"`，但动作项包含 `prescription`，被服务端 schema 正确拒绝。
- 后续修正 payload 后，最终正文仍输出 `3 组 × N 次`、组间休息和每周频率等处方型内容。

结构化 schema 已经能拦截 payload 中的非法 `prescription`，缺口在模型可见文本合同：通用 prompt 和 `submitVisibleTrainingProposal` description 都允许 `content` 写“训练建议”，但没有区分动作推荐解释和训练编排处方。

## Goals / Non-Goals

**Goals:**
- 让模型稳定区分“动作推荐集合”和“可执行训练编排 / 多天计划”。
- 当 `payload.kind = "exercise_selection"` 时，让正文只解释推荐理由、目标肌群、动作注意事项、适用场景、动作差异或与用户目标的关系。
- 让组数、次数、时长、休息、训练频率、日程等处方型内容只在用户明确需要训练安排，或模型选择 `routine` / `plan` 且 payload 能支撑时出现。
- 保持模型基于语义自主判断用户要动作、编排还是计划，不通过服务端关键词或短句模板分流。

**Non-Goals:**
- 不修改 `repair feedback` 或工具失败反馈。失败反馈继续只表达结构化错误事实，不新增自然语言意图判断。
- 不修改 validator，让 validator 继续只校验结构、字段、数据库事实、section、`prescription`、`schedule` 和可渲染边界。
- 不在 `/api/chat`、LangChain runtime、tool handler、response adapter 或 renderer 中新增关键词、正则、同义词表、短句模板或用户原文分支。
- 不改变 `visibleTrainingProposal` payload schema 形状，不新增字段，不修改数据库或持久化结构。

## Decisions

### 1. 通用正文边界放在 system prompt 的回答规则

通用 prompt 负责最终正文和结构化输出之间的高层边界。新增规则应表达：
- 动作推荐集合的正文只能承担解释和注意事项，不主动输出处方参数。
- 处方参数包括组数、次数、时长、休息、训练频率和日程。
- 用户明确要求训练安排、routine 或 plan 时，才可以在结构化 payload 支撑下输出处方相关说明。

这个规则不写具体用户短句，也不绑定具体 `toolName`。它描述稳定输出类型边界：动作推荐解释 vs 训练编排处方。

### 2. `submitVisibleTrainingProposal` 说明承担业务结构语义

`submitVisibleTrainingProposal` 是 `visibleTrainingProposal` 的 finalization tool，应在 schema description 和 description 中说明：
- `kind=exercise_selection` 表示动作推荐集合，只承载动作事实，不承载 `prescription` 或 `schedule`。
- `kind=routine` 表示一次可执行训练，动作项需要 `prescription`。
- `kind=plan` 表示多天训练计划，动作项需要 `prescription`，并需要 `schedule`。
- 当 `kind=exercise_selection` 时，`content` 不应主动输出和处方等价的自然语言参数。

这属于业务 tool 局部说明，不放到 validator，也不改 runtime。

### 3. 测试覆盖模型可见合同，不做 LLM 文本硬拦截

自动化测试优先覆盖：
- system prompt 包含动作推荐正文边界。
- production tool catalog 中 `submitVisibleTrainingProposal` description / schema description 包含 `exercise_selection` 的处方边界。
- 现有模型可见 contract gate 不出现服务端关键词分流、具体 phrasing 触发或 runtime 业务 `toolName` 分支。

黑盒 LLM 回归可以作为手工验证或 manual test：原始用户表达和等价表达只作为测试样例，不反向决定生产规则。

## Risks / Trade-offs

- [Risk] 模型在只问动作时回答变短，用户可能希望顺手得到训练量。  
  Mitigation: 正文仍可给动作理由、目标肌群和注意事项；如果用户需要训练安排，可以通过建议问题或后续追问进入 `routine` / `plan`。

- [Risk] 规则过宽导致模型连泛化训练建议都不敢给。  
  Mitigation: 禁止的是具体处方参数，不禁止解释减脂原则、动作质量、注意事项或建议搭配全身训练 / 有氧这类非结构化常识。

- [Risk] prompt 过长增加噪声。  
  Mitigation: 通用 prompt 只加短边界，详细 kind 语义放在 finalization tool schema description / description。
