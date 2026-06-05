## 1. 边界审查

- [ ] 1.1 复核本 change 为 Core Contract 变更，允许触碰 Agent core runtime、`PlannerPort`、Planner adapter、tool result projection、terminal validation、trace/replay 和相关 tests。
- [ ] 1.2 复核禁止范围：不修改业务 tool handler 查询语义，不新增服务端关键词、正则、同义词表、用户 phrasing 特判、固定 `toolName` 调用顺序或 Agent core 内具体业务 `toolName` 语义分支。
- [ ] 1.3 读取当前真实 Agent Loop、`LlmPlanner` 输入构造、`ToolResult` projection、terminal validation 和 trace/replay 代码，记录现有 `observations` / `toolResults.projection.model` 传递路径。
- [ ] 1.4 使用 `agent-fix-abstraction-gate` 完成抽象层级门禁审查，确认具体业务名只出现在 tool manifest、observation/evidence projection、resource contract 或回归测试中。
- [ ] 1.5 检查当前 Git 工作区，确认无关 diff 不进入本 change。

## 2. 核心状态类型

- [ ] 2.1 新增或调整 `AgentLoopState` 内部状态类型，覆盖 run id、turn index、action history、tool results、resources、evidence、pending requirements、budget 和 terminal gate 状态。
- [ ] 2.2 新增 `PlannerStateView` 模型可见状态类型，覆盖 `currentInput`、`visibleContext`、`actionHistory`、`evidence`、`pendingRequirements` 和 `terminalConstraints`。
- [ ] 2.3 为导出的核心类型、builder 和配置对象添加简短中文意图注释，说明它们在 Agent Loop 中的位置和边界。
- [ ] 2.4 如果新增预算、截断、压缩或开关配置，将配置放入集中配置模块，不在 runtime 或 adapter 局部散落默认值。
- [ ] 2.5 新增 `PlannerStateView` builder，确保模型输入只消费单一权威 state view，不再并行传入重复 raw `observations` 和完整 `ToolResult.projection.model`。

## 3. Evidence Pipeline

- [ ] 3.1 新增 `PlannerEvidence`、`PlannerPendingRequirement`、`PlannerRecoverableAction` 和相关 ref 类型。
- [ ] 3.2 实现默认 `ToolResult -> Evidence` adapter，保留 `toolResultId`、tool name/version、ok 状态、fulfillment、resource refs、安全摘要和 redaction status。
- [ ] 3.3 将 failed、diagnostic 或 `fulfillment.satisfied = false` 的 tool result 投影为 diagnostic evidence，确保不能支撑成功 terminal completion。
- [ ] 3.4 接入现有 repair / schema feedback，让 invalid action、terminal validation failure 和 policy/resource failure 能进入 evidence 或 pending requirements。
- [ ] 3.5 为需要更丰富事实的业务 tool 预留 projection / resource contract 扩展点，但不在 Agent core 内识别具体 `toolName`。

## 4. PlannerPort 和 Runtime Loop 接入

- [ ] 4.1 将 `PlannerPort.decideNext()` 或等价入口的模型可见状态输入切换为 `PlannerStateView`。
- [ ] 4.2 更新 `LlmPlanner` request builder，确认真实模型请求中只包含 `PlannerStateView`、tool manifest 和受控 prompt。
- [ ] 4.3 更新 `ReplayPlanner` 和 replay fixture，使测试能断言每轮 state view、evidence、pending requirements 和 terminal constraints。
- [ ] 4.4 在 Runtime loop 中按顺序写入状态转移：action validation、tool execution、evidence projection、pending requirements 更新、terminal gate 检查和预算更新。
- [ ] 4.5 删除或替换旧的重复 observation / projection 输入路径，保留必要的 trace summary，不保留会误导模型的双权威通道。

## 5. TerminalGate

