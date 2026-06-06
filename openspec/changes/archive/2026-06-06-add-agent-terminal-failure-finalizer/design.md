## Context

当前 production `/api/chat` 已有三类失败收口：默认 renderer 的脱敏 `error` 事件、production adapter 的确定性 terminal failure fallback，以及前端本地错误兜底。这个设计能避免内部错误泄漏，但当主 Agent 已经多次尝试并因服务端校验未通过而耗尽 repair budget 时，确定性文案仍显得机械，前端对话体验也容易从“助手对话”断裂成“系统报错”。

本 change 不是要放宽 validator，也不是让失败结果继续进入卡片渲染。它新增一个独立的 terminal failure finalizer：主 Agent 已经不能再 repair 之后，系统允许额外调用一次受限 LLM，只生成失败解释和后续建议问题。该调用不属于主 planner 循环，不增加主流程重试次数，不允许 tool calling，不允许 `visibleOutputs`，也不能声称用户需求已经完成。

任务分类：`agent-tool-change-governance` 下的 **Production 接入变更**，并包含 `agent-prompt-contract-governance` 的 secondary 检查，因为 finalizer 有独立模型可见输入和系统指令。它不是新增业务 tool，不应修改业务 tool handler 查询语义，也不应把具体业务 `toolName` 写进 Agent core 分支。

允许触碰模块：

- production `/api/chat` adapter 和 terminal failure projection helper。
- finalizer model adapter / service 边界。
- `lib/server/config/` 下的 finalizer 行为预算和 prompt 配置。
- trace / replay / chat service tests / manual LLM report contract。
- 前端 chat client 对 `content` / `suggested_questions` / `error` 的安全消费测试。

禁止触碰模块：

- 不降低 `Action Validator`、terminal output validator、ResourceStore、Policy Guard、resource contract 或权限校验。
- 不在 Agent core、runtime、validator、renderer 或 `/api/chat` 中新增用户原文关键词、正则、同义词、短句模板或 phrasing 特判。
- 不在 Agent core 中新增具体业务 `toolName` 语义分支。
- 不注册 fixture tool、隐藏业务 tool、旧 `AgentOrchestrator`、旧 `assistant_action`、旧 `intent_resolved` 或旧 card trigger。
- 不让 finalizer 生成或修改训练卡片、artifact、长期记忆或数据库写入。

## Goals / Non-Goals

**Goals:**

- 在主 Agent 内部 repair / terminal validation 耗尽后，额外提供一次受限 finalizer LLM 调用，生成自然、可继续对话的用户回复。
- 明确 finalizer 与主 Agent planner / repair loop 隔离：它不继续尝试满足用户需求，只说明本轮未完成并给出下一步建议。
- 只在模型供应商仍可用、请求仍在 finalizer 预算内、失败属于内部可分类校验/合同失败时调用 finalizer。
- 在 provider quota/rate limit/HTTP failure、模型配置缺失、网络失败、stream 失败或总超时等模型不可用边界下，使用确定性中文安全兜底。
- 对 finalizer 输入和输出建立结构化合同：脱敏输入、严格系统指令、Zod / JSON Schema 输出校验、失败后无 repair 降级。
- trace 必须能区分主 Agent 成功、确定性 fallback、finalizer 成功、finalizer 输出无效、finalizer provider 不可用和前端本地错误。

**Non-Goals:**

- 不调大主 Agent 的 `maxRepairAttempts`、`maxPlannerCalls`、`maxSteps` 或 tool budget 来继续完成原任务。
- 不让 finalizer 调用 tool、产生 `AgentAction`、输出 `visibleOutputs`、渲染训练卡片或保存事实。
- 不把 validator 错误、provider 原文、完整 tool output、stack、API key、authorization、cookie 或跨用户 payload 暴露给 finalizer。
- 不根据用户原文判断失败类型，不按具体业务 `toolName`、字段组合或 trace case 选择回复策略。
- 不要求真实 LLM 黑盒自动进入默认 `npm run test`。

## Decisions

### Decision 1: finalizer 是独立失败回复阶段，不是主 Agent repair

主 Agent run 仍按当前合同执行：`LlmPlanner -> runAgentRuntime -> Action Validator -> tool execution -> terminal validation`。如果主 run 失败，production adapter 先做确定性分类。只有分类结果满足“内部可分类校验/合同失败”时，才进入 finalizer。

