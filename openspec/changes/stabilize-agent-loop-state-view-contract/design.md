## Context

当前 Agent Loop 的第二轮 Planner 并不是由第一轮模型直接告诉“下一步应该调哪个 tool”。第一轮模型只产出候选 `AgentAction`；服务端执行 tool 后，把结果、错误、资源和预算状态重新组织成下一轮模型输入。问题在于当前组织方式仍偏“文本和 projection 叠加”：同一事实可能同时出现在 `observations` 和 `toolResults.projection.model`，截断规则与权威层级不清，终态校验也缺少“完成 / 部分完成 / 需要用户输入 / 阻断”的结构化门禁。

这次 change 属于 `agent-tool-change-governance` 定义下的 **Core Contract 变更**。它允许触碰 Agent core runtime、`PlannerPort`、model input adapter、tool result projection、trace/replay 和 terminal validation；禁止为了某个业务 case 修改业务 tool handler、服务端关键词路由、固定 tool 调用顺序或具体业务 `toolName` 分支。

项目不需要引入重框架，但核心实现应对齐成熟 Agent 框架的稳定抽象：

- 显式 state 和状态转移：对齐 LangGraph 的 state / transition 思想。
- tool event 和 termination condition：对齐 AutoGen 的工具事件与终止条件思想。
- guardrail / tracing：对齐 OpenAI Agents SDK 的 guardrails、Runner 和 tracing 思想。
- agent service 边界：对齐 Semantic Kernel 这类框架把 agent 能力和业务服务分层的思想。

本项目可以忽略多 agent 协作、handoff、完整 graph DSL、durable long-running execution、human-in-the-loop approval framework、parallel tool planning 和跨进程 checkpoint。当前核心诉求是让一个轻量单 Agent Loop 在多轮 tool calling 中有稳定、可验证、可 trace 的状态合同。

## Goals / Non-Goals

**Goals:**

- 定义 `AgentLoopState` 内部真相和 `PlannerStateView` 模型可见真相的分层。
- 让 tool result 先归一化为 `Evidence`，再进入 Planner 输入。
- 用 `pendingRequirements` 和 `terminalConstraints` 替代“长文本提示是否被模型理解”的隐式完成度判断。
- 用 `TerminalGate` 阻止仍有可恢复缺口的 `complete final_answer` 成功收口。
- 让 trace/replay 能解释每一轮“模型看到了什么、证据来自哪里、为什么允许或拒绝终态”。
- 保持业务 tool、Agent Tool、ToolRegistry 注册方式和 `/api/chat` 外部 stream contract 基本稳定。
- 让根目录基础/完整 LLM 黑盒用例的用户可见目标能映射到 core loop 验证点。

**Non-Goals:**

- 不引入 LangGraph、AutoGen、OpenAI Agents SDK、Semantic Kernel 或其他重框架依赖。
- 不新增多 Agent、handoff、full graph workflow、durable checkpoint 或 parallel tool selection。
- 不新增服务端自然语言关键词、正则、同义词表、用户短句模板或业务 phrasing 特判。
- 不在 Agent core 中写 `searchExerciseResources`、`visibleTrainingProposal` 或其他具体业务 `toolName` 语义分支。
- 不重写训练计划生成领域规则、动作选择算法、动作去重、组数/时长精确质量断言或前端卡片 UI。
- 不替代 `generalize-agent-schema-repair-feedback` 的 schema projector 设计；本 change 只消费通用 repair / diagnostic facts。
- 不替代 `clarify-visible-training-output-kind-prompt` 的模型语义选择说明；本 change 只提供状态、证据和终态门禁。

## Decisions

### Decision 1: 用 `PlannerStateView` 取代双通道 observation / toolResults 输入

现状中，同一 tool 事实可能既在 `observations` 里以文本摘要出现，又在 `toolResults.projection.model` 里以较完整结构出现。模型不知道哪个更权威，开发者也难以判断截断后关键字段是否仍可见。

实现时应新增一个 builder：

