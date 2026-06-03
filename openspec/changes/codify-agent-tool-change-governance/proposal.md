## Why

后续新增 Agent tool 或修复 Agent tool bug 时，如果只依赖人工记忆，很容易绕过 `docs/agent-tool-orchestrator-design.md` 中关于 Tool Bundle、ToolRegistry、Policy Guard、ResourceStore、projection 和架构扫描的边界要求。

本 change 要先把“如何开始、如何判断范围、哪些文件禁止随意修改、必须怎么验证”固化成可执行的治理流程，降低后续实现跑偏、把业务分支写回 orchestrator/core 或让 tool handler 绕过安全边界的风险。

## What Changes

- 新增 `agent-tool-change-governance` 能力规格，定义 Agent tool 相关任务的前置分类、OpenSpec 范围约束、实现禁止项和验收要求。
- 要求后续新增业务 tool 默认走“新增 tool bundle + 注册 ToolRegistry + 补 contract tests”的路径，不得默认修改 orchestrator 主循环、PlannerPort、Executor、Policy Guard、Resource Contract Validator、Response Renderer 或 `/api/chat` 主链路。
- 要求后续修复 Agent tool bug 时先读取真实 trace、当前代码和架构文档，判断根因属于 tool contract、projection、resource、policy、planner adapter、core contract 还是生产接入，而不是直接加业务关键词分流或 toolName 特判。
- 要求实现一个 Codex Skill 作为后续工作入口，并配套架构扫描或测试检查，让规则既能在工作流程里被触发，也能在自动验证中被发现。
- 不改变当前 Agent runtime 行为，不新增真实业务 tool，不接入生产聊天链路。

## Capabilities

### New Capabilities

- `agent-tool-change-governance`: 规范 Agent tool 新增、Agent tool bug 修复、Agent core contract 变更和生产接入变更的工作流程、禁止项、验证项和 Codex Skill 入口。

### Modified Capabilities

- 无。

## Impact

- 影响 OpenSpec 文档与后续协作流程。
- 后续实现预计影响 `.codex/skills/` 或项目内等效 skill 目录、Agent tool 架构扫描测试、相关验证脚本或测试命令。
- 不影响 API 契约、数据库结构、运行时主链路、现有 tool 行为或用户可见 UI。