finalizer 输入不使用 `PlannerInput`，不序列化 tool manifest，也不提供 tool calling 能力。建议定义独立结构：

```ts
type TerminalFailureFinalizerInput = {
  failureCategory: "visible_output_validation" | "terminal_reference" | "repair_exhausted" | "budget_exhausted" | "unsupported_capability";
  userRequestSummary: string;
  verifiedFactsSummary: JsonValue;
  unmetRequirements: Array<{ code: string; path?: string; summary: string }>;
  blockedOutputs: Array<{ outputType?: string; reasonCode: string; summary: string }>;
  allowedResponseMode: "failure_explanation_only";
};
```

备选方案是把错误 observation 继续塞回主 `LlmPlanner`，让它再输出一次 `final_answer`。不采用：这会把失败回复和继续 repair 混在一起，容易让模型再次尝试 `visibleOutputs` 或 tool calling，也会让主 Agent budget 语义变得模糊。

### Decision 2: finalizer 有自己的单次预算和 provider 可用性门禁

这次调用不是“主流程还剩一次 repair”。它是 production adapter 的单独失败收口调用，最多一次。集中配置应至少包含：

- `enabled`
- `maxCallsPerRun = 1`
- `timeoutMs`
- `maxTokens`
- `temperature`
- `maxSuggestedQuestions`

调用前必须先判断 provider 是否可用。以下情况 MUST NOT 调用 finalizer：

- 缺少 API key / endpoint / model 配置。
- 最近模型调用或当前错误明确是 provider quota、rate limit、billing、auth、HTTP failure、network failure、adapter exception 或模型请求 timeout。
- 当前请求剩余墙钟时间不足以可靠完成 finalizer。
- finalizer 已经调用过一次。

这些场景直接进入确定性 fallback。理由是：模型已经不可用时再请求同一个模型只会产生二次失败，且无法改善体验。

### Decision 3: finalizer prompt 必须强约束“不满足需求”

finalizer 的 system message 必须使用中文描述业务边界，并保持技术标识英文原样。核心指令：

- 本轮主 Agent 已经耗尽内部修复机会。
- 用户需求没有被满足，不能声称已完成。
- 不得输出 `AgentAction`、NDJSON、JSON 卡片、`visibleOutputs`、tool call 或保存结果。
- 不得承诺已经查询、生成、保存、确认或执行未发生的操作。
- 只能输出简短自然语言解释和最多 3 条 `suggestedQuestions`。
- 建议问题必须是用户可直接点击发送的下一轮问题，不能承诺不可用能力，不能要求用户复制内部 code。

输出建议用 JSON Schema / Zod 严格约束：

```ts
type TerminalFailureFinalizerOutput = {
  content: string;
  suggestedQuestions?: string[];
};
```

如果 finalizer 输出非法 JSON、字段不合规、正文声称已完成、建议问题为空泛或数量超限，production adapter 不做第二轮 repair，直接降级为确定性 fallback。

### Decision 4: finalizer 输入只给脱敏失败摘要和可恢复方向

finalizer 需要知道“为什么没完成”和“下一步怎么恢复”，但不需要完整内部状态。输入应来自稳定事实：

- `result.terminalError.code`、安全 details 摘要。
- 最近 `validation_result`、`budget_event`、terminal output validation summary。
- 已成功且可消费的 tool result / resource 安全摘要。
- 缺失 section、缺失 resource、无效 reference、预算耗尽等结构化 facts。
- 最近用户请求的安全摘要和会话目标摘要。

输入不得包含：

- provider 原始 HTTP body、stack、完整 prompt、完整 tool output。
- 跨用户 payload、未脱敏敏感字段、API key、authorization、cookie。
- 服务端从用户原文关键词推断的 intent 分类。
- 具体业务 `toolName` 触发规则或“下一步必须调用某 tool”的命令。

### Decision 5: production response 仍输出普通聊天事件

finalizer 成功后，production adapter 输出：

- `content`
- 可选 `suggested_questions`
- `done`

这些事件和普通助手回复兼容，但 trace 的 `projectionType` 必须明确是 `terminal_failure_finalizer`，不能把它记成主 Agent `final_answer` 成功。前端不需要新增特殊 UI，但需要测试确认不会把 finalizer 回复当训练卡片、confirmation 或旧事件处理。

