## Context

当前已经有 `.codex/skills/agent-tool-change-governance/SKILL.md`，它负责 Agent tool / core / production 接入变更的范围治理：先分类任务、声明允许和禁止模块、防止业务 tool 污染 core 或绕过安全边界。

但后续新增业务 tool 或修复 Agent prompt bug 时，还会频繁修改模型实际可见的 `prompt / model input`，包括 `agent-llm-prompt-config.ts`、tool manifest 文案、schema summary、examples、repair feedback、context package、observations 和压缩后的 tool results。这里的问题不是“文案写得是否好看”，而是模型是否被清楚告知通用 Agent 编排器的固定合同：

- 模型只能输出受控 `AgentAction`。
- tool 只能通过 `ToolRegistry` 中注册的 `toolName` 调用。
- tool input 必须严格符合 schema。
- final answer 必须基于 `satisfied=true` 的 tool result 或 consumable resource。
- diagnostic / failed / unsatisfied 结果不能支撑成功 final answer。
- write / high risk tool 必须经过 `Policy Guard` / confirmation。
- 模型不能假装 tool 已执行，也不能绕过 `ResourceStore`、`Policy Guard` 或 `Response Renderer`。

这些 prompt 合同属于长期稳定底座；业务 tool 会增加，但通用编排器使用方式、输出格式、resource / policy / grounding 边界不应随业务 tool 漂移。因此需要一个独立 Skill 来治理“怎么改 prompt / model input”，而不是继续塞进 Agent tool change governance。

## Goals / Non-Goals

**Goals:**

- 新增一个只针对 Agent prompt / model input 合同的 Codex Skill。
- 明确该 Skill 的触发范围：修改 prompt config、tool manifest、schema summary、examples、repair feedback、context package、observations、compressed tool results、LLM 输出格式说明、business tool 的模型可见说明。
- 固化 prompt / model input 必须表达的通用 Agent 编排规则、输出格式和成功收口规则。
- 要求新增业务 tool 时同步补充模型可见说明，但不把业务 tool 的语义决策写进通用 prompt。
- 要求 prompt 相关 change 的 OpenSpec 文档和 `tasks.md` 包含 prompt 合同分类、验证计划、相关测试和无法运行时的风险说明。
- 明确该 Skill 与 `agent-tool-change-governance` 的分工，避免两个 Skill 内容互相吞并。

**Non-Goals:**

- 本 change 不直接修改任何 prompt 文案或 prompt runtime。
- 本 change 不新增真实业务 tool。
- 本 change 不修改 Agent runtime、`PlannerPort`、Executor、`Policy Guard`、`ResourceStore`、`Response Renderer` 或 `/api/chat` 主链路。
- 本 change 不规定具体业务 tool 的全部 prompt 内容；它只规定后续业务 tool prompt 说明必须覆盖哪些固定合同。
- 本 change 不新增服务端自然语言关键词、正则、同义词或模板分流。

## Decisions

### Decision 1: 新增独立 `agent-prompt-contract-governance` Skill

选择新增独立 Skill，而不是继续扩展 `agent-tool-change-governance`。

理由：`agent-tool-change-governance` 管“Agent tool / core / production 变更能改哪里、不能改哪里”；新 Skill 管“模型实际看到的 prompt / model input 应该如何表达合同、如何审、如何验证”。两者关联紧密，但触发场景不同。把 prompt 合同细节继续塞进 tool governance 会让原 Skill 过重，也会让纯 prompt 修改不容易进入正确流程。

替代方案是只在现有 Skill 中加一段 prompt 检查。缺点是后续新增业务 tool 的 prompt manifest、schema summary、examples、repair feedback 都会被当成 tool 变更附属项，缺少专门的 prompt 合同审阅入口。

### Decision 2: Skill 关注 `prompt / model input` 合同，不关注文案润色

该 Skill 的核心不是“让模型更聪明”或“写更自然的提示词”，而是确保模型可见输入包含稳定、可验证的合同：

