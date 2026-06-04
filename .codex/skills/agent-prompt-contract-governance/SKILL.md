---
name: agent-prompt-contract-governance
description: 治理 AITest 中 Agent prompt 与模型实际可见输入的合同变更。用于修改 Agent prompt、model input、tool manifest、schema summary、examples、repair feedback、context package、observations、compressed tool results、AgentAction 输出格式说明、final grounding 说明，新增/调整业务 Agent tool 的模型可见说明，或在 tool 字段重命名后同步模型可见字段说明；不用于普通 UI 文案、README 文案或与模型执行合同无关的小修。
---

# Agent Prompt 合同治理

## 使用目标

用这个 Skill 先审“模型实际看到了什么”，再决定怎么修改 prompt / model input。重点是稳定 Agent Orchestrator 的执行合同，而不是做普通文案润色。

## 前置检查

1. 运行或读取当前 OpenSpec change 状态；非文案类 prompt / model input 变更必须先有 OpenSpec 边界。
2. 运行 `git status --short`。如有无关改动，不要混入当前 diff 或 commit。
3. 判断是否还需要同时使用 `agent-tool-change-governance`：
   - 新增业务 tool、修 Agent tool bug、改 core contract、改 production 接入、触碰 `PlannerPort`、Executor、`Policy Guard`、`ResourceStore`、`Resource Contract Validator`、`Response Renderer`、trace/replay 或 `/api/chat` 主链路时，先用 `agent-tool-change-governance` 定范围。
   - 涉及业务 tool `inputSchema`、`outputSchema`、handler、resource、projection、trace 或测试中的字段命名、弃用和重命名时，先用 `agent-tool-change-governance` 治理执行合同，再用本 Skill 检查模型可见说明。
   - 只修改 prompt、model input、manifest、schema summary、examples、repair feedback、context package、observations 或 compressed tool results 时，用本 Skill 治理模型可见合同。
4. 实现前说明问题根因或产品需求、设计方向、预计影响模块和取舍。

## 修改类型

把任务归为一个主类型，并写进方案或实现说明：

- 通用 Agent prompt 合同：`AgentAction` 输出格式、允许 action、tool loop、final grounding、confirmation、repair 规则。
- 单个业务 tool 模型可见说明：`whenToUse`、`whenNotToUse`、input schema 关键字段、成功结果含义、失败或 diagnostic 含义、resource role、final answer 引用方式。
- repair / feedback 合同：结构化错误、repair feedback、失败原因、可恢复建议。
- context / observation 投影：context package、observations、compressed tool results、resource 摘要、redaction 后内容。
- production prompt 规则：生产聊天接入的模型输入、空 registry 行为、能力边界说明。
- 模型可见描述语言：system / developer prompt、manifest、schema description、examples、repair feedback、observations、compressed tool results、final grounding 等描述性自然语言默认使用中文。

## 必查真实输入

不要只看源文件文案。先确认本次模型实际可见输入来自哪里、经过哪些 builder / projection / compression，再检查最终内容。

优先查这些对象，按当前代码真相取舍：

- prompt config 和 system / developer message builder。
- tool manifest、tool schema summary、examples。
- `ContextPackage` 或等价上下文投影。
- repair feedback、runtime observations、compressed tool results。
- `ResourceStore` 暴露给模型的 resource 摘要。
- `codex_logs/ai_trace_log.js` 或真实黑盒报告中的 model request / model input。

如果源文件写了规则，但 builder 没带上、被压缩丢失、顺序被后续消息覆盖，必须把根因归为“模型可见合同缺失”，不要只继续润色源文件。

## 模型自主规划与 Tool Calling

prompt / model input 修复的目标不是把业务流程写死给服务端，而是让模型具备稳定自主规划能力。

模型可见合同应清楚表达：

- 当前有哪些 tool 可用。
- 每个 tool 适合解决什么问题，不适合解决什么问题。
- 模型什么时候应该先调用 tool，而不是直接回答。
- tool input 如何从用户目标、上下文、resource 和历史结果中构造。
- tool result 中哪些内容可以支撑 `final_answer`，哪些只能用于追问、解释失败或下一轮 repair。
- 当 tool input 被拒绝、resource 不可消费或结果不足时，模型应该如何修正或澄清。

