## Why

当前 LangChain Agent 在用户只给出宽泛训练目标时，容易把“未指定器械默认无器械”和多肌群查询诊断继续扩展成更多未确认条件，例如场地、支撑条件或每个细分肌群都必须补齐。这样会增加不必要的 tool 调用，也会把用户本可澄清的偏好误当成已确认事实。

本变更要让模型在信息不足但目标可继续时，清楚区分“保守默认继续”和“向用户澄清”两个合法出口，并限制默认假设只补齐当前任务所需的最小边界。

## What Changes

- 调整 LangChain Agent system prompt：增加默认假设策略，说明缺少器械、场地、时长、经验等偏好时，模型可以使用明确说明的保守默认继续，也可以向用户追问最影响结果质量的关键问题。
- 调整 system prompt 中宽泛身体目标的处理边界：全身或宽泛部位目标可以用代表性覆盖理解，不要求每个细分肌群都继续查询或补齐事实。
- 调整 `searchExerciseResources` 的 tool description、schema description 或模型可见结果摘要：说明多肌群查询用于获得代表性候选覆盖，`zeroMatchMuscles` 是诊断事实，不是必须继续补查每个肌群的义务。
- 调整 `homeRequirement` 模型可见说明：该字段只在用户目标、上下文或当前规划确实需要环境、场地或支撑条件时填写；未填写表示不额外限定环境条件。
- 不新增服务端自然语言分流、关键词规则、短句模板、runtime 专属分支或 provider tool call 改写。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-llm-prompt-configuration`: 增加默认假设与澄清出口的模型可见规则，避免默认条件级联扩张。
- `agent-exercise-resource-query-tool`: 收紧 `searchExerciseResources` 的多肌群候选和 `zeroMatchMuscles` 消费边界，并澄清 `homeRequirement` 的输入来源。
- `chat-exercise-recommendation-trigger`: 澄清未指定器械默认无器械是可用默认策略，不应阻止模型在偏好影响结果质量时向用户澄清。

## Impact

- 影响 `lib/server/langchain-agent/prompt.ts` 的 LangChain Agent system prompt。
- 影响 `lib/server/langchain-agent/tools/exercise-resource-tools.ts` 中 `searchExerciseResources` 的 description / schema description / model-visible summary。
- 影响相关 OpenSpec specs 和 Agent prompt/tool contract tests。
- 不影响数据库结构、Prisma schema、API route、LangChain runtime 主循环、tool handler 执行逻辑、production response adapter 或权限边界。
