## Why

最新 trace 显示，动作检索已成功返回弹力带臀腿候选，但模型最终 `final_result` 漏掉顶层 `reason` 字段，导致 Agent runtime 将整轮降级为 `model_output_invalid`，用户看不到已经查到的推荐卡片。

同时，推荐类 `searchExercises` 已经携带 `bodyRegions`、`equipment`、`level` 等结构化条件，泛化 `query` 不应在这些可执行边界存在时继续作为硬召回门槛清空候选。

## What Changes

- 对 `final_result` 终止决策增加窄口径结构容错：当 `result` 已符合 `AgentExecutionResult`，但模型只遗漏顶层 `reason` 时，服务端补一个诊断用默认原因，不改变 `status`、引用、回复内容或用户语义。
- 调整推荐类动作搜索：当 `candidateUse="recommendation"` 且存在结构化候选边界时，`query` 仅作为排序提示，不作为硬召回过滤。
- 将 `searchExercises` 的模型可见说明补充为优先使用受控结构化 facet，并把动作库真实 facet 摘要纳入工具描述，降低模型传入不可执行 facet 的概率。
- 增加 Agent 决策解析、动作搜索和推荐卡片链路的自动化测试。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `chat-exercise-recommendation-trigger`: 候选检索成功且最终结果只缺少非语义诊断字段时，系统必须仍能投影推荐卡片。
- `rag-hybrid-search`: 推荐类动作搜索在已有结构化候选边界时，泛化 `query` 不得清空可执行候选。
- `readonly-llm-tool-calling`: `searchExercises` 工具必须向模型暴露真实 facet 摘要，并要求模型优先使用结构化筛选字段。

## Impact

- 影响 `lib/server/agent-orchestrator/tool-registry.ts` 的决策解析容错。
- 影响 `lib/server/exercises/exercise-service.ts` 的 `searchExercises` query 召回门控。
- 影响 `lib/server/agent-orchestrator/readonly-tools.ts` 的工具描述和模型可见 facet 摘要。
- 影响 `tests/agent-orchestrator.test.ts` 以及动作搜索相关测试。
