## Why

当前 LangChain runtime 在连续业务 tool 达到上限后会从后续 provider request 的 `tools` 中移除该 tool；但如果 provider 仍返回已移除 tool 的 `tool_call`，runtime 只返回普通 `unknown_tool` 反馈，模型可能继续空转到超时或模型调用预算耗尽。

同时，`searchExerciseResources` 成功返回候选池后，模型可见结果没有明确表达“当前候选事实已经覆盖哪些查询 section、是否可用于后续结构化编排、继续同参查询不会补充新事实”。模型容易把“还没完成训练计划”误判为“还需要继续查动作候选”。

## What Changes

- 强化 LangChain runtime 的连续 tool loop 收口：当某业务 tool 因连续上限从当前 request tools 中移除后，若 provider 继续返回该 tool call，runtime MUST 归一化为 terminal tool loop failure，而不是继续给模型普通 `unknown_tool` 反馈。
- 保留通用未知 tool 边界：真正未注册、未在当前 request 暴露且不属于连续上限移除的 tool call，仍按 `unknown_tool` 拒绝，不执行 handler。
- 增强 `searchExerciseResources` 的模型可见成功摘要：表达 `candidateGroups[]` 是当前查询口径下的动作候选事实，表达实际覆盖的 section 和缺失 section，表达同参重复查询不会产生新增候选事实。
- 不新增服务端关键词、正则、同义词、用户短句模板或具体 phrasing 分流；不根据用户自然语言改写 provider tool call。
- 不把 `searchExerciseResources` 的结果包装成最终训练方案，不指挥模型固定调用某个下一步 tool。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `langchain-agent-runtime`: 强化连续业务 tool 上限后的 terminal loop 收口，覆盖 provider 继续调用已从当前 request tools 移除 tool 的场景。
- `agent-exercise-resource-query-tool`: 强化 `searchExerciseResources` 的模型可见候选事实完成度说明，帮助模型从查询阶段切换到自主收口、澄清或失败出口。

## Impact

- 影响 `lib/server/langchain-agent/runtime.ts` 中当前 request tool availability、连续 tool 限制和 terminal loop failure 归一化。
- 影响 `lib/server/langchain-agent/tools/exercise-resource-tools.ts` 中 `searchExerciseResources` 的 `description`、`toModelVisibleSummary` 和相关 summary shape。
- 影响 LangChain runtime tests、`searchExerciseResources` tool-level tests 和 model-visible contract gate tests。
- 不修改 `/api/chat` 主路由，不恢复旧 `AgentAction` / `PlannerPort` / `ToolRegistry`，不新增服务端自然语言语义分流。