不要把单个业务流程写成服务端隐藏编排；如果模型缺少判断依据，应补模型可见上下文、tool 说明、schema、examples 或 repair feedback。

## 语义偏差根因检查

当问题表现为模型误解用户意图、选错 action、错误引用上下文、错误消费 tool result 或 final answer grounding 不符合预期时，优先怀疑模型实际可见合同不完整或被投影/压缩/顺序覆盖，而不是先改某一句 prompt 文案。

修改 prompt / model input 前必须回答：

- 模型实际看到了哪些上下文、resource、tool 说明和历史摘要？
- 模型是否能从可见输入中稳定区分相邻语义，例如 plan 与 routine、查看与生成、调整与新建、失败解释与成功回答？
- 当前 prompt 是否只对一个 phrasing 有效，换成同义表达后是否仍能约束模型？
- 是否应该把规则放到通用 Agent 合同、单个 tool manifest、schema description、examples、repair feedback、observation，还是 final grounding 说明中？
- 是否需要同步调整结构化输出字段或 schema summary，而不是只补自然语言提示？

prompt 修复必须覆盖语义类别，而不是只补当前失败句子的提示词。涉及可复现 bug 时，测试或黑盒用例至少覆盖原始输入和一个等价表达。

## 字段重命名同步检查

当业务 tool 的字段已经重命名、弃用或含义调整时，本 Skill 只负责模型可见合同同步，不负责替代 runtime/schema 迁移：

- 先确认 `agent-tool-change-governance` 已覆盖真实执行合同；不要用 prompt 继续兼容旧字段。
- 检查 tool manifest、schema summary、schema description、examples、repair feedback、observations、compressed tool results、resource 摘要和 final grounding 说明是否仍暴露旧字段名。
- 示例 input 必须使用新字段名，并继续严格匹配当前 schema。
- 如保留旧字段名只用于迁移说明或反例，必须明确告诉模型不要再输出旧字段；不要让旧字段同时表现为可用字段。
- 技术字段名保持英文原样；中文说明解释新字段当前业务含义和使用条件。

## 模型可见描述语言

所有发给模型的描述性自然语言默认使用中文，包括但不限于：

- system / developer prompt 中的业务规则、能力边界和输出格式说明。
- tool manifest 的 `description`、`whenToUse`、`whenNotToUse`。
- JSON Schema / Zod schema 的 description、schema summary 和字段说明。
- examples description、repair feedback、context package、observations、compressed tool results、resource 摘要和 final grounding 说明。

以下内容保持英文原样，不要为了中文化而改动执行合同：

- `toolName`、字段名、枚举值、action type、resource type、schema id。
- 命令、路径、代码标识符、外部 API 标识、错误码和 trace event type。
- 示例 input 中必须匹配 schema 的结构化值。

如果必须引用英文原文或第三方术语，先保留原文，再补中文解释；不要让模型只看到英文业务规则、使用条件或失败含义。

## 通用 Agent 合同

修改通用 Agent prompt / model input 时，必须让模型可见输入表达这些规则：

- 模型只能输出受控 `AgentAction`。
- 允许的 action 类型必须明确；当前通用合同至少需要说明 `tool_call`、`final_answer`、`ask_user` 的字段要求。若某类 action 暂不支持，要明确不可用或会被服务端拒绝。
- `tool_call.toolName` 只能来自 `ToolRegistry` 注册的 tool。
- tool input 必须严格匹配模型可见 schema；字段缺失、枚举错误、类型错误应进入结构化错误或 repair，而不是由模型假装成功。
- 模型不能假装 tool 已执行，不能虚构 tool result，不能把未执行的结果写进最终回答。
- `final_answer` 必须基于 `satisfied=true` 的 tool result 或 `consumable` resource。
- diagnostic、failed 或 `satisfied=false` 的 tool result 只能用于 `ask_user`、失败解释、阻断说明或下一轮 repair，不能支撑成功 `final_answer`。
- write / high risk tool 必须经过 `Policy Guard` / confirmation；模型不能自行宣称已确认、已写入或已绕过确认。
- 模型不能绕过 `ResourceStore`、`Policy Guard`、`Resource Contract Validator` 或 `Response Renderer`。

## 业务 Tool 可见说明