1. 允许输出的 action 类型。
2. 每类 action 的必需字段。
3. 什么时候必须继续调用 tool。
4. 什么时候可以 final answer。
5. 什么时候必须 ask_user。
6. tool result 和 resource 的可消费边界。
7. diagnostic / failed / unsatisfied 结果的使用边界。
8. write / high risk / confirmation 的边界。

替代方案是让每次 prompt 修改自由判断。缺点是容易遗漏通用 Agent Orchestrator 使用方式，导致模型生成“看似合理但不能执行”的 action 或 final answer。

### Decision 3: 区分通用 Agent prompt 规则和业务 tool 模型可见说明

Skill 必须要求实现者先判断本次修改属于：

- 通用 Agent prompt 合同，例如 `AgentAction` 输出格式、tool loop 使用方式、final grounding、repair feedback。
- 单个业务 tool 的模型可见说明，例如 whenToUse、whenNotToUse、input schema 解释、成功输出含义、失败/diagnostic 含义、resource 是否可消费。

通用规则只能写稳定合同；业务 tool 说明只能描述该 tool 的能力边界和输入输出，不得在服务端引入关键词式语义分流，也不得让业务 tool prompt 反向要求修改 core 主循环。

### Decision 4: 验证必须围绕模型实际可见输入

后续 prompt change 必须优先验证模型实际看到的内容，而不是只读源文件文案。可验证对象包括：

- prompt config 单测。
- tool manifest / schema summary 单测。
- prompt snapshot 或 model input builder 输出。
- repair feedback / observations 压缩后的模型可见内容。
- Agent runtime / grounding 测试。
- 必要时基于 `codex_logs/ai_trace_log.js` 或真实黑盒报告复核。

这样可以避免“源文件看起来写了规则，但实际 model input 没带上、被压缩丢失或顺序冲突”的问题。

## Risks / Trade-offs

- [Risk] 新 Skill 与 `agent-tool-change-governance` 同时触发，造成流程重复。  
  Mitigation: 新 Skill 只管 prompt / model input 合同；当任务同时新增业务 tool 和改 prompt 时，先用 `agent-tool-change-governance` 定范围，再用新 Skill 审模型可见合同。

- [Risk] Skill 规则过重，导致普通文案微调也被要求完整架构审查。  
  Mitigation: Skill 只覆盖 Agent prompt / model input / manifest / schema summary / repair feedback 等模型执行合同；普通 UI 文案、README 文案和非 Agent prompt 文案不触发。

- [Risk] Prompt 合同规则写得过死，影响后续业务 tool 的表达空间。  
  Mitigation: Skill 固化的是通用编排器和安全收口边界；业务 tool 的 whenToUse、schema 描述和 examples 仍由具体 change 定义。

- [Risk] 只新增 Skill 仍可能漏掉自动验证。  
  Mitigation: tasks 必须包含 Skill、文档说明、prompt config / manifest / schema summary 相关验证要求和 OpenSpec validate；实现阶段如新增测试 helper 或扫描，再由后续 apply 具体决定。

## Migration Plan

1. 新增 `agent-prompt-contract-governance` Codex Skill。
2. 在 Skill 中写明触发范围、preflight、通用 Agent prompt 合同、业务 tool 模型可见说明 checklist、禁止项和验证要求。
3. 更新 README 或相关开发文档，说明 prompt 相关 change 应使用该 Skill。
4. 按项目规则新增方案变更历史和项目演变历程记录。
5. 运行 OpenSpec validate、Skill 基础校验、必要的 prompt config / manifest / schema summary 测试或说明未运行原因。

## Open Questions

- 是否需要同时新增 prompt contract 测试 helper，由后续 apply 根据现有 `tests/agent-core/**` 和 prompt config 测试现状决定。
- Skill 是否需要引用现有 prompt 入口文件清单，还是只要求实现者通过当前代码搜索确认真实入口；实现时应优先避免写死会快速过期的完整文件清单。
