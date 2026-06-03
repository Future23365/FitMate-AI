## Context

`docs/agent-tool-orchestrator-design.md` 已将通用 `Agent Tool Orchestrator` 拆成 M0 / M1 / M2。M0 负责合同内核闭环，M1 负责资源、策略和确认闭环；M2 负责上线硬化，让新 core 可以在真实模型输出不稳定、prompt injection、trace 审计、预算限制和重复请求等条件下保持可控。

本 change 只面向新的 `lib/server/agent-core/**`、`lib/server/agent-planners/**` 和 fixture tool 验证链路。它不是恢复旧 `lib/server/agent-orchestrator/**`，也不是接入动作库、训练生成、保存或用户记忆等真实业务 tool。

用户已明确当前大模型接入只需要 DeepSeek。因此 M2 会保留 `ModelAdapter` 抽象和替换测试，但只实现一个生产级 `DeepSeekModelAdapter`；第二个真实供应商 adapter 不在本 change 范围内。

## Goals / Non-Goals

**Goals:**

- 新增真实 `LlmPlanner`，让模型输出只进入 `AgentAction` candidate，再交给 Action Validator / Policy Guard / Executor。
- 新增 `DeepSeekModelAdapter`，封装 DeepSeek SDK / HTTP 调用、prompt 构造、模型输出解析、错误归一化和可测试 fixture 回放。
- 通过 `ModelAdapter` 接口保持模型厂商可替换，替换 adapter 时不得修改 `agent-core`。
- 新增 manifestHash、registry snapshot、tool manifest linter 和 contract test helper，保证模型可见 tool 合同可审计、可回放、可回归。
- 新增 redaction、trace 脱敏审计、observation 压缩、planner/tool budget、idempotencyKey 和 prompt injection 测试。
- 用 fixture tools + DeepSeek 黑盒验证真实模型接入后的通用链路，不接入真实业务 tool。

**Non-Goals:**

- 不实现 OpenAI、Anthropic 或其他真实模型 adapter。
- 不新增真实动作库、训练生成、保存、用户记忆、数据库查询或业务 domain tool。
- 不在 `agent-core`、Runtime、Executor、Policy Guard、Response Renderer 或 `/api/chat` 中增加具体业务 toolName 分支。
- 不通过用户自然语言关键词、正则、同义词表或规则评分做业务路由。
- 不新增 Prisma migration、持久化 trace 表、持久化 ConfirmationStore 或生产级跨请求恢复存储。
- 不改前端 UI，不新增浏览器验证要求。

## Decisions

### 1. `LlmPlanner` 只产出 `AgentAction`，不执行 tool

`LlmPlanner` SHALL 位于 `lib/server/agent-planners/llm-planner.ts`，只实现 `PlannerPort.decideNext(input): Promise<AgentAction>`。它可以读取 runtime state、manifest、observation 和压缩后的历史，但输出必须先解析为候选 `AgentAction`，再由 Action Validator 校验。

取舍：让模型 adapter 直接执行 tool 或生成 NDJSON 事件会绕过 M0/M1 的安全边界。只产出 `AgentAction` 可以把 LLM 不稳定性限制在 planner 边界内。

### 2. 本 change 只实现 `DeepSeekModelAdapter`

`ModelAdapter` SHALL 定义模型无关接口，例如 `completeAction(input)` 或等价方法；`DeepSeekModelAdapter` 负责把 `ToolManifest[]`、state 和 observation 转成 DeepSeek 请求，并把 DeepSeek 输出解析为 `AgentAction` candidate。

取舍：架构文档建议 M2 至少两个 adapter，但用户明确当前只需 DeepSeek。为了不提前引入额外供应商 SDK、环境变量和测试负担，本 change 只实现 DeepSeek，同时用 adapter contract test 证明后续替换 adapter 不需要改 `agent-core`。

### 3. DeepSeek 输出解析必须走结构化合同和 repair

DeepSeek adapter MUST 要求模型输出结构化 JSON action；解析失败、Schema 不合法、未知 tool、非法 input 或非法 resource refs 时，Runtime MUST 进入 M0/M1 已有 invalid action observation / repair 限制，而不是服务端关键词 fallback。

取舍：在服务端用关键词纠偏看似能提高成功率，但会违反“LLM 是语义理解来源，服务端只校验合同”的边界。repair observation 能把结构错误反馈给模型，同时保持确定性裁判角色。

### 4. manifestHash 与 registry snapshot 是每次 run 的可回放证据

Runtime SHALL 在每次 run 生成 registry snapshot 和 manifestHash，记录 tool name、version、模型可见 manifest、resource contract、安全 policy hint、examples 摘要和 linter 结果。snapshot 只记录安全字段，不包含 handler、capabilities、secret、数据库对象或完整用户数据。

取舍：只在 trace 中记录 tool name 无法复现模型当时看到的合同；记录完整 tool 对象又会泄漏实现细节。manifestHash + 安全 snapshot 能同时满足回放和安全边界。

### 5. Redaction 在 manifest、observation、user event 和 trace 前统一执行