### Decision 6: 确定性 fallback 继续存在

finalizer 是改善体验的可选增强，不是唯一防线。以下情况必须保留确定性 fallback：

- finalizer provider 不可用。
- finalizer 输出校验失败。
- finalizer 超时。
- finalizer 被配置关闭。
- 失败类型无法安全归类。

这样即使 finalizer 自己失败，用户也会收到普通 `content` / `suggested_questions` / `done` 或稳定安全错误，而不是看到内部异常。

### Decision 7: 抽象层级门禁

结论：可继续。

1. 抽象问题类型：内部 repair budget 耗尽后的用户可见失败收口不可恢复；finalizer 模型可见合同需要明确“未满足需求”和“只生成下一步建议”。
2. 通用合同修复：基于 runtime status、terminal error code、validation details、budget events、provider availability 和脱敏事实摘要触发 finalizer，不使用用户短句或业务 toolName 作为触发条件。
3. 业务 tool 局部说明：如需出现 `visibleTrainingProposal`、`searchExerciseResources` 或 `inspectVisibleTrainingProposals`，只能出现在 validator diagnostics、tool manifest、observation / resource contract 或回归测试中。
4. 回归测试样例：可以覆盖“主 Agent 两次输出未通过 visible output validation 后 finalizer 说明未完成并给出建议”，并增加一个等价失败类型，例如 terminal resource reference 无效。
5. 服务端语义分流检查：本 change 不新增关键词规则、自然语言模板路由、phrasing 特判或具体 `toolName` 语义分支。

## Risks / Trade-offs

- [Risk] 额外模型调用增加成本和延迟。→ Mitigation：finalizer 单次调用、独立集中配置、短 prompt、低 `maxTokens`，trace 记录 token usage；默认测试不真实调用模型。
- [Risk] finalizer 可能声称已完成原需求。→ Mitigation：严格 system prompt、输出 schema、内容安全校验和回归测试；失败则确定性 fallback。
- [Risk] finalizer 可能掩盖真实 validator bug。→ Mitigation：trace 保留主 Agent 原始 error code、details、失败阶段、repair budget 和 finalizer projection type；测试断言主 run 仍为 failed。
- [Risk] provider 不可用时再次调用导致更差体验。→ Mitigation：provider availability gate 必须在调用前执行，HTTP/quota/rate limit/config/network failure 直接确定性 fallback。
- [Risk] finalizer 输入摘要太弱，建议不够有帮助。→ Mitigation：输入保留 unmet requirements、blocked outputs、verified facts 和安全用户目标摘要；后续可基于 trace 调整摘要 builder，而不改业务语义边界。
- [Risk] 变成服务端语义路由。→ Mitigation：触发只读 runtime / validator / budget / provider facts；architecture scan 检查无用户原文关键词、phrasing 或具体业务 toolName 分支。

## Migration Plan

1. 新增 finalizer 配置和 prompt 配置，保留现有 deterministic fallback。
2. 新增 finalizer input builder，只消费脱敏 runtime failure summary、verified facts 和 unmet requirements。
3. 新增 finalizer model call service 或 adapter，输出 `TerminalFailureFinalizerOutput`，最多一次，无 tool manifest。
4. 在 production terminal failure projection 中接入 provider availability gate 和 finalizer gate。
5. finalizer 成功时输出 `content` / `suggested_questions` / `done`；失败时降级到现有 deterministic fallback。
6. trace 增加 finalizer 触发、请求摘要、响应校验、token usage、降级原因和最终 projection type。
7. 补 chat service、prompt/model input、config、trace、architecture boundary 和手动 LLM report contract 测试。

## Open Questions

- finalizer 是否复用当前 `DeepSeekModelAdapter` 的底层 HTTP 封装，还是新增只返回 `TerminalFailureFinalizerOutput` 的轻量 adapter，需要实现前结合现有 adapter 结构确认。
- provider quota/rate limit 的错误 code 目前是否需要先从 `deepseek_http_error` 细分为稳定 `provider_unavailable` / `provider_quota_exhausted`，需要实现时按真实响应可见性确认。
- finalizer 默认是否启用，还是先通过 TS config `enabled` 开关开启，需要根据成本和黑盒测试节奏确认。