新增或修改业务 Agent tool 时，同步补齐该 tool 的模型可见说明：

- 何时使用这个 tool。
- 何时不要使用这个 tool。
- input schema 的关键字段、必填条件、枚举和引用字段含义。
- 成功结果代表什么。
- 失败、diagnostic 或 unsatisfied 结果代表什么。
- 产出的 resource role 是 `consumable`、`diagnostic`、`partial` 还是 `feedback`。
- `final_answer` 可以怎样引用该结果，哪些结果只能用于解释或追问。

这些说明必须使用中文描述业务含义；`toolName`、input/output 字段名、枚举值和 resource type 保持英文原样。

### Tool 能力族可见说明

新增或调整业务 tool 的模型可见说明时，不要只围绕当前用户故事写 `whenToUse` 和 examples。必须让模型看到这个 tool 的稳定能力族。

检查项：

- `description` 是否说明稳定资源和能力，而不是当前页面或当前流程。
- `whenToUse` 是否覆盖同类场景，例如最近、列表、筛选、详情读取。
- schema description 是否解释 filter、sort、limit、cursor、resource id、detailLevel 等结构化能力。
- examples 是否至少包含当前需求和一个同类变体。
- `whenNotToUse` 是否说明跨资源、跨权限、写操作或不可消费结果的边界。

通用 Agent prompt 只写稳定编排合同；业务 tool 的专属能力写进 manifest / schema 描述 / examples，不要把单个业务 tool 的特例写成通用规则。

## 禁止项

- 不要用服务端关键词、正则、同义词表、短句模板或业务 `toolName` 特判改写 LLM 的高层语义决策。
- 不要把用户自然语言理解问题修成服务端语义归一化。
- 不要让业务 tool prompt 反向要求修改 core 安全、resource、policy 或 grounding 基础规则；如果确实需要，升级为 core contract 设计。
- 不要把完整 tool output、secret、内部 handler payload 或不可消费 diagnostic 暴露成模型可成功消费的资源。
- 不要为了单个业务 tool 绕过 `ToolRegistry`、`Policy Guard`、`ResourceStore`、`Resource Contract Validator` 或 `Response Renderer`。

## OpenSpec 要求

非文案类 Agent prompt change 的 `proposal.md`、`design.md` 和 `tasks.md` 必须写清：

- prompt 修改类型。
- 允许触碰的 prompt / model input 入口。
- 禁止触碰的 runtime / core 模块。
- 是否涉及业务 tool 模型可见说明。
- 是否涉及 core contract、resource、policy、grounding 或 production 接入。
- 验证计划。

`tasks.md` 至少包含：

- `openspec validate <change> --strict`。
- 与改动范围相关的 prompt config、manifest、schema summary、model input builder、Agent runtime、final grounding 或黑盒验证。
- 涉及字段重命名时，包含旧字段残留检查、示例 input 更新、schema summary/manifest 快照或等价回归测试。
- 修改 TypeScript、API、Schema、AI 编排或共享业务逻辑时，包含 `npm test` 或相关自动化测试，并按需包含 `npm run typecheck`。
- 无法运行验证时，最终总结说明原因和剩余风险。

## 验证

优先运行最窄的相关检查：

- OpenSpec：`openspec validate <change> --strict`
- Skill 基础校验：`quick_validate.py <skill-folder>` 或等价 frontmatter / metadata 检查
- Prompt config 或 model input builder 测试
- Tool manifest / schema summary 测试
- 模型可见描述语言测试：manifest、schema description、examples、repair feedback 或 observation 中的描述性自然语言默认中文
- 字段重命名同步测试：用 `rg` 检查旧字段残留，并验证模型可见 manifest、schema summary、examples 和 repair feedback 使用新字段
- Agent runtime / final grounding 测试
- 修改 TypeScript、React、API、Schema、AI 编排或共享业务逻辑后运行 `npm run typecheck`

如果本次只新增 Skill 或文档，不修改真实 prompt runtime、业务 tool 或 TypeScript，说明未运行 prompt/runtime/typecheck 的原因。

## 收尾说明

完成后总结：

- 改了什么。
- 为什么这个设计优于局部 prompt 补丁。
- 如何验证。
- 是否仍有剩余风险。
