## 1. 内核目录与合同类型

- [ ] 1.1 新增 `lib/server/agent-core/**` 目录结构，放置 M0 内核文件，且不复用旧 `lib/server/agent-orchestrator/**`。
- [ ] 1.2 在 `contracts.ts` 中定义 `AgentActor`、`AgentRunInput`、`AgentAction`、`ToolPolicy`、`Tool`、`ToolResult`、`ToolError`、`ToolManifest`、`AgentStreamEvent` 等 M0 合同类型。
- [ ] 1.3 为导出的核心类型和对象补充简短中文意图注释，说明其在通用 Agent Tool 链路中的业务边界。
- [ ] 1.4 明确 M0 resource 字段只保留长期合同形状，非空 `consumes` / `usedResourceRefs` 必须在 M0 被拒绝。
- [ ] 1.5 定义稳定错误 code 集合，覆盖未知 tool、非法输入、非法 action、非 M0 能力、timeout、handler 异常、输出 Schema 失败和重复失败熔断。

## 2. defineTool、ToolRegistry 与 manifest

- [ ] 2.1 实现 `defineTool`，在启动或注册阶段校验 name、version、description、whenToUse、whenNotToUse、inputSchema、outputSchema、policy 和 handler。
- [ ] 2.2 校验 M0 可执行 tool 必须是 `sideEffect: "read"`、`riskLevel: "low"`、`confirmation: "never"`；其他 tool 元数据可保留但 Runtime 不得执行。
- [ ] 2.3 实现 `ToolRegistry.register()`、`get()`、`listAvailable()`、`serializeForPlanner()`，保证 tool name 唯一且未注册 tool 不能执行。
- [ ] 2.4 实现 Zod 到 manifest JSON Schema 的安全序列化，保留 object、array、record、union、enum、required 和 nested fields。
- [ ] 2.5 确保 manifest 只暴露模型可见安全字段，不包含 handler、数据库对象、secret、完整 payload 或服务端 capability 对象。
- [ ] 2.6 增加 registry / manifest 单元测试，覆盖重复注册、非法 tool、nested schema 保留和敏感字段不暴露。

## 3. PlannerPort、ReplayPlanner 与 Action Validator

- [ ] 3.1 定义 `PlannerPort`，使 core 只依赖 `decideNext(input): Promise<AgentAction>`，不依赖具体 LLM SDK 或 function calling 格式。
- [ ] 3.2 实现 `ReplayPlanner`，支持固定 action 序列、耗尽序列错误和测试可读的 planner 调用记录。
- [ ] 3.3 定义并实现 `AgentAction` Schema，只允许 `tool_call`、`final_answer`、`ask_user` 三类 action。
- [ ] 3.4 实现 Action Validator，校验 action 结构、已注册 tool、当前可用性、tool inputSchema 和 terminal action 的 `usedToolResultIds`。
- [ ] 3.5 拒绝 `{ type: "request_confirmation" }`、未知 action、未知 tool、非法 input、任意 NDJSON event 和非空 resource refs。
- [ ] 3.6 增加 PlannerPort / ReplayPlanner / Action Validator 测试，覆盖成功 action、非法 action、confirmation action 拒绝、resource refs 拒绝和 terminal 引用校验。

## 4. Executor、Observation 与 Runtime loop

- [ ] 4.1 实现通用 Executor，负责调用 handler、传入 run context、注入 `AbortSignal`、执行 per-tool timeout 和归一化异常。
- [ ] 4.2 对 handler 返回值执行 outputSchema 校验，输出不合法时不得进入 observation、renderer 或用户可见 payload。
- [ ] 4.3 实现 `ToolResult` 创建和 `toolResultId` 生成，成功与失败结果都必须包含 toolName、toolVersion、toolResultId 和 fulfillment / error 摘要。
- [ ] 4.4 实现 observation 生成逻辑，只使用 `toModelObservation`、`projection.model` 或默认安全摘要，不把完整 output 当作 Planner 指令。
- [ ] 4.5 实现 Runtime loop，按 manifest、planner、validator、terminal、executor、result validation、observation 的顺序运行。
- [ ] 4.6 实现 `maxSteps`、overall timeout、基础 planner/tool call 次数限制、非法 action repair 次数限制和重复不可重试失败熔断。
- [ ] 4.7 Runtime 必须拒绝执行 write、high risk 或 confirmation-required tool，并返回需要 M1 Policy Guard / confirmation 的结构化失败。
- [ ] 4.8 增加 Executor / Runtime 测试，覆盖成功执行、handler 异常、输出 Schema 失败、per-tool timeout、overall timeout、maxSteps、repair 超限和重复失败熔断。

## 5. 默认 Response Renderer 与 fixture read tool

- [ ] 5.1 实现默认 Response Renderer，支持 `content`、`tool_result`、`assistant_suggestions` 或等价安全建议事件、`error` 和 `done` 白名单 NDJSON event。
- [ ] 5.2 确保 renderer 只使用 terminal action、`projection.user` 或默认安全摘要，不默认暴露完整 tool output。
- [ ] 5.3 新增 `lib/server/agent-tools/fixture/read-fixture.tool.ts`，只用于 M0 合同闭环测试，不代表真实业务能力。
- [ ] 5.4 新增 `lib/server/agent-tools/index.ts` 或等价注册入口，注册 fixture read tool 时不修改 Runtime、Executor、Validator、Renderer 或 `/api/chat`。
- [ ] 5.5 增加 fixture read tool 端到端测试，证明 manifest 暴露、ReplayPlanner 选择、Executor 调用、observation 生成和 NDJSON 输出闭环。
- [ ] 5.6 增加“新增第二个 read fixture tool 不改 core 主流程”的合同测试或架构扫描。

## 6. 架构边界与回归验证

- [ ] 6.1 增加架构扫描测试，证明新 `agent-core` 不导入旧 `lib/server/agent-orchestrator/**`、旧 `AgentExecutionResult`、旧 Response Writer 或旧 prompt module。
- [ ] 6.2 增加架构扫描测试，证明 M0 实现未修改 production `/api/chat` 主链，也未接入真实 LLM adapter 或真实业务 tool。
- [ ] 6.3 扫描 Runtime / Executor / Validator / Renderer，确认没有具体业务 toolName 分支，也没有基于用户自然语言关键词、正则或同义词表的 tool 选择逻辑。
- [ ] 6.4 确认 M0 不新增 Prisma migration、数据库字段、前端 UI 或真实训练生成链路。
- [ ] 6.5 对未完成的 ResourceStore、Policy Guard、confirmation、Trace/Replay、LlmPlanner 和 production chat 接入保留明确后续边界，不提交假实现、TODO 式占位或兼容层。

## 7. 文档与自动化检查

- [ ] 7.1 更新必要开发文档，记录 M0/M1/M2 分阶段边界、新 `agent-core` 目录职责和 fixture read tool 的非业务属性。
- [ ] 7.2 在 `docs/方案变更历史` 中新增本次 M0 合同内核闭环的方案变更记录，时间使用上海时区精确到秒。
- [ ] 7.3 在 `docs/项目演变历程.md` 末尾追加本次从旧 Agent runtime 删除后重新建立通用合同内核的简要记录。
- [ ] 7.4 运行 `openspec validate add-agent-tool-contract-kernel-m0 --strict`。
- [ ] 7.5 运行与实现相关的自动化检查：`npm test`、`npm run typecheck`；若某项无法运行，记录原因和风险。
- [ ] 7.6 最终检查 `git diff`，确认只包含本 change 范围内的 OpenSpec、M0 内核、fixture、测试和必要文档改动。
