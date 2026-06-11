## 1. 合同与模型可见输入

- [x] 1.1 完成 LangChain activity tool 抽象层级检查，确认 `reportAgentActivity` 是 request-local UI observation tool，不属于业务 query / read / save tool，不产生业务 resource。
- [x] 1.2 新增 `reportAgentActivity` LangChain tool wrapper，输入包含模型生成的 `summary` 和可选 `stepType`，handler 只做宽松归一化和安全投影。
- [x] 1.3 将 `reportAgentActivity` 注册到 production LangChain tool catalog，并保证它不按用户原文动态启停。
- [x] 1.4 更新 LangChain system prompt，让模型可见活动汇报用途、边界和非 grounding 属性，描述性自然语言使用中文。

## 2. Runtime 与 NDJSON 投影

- [x] 2.1 为 LangChain runtime 增加 request-local observer 事件，成功执行 `reportAgentActivity` 后产出模型活动摘要。
- [x] 2.2 将活动 tool 与业务 tool 预算区分，活动汇报不消耗业务 tool 调用预算，并保留独立防循环边界。
- [x] 2.3 在 `/api/chat` LangChain streaming adapter 中实时消费 observer 事件，并投影为 `agent_progress.activitySummary`。
- [x] 2.4 保持 `agent_loop` 和 `agent_progress` 独立，不用活动摘要推断或递增 loop 轮次。

## 3. 前端活动展示

- [x] 3.1 更新前端 activity stage 白名单或 fallback，使 `model_activity` 可以展示模型生成的 `activitySummary`。
- [x] 3.2 调整活动摘要展示校验为宽松策略：只拒绝非字符串、空值和明显破坏 UI 的控制字符，不要求固定中文模板。
- [x] 3.3 确认活动摘要不进入 `ChatMessage`、聊天历史、conversation summary、visible output 或本地历史恢复。

## 4. 测试与文档

- [x] 4.1 新增或更新 LangChain runtime 测试，覆盖模型同轮返回 `reportAgentActivity` 与业务 tool 时的执行、预算和 observer 事件。
- [x] 4.2 更新 production tool catalog / prompt 测试，断言 `reportAgentActivity` 可见且说明不包含旧 `AgentAction` 合同或服务端固定文案分流。
- [x] 4.3 更新 API route / client parser / activity reducer 测试，覆盖 `agent_progress.activitySummary` 的实时投影、宽松展示和历史隔离。
- [x] 4.4 运行 `openspec validate restore-langchain-agent-activity-stream --strict`。
- [x] 4.5 运行相关自动化测试：`npm test -- tests/langchain-agent-runtime/runtime.test.ts tests/langchain-agent-tools/production-tool-catalog.test.ts tests/api-routes.test.ts tests/client-api.test.ts tests/chat-agent-activity.test.ts tests/chat-controller-stream-state.test.ts`。
- [x] 4.6 运行 `npm run typecheck`。
