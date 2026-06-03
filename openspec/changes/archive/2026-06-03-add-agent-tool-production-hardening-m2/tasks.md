## 1. Planner 与 DeepSeek adapter 边界

- [x] 1.1 新增 `ModelAdapter` 合同，定义模型无关的 action completion 输入、输出、错误和测试 fake adapter。
- [x] 1.2 新增 `lib/server/agent-planners/llm-planner.ts`，实现只通过 `PlannerPort` 返回 `AgentAction` candidate 的 `LlmPlanner`。
- [x] 1.3 新增 `DeepSeekModelAdapter`，封装 DeepSeek 请求构造、模型参数、结构化输出解析、错误归一化和超时处理。
- [x] 1.4 保证 `agent-core` 不导入 DeepSeek SDK、DeepSeek HTTP client、DeepSeek 环境变量或 DeepSeek 专有响应格式。
- [x] 1.5 实现 DeepSeek 输出解析失败、非法 action、非法 input、未知 tool 和非法 resource refs 的结构化 repair / 失败收口链路，不新增关键词 fallback。
- [x] 1.6 增加 adapter contract 测试，证明 fake adapter 与 `DeepSeekModelAdapter` 可替换且不需要修改 `agent-core`。

## 2. Manifest hash、registry snapshot 与 linter

- [x] 2.1 新增 manifestHash 生成工具，基于模型可见 manifest 的 canonical JSON 生成稳定 hash。
- [x] 2.2 扩展 Runtime run trace / replay 摘要，记录 manifestHash、registry snapshot id 和安全 snapshot。
- [x] 2.3 新增 registry snapshot 结构，记录 tool name、version、input schema、resource contract、policy hint、examples 摘要和 linter 结果。
- [x] 2.4 确保 snapshot 不包含 handler、capabilities、secret、数据库对象、完整用户数据或完整 tool output。
- [x] 2.5 新增 tool manifest linter，检查敏感字段泄漏、关键 schema 结构丢失、examples 超限和不安全 policy hint。
- [x] 2.6 增加 manifestHash / registry snapshot / linter 单元测试，覆盖稳定 hash、复杂 schema 保留和不安全 manifest 拒绝。

## 3. Redaction、observation 压缩与 trace 脱敏

- [x] 3.1 新增统一 redaction 策略模块，支持字段级、路径级、默认拒绝和可测试 audit 结果。
- [x] 3.2 将 redaction 应用于 manifest snapshot、Planner observation、Response Renderer 用户事件和 trace / replay 摘要。
- [x] 3.3 扩展 observation 生成与压缩逻辑，只保留 toolResultId、resource refs、安全 summary、policy decision、confirmation 状态和错误码。
- [x] 3.4 确保 observation 压缩不编造业务事实，不将 diagnostic resource 改写为 consumable resource。
- [x] 3.5 新增 trace 脱敏审计工具，扫描 secret、API key、完整敏感 payload、handler output、内部 capability 和未脱敏 resource payload。
- [x] 3.6 增加 redaction / observation compression / trace audit 测试，覆盖模型、用户事件和 trace 三类投影边界。

## 4. Budget 与 idempotency

- [x] 4.1 扩展 `AgentRunInput` 或等价 runtime config，支持 planner call、tool call、repair、token 或等价成本预算。
- [x] 4.2 在 Runtime 中统一扣减预算，预算耗尽后结构化失败收口，并停止继续调用模型或 tool handler。
- [x] 4.3 新增 `idempotencyKey` 生成工具，基于 run、tool name/version、input hash、resource refs 和 pending action 生成稳定 key。
- [x] 4.4 将 `idempotencyKey` 注入 `ToolContext`，并保证 fixture write tool 能验证重复 resume 不重复执行。
- [x] 4.5 增加 budget 测试，覆盖 planner call 预算、tool call 预算、repair 预算和预算耗尽 trace 记录。
- [x] 4.6 增加 idempotency 测试，覆盖普通 tool execution、confirmation resume 和 consumed pending action 重复提交拒绝。

## 5. Contract test helper 与 fixture 验收