- [ ] 5.1 为 terminal action 增加结构化 outcome 合同，至少区分 `complete`、`partial`、`needs_input` 和 `blocked`，并同步 Zod / JSON Schema 校验。
- [ ] 5.2 实现通用 `TerminalGate`，校验 outcome、pending requirements、usedRefs、resource refs、visibleOutputs validator、evidence status 和 grounding。
- [ ] 5.3 当 `complete final_answer` 仍存在可恢复缺口、unsatisfied evidence 或未登记 refs 时，生成结构化 invalid terminal feedback，而不是成功收口。
- [ ] 5.4 允许 `partial`、`needs_input` 和 `blocked` 进入安全 renderer，但在 run summary 和黑盒报告中与直接完成分开统计。
- [ ] 5.5 确认 `TerminalGate` 不解析用户原文、不解析 `content` 文案、不基于具体业务 `toolName` 分支判断 routine / plan / recommendation 语义。

## 6. Trace / Replay / 报告

- [ ] 6.1 新增或调整 trace event，记录 `PlannerStateView` 安全摘要、evidence ids、pending requirement ids、terminal constraints 和预算摘要。
- [ ] 6.2 记录 `ToolResult -> Evidence` 转换事件，包含 toolResultId、evidenceId、projection status、fulfillment status、resource refs 和 redaction status。
- [ ] 6.3 记录 `TerminalGate` 判定事件，包含 outcome、gate status、usedRefs 校验、visibleOutputs 校验摘要、pending requirements 摘要和失败 code。
- [ ] 6.4 更新 `/dev/ai-traces` 导出摘要或对应 trace projection，使后续 log 能直接看到 state view / evidence / terminal gate 链路。
- [ ] 6.5 更新 replay fixture，确保可在没有真实模型和未脱敏 payload 的情况下复现 terminal gate 接受或拒绝路径。

## 7. 测试和验证

- [ ] 7.1 新增或更新 `PlannerStateView` builder 单元测试，覆盖去重、截断保留关键 refs、pending requirements 和 terminal constraints。
- [ ] 7.2 新增或更新 Evidence adapter 单元测试，覆盖成功 tool result、0 条事实查询、failed/diagnostic/unsatisfied 结果、redaction 和 resource refs。
- [ ] 7.3 新增或更新 `TerminalGate` 单元测试，覆盖 complete 成功、pending requirement 拒绝、unsatisfied evidence 拒绝、partial / needs_input / blocked 安全收口。
- [ ] 7.4 更新 Planner adapter / model input snapshot 测试，断言真实模型请求不再并行包含重复 raw observations 和完整 `toolResults.projection.model`。
- [ ] 7.5 更新 trace / replay 测试，断言 state view、evidence、pending requirements 和 terminal gate 判定可复盘且不泄漏敏感字段。
- [ ] 7.6 更新手动 LLM runner / judge / report contract，使直接完成、建议可恢复通过、needs_input、blocked 和 failed 分开统计。
- [ ] 7.7 运行 `npm test -- tests/agent-core/architecture-boundary.test.ts` 或项目当前等价 architecture scan，确认没有新增服务端关键词路由、phrasing 特判或具体业务 `toolName` 语义分支。
- [ ] 7.8 运行与 core 合同相关的最窄测试，例如 agent-core contract、runtime loop、trace/replay、manual LLM report contract 和 tool registry / manifest 测试。
- [ ] 7.9 修改 TypeScript、schema、AI orchestration 或共享业务逻辑后运行 `npm run typecheck`。
- [ ] 7.10 如用户确认真实模型 token 成本，再运行基础 LLM 黑盒 P0 冒烟集或 `npm run test:llm`；未运行时在最终实现总结中说明原因。

## 8. 文档和收尾

- [ ] 8.1 运行 `openspec validate stabilize-agent-loop-state-view-contract --strict`。
- [ ] 8.2 如果实现阶段修改核心架构或核心链路，在 `docs/方案变更历史/` 新增上海时间到秒的方案变更记录。
- [ ] 8.3 如果实现阶段修改核心链路，在 `docs/项目演变历程.md` 末尾追加简要演变记录。
- [ ] 8.4 最终 diff 检查：确认没有无关格式化、无关依赖升级、无关业务 tool 重写或高风险删除。
- [ ] 8.5 最终总结改了什么、为什么这个设计优于局部补丁、如何验证、是否存在未运行真实 LLM 的剩余风险。
