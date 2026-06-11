# Agent Tool 合同内核 M0 闭环

时间：2026-06-03 12:51:48 CST

## 当前真实问题

旧 AI/Agent runtime 已经删除，生产 `/api/chat` 当前不再承载旧 Agent 主链。后续如果直接把真实业务 tool 或模型 adapter 接回聊天入口，会缺少一个独立、可测试、模型无关的合同内核，容易重新出现 runtime 里混入业务 toolName 分支、模型厂商协议泄漏、tool output 直接回灌、确认动作由模型生成等问题。

## 调整思路

先实现 M0 合同闭环，而不是直接接生产聊天。M0 只证明通用链路可以独立运行：

```txt
Tool Bundle -> ToolRegistry -> manifest -> PlannerPort / ReplayPlanner
-> Action Validator -> Executor -> Observation -> Runtime -> Response Renderer
```

ResourceStore、Policy Guard、confirmation、Trace/Replay、真实 `LlmPlanner`、真实业务 tool 和 production `/api/chat` 接入继续留到后续 M1/M2 change。

## 关键改动

- 新增 `lib/server/agent-core/**`，定义 `AgentAction`、`Tool`、`ToolResult`、`ToolManifest`、`AgentStreamEvent` 等 M0 合同类型。
- 新增 `defineTool`、`ToolRegistry` 和 manifest 序列化，保留 nested JSON Schema，并防止 handler、secret、完整 payload 进入模型可见 manifest。
- 新增 `PlannerPort` 和 `ReplayPlanner`，让 core 不依赖真实 LLM SDK、function calling 或 JSON mode。
- 新增 Action Validator，拒绝未知 action、未知 tool、非法 input、`request_confirmation`、非空 resource refs 和非法 terminal 引用。
- 新增 Executor、Observation、Runtime loop 和默认 Response Renderer，统一处理 output schema、timeout、handler 异常、重复不可重试失败熔断和安全投影。
- 新增 `readFixture` 只读 fixture tool 和注册入口，只用于 M0 合同测试，不代表真实业务能力。
- 新增 `tests/agent-core/**`，覆盖 registry/manifest、planner/validator、executor/runtime/renderer、fixture 端到端和架构边界。

## 为什么不是最小补丁

最小补丁只能让某个 tool 临时能跑，但无法防止后续把真实业务语义、模型协议或旧 runtime 概念重新塞进主循环。M0 选择先建立清晰的通用合同内核，把“Planner 提议、服务端校验、Executor 执行、Renderer 投影”的边界固化下来，后续新增 tool 时只需要注册 tool 和补合同测试。

## 结果

- 新增 5 个 `tests/agent-core` 测试文件，共 19 个 M0 合同用例。
- M0 未修改 production `/api/chat`、Prisma schema、数据库迁移、前端 UI 或真实训练生成链路。
- 架构扫描测试验证新 core 不导入旧 Agent runtime、旧 prompt module、真实 LLM SDK 或数据库访问。