```ts
type PlannerStateView = {
  currentInput: PlannerCurrentInput;
  visibleContext: PlannerVisibleContext;
  actionHistory: PlannerActionHistoryItem[];
  evidence: PlannerEvidence[];
  pendingRequirements: PlannerPendingRequirement[];
  terminalConstraints: PlannerTerminalConstraints;
};
```

`LlmPlanner` 只接收 `PlannerStateView` 和 `ToolManifest[]`。内部 `AgentLoopState` 可以更完整，但不得直接序列化给模型。这样后续如果要调整压缩、排序或摘要，只改 state view builder，不把重复输入散落到 runtime 和 planner adapter。

### Decision 2: ToolResult 内部完整保留，模型可见只看 Evidence

`ToolResult` 仍然是 executor 和 trace 的完整合同，保留 output、projection、fulfillment、resource refs、error 和 trace summary。进入 `PlannerStateView` 前，必须经过 Evidence adapter：

```ts
type PlannerEvidence = {
  evidenceId: string;
  source: { kind: "tool_result" | "invalid_action" | "resource" | "policy" | "runtime"; ref: string };
  status: "satisfied" | "diagnostic" | "failed" | "blocked";
  facts: unknown[];
  supports: string[];
  missing: PlannerMissingFact[];
  blockedOutputs: PlannerBlockedOutput[];
  refs: PlannerEvidenceRef[];
  recoverableActions: PlannerRecoverableAction[];
};
```

默认 adapter 只输出安全摘要和关键 id；业务 tool 如果需要让模型看到更精细 facts，可以在 tool projection / resource contract 层扩展 Evidence，但不能修改 Agent core 识别具体 toolName。

### Decision 3: 用 `pendingRequirements` 表达可恢复缺口

`pendingRequirements` 不等于服务端替模型判断用户语义。它只表达已经由 schema、resource、tool result、validator 或上下文合同确定的缺口，例如：

- 当前 terminal visible output 需要的 resource / evidence 不足。
- 某类已声明 outcome 的成功收口缺少必需 refs。
- 上一轮 tool result 明确返回 `missing` 或 `blockedOutputs`。
- 当前 action 因 schema / resource / policy / terminal gate 被拒绝，且有结构化恢复路径。

它不得来自用户原文关键词，也不得把“某句话应该调用某 tool”写成服务端规则。

### Decision 4: Terminal action 必须声明 outcome，并由 `TerminalGate` 校验

当前 `final_answer` 只要结构合法且引用看起来满足，就可能成功收口。新设计要求 terminal action 声明完成度 outcome：

- `complete`: 直接完成。
- `partial`: 只完成部分目标，但用户可见结果里明确说明缺口和恢复路径。
- `needs_input`: 需要用户补充信息。
- `blocked`: 权限、policy、候选缺失、预算或不可恢复边界导致阻断。

`TerminalGate` 只校验结构化事实：evidence status、usedRefs、resource role、visibleOutputs validator、pending requirements 和预算/policy 状态。它不解析 `content` 文案，不读取用户原文关键词，也不判断训练语义应属于 routine 还是 plan。routine / plan / exercise_selection 的语义选择仍由模型基于 prompt、manifest、examples 和 evidence 决策。

### Decision 5: Trace 记录状态转移，而不是只记录长 prompt

trace 需要能回答三件事：

1. 本轮 Planner 实际看到的 `PlannerStateView` 摘要是什么。
2. 某个 tool result 如何变成 evidence，是否进入下一轮 state view。
3. terminal gate 为什么接受或拒绝最终 action。

因此 trace events 应新增或调整为：

- `agent_state_view_built`
- `agent_evidence_projected`
- `agent_pending_requirements_updated`
- `agent_terminal_gate_checked`

已有 `model_request` / `model_response` / `tool_execution` 仍保留，但不再要求开发者从长 prompt 中人工推断事实是否进入下一轮。

### Decision 6: LLM 黑盒测试只对齐用户可见合同

根目录 `llm基础测试.md` 和 `LLM完整测试.md` 应被用来提炼 core loop 的通用验证目标：

