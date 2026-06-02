## 1. 运行时删除边界确认

- [ ] 1.1 扫描生产代码中的旧 AI/Agent 入口和合同，至少覆盖 `runAgentOrchestrator`、`AgentExecutionResult`、`AgentToolRegistry`、`agent_execution_result`、`agent_tool_decision`、`agent_response_writer`、旧模型 provider、Prompt module、manual LLM runner 和旧 trace event。
- [ ] 1.2 复核 `/api/chat`、`lib/server/chat/chat-service.ts`、服务端 AI 目录、trace 生产入口和 summary 更新入口，列出所有旧 AI 执行调用点。
- [ ] 1.3 复核聊天页面、dev trace 页面和相关组件，区分需要保留的页面壳与必须断开的旧 AI 调用、旧 stream 解析和旧 Agent 事件依赖。
- [ ] 1.4 复核动作库、训练校验、artifact、policy/confirmation、user memory 和数据库访问模块，标记真正公共、非 AI、无旧 Agent 业务逻辑的保留范围。
- [ ] 1.5 记录其他仍引用旧 Agent core 的 open changes，但不把它们作为本 change 的实现阻塞。

## 2. 删除旧 Agent/AI 运行时代码

- [ ] 2.1 删除 `lib/server/agent-orchestrator/**` 中旧 runtime、contracts、context builder、execution state、execution result、planner loop、dependency graph、tool registry、readonly/workout tools、response writer、resource recovery 和 trace projection。
- [ ] 2.2 删除服务端 AI 执行外围中只服务旧链路的 Prompt、模型调用协议、Agent decision provider、旧 token budget 输入、旧 activity mapper、旧 response projection 和旧 summary action 输入。
- [ ] 2.3 删除 `/api/chat` 的 AI 执行能力，使其不再触发模型调用、tool calling、artifact 生成、summary 更新、旧 Agent NDJSON 事件、旧 trace final decision 或旧可恢复 Agent 错误。
- [ ] 2.4 删除旧 AI trace 生产逻辑、旧 replay fixture 和旧 Agent runtime event 生产路径；历史 trace 展示页面如保留，只能作为页面壳或历史数据展示，不得恢复运行时生产。
- [ ] 2.5 删除混合模块中的旧 AI/Agent 业务包装；如果公共能力可清晰拆出，则保留拆出的非 AI 公共模块，否则删除整个非公共模块。

## 3. 保留页面壳并断开调用

- [ ] 3.1 保留聊天页面、dev trace 页面和相关组件的页面结构、布局和非 AI 本地状态。
- [ ] 3.2 移除页面到旧 AI 接口、旧 Agent stream、旧 `agent_execution_result`、旧 dependency graph、旧 `legacyPathSkip` 和旧模型结果的强依赖。
- [ ] 3.3 如果页面需要展示不可用状态，使用非 AI 的本地 UI 状态，不伪造旧 Agent event、tool result 或 trace 字段。
- [ ] 3.4 确认页面保留不引入新的 mock AI、假数据生成、兼容 adapter 或隐藏模型调用。

## 4. 删除旧核心链路测试和 fixture

- [ ] 4.1 删除 `tests/agent-orchestrator.test.ts`、旧 Agent registry / readonly tools 测试、旧聊天 AI 流测试中依赖旧核心链路的断言。
- [ ] 4.2 删除 `manual-tests/llm/**` 中依赖旧 Agent/LLM 执行的 runner、assertions、fixtures 和报告逻辑。
- [ ] 4.3 删除旧 `AgentExecutionResult`、旧 `generated/patched` 收口、旧 tool result id、旧 response writer 字段、旧 dependency graph 和旧 trace event 的测试 fixture。
- [ ] 4.4 保留或补充非 AI 公共领域服务测试，证明动作库、训练校验、artifact 持久化、policy/confirmation、user memory 和数据库访问不依赖旧 AI/Agent。

## 5. 规格和文档边界

- [ ] 5.1 确认 `tool-first-agent-orchestrator`、`agent-runtime-resource-contract`、`agent-tool-capability-contract` 中旧 Agent/AI 运行时要求已被移除或失效。
- [ ] 5.2 保留 `docs/**`、OpenSpec archive、方案历史和本 change 文档，不把历史文档中的旧 Agent 描述当作运行时兼容要求。
- [ ] 5.3 不处理其他 open changes 的去留；只确保本 change 明确说明其他 change 不阻塞当前删除边界。

## 6. 防回归验证

- [ ] 6.1 增加或更新架构级扫描，证明生产代码不再出现旧 AI/Agent 运行时引用：`runAgentOrchestrator`、`AgentExecutionResult`、`AgentToolRegistry`、`agent_execution_result`、`agent_tool_decision`、`agent_response_writer`、旧 Prompt module、旧模型 provider 和 manual LLM runner。
- [ ] 6.2 增加或更新公共领域服务导入测试，证明保留服务不依赖旧 AI/Agent 运行时。
- [ ] 6.3 运行 `openspec validate remove-current-agent-core-layer --strict`。
- [ ] 6.4 运行 `npm run typecheck`。
- [ ] 6.5 运行相关自动化测试，至少覆盖架构缺席扫描和公共领域服务导入。
- [ ] 6.6 如删除影响构建、路由或模块边界，运行 `npm run build` 或说明无法运行原因。
