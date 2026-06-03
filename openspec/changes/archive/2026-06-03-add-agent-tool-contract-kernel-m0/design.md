## Context

`docs/agent-tool-orchestrator-design.md` 已将新架构收敛为 contract-first 的通用 `Agent Tool Orchestrator`：core 不绑定模型厂商、不绑定业务语义、不在 runtime 中写具体 toolName 分支，LLM/Planner 只提出 action，服务端负责合同校验、执行、收口和安全投影。

当前仓库已经通过 `remove-current-agent-core-layer` 删除旧 `lib/server/agent-orchestrator/**` 和旧运行时 AI/Agent 链路。因此本 change 不是修补旧实现，而是从空白运行时边界重新建立 M0 合同内核。M0 必须先证明通用内核可独立闭环，再让后续 M1/M2 接入资源、确认、trace、真实模型 adapter 和真实业务 tool。

## Goals / Non-Goals

**Goals:**

- 建立新的 `lib/server/agent-core/**`，作为通用 Agent Tool 合同内核。
- 用 `defineTool`、`ToolRegistry` 和 manifest 序列化表达 tool 的模型可见安全合同。
- 用 `PlannerPort` 和 `ReplayPlanner` 切开 core 与具体 LLM SDK / function calling / JSON mode 协议。
- 用 `AgentAction` Schema 和 Action Validator 校验 `tool_call`、`final_answer`、`ask_user` 三类 action。
- 用通用 Executor 执行 read-only fixture tool，处理输入 Schema、输出 Schema、timeout、abort 和错误归一化。
- 用 Runtime loop 串联 manifest、planner、validator、executor、observation、terminal result 和默认 Response Renderer。
- 用 fixture read tool 端到端测试证明只新增并注册一个 tool 时，不需要改 runtime、executor、validator、renderer 或 API 主流程。

**Non-Goals:**

- 不恢复旧 `lib/server/agent-orchestrator/**`、旧 `AgentExecutionResult`、旧 Response Writer 或旧 prompt module。
- 不接入 production `/api/chat` 主链；M0 只提供可测试内核和 fixture 验收。
- 不实现真实业务 tool、动作库 tool、训练生成 tool、保存 tool 或用户记忆 tool。
- 不实现真实 LLM adapter；M0 只提供 `PlannerPort` 合同和 `ReplayPlanner`。
- 不实现 `ResourceStore`、Resource Contract Validator、Policy Guard、confirmation、pending action、action hash、trace/replay 硬化、redaction 审计或跨 run 资源消费。
- 不通过用户自然语言关键词、正则、同义词或服务端规则来选择 tool 或改写 Planner 语义。

## Decisions

### 1. 从新的 `agent-core` 目录开始，不复用旧 Agent runtime

实现阶段 SHALL 新增 `lib/server/agent-core/**`，并把 `contracts.ts`、`define-tool.ts`、`tool-registry.ts`、`manifest.ts`、`planner-port.ts`、`action-validator.ts`、`executor.ts`、`runtime.ts`、`observation.ts`、`response-renderer.ts`、`errors.ts` 等 M0 文件放在新目录下。

取舍：复用旧路径能减少文件迁移，但会重新引入旧 `AgentToolRegistry`、旧业务 toolName 分支、旧 `AgentExecutionResult` 和旧 Response Writer 的心智负担。新目录能让 M0 明确只继承架构文档，不继承旧实现。

### 2. M0 tool contract 只允许安全只读闭环

`Tool` 类型 SHALL 包含 `name`、`version`、`description`、`whenToUse`、`whenNotToUse`、`inputSchema`、`outputSchema`、`policy`、`handler` 和可选投影函数。M0 可以保留 `policy` 字段用于 manifest 与未来 M1，但 Runtime 在 M0 阶段 MUST NOT 执行 write/high risk/confirmation-required tool。

取舍：完全去掉 `policy` 会让 M1 再改公共类型；允许写工具执行又会绕过尚未实现的 Policy Guard。保留元数据但拒绝执行非安全只读 tool，是 M0 最清晰的安全边界。

### 3. Tool manifest 使用安全 JSON Schema 摘要作为 Planner 唯一工具视图

`ToolRegistry.serializeForPlanner()` SHALL 从 tool contract 生成 `ToolManifest[]`，只暴露模型可见字段：名称、版本、说明、使用/不使用边界、输入 JSON Schema、可选输出摘要、安全 policy hint 和安全 examples。manifest MUST 保留 object、array、record、union、enum、required 和 nested fields，不能为了省 token 丢掉执行关键结构。

