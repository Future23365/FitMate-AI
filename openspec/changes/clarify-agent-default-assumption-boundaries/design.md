## Context

当前生产 `/api/chat` 使用 LangChain Agent Runtime 和 DeepSeek native tool_calls。用户给出宽泛训练目标时，模型可以自主选择直接回答、调用工具、提交结构化训练结果或追问澄清。

现有合同里已有两个重要边界：
- 未指定器械的动作推荐可以默认无器械 / 自重。
- `searchExerciseResources` 中 `equipment` 表达器械可用性，`homeRequirement` 表达环境、场地或支撑条件，两者不能混用。

当前问题不是服务端改写了模型语义，而是模型可见合同没有清楚表达：保守默认只是继续推进的最小假设，不应级联扩张成更多未确认偏好；同时 `zeroMatchMuscles` 是诊断事实，不是继续补查每个肌群的义务。

## Goals / Non-Goals

**Goals:**
- 让模型在目标可理解但偏好缺失时，稳定具备两个出口：使用说明清楚的保守默认继续，或向用户追问一个关键问题。
- 让保守默认保持最小化，只补齐当前任务必要边界，不把器械默认继续扩展成场地、支撑条件、时长、经验或细分覆盖要求。
- 让宽泛身体目标以代表性覆盖为默认理解，避免因全身或多肌群目标持续补查每个细分肌群。
- 让 `searchExerciseResources` 的 `zeroMatchMuscles` 和 `homeRequirement` 模型可见说明更清楚，减少不必要的重复查询。

**Non-Goals:**
- 不新增服务端关键词、正则、同义词表、短句模板或自然语言分流。
- 不修改 LangChain runtime 主循环、provider tool calling、tool wrapper 通用执行、API route 或 production response adapter。
- 不改变 `searchExerciseResources` 的 input / output schema 形状、repository 查询逻辑、数据库结构或权限边界。
- 不移除“未指定器械默认无器械”的既有产品默认，只澄清该默认与澄清出口的关系。

## Decisions

### 1. 默认策略放在通用 Agent prompt

通用 prompt 负责模型规划策略和停止条件。新增规则应表达：
- 缺少器械、场地、时长、经验等偏好时，模型可以保守默认继续，也可以追问关键问题。
- 选择默认继续时，正文要说明默认口径。
- 默认假设只补齐当前任务所需的最小边界。
- 宽泛身体目标默认按代表性覆盖处理。

替代方案是把这条规则写进 `searchExerciseResources` description。这个方案不够完整，因为直接回答、结构化收口和其他工具链路也会遇到同类默认 / 澄清选择。

### 2. 业务字段语义放在 tool description / schema description

`homeRequirement` 和 `zeroMatchMuscles` 是 `searchExerciseResources` 的业务字段，解释应放在该 tool 的模型可见说明里：
- `homeRequirement` 只在用户目标、上下文或当前规划确实需要环境、场地或支撑条件时填写。
- 多 `muscles` 查询用于获得代表性候选覆盖。
- `zeroMatchMuscles` 是当前过滤条件下的诊断事实，可用于解释、澄清或调整查询，不代表必须继续补查每个肌群。

替代方案是把具体字段名写进 system prompt。这个方案会让通用 prompt 承担业务 tool 细节，违反 prompt 分层。

### 3. 不做 trace phrasing 特判

本次修复来自一条具体 trace，但生产规则只能表达稳定抽象：默认假设、澄清出口、代表性覆盖、诊断事实消费边界。回归测试可以包含原始语义和等价表达，但实现不得根据用户原文、关键词或具体字段组合强制改写 provider tool call。

## Risks / Trade-offs

- [Risk] 模型可能更频繁追问，降低一次性输出率。  
  Mitigation: prompt 同时允许保守默认继续；只有偏好显著影响结果质量时才追问一个关键问题。

- [Risk] 默认继续时仍可能选择过窄条件。  
  Mitigation: `homeRequirement` 说明强调只有需要环境、场地或支撑条件时才填写；未填写表示不额外限定环境条件。

- [Risk] `zeroMatchMuscles` 仍被模型误读为必须补查。  
  Mitigation: 同时调整 tool description、schema description 和 model-visible summary，并增加 contract tests 覆盖该文本边界。

- [Risk] Prompt 规则过长导致噪声增加。  
  Mitigation: 通用 prompt 只保留 3 条短句；字段细节留在 tool 层。
