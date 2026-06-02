# Agent Tool Schema 嵌套摘要修复

记录时间：2026-06-02 18:29:27 CST

## 当前真实问题

Tool-first Agent 的决策模型不会直接看到完整工具 JSON Schema，而是看到 `buildAgentDecisionModelInput` 生成的轻量 `inputFields`。旧摘要只展开顶层字段，导致 `filters`、`resultRequirements`、`intent`、`strategy`、`patch`、`payload` 等复杂对象在模型侧只剩字段名。

这会让模型误判工具输入形态。例如 `searchExercises.resultRequirements.sectionCoverage` 真实需要 record/object 结构，但模型只看到字段名后可能写成数组；`query` 是顶层字段，但模型可能把它放进 `softPreferences.query`。这类失败不是动作库数据问题，也不是用户请求问题，而是模型可见工具合同不够完整。

## 调整思路

本次不修改任何 Agent Tool 的真实 Zod Schema，也不新增服务端语义纠偏。调整只发生在模型可见摘要层：

- 保持 token 瘦身，不发送完整 JSON Schema。
- 在受控深度内递归摘要 object、array、record / `additionalProperties` 和 union 分支。
- 保留模型调用工具所需的 required、enum、const、default、min/max、minItems/maxItems 等边界。
- 对深层 payload 做截断摘要，避免复杂 payload schema 膨胀成大 prompt。

## 关键改动

- `summarizeJsonSchemaFields` 从顶层字段摘要升级为受控递归摘要。
- `searchExercises.resultRequirements.sectionCoverage` 现在能向模型表达 record value 包含 `min`。
- `searchExercises.softPreferences` 现在能向模型表达只接受 `preferredEquipment`、`preferredMuscles`、`preferredDifficulty`，而 `query` 留在顶层。
- `generateRoutineDraft.intent`、`generatePlanDraft.strategy` 和 `evaluatePolicy` union 分支的关键结构现在能进入模型可见工具摘要。

## 验证结果

- `npx vitest run tests/chat-service.test.ts` 通过，16 个测试通过。
- `npm run typecheck` 通过。

## 后续边界

这次只解决“模型看不到工具输入结构”的公共缺陷。模型输出非法 JSON、schema 失败后的 repair 投影、运行时反馈预算等问题仍属于 Agent runtime repair 合同，不在本次改动范围内。
