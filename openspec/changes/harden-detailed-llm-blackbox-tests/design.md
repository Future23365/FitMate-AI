## Context

当前项目已经有三层测试入口：`npm run test` 跑普通自动化测试，`npm run test:llm` 跑基础 LLM 黑盒冒烟，`npm run test --detail` 跑完整/详细 LLM 黑盒套件。详细套件已经覆盖更多首页聊天能力域，但仍存在四个问题：

- runner 直接复用服务端聊天编排函数并手工维护会话状态，和真实首页通过 `/api/chat` 请求、保存会话、再从数据库读取 recent artifact 的链路不完全一致。
- 引用、修改和动作讲解类用例依赖 artifact 事实源，但当前测试容易通过手工构造的 `recentArtifactSummaries` 获得比真实页面更理想的上下文。
- 自动断言主要停留在非空回复、内部字段泄漏和卡片类型，不能区分“卡片类型通过”和“语义目标通过”。
- `LLM完整测试.md` 中还有多轮上下文、引用修改、安全边界和异常恢复类高价值用例没有落入详细 fixture。

## Goals / Non-Goals

**Goals:**

- 让完整/详细 LLM 测试更贴近真实首页聊天路径，优先验证 `/api/chat`、会话保存、artifact 持久化和后续引用读取。
- 增加分级断言模型，让详细套件能识别引用成功、条件覆盖、动作排除、安全边界和异常恢复等关键语义目标。
- 补齐 `LLM完整测试.md` 的高价值缺口，使详细套件成为真实回归入口，而不是只比基础套件多一些同类样例。
- 提升报告诊断能力，明确区分 runner 错误、stream 错误、卡片类型失败、语义断言失败和级联跳过。
- 用最近真实运行结果校准 token 预估，降低完整测试成本误判。

**Non-Goals:**

- 不把真实 LLM 测试纳入默认 `npm run test`。
- 不要求每次 apply 都实际调用真实模型；真实模型运行仍由用户显式控制。
- 不把浏览器 UI 验收纳入本 change。输入焦点、滚动、视觉遮挡和真实交互截图仍由独立 UI 验收处理。
- 不改变生产 API 契约、数据库 schema 或 AI 输出 schema。

## Decisions

### 1. 详细 runner 优先走 HTTP/API 形态

完整/详细测试应新增或重构 runner，使每轮请求尽量靠近真实首页行为：构造 `conversationId`、`responseMessageId`、`latestUserMessage`、`conversationSummary`、`thinkingEnabled`，调用 `/api/chat` 处理 NDJSON stream，然后保存会话状态，下一轮再继续。

取舍：直接调用 `createAiChatResponse` 更快、更容易隔离，但会绕过 API Route 的用户校验、recent artifact 查询和真实请求 payload。详细套件的目标是回归真实用户链路，因此应优先使用 API 形态；基础套件可以继续保留较轻执行路径，或与详细 runner 共享底层执行器但使用较少 fixture。

### 2. 引用类用例必须依赖真实 artifact

测试中生成 `exercise_recommendation`、`workout_routine`、`workout_plan` 后，应让会话保存流程写入 `ConversationArtifact` 和 `ArtifactIndex`。后续“它”“这个”“第一个动作”“把第二天换简单点”等引用类轮次必须通过真实 artifact summary 和 payload 读取完成验证。

取舍：手工构造 `recentArtifactSummaries` 成本低，但会掩盖数据库持久化、sourceMessageId、active revision、payload 解析和权限隔离问题。完整测试应覆盖这些链路。

### 3. 分级断言替代单一卡片类型断言

断言层应至少分为：

- P0：请求失败、stream 失败、空回复、预期卡片缺失或错误卡片类型。
- P1：关键语义目标失败，例如应解释动作却返回“没有安全读取到动作详情”、应排除硬拉却继续推荐硬拉、当前消息覆盖失败。
- P2：上下文质量问题，例如重复追问已提供条件、引用歧义未澄清、多轮非健身插入后丢失最近训练上下文。
- P3：内容质量问题，例如措辞不自然、摘要不够完整、训练容量略偏但不影响流程。

第一版实现不需要引入复杂 NLP 评测模型，优先通过 fixture 中的结构化 expectation 描述可维护规则，例如 `mustIncludeAny`、`mustNotIncludeAny`、`requiredSemanticOutcome`、`expectedReferenceStatus`、`expectedArtifactPayloadReadable`。

### 4. fixture 补齐优先高价值缺口

详细套件不追求一次补齐所有文档用例。优先补以下缺口：

- 计划变化：`P04`、`P07`
- 多轮上下文：`C03`、`C05`、`C06`、`C08`
- 引用修改：`M03`、`M04`、`M05`、`M07`、`M08`
- 安全边界：`S03`、`S05`、`S06`
- 输出异常：`Q04`

这些用例比增加同类推荐措辞更能发现真实回归。

### 5. 报告必须能解释“为什么失败”

报告除现有字段外，应记录：

- 运行命令、套件名、runner 类型、真实模型/跳过状态。
- 每轮卡片类型断言状态和语义断言状态。
- artifact 诊断摘要：是否真实保存、是否读取到 recent summary、是否读到 payload、引用解析状态。
- token 预估口径、实际 token 汇总和与上一份真实报告的偏差。
- 失败分级、失败原因、可用于排错的 `conversationId`、`responseMessageId`、`traceId` 和 assistant 摘要。

## Risks / Trade-offs

- [Risk] HTTP/API runner 可能需要更多本地环境准备，例如用户 cookie、数据库迁移和 seed 数据。→ Mitigation: 提供测试专用用户/session 工具，并在缺少环境时清晰跳过，不静默 mock 真实模型。
- [Risk] 语义断言过严会导致真实模型小幅措辞变化造成误报。→ Mitigation: 使用分级断言和关键词/结构化诊断组合，不做逐字匹配。
- [Risk] 完整套件 token 成本继续上升。→ Mitigation: 保留基础套件，完整套件显式运行；报告显示真实成本，脚本按最近真实结果校准估算。
- [Risk] 会话保存和 artifact 写入可能污染本地开发数据。→ Mitigation: 使用 `manual-llm-*` 前缀的 conversationId/user 标识，并提供测试后可定位清理的记录字段；不在本 change 中做 destructive 自动清理。