- 直接完成和建议可恢复通过不能混为一类。
- recommendation、routine、plan 的用户可见卡片类型必须稳定。
- 多轮中上下文继承、当前轮覆盖、最近对象引用必须可恢复到结构化 visible context / evidence。
- 信息不足、候选不足和安全边界必须能进入 `needs_input`、`partial` 或 `blocked`，而不是伪装成功。
- 用户可见输出不能泄漏 raw JSON、tool payload、prompt 或内部调试字段。

不能从测试中反向生产规则：

- 不把 F01、SM02、W03、P01 这类测试 ID 写入生产 prompt 或 runtime。
- 不把测试里的具体用户短句写成服务端关键词路由。
- 不要求 core loop 关心具体动作、肌群、器械、组数、时长或 schedule 质量细节。

### Decision 7: 迁移采用 adapter 优先，避免业务 tool 批量重写

实现顺序应是：

1. 新增 core 类型和 builder，但先通过默认 adapter 包装现有 tool results。
2. 让 `LlmPlanner` 输入切到 `PlannerStateView`。
3. 引入 `TerminalGate`，先覆盖通用 grounding、pending requirements 和 visible output validator。
4. 再逐步为关键业务 tool 增加 richer Evidence projector。

这比直接重写所有 tool 更稳，因为核心问题在 Loop 状态传递与终态门禁，不在每个业务 tool handler。

## Risks / Trade-offs

- [Risk] `PlannerStateView` 太抽象，模型看不到足够事实。→ Mitigation：为 Evidence adapter 增加 contract tests 和 trace snapshot，确保 decisive facts、missing 和 refs 不被压缩掉。
- [Risk] `TerminalGate` 过严导致可展示的部分回答被拒绝。→ Mitigation：明确 `partial`、`needs_input`、`blocked` 是合法非完成收口，renderer 和黑盒报告单独统计，不把它们当直接完成。
- [Risk] 实现时误把 routine / plan 业务语义写进 core。→ Mitigation：tasks 加 architecture scan，确认 `agent-core`、runtime、validator、renderer 和 `/api/chat` 没有服务端关键词、phrasing 或具体业务 `toolName` 分支。
- [Risk] active change 之间职责重叠。→ Mitigation：本 change 只定义状态视图、Evidence 和 TerminalGate；schema repair facts 继续由 repair feedback change 承担，`payload.kind` 语义选择继续由 prompt change 承担。
- [Risk] trace 体积增加。→ Mitigation：trace 只记录 state view / evidence / gate 的安全摘要、id 和 code，长内容继续通过现有 text refs / chunks 或摘要机制处理。

## Migration Plan

1. 新增 `AgentLoopState`、`PlannerStateView`、`PlannerEvidence`、`PendingRequirement` 和 `TerminalGate` 类型，保留旧 runtime 外部结果结构。
2. 增加默认 `ToolResult -> Evidence` adapter，先覆盖所有现有 tool 的安全摘要。
3. 将 `LlmPlanner` 模型输入切换为单一 `PlannerStateView`，移除重复传入的 raw observations / full projection 通道。
4. 在 Runtime loop 中写入状态转移：action validation、tool execution、evidence projection、pending requirements、terminal gate。
5. 接入 trace/replay 事件，补可复盘 fixture。
6. 运行 agent-core、trace/replay、architecture boundary 和 LLM 黑盒相关验证。
7. 后续按 tool 风险逐个补 richer Evidence projector；不作为核心替换的前置条件。

## Open Questions

- `outcome` 字段是直接加入 terminal `AgentAction` schema，还是作为 `final_answer` / `ask_user` 的嵌套 `terminal` 对象，需要实现前结合当前类型定义确认。
- `pendingRequirements` 的最小字段集是否需要包含用户可见 message hint，还是只给模型 facts/code，由 prompt 负责生成用户文案，需要实现时通过 snapshot 测试确认。
- 真实模型 LLM 黑盒是否在本 change 实现后立即跑完整详细套件，需要用户确认 token 成本；自动化门禁可先覆盖 P0 冒烟和 deterministic tests。
