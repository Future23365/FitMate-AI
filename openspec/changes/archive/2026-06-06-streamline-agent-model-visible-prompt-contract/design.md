## Context

当前 `/api/chat` 生产 Agent 的模型请求由 `DeepSeekModelAdapter.createRequestBody()` 组装：system message 来自 `buildAgentActionSystemPrompt()`，user message 中包含 `run`、`tools`、`observations` 和 `toolResults`。`ToolRegistry.serializeForPlanner()` 会把每个 tool 的 `description`、`whenToUse`、`whenNotToUse`、JSON Schema description、metadata 和 examples 暴露给 Planner。

本次审阅发现，当前 `system prompt` 已经包含通用 AgentAction、terminal grounding、`visibleOutputs[]`、`visibleTrainingProposal`、引用对象、routine / plan section coverage 和 repair 边界；与此同时，`searchExerciseResources`、`inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions` 的 manifest / observation 又重复了不少同类终态规则，例如：

- `final_answer.content` 不会触发后续自动 tool 调用。
- 最终训练结构必须写入 `final_answer.visibleOutputs[]`。
- tool result 不等于已经生成最终 `visibleTrainingProposal`。
- `routine` / `plan` 需要 `warmup`、`training`、`stretch` 三类可消费动作事实。
- `requiredExerciseIds` 是正向锚点，`excludeExerciseIds` 是负向排除。

这些规则本身大多是正确的，问题在于同类规则跨 system、manifest、schema description 和 observation 重复铺开，导致模型输入变长、重点分散，也让后续维护者难判断“应该新增规则”还是“应该挪动规则”。

## Goals / Non-Goals

**Goals:**

- 在不降低模型理解能力的前提下，压缩和重排模型可见 prompt / manifest。
- 明确规则层级：
  - system prompt 负责通用 `AgentAction`、terminal grounding、资源消费、结构化训练输出前置条件和少量关键结构例子。
  - tool manifest 负责该 tool 的稳定能力、输入字段、输出事实和不能承担的职责。
  - tool observation 负责真实 tool result 才能产生的动态事实和可恢复方向。
- 保留关键例子，删除长篇解释和重复禁令。
- 保持模型能力优先：Planner 仍基于可见 prompt、manifest、observations、toolResults 自主选择 tool、action、`payload.kind` 和收口方式。
- 更新测试，使测试断言关键合同仍存在，而不是绑定长句全文。

**Non-Goals:**

- 不修改 `ToolRegistry` 注册范围。
- 不修改 tool `inputSchema` / `outputSchema` 字段语义。
- 不修改 tool handler、repository、ResourceStore、Policy Guard、Resource Contract Validator、terminal output validator 或 Response Renderer。
- 不新增服务端关键词、正则、短句模板、同义词表、用户原文分流或业务 `toolName` 特判。
- 不以 token 数字作为唯一目标；若某条规则对模型首轮判断必要，即使较长也应保留或改写为更紧凑的等价表达。

## Decisions

### Decision 1: system prompt 只保留跨 tool 必须首轮可见的规则

system prompt 仍应保留：

- 合法 `AgentAction` JSON 输出形状。
- `tool_call` 只能使用当前 `tools` 清单，input 必须匹配 schema。
- `final_answer` / `ask_user` 的 `content`、`usedRefs`、`suggestedQuestions` 主合同。
- `final_answer.content` 是本轮终态，不会触发后续自动 tool 调用。
- `visibleOutputs[]` 是结构化训练输出入口，正文不能替代动作、处方、编排或计划事实。
- `visibleTrainingProposal.payload.kind` 的三类结构能力和最小选择原则。
- `routine` / `plan` 的 section coverage 前置条件。
- 引用对象存在性、资源操作类型和缺少引用对象时不得编造的通用规则。
- 医疗安全边界。

不应继续在 system prompt 中展开每个 tool 的具体 operation、字段来源、字段禁止项和长篇恢复说明。具体 tool 的使用条件留给 manifest / schema / observation。

替代方案：把所有业务规则都移出 system。这个方案会让模型第一轮在还没有 tool result 时缺少训练输出结构选择和终态边界，容易退回“先查到什么就输出什么”。因此不采用。

### Decision 2: tool manifest 聚焦 tool 独有边界

`searchExerciseResources` manifest 应重点说明：

