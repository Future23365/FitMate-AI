---
name: agent-prompt-contract-governance
description: 治理 AITest 中 Agent prompt 与模型实际可见输入的合同变更。用于修改 Agent prompt、model input、tool manifest、schema summary、examples、repair feedback、context package、observations、compressed tool results、AgentAction 输出格式说明、final grounding 说明，或新增/调整业务 Agent tool 的模型可见说明；不用于普通 UI 文案、README 文案或与模型执行合同无关的小修。
---

# Agent Prompt 合同治理

## 使用目标

用这个 Skill 先审“模型实际看到了什么”，再决定怎么修改 prompt / model input。重点是稳定 Agent Orchestrator 的执行合同，而不是做普通文案润色。

## 前置检查

1. 运行或读取当前 OpenSpec change 状态；非文案类 prompt / model input 变更必须先有 OpenSpec 边界。
2. 运行 `git status --short`。如有无关改动，不要混入当前 diff 或 commit。
3. 判断是否还需要同时使用 `agent-tool-change-governance`：
   - 新增业务 tool、修 Agent tool bug、改 core contract、改 production 接入、触碰 `PlannerPort`、Executor、`Policy Guard`、`ResourceStore`、`Resource Contract Validator`、`Response Renderer`、trace/replay 或 `/api/chat` 主链路时，先用 `agent-tool-change-governance` 定范围。
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
- 修改 TypeScript、API、Schema、AI 编排或共享业务逻辑时，包含 `npm test` 或相关自动化测试，并按需包含 `npm run typecheck`。
- 无法运行验证时，最终总结说明原因和剩余风险。

## 验证

优先运行最窄的相关检查：

- OpenSpec：`openspec validate <change> --strict`
- Skill 基础校验：`quick_validate.py <skill-folder>` 或等价 frontmatter / metadata 检查
- Prompt config 或 model input builder 测试
- Tool manifest / schema summary 测试
- 模型可见描述语言测试：manifest、schema description、examples、repair feedback 或 observation 中的描述性自然语言默认中文
- Agent runtime / final grounding 测试
- 修改 TypeScript、React、API、Schema、AI 编排或共享业务逻辑后运行 `npm run typecheck`

如果本次只新增 Skill 或文档，不修改真实 prompt runtime、业务 tool 或 TypeScript，说明未运行 prompt/runtime/typecheck 的原因。

## 收尾说明

完成后总结：

- 改了什么。
- 为什么这个设计优于局部 prompt 补丁。
- 如何验证。
- 是否仍有剩余风险。
