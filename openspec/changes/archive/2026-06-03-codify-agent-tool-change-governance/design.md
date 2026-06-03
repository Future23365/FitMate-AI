## Context

`docs/agent-tool-orchestrator-design.md` 已经定义了 Agent Tool Orchestrator 的核心边界：新增业务能力应通过 `Tool Bundle + ToolRegistry + contract tests` 接入，而不是修改 orchestrator、planner、executor、policy、renderer 或 `/api/chat` 主流程。文档第 24-26 节还明确了后续新增业务 tool 的允许项、禁止项和最小验收清单。

当前风险在于这些规则主要存在于架构文档和人工记忆中。后续新增 tool 或修复 bug 时，如果没有固定入口和验证机制，容易出现以下跑偏方式：

- 为单个业务 tool 修改 core 主循环或增加 toolName 特判。
- 在 `/api/chat` 或 tool handler 中增加关键词、正则或自然语言模板分流。
- 让 handler 直接生成用户事件、绕过 Policy Guard、伪造 resource 或默认回灌完整 output。
- 修 bug 时只看表面报错，没有先确认 trace、真实 schema、model-visible manifest 和 resource/policy/projection 边界。

本 change 先把治理流程定义清楚，后续实现时再落 Codex Skill、架构扫描和 contract test helper。

## Goals / Non-Goals

**Goals:**

- 为所有 Agent tool 相关任务建立固定 preflight：读取架构文档、检查 OpenSpec 状态、检查 git 工作区、按任务类型分类。
- 将后续任务分成新增业务 tool、修复 Agent tool bug、core contract 变更、production 接入变更四类，并为每类规定默认边界。
- 创建一个 Codex Skill 作为后续任务入口，让“新增 Agent tool / 修 Agent tool bug / 改 Agent core contract”自动触发这套流程。
- 增加可自动化的架构扫描或 contract tests，覆盖业务 toolName 分支、关键词分流、core 被业务污染、tool output 泄漏和 confirmation/resource 绕过。
- 要求后续非文案类 OpenSpec tasks 必须包含对应验证步骤，避免只写实现不写检查。

**Non-Goals:**

- 本 change 不新增真实业务 tool。
- 本 change 不修改 Agent runtime、PlannerPort、Executor、Policy Guard、ResourceStore、Response Renderer 或 `/api/chat` 主链路。
- 本 change 不改变当前模型输出结构、API 契约、数据库结构或用户可见聊天流程。
- 本 change 不替代 `docs/agent-tool-orchestrator-design.md`；它只把该文档的执行流程和验收边界固化到后续协作机制中。

## Decisions

### Decision 1: 新增独立治理规格，而不是修改运行时规格

新增 `agent-tool-change-governance` 规格，用来描述“后续怎么改”的流程要求。这样不会把协作流程混入 `tool-first-agent-orchestrator` 或 `agent-tool-capability-contract` 的运行时语义，也能在 archive 后形成长期可引用的正式要求。

替代方案是直接修改既有 runtime spec。缺点是流程规则和系统行为会混在一起，后续实现者难以判断某条要求是在约束 runtime 还是约束开发流程。

### Decision 2: Skill 做入口，OpenSpec 做范围，测试/扫描做兜底

后续实现应新增一个简洁的 Codex Skill。该 Skill 只保留必要流程：

1. 触发时读取 `docs/agent-tool-orchestrator-design.md` 第 24-26 节。
2. 检查当前 OpenSpec 状态和相关 change。
3. 按任务类型分类，并列出默认允许项和禁止项。
4. 如果任务必须改 core，先说明它是单 tool 特例、多个无关 tool 的通用需求，还是安全/权限/resource/trace/stream 合同问题。
5. 完成后要求运行对应 contract tests、architecture scan 或说明未运行原因。

OpenSpec 负责把本次实际变更范围写清楚；测试和扫描负责发现实现是否违反架构边界。只写 Skill 不够，因为 Skill 是工作协议，不是自动失败机制。

### Decision 3: 修 bug 必须先做 trace-first 分类

Agent tool bug 不能默认通过 prompt 文案或服务端关键词补丁修复。实现者必须先读取 `codex_logs/ai_trace_log.js`、相关 tool schema、model-visible manifest/schema summary、resource/projection/policy 代码，再判断根因类别。

这能避免把 LLM 参数错误、工具能力不足、resource 未登记、projection 泄漏、final grounding 缺陷、policy/confirmation 边界等问题误修成业务分支。

### Decision 4: core 变更必须升级为 core contract 设计

如果新增 tool 必须修改 core 才能工作，后续 change 必须明确原因：

- 只有一个 tool 需要时，优先修 tool contract，不改 core。
- 两个以上无关 tool 都需要时，才考虑抽象成通用 core 扩展点。
- 涉及安全、权限、resource、trace、stream 协议时，必须回到 core contract 统一设计，不能为某个业务 tool 开特例。

这与架构文档第 24 节保持一致。

## Risks / Trade-offs

- [Risk] Skill 触发依赖描述匹配，可能漏掉措辞不同的任务。  
  Mitigation: Skill description 必须覆盖“新增 Agent tool、修 Agent tool bug、Agent core contract、PlannerPort、Policy Guard、ResourceStore、Response Renderer、/api/chat production 接入”等关键词。

- [Risk] 架构扫描过严会误伤合理的通用 core 变更。  
  Mitigation: 扫描失败不直接鼓励绕过，而是要求在 OpenSpec design 中说明该 core 变更属于通用合同扩展，并补对应 contract tests。

- [Risk] 只新增流程规则会增加后续实施前置工作。  
  Mitigation: 规则只要求高风险 Agent tool 链路执行；文案修改、无关 UI 调整和非 Agent tool 小修不受此流程影响。

- [Risk] 后续实现可能只创建 Skill，不补自动化检查。  
  Mitigation: tasks 必须包含 Skill、architecture scan、contract tests 和 OpenSpec validation 四类验收，缺一项不能认为完成。

## Migration Plan

1. 新增 Agent tool 治理 Skill，并让其触发后读取架构文档关键章节。
2. 新增或扩展架构扫描，检查 core 业务污染、`/api/chat` 关键词分流、tool output 默认泄漏、confirmation/resource 绕过等风险。
3. 新增 contract test helper 或测试模板，要求真实业务 tool 的 schema、policy、resourceContract、projection、trace projection 都被验证。
4. 更新相关文档，说明后续 Agent tool change 必须先按治理流程分类。
5. 运行 OpenSpec validate、相关测试和最终 git diff 检查。

## Open Questions

- Skill 最终放在 `.codex/skills/` 还是 `.agents/skills/`，实现时应根据当前项目已启用的技能目录和触发规则确认。
- 架构扫描使用现有测试框架还是独立脚本，后续实现时应优先复用 `tests/agent-core/**` 已有扫描模式。