M2 SHALL 新增 redaction 策略模块，提供字段级、路径级和默认拒绝规则。所有进入模型 observation、用户事件和 trace 的数据都必须先经过 projection / redaction，不允许完整 tool output 默认透传。

取舍：把 redaction 分散在每个 tool 或 renderer 中容易遗漏。统一策略模块可以让 fixture、trace audit 和 manifest linter 复用同一安全规则。

### 6. observation 压缩控制上下文增长，不改变事实含义

Runtime SHALL 在发给 `LlmPlanner` 前压缩历史 observation，只保留 toolResultId、resource ref、安全 summary、policy decision、confirmation 状态和必要错误码。压缩不得生成新的业务事实，也不得删除当前 step 必须校验的 resource / tool result 引用。

取舍：不压缩会导致 token 持续膨胀；用语义总结替代事实引用又可能引入模型幻觉。结构化压缩能降低上下文，同时保持可验证引用。

### 7. Budget 与 idempotencyKey 进入通用 runtime 配置

M2 SHALL 扩展 runtime 配置，强制 planner call、tool call、token 预算或等价成本预算，并为每个 tool execution 注入稳定 `idempotencyKey`。重复 resume、重复 tool call 或相同 pending action 不能造成重复写入 fixture。

取舍：预算放在模型 adapter 内会漏掉 tool loop；idempotency 放在业务 tool 内会让每个 tool 重复实现。通用 runtime 统一注入更适合后续业务 tool 复用。

### 8. prompt injection 只作为不可信输入处理

M2 SHALL 增加 prompt injection 测试，覆盖 tool output、resource summary、observation、用户输入和 manifest examples 试图要求模型绕过策略、泄漏 secret、伪造 confirmation 或生成任意 event 的情况。系统必须通过结构校验、Policy Guard、redaction 和白名单 renderer 阻断，而不是靠关键词屏蔽。

取舍：关键词过滤无法覆盖 injection 变体，也容易变成语义判断。合同校验和投影边界是更稳定的防护。

### 9. Contract test helper 用于后续 tool 扩展

M2 SHALL 新增 contract test helper，让新增 fixture 或未来业务 tool 能快速验证 defineTool、manifest schema、resource contract、policy、projection、redaction、trace projection 和 renderer 安全边界。helper 只依赖 core 合同，不依赖具体业务语义。

取舍：每个 tool 手写一套合同测试会导致遗漏和风格不一。helper 能把“新增 tool 不改 core”的架构目标变成可重复测试。

### 10. 真实业务 tool 仍不进入 M2

M2 验收只使用 fixture read / resource / confirmation / diagnostic tools。`lib/server/agent-tools/<domain>/` 真实业务目录、动作库查询、训练生成、保存、用户记忆和生产数据访问均留给后续独立 change。

取舍：把真实业务 tool 和真实 LLM 同时接入会把模型 prompt、业务字段、数据库权限和 runtime 硬化问题混在一起。先用 fixture 证明上线硬化，再按业务合同单独接 tool，风险更低且更符合架构文档的分层方向。

## Risks / Trade-offs

- [Risk] 只实现 DeepSeek adapter，无法用第二供应商证明运行时完全模型无关。→ Mitigation：保留 `ModelAdapter` contract test 和 fake adapter 测试，证明 `agent-core` 不导入 DeepSeek，也不依赖 DeepSeek 格式。
- [Risk] DeepSeek 输出格式波动导致 repair loop 过长。→ Mitigation：使用结构化 action schema、明确 repair 次数、planner budget 和 invalid action observation，超限后结构化失败收口。
- [Risk] redaction 规则遗漏敏感字段。→ Mitigation：增加 trace audit、manifest linter、projection 测试和 prompt injection 样例，默认未知内部字段不得外泄。
- [Risk] observation 压缩删掉必要引用，导致后续 action 校验失败。→ Mitigation：压缩测试必须覆盖 toolResultId、resource refs、confirmation pendingActionId 和错误码保留。
- [Risk] M2 被误用为生产业务 tool 接入口。→ Mitigation：tasks 和架构扫描明确不得注册真实业务 tool，也不得新增 domain tool 目录。

## Migration Plan

1. 在 `agent-planners` 中新增 `LlmPlanner`、`ModelAdapter` 合同和 `DeepSeekModelAdapter`，保持 `agent-core` 无模型 SDK 依赖。
2. 在 `agent-core` 中补齐 manifestHash、registry snapshot、redaction、trace replay/audit、observation 压缩、budget 和 idempotencyKey。
3. 增加 tool manifest linter 和 contract test helper，先覆盖既有 fixture tools。
4. 增加 DeepSeek fixture 黑盒测试、prompt injection 测试、trace 脱敏审计和架构扫描。
5. 更新架构文档和项目演变记录，运行 OpenSpec 校验、相关自动化测试、`npm test` 和 `npm run typecheck`。
6. 回滚策略：M2 不改数据库和真实业务 tool；如实现失败，删除新增 planner adapter、hardening 模块、fixture 测试和文档记录即可回到 M1。

## Open Questions

无。是否接入第二个真实模型 adapter、production `/api/chat`、真实 `/api/agent/confirm`、持久化 trace / confirmation store 或真实业务 tool，均留给后续独立 change。
