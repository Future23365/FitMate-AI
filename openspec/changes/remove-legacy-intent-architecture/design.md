## Context

`replace-chat-orchestrator-with-tool-first-agent` 已经把 `/api/chat` 的目标主链定义为 Tool-first `AgentOrchestrator`，现有代码也已经出现 `runAgentOrchestrator`、`AgentExecutionResult`、`AgentToolRegistry`、`LegacyChatEventAdapter` 和 Agent trace 等模块。

但当前主规格和代码边界仍保留旧架构语义：

- `openspec/specs/chat-intent-decision-flow/spec.md` 仍要求每轮聊天产出唯一 `resolved intent`，并要求后续回复、卡片生成、只读 tool loop、长期计划短指令和澄清都服从它。
- `openspec/specs/readonly-llm-tool-calling/spec.md` 仍把 LLM tool 能力描述为只读-only、feature flag 控制、最多三步的补查循环。
- `plan-push-composition`、`domain-plan-engine`、`chat-routine-composition`、`chat-exercise-recommendation-trigger` 等能力仍把 resolved intent、`workoutIntent` 或内部推荐事件作为下游执行事实源。
- 测试和文档中仍存在 `assistant_action`、`workoutIntent`、`conversationSummary`、`ENABLE_READONLY_LLM_TOOLS`、`runReadonlyToolLoop`、旧 trigger JSON 等迁移期字段。

这类遗留合同如果继续存在，后续实现会自然倾向于保留双主链：Agent 负责新结果，旧 intent 负责兼容、诊断、测试或兜底。长期看这会重新制造语义冲突：服务端旧规则和 Agent 工具结果可能同时声称自己能触发卡片、Patch 或 plan。

本 change 是实现型架构清理 change：目标是在后续 apply 阶段删除旧 intent-first 执行链路、旧只读 tool loop、旧流事件、旧测试口径和旧规格合同。当前用户要求“只写文档”，因此本轮只产出 OpenSpec proposal / design / specs / tasks，不改业务代码。

## Goals / Non-Goals

**Goals:**

- 删除旧 intent-first 主链的 OpenSpec 合同。
- 明确 `AgentExecutionResult` 是 `/api/chat` 唯一生产执行合同。
- 明确旧 `ResolvedChatIntent`、`ChatIntent`、`workoutIntent`、`assistant_action`、`intent_resolved`、只读-only tool loop 和 summary-only 上下文只能作为历史迁移或测试夹具存在。
- 让长期计划、routine、动作推荐、Patch、动作讲解和普通回复都从 Agent tool result 和执行结果进入下游领域服务。
- 为后续实现提供可检查的代码删除任务、测试迁移任务、trace/黑盒迁移任务和文档同步任务。
- 防止新增兼容层把旧路径包装成 Agent 工具或 trace 字段继续参与生产执行。

**Non-Goals:**

- 本 change 不重新设计 AgentOrchestrator；它以现有 Tool-first 架构为前提。
- 本轮提案阶段不修改业务代码、不删除文件、不迁移测试，只写 OpenSpec 文档；后续 apply 阶段需要按任务执行代码清理。
- 本 change 不要求删除 `conversationSummary` 存储本身；它可以继续用于后台摘要、标题、历史迁移和调试。
- 本 change 不要求删除所有历史报告中的旧字段；历史报告可以保留，但新运行和新验收不得依赖旧字段。
- 本 change 不引入新的外部依赖、数据库表或 API 路由。

## Decisions

### 1. 删除旧架构实现链路，而不是继续兼容降级

选择：把旧 intent-first requirement 放入 `REMOVED Requirements`，并新增少量 Agent-only 防回归 requirement。

原因：上一轮 Agent change 已经把 resolved intent 降级为兼容字段，但主规格和源码仍有大量旧路径。继续“兼容降级”会让旧字段持续存在，后续实现很难判断哪些代码可删。删除旧实现链路和对应合同能让归档后的规格直接表达最终目标：生产主链只认 Agent。

替代方案是保留 `LegacyChatEventAdapter` 和旧字段一段时间。这个方案对前端平滑迁移有价值，但现在用户明确要求“把所有旧架构的东西都去掉”，因此不作为本 change 的目标。

### 2. 读工具迁入 AgentToolRegistry，删除只读-only loop

选择：废弃旧 `readonly-llm-tool-calling` 能力中关于 feature flag、只读触发矩阵、只读 decision JSON 和只读上下文 bundle 的主链要求。

原因：Tool-first Agent 的工具系统已经同时覆盖读工具和受控写工具。继续保留只读-only loop 会形成第二个工具运行时，并且旧 loop 输入仍依赖 `conversationSummaryContext` 和 `ResolvedChatIntent`。

迁移后的读工具仍然必须保留 Schema、权限、摘要、预算和 trace 边界，但这些边界属于统一 Agent registry，而不是独立只读 loop。

### 3. 下游领域服务消费 Agent 输入，不消费 resolved intent

选择：计划、routine、动作推荐和 patch 相关规格统一改为从 Agent tool result、`WorkoutEditPlan`、candidate set、validation、policy 和 revision 输入派生。

原因：下游领域服务应该处理结构化领域输入，而不是重新接收聊天层旧意图字段。这样能避免 plan/routine 生成层重新判断“本轮是否应该生成”，也避免默认值、历史摘要或旧字段覆盖 Agent 已确定的执行结果。

### 4. Trace 和黑盒测试记录旧路径缺席，而不是记录旧路径输出

选择：新 trace 和黑盒要求必须证明旧 intent-first 分支未参与生产执行；旧字段缺失不得导致测试失败。

原因：测试如果继续断言 `assistant_action`、`workoutIntent` 或旧 trigger JSON，就会反向要求生产流继续输出旧字段。更合理的证据是：用户可见闭环成功、Agent result 存在、工具依赖图完整、写入引用了合法 tool result、旧路径未触发。

### 5. 代码清理是主体，文档同步是收尾

选择：当前阶段只定义文档；后续实现必须以源码、测试、trace、黑盒和流事件清理为主体，并同步更新架构文档，不能只删 OpenSpec。

原因：旧架构残留同时存在于代码、测试、手动黑盒 runner、架构说明和演变历史中。只改源码会留下错误协作信号，只改文档会留下可运行旧路径。tasks 必须把两者作为同一个验收闭环。

## Risks / Trade-offs

- [Risk] 删除旧兼容字段可能影响尚未迁移的前端或报告消费方 → Mitigation：实现阶段先用测试确认前端只依赖 `agent_execution_result`、artifact / patch / suggestion 事件和 done metadata；历史报告解析保留在离线脚本或测试夹具中。
- [Risk] 旧代码中部分 helper 仍被单测复用，直接删除会扩大改动面 → Mitigation：实现阶段先识别生产引用和测试引用；生产路径必须删除，测试夹具如确需保留必须移动到测试目录并改名为 legacy fixture。
- [Risk] `conversationSummary` 存储仍存在，容易被误认为执行上下文 → Mitigation：规格明确允许存储但禁止执行使用；测试必须断言 Agent context 不包含 summary-only 事实源。
- [Risk] 删除只读 tool loop 后可能丢失已有工具权限和摘要测试 → Mitigation：把这些测试迁移到统一 Agent registry，而不是删除工具边界测试。
- [Risk] 同时清理多个 spec 可能影响归档可读性 → Mitigation：每个 spec delta 只写和旧架构直接相关的删除/替换要求，不顺手重写无关训练领域规则。
