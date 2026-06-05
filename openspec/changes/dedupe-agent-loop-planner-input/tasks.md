## 1. 边界确认

- [x] 1.1 复核本 change 的 primary governance 为 `agent-tool-change-governance` 的 core contract 小改，secondary governance 为 `agent-prompt-contract-governance` 的 context / observation / model input 检查。
- [x] 1.2 确认允许触碰模块仅限 `lib/server/agent-core/observation.ts`、`lib/server/agent-core/runtime.ts`、`lib/server/agent-core/contracts.ts` / `lib/server/agent-core/planner-port.ts` 的 `PlannerInput` 语义说明、model adapter request trace 摘要和相关 tests。
- [x] 1.3 确认禁止触碰模块：业务 tool handler、tool input/output schema、ToolRegistry 注册模式、Executor 主流程、Policy Guard、ResourceStore、Response Renderer、`/api/chat` 外部 stream contract 和 `AgentAction` schema。
- [x] 1.4 检查当前 Git 工作区，确认无关 diff 不进入本 change。
- [x] 1.5 使用 `agent-fix-abstraction-gate` 完成抽象层级门禁审查，确认没有把用户原文、具体 phrasing、具体业务 `toolName` 或测试样例升格成 core 规则。
- [x] 1.6 记录当前真实模型输入路径：`runAgentRuntime` 构造 `observations` / `toolResults`，`createToolObservation()` 写入 `projection.model`，model adapter 序列化两者。

## 2. Observation 去重实现

- [x] 2.1 为 satisfied success tool result 新增轻量 observation 投影，保留 `toolResultId`、`toolName`、`ok`、`fulfillment.satisfied`、必要 resource / grounding 摘要和中文边界说明。
- [x] 2.2 调整 `createToolObservation()`，让 `ok=true` 且 `fulfillment.satisfied=true` 的 tool result 不再把完整 `projection.model` 放入 observation content。
- [x] 2.3 保持 failed、diagnostic、`fulfillment.satisfied=false`、invalid action、duplicate success feedback 和 runtime error observation 的结构化 details / repair facts 不被删除。
- [x] 2.4 确认 `redactToolResultForPlanner()` 继续 redacts 完整 handler `output`，并保留安全 `projection.model` 和 fulfillment 摘要。
- [x] 2.5 更新 `PlannerInput` 或相关注释，明确 `toolResults` 是成功 tool facts 的详细权威通道，`observations` 是 repair / diagnostic 和轻量索引通道。

## 3. Trace 和 Model Request 摘要

- [x] 3.1 更新 model request trace 或 runtime trace 摘要，记录或可派生 observationCount、toolResultCount、successful lightweight observation count、repair / diagnostic observation count 和 toolResult projection presence。
- [x] 3.2 确认 trace / replay summary 不记录完整 handler output、secret、authorization、cookie、跨用户 payload 或未脱敏大 payload。
- [x] 3.3 确认 `/dev/ai-traces` 导出后能通过摘要判断成功 tool facts 是否被双通道重复传递。

## 4. 测试

- [x] 4.1 新增或更新 observation 单元测试，断言 satisfied success observation 不包含完整 `projection.model`，但包含 `toolResultId` 和中文边界说明。
- [x] 4.2 新增或更新 observation 单元测试，断言 failed / unsatisfied / invalid action / duplicate success observation 仍保留 repair / diagnostic details。
- [x] 4.3 新增或更新 runtime / ReplayPlanner 输入测试，断言下一轮 Planner input 中成功 facts 只通过 `toolResults[].projection.model` 详细出现。
- [x] 4.4 新增或更新 model adapter request snapshot / trace 测试，断言序列化请求没有把同一成功 projection 同时放进 observations 和 toolResults。
- [x] 4.5 更新 trace / replay 测试，断言去重摘要可诊断且不泄漏完整 handler output。
- [x] 4.6 运行 `npm test -- tests/agent-core/architecture-boundary.test.ts` 或项目当前等价 architecture scan，确认没有新增服务端关键词路由、phrasing 特判或具体业务 `toolName` 语义分支。
- [x] 4.7 运行与改动相关的最窄测试文件，例如 agent-core runtime / observation / planner input / model adapter trace tests。
- [x] 4.8 修改 TypeScript、schema、AI 编排或共享业务逻辑后运行 `npm run typecheck`。

## 5. 收尾

- [x] 5.1 运行 `openspec validate dedupe-agent-loop-planner-input --strict`。
- [x] 5.2 最终 diff 检查，确认没有混入当前工作区已有的无关 prompt、tool、judge 或测试改动。
- [x] 5.3 最终总结改了什么、为什么这个小改优于大 core 重构、如何验证，以及是否仍需要后续独立评估完整 `PlannerStateView` / `TerminalGate`。
