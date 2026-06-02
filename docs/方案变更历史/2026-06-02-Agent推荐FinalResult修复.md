# Agent 推荐 FinalResult 修复

时间：2026-06-02 00:44:26 CST

## 当前真实问题

最新 trace 中，用户请求“推荐几个适合新手的臀腿动作，我只有弹力带，不想做跳跃”时，`searchExercises` 已成功返回 6 个候选动作，并生成了 `candidateSetId`。失败点不在数据库检索，而在模型第二轮 `final_result` 漏掉顶层 `reason` 字段，导致 Agent runtime 将整轮判定为 `model_output_invalid`，Response Writer 输出通用失败文案，推荐卡片没有展示。

同时，推荐检索里模型传入了 `query="臀腿训练"`。这类 query 是泛化自然语言；当请求已经包含 `bodyRegions`、`equipment`、`level` 等结构化候选边界时，query 不应继续作为硬召回条件清空候选。

## 调整思路

本次修复保留“LLM 负责语义理解，服务端只校验结构合同”的边界：

- 对 `final_result` 只补齐非语义诊断字段 `reason`，前提是 `result` 已经满足 `AgentExecutionResult` 合同。
- 对 recommendation 动作搜索，当结构化候选边界已存在时，将 query 降级为排序提示，不再作为硬召回过滤。
- 在 `searchExercises` 工具描述里加入短小真实 facet 摘要，帮助模型优先传数据库可执行的结构化条件。

## 关键改动

- `parseAgentToolDecision()` 新增缺失 `reason` 的窄口径容错，非法 `result` 仍然失败。
- `searchExercisesInMemory()` 将 `candidateUse="recommendation"` 纳入结构化候选边界优先的 query 门控。
- `searchExercises` 工具模型可见描述补充 `bodyRegions`、`allowedSections`、`level`、常用器械和下肢肌群示例。
- OpenSpec change：`fix-agent-recommendation-final-result`。

## 验证结果

- `npm test -- tests/agent-orchestrator.test.ts`：40 个测试通过。
- `npm test -- tests/exercise-service.test.ts`：13 个测试通过。
- `npm test -- tests/chat-service.test.ts`：10 个测试通过。
- `openspec validate fix-agent-recommendation-final-result --strict`：通过。