- 它是只读发布态动作事实查询 tool，不生成训练方案。
- 支持哪些输入字段和 facet 选择方式。
- `groups.<section>.exercises[]` 与 `visibleTrainingProposal.exerciseItems[*].section` 的事实对应关系。
- `requiredExerciseIds` / `excludeExerciseIds` 的字段语义。
- 何时需要先用 `inspectVisibleTrainingProposals` 确认历史可见方案事实。
- 保留 1-2 个关键 input examples，例如受约束动作查询、补 `warmup` / `stretch` 查询；如保留 `requiredExerciseIds` 例子，应与 `resolveExerciseResourceMentions` 的输出衔接。

它不应重复 system 已经覆盖的所有 terminal final answer 禁令。

`inspectVisibleTrainingProposals` manifest 应重点说明：

- `list_recent` 返回轻量索引，不导入完整事实。
- `read_recent` 只能读取本轮可见真实 `ref`，成功后导入 consumable resource。
- `factRef` / `messageId` 与 `final_answer.usedRefs.resource.id` 不是同一类 id。
- 读取事实不代表已经生成新的最终训练结构。

`resolveExerciseResourceMentions` manifest 应重点说明：

- 它只解析点名动作身份。
- matched / ambiguous / not_found 的含义。
- matched `exerciseId` 应作为 `searchExerciseResources.requiredExerciseIds` 的后续输入。
- 它不直接支撑 `visibleTrainingProposal` 动作来源。

替代方案：只在 tool manifest 上加 “详见 system prompt”。这个方案会让单个 tool 能力边界不够自解释，也不利于 replay / trace 审查。因此不采用。

### Decision 3: 动态 observation 保留结果相关事实，但压缩重复说明

真实 tool result 才能确定的信息应继续留在 observation：

- `availableSections`
- `sectionSummary`
- `missingSectionsForRoutineOrPlan`
- `supportsOutputKinds`
- `querySpecificity`
- `facts[]` 空结果
- `read_recent` 是否导入 consumable resource
- `requiredExerciseIds` 或 `excludeExerciseIds` 是否实际应用

但 observation 不需要复制完整 system 终态规则。它应以短字段和值表达事实，例如“当前结果不能支撑 routine / plan，因为 missingSectionsForRoutineOrPlan 非空”，并给出有限可恢复方向，而不是重复长段禁止语。

替代方案：把 observation 缩成纯数据字段，删除自然语言 boundary。这个方案可能让模型难以区分 diagnostic、consumable 和 terminal 输出边界，尤其在 repair 轮中风险较高。因此不采用。

### Decision 4: 测试从长句断言改为合同断言

现有测试有不少 `toContain("...长句...")` 风格断言。实现时应改为更稳定的合同断言：

- 断言 manifest / observation 包含关键字段、结构和短边界。
- 断言不包含旧字段、旧 action、固定短语路由、fake 引用或过时协议。
- 断言 examples 符合当前 schema。
- 断言 prompt 仍表达三类 `AgentAction`、`visibleOutputs[]`、`usedRefs`、`suggestedQuestions`、routine / plan section coverage 和无服务端语义分流。

替代方案：保留所有长句断言。这个方案会让后续 prompt 优化难以维护，且容易把“当前写法”误当成“必须逐字存在的合同”。因此不采用。

## Risks / Trade-offs

- [Risk] 压缩后模型漏掉关键终态边界。→ Mitigation：先盘点真实模型输入，保留首轮必须可见的 system 规则；用 prompt / manifest 快照测试和 replay / manual LLM 关键场景验证。
- [Risk] 过度下放到 tool manifest，使模型首轮缺少训练输出结构判断。→ Mitigation：`visibleTrainingProposal.payload.kind`、`routine` / `plan` section coverage 和 `visibleOutputs[]` 仍保留在 system prompt。
- [Risk] 删除重复长句导致现有测试大面积失败。→ Mitigation：同步改测试断言方式，保留合同级检查，不保留逐字长句依赖。
- [Risk] 为了压缩误删业务 tool 独有字段边界。→ Mitigation：每个 tool 单独列出“必须保留”的字段、operation、resource role 和 example。
- [Risk] prompt 变短但黑盒质量下降。→ Mitigation：实现阶段必须覆盖真实多轮聊天或 manual LLM 关键场景，至少包含普通动作查询、routine / plan 补 section、上一套方案刷新、点名动作 requiredExerciseIds 链路和引用对象缺失收口。
