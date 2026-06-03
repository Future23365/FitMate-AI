## 1. 治理入口 Skill

- [ ] 1.1 使用 `skill-creator` 流程确认 Agent tool 治理 Skill 的目录、名称、description 和触发关键词。
- [ ] 1.2 新增 Agent tool 治理 Skill，要求触发后读取 `docs/agent-tool-orchestrator-design.md` 第 24-26 节，并执行 OpenSpec / Git / 任务分类 preflight。
- [ ] 1.3 在 Skill 中明确四类任务边界：新增业务 tool、Agent tool bug 修复、core contract 变更、production 接入变更。
- [ ] 1.4 在 Skill 中写明默认允许项和禁止项，尤其是不得默认修改 orchestrator 主循环、PlannerPort、Executor、Policy Guard、Resource Contract Validator、Response Renderer 或 `/api/chat` 主链路。
- [ ] 1.5 在 Skill 中写明 core 变更升级规则：单 tool 特例优先改 tool contract，多个无关 tool 需求才抽象通用 core 扩展点，安全/权限/resource/trace/stream 问题必须回到 core contract 设计。

## 2. OpenSpec 流程约束

- [ ] 2.1 新增或更新项目协作说明，要求后续 Agent tool 非文案 change 的 `proposal.md` / `design.md` / `tasks.md` 明确任务分类、允许触碰模块、禁止触碰模块和验证计划。
- [ ] 2.2 为新增业务 tool 的 OpenSpec 文档提供 checklist 或模板片段，覆盖 tool bundle、ToolRegistry 注册、schema、policy、resourceContract、projection、traceProjection 和 contract tests。
- [ ] 2.3 为 Agent tool bug 修复的 OpenSpec 文档提供 checklist 或模板片段，要求先读 `codex_logs/ai_trace_log.js`、真实 schema、model-visible manifest/schema summary、ResourceStore、Policy Guard、projection 和 trace。
- [ ] 2.4 确保后续涉及 Agent tool 的 `tasks.md` 必须包含 `openspec validate <change> --strict`、相关自动化测试、架构扫描和无法运行时的风险说明。

## 3. 架构扫描与合同测试

- [ ] 3.1 检查 `tests/agent-core/**` 中已有架构扫描模式，优先复用现有测试框架新增 Agent tool governance 扫描。
- [ ] 3.2 新增或扩展架构扫描，确认 Agent core 中没有具体业务 toolName 分支、没有业务 tool handler / 生产业务服务导入、没有具体模型 adapter 依赖。
- [ ] 3.3 新增或扩展 `/api/chat` 或等价生产入口扫描，确认没有新增业务关键词分流、正则分流、自然语言模板分流或绕过 Agent tool loop 的业务路由。
- [ ] 3.4 新增或扩展 tool contract 测试 helper，覆盖 inputSchema、outputSchema、policy metadata、resourceContract、handler 错误归一化、安全 projection、user event projection 和 trace projection。
- [ ] 3.5 新增回归测试，证明 write / high risk tool 未经 Policy Guard / confirmation 不会执行，diagnostic resource 不能支撑成功 final answer，完整 tool output 不会默认进入 model、user event 或 trace。

## 4. 文档与项目记录

- [ ] 4.1 更新 `docs/agent-tool-orchestrator-design.md` 或相关协作文档，记录治理 Skill、OpenSpec 前置分类和自动验证的使用方式。
- [ ] 4.2 如新增或调整 skill 目录、测试命令或验证命令，更新 README 或相关开发文档；若无影响，在实现总结中说明原因。
- [ ] 4.3 在 `docs/方案变更历史` 中新增本次 Agent tool 治理流程固化记录，时间使用上海时区精确到秒。
- [ ] 4.4 在 `docs/项目演变历程.md` 末尾追加本次治理流程固化的简要记录。

## 5. 验证与收尾

- [ ] 5.1 运行 `openspec validate codify-agent-tool-change-governance --strict`。
- [ ] 5.2 运行新增或修改的 Agent tool governance 架构扫描 / contract tests。
- [ ] 5.3 修改 TypeScript 测试、核心代码或共享逻辑后运行 `npm run typecheck`。
- [ ] 5.4 按需运行 `npm test`；如时间或环境限制无法运行，记录未运行原因和剩余风险。
- [ ] 5.5 最终检查 `git diff`，确认只包含本 change 的 Skill、OpenSpec、测试和必要文档改动，没有混入无关 change 或真实业务 tool 实现。