取舍：直接把 Zod 或 handler 暴露给 Planner 不安全，也会绑定 TypeScript 实现。JSON Schema 作为中间格式更适合后续模型 adapter 转换。

### 4. Core 只依赖 `PlannerPort`，M0 用 `ReplayPlanner` 验证运行时

`PlannerPort.decideNext(input)` SHALL 只返回 `AgentAction`。M0 的 `ReplayPlanner` SHALL 使用固定 action 序列驱动 runtime，覆盖成功、非法 action、工具失败、终止回答和追问等路径。

取舍：M0 直接接真实 LLM 会把模型输出解析、prompt、token、供应商差异和黑盒波动混进内核验收。ReplayPlanner 能稳定证明 core 合同正确，真实 `LlmPlanner` 留到 M2。

### 5. M0 暂不消费 Resource，只校验无资源引用的 action

`AgentAction` 保留 `consumes`、`usedResourceRefs` 等字段形状以贴合长期合同，但 M0 Action Validator MUST 拒绝非空 resource 引用，并返回结构化不可执行错误。ResourceStore、consumable/diagnostic 角色和 Resource Contract Validator 留给 M1。

取舍：提前实现半套 resource 会让 downstream tool 消费规则不完整。M0 明确拒绝资源引用，可以避免 Planner 或 fixture 把未登记资源伪装为成功事实。

### 6. Runtime loop 必须是通用确定性裁判

Runtime SHALL 按固定顺序执行：构建 state、列出可用 tools、序列化 manifest、调用 planner、校验 action、处理 terminal action、执行 tool、校验 result、生成 observation、继续下一步或收口。Runtime MUST NOT 出现具体业务 toolName 分支，也 MUST NOT 读取用户自然语言做业务判断。

M0 需要实现 `maxSteps`、overall timeout、per-tool timeout、非法 action 修复次数限制、基础 planner/tool call 次数限制和重复失败熔断。成本预算、token budget、复杂 redaction 审计留给 M2。

### 7. 默认 Response Renderer 只投影已校验结果

M0 Response Renderer SHALL 根据 terminal result、tool result 和标准化错误生成 NDJSON event，并最终输出 `done`。用户可见 payload MUST 来自 `projection.user` 或默认安全摘要，不能把完整 `output` 默认暴露给用户；Planner observation MUST 来自 `toModelObservation` 或默认安全摘要，不能把 tool output 当作 system 指令。

取舍：每个 tool 都写 renderer 会让 M0 过重，也会把 UI 逻辑塞进 tool。默认 renderer 覆盖 read fixture 和普通 terminal 输出，特殊 tool 的 `toUserEvents` 留给后续阶段。

## Risks / Trade-offs

- [Risk] M0 与未来 M1/M2 类型衔接不顺，导致二次重构。→ Mitigation：M0 保留长期合同字段形状，但对未实现能力执行明确拒绝，不提交假实现。
- [Risk] fixture read tool 过于简单，无法证明真实业务能力。→ Mitigation：M0 只验收内核链路；resource、confirmation、diagnostic failure 和真实业务 tool 在 M1/M2 用专门 fixture 补齐。
- [Risk] manifest 摘要过浅，后续 LLM 无法正确调用工具。→ Mitigation：M0 的 manifest 测试必须覆盖 nested fields、required、enum 和 array/object 结构，禁止压扁关键 schema。
- [Risk] 默认 renderer 泄漏 tool output。→ Mitigation：测试必须覆盖没有 `projection.user` 时只输出默认安全摘要，而不是完整 handler output。
- [Risk] 新内核被过早接入 production `/api/chat`。→ Mitigation：M0 tasks 明确不改生产聊天路由；接入生产链必须另起 M2 或后续 change，并具备真实 LLM、trace、policy 和回归测试。

## Migration Plan

1. 新增 `agent-core`、`agent-planners`、`agent-tools/fixture` 和 `tests/agent-core`，不修改 production `/api/chat`。
2. 先实现类型、contract、registry、manifest 和 `ReplayPlanner`。
3. 再实现 validator、executor、runtime、observation 和默认 renderer。
4. 最后接入 fixture read tool 端到端测试，运行 OpenSpec、单元测试和类型检查。
5. 若实现失败，删除本 change 引入的新目录和测试即可回滚，不影响现有生产聊天或训练功能。

## Open Questions

无。Resource、Policy、confirmation、Trace/Replay、真实 LLM adapter 和 production `/api/chat` 接入均不在 M0 中讨论，后续按 M1/M2 另行拆分。