- [x] 5.1 新增 contract test helper，覆盖 `defineTool`、manifest schema、resource contract、policy、projection、redaction 和 trace projection。
- [x] 5.2 将 M0/M1 fixture tools 接入 contract helper，证明 fixture tool 注册不需要修改 Runtime、Executor、Policy Guard 或 Renderer 主流程。
- [x] 5.3 新增不合格 tool contract 测试，覆盖缺失 description、whenToUse、output schema、policy、projection 或敏感 examples。
- [x] 5.4 新增 DeepSeek + fixture read tool 黑盒测试，证明真实模型只能通过 `AgentAction` 驱动通用链路。
- [x] 5.5 新增 DeepSeek + resource producer / consumer fixture 黑盒测试，证明真实模型的 resource 引用仍受 ResourceStore 和 Action Validator 约束。
- [x] 5.6 新增 DeepSeek + confirmation write fixture 黑盒测试，证明 write / high risk 操作未确认不会执行，resume 后执行服务端保存的 pending action。
- [x] 5.7 新增 DeepSeek + diagnostic failure fixture 黑盒测试，证明 diagnostic resource 不能支撑成功 final answer。

## 6. Prompt injection 与架构扫描

- [x] 6.1 新增 prompt injection 测试，覆盖用户输入要求绕过策略、泄漏 secret、伪造 confirmation、伪造 resource 或生成任意 NDJSON event。
- [x] 6.2 新增 tool output injection 测试，覆盖 fixture output 要求模型忽略 policy、调用未注册 tool 或执行未确认写操作。
- [x] 6.3 新增 manifest examples injection 测试，确保 examples 不能让模型绕过 `AgentAction` Schema、Policy Guard 或 renderer 白名单。
- [x] 6.4 增加架构扫描，确认 `agent-core` 中没有具体业务 toolName 分支、没有 DeepSeek 依赖、没有用户自然语言关键词分流。
- [x] 6.5 增加架构扫描，确认本 change 未新增或注册真实动作库、训练生成、保存、用户记忆、数据库查询或 `agent-tools/<domain>` 业务目录。
- [x] 6.6 增加 `/api/chat` 扫描，确认没有新增业务关键词路由，也没有把 fixture runtime 当成真实业务 tool 接入口。

## 7. 文档与项目记录

- [x] 7.1 更新 `docs/agent-tool-orchestrator-design.md` 的 M2 落地状态，记录 DeepSeek-only、上线硬化能力、未接入真实业务 tool 和验证结论。
- [x] 7.2 在 `docs/方案变更历史` 中新增 M2 上线硬化方案变更记录，时间使用上海时区精确到秒。
- [x] 7.3 在 `docs/项目演变历程.md` 末尾追加 M2 从 M1 安全闭环扩展到真实 DeepSeek planner 与上线硬化的简要记录。
- [x] 7.4 如实现新增环境变量、启动方式或测试命令，更新 README 或相关开发文档；若无影响，在实现总结中说明原因。

## 8. 验证与收尾

- [x] 8.1 运行 `openspec validate add-agent-tool-production-hardening-m2 --strict`。
- [x] 8.2 运行 `tests/agent-core/**` 相关自动化测试，覆盖 runtime hardening、adapter、manifest、redaction、budget、idempotency 和 fixture E2E。
- [x] 8.3 运行 DeepSeek 真实模型黑盒测试；如缺少环境变量或网络权限，记录未运行原因和剩余风险。
- [x] 8.4 修改 TypeScript 核心代码后运行 `npm run typecheck`。
- [x] 8.5 按需运行 `npm test`；如时间或环境限制无法运行，记录未运行原因和剩余风险。
- [x] 8.6 最终检查 `git diff`，确认只包含 M2 OpenSpec、agent-core / agent-planners 硬化、fixture、测试和必要文档改动。

## 9. Diagnostic grounding 补漏

- [x] 9.1 修复 `final_answer.usedToolResultIds` 只校验存在性的边界缝隙，禁止 failed 或 `fulfillment.satisfied=false` 的 tool result 支撑成功 final answer。
- [x] 9.2 增加 validator、M1 runtime 和 DeepSeek fixture adapter 回归测试，证明 unsatisfied diagnostic tool result 只能用于 ask_user / 失败解释，不能支撑 completed final_answer。
