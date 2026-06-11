---
name: agent-prompt-contract-governance
description: 治理 AITest 中 Agent prompt 与模型实际可见输入的合同变更，并要求所有传给 AI 的提示词、LangChain tool description、schema description 和模型可见说明先对齐 docs/llm-prompt-guidance.md 的分层、职责和检查清单。作为 primary skill 用于修改 Agent prompt、model input、LangChain tool description、schema description、examples、失败反馈、context package、tool result summary、structured final response / finalization tool 说明、final grounding 说明，新增/调整业务 Agent tool 的模型可见说明，或在 tool 字段重命名后同步模型可见字段说明；大范围 prompt / model input / output contract / model-visible summary 重组还必须在本 Skill 检查模型实际可见合同后使用 agent-regression-contract-audit；普通局部 prompt 或单个 tool description 小修不因此扩大流程，也不自动要求 OpenSpec。不用于普通 UI 文案、README 文案、tool handler、runtime validation、production response adapter、production route 或与模型执行合同无关的小修。
---

# Agent Prompt 合同治理

## 使用目标

用这个 Skill 先审“模型实际看到了什么”，再按 `docs/llm-prompt-guidance.md` 判断提示词应该落在哪一层，最后决定怎么修改 prompt / model input。重点是稳定当前 LangChain Agent Runtime 的执行合同，而不是做普通文案润色。

## 前置检查

0. 每个任务只选择一个 primary governance skill。本 Skill 只在模型实际可见输入是主问题时作为 primary；涉及 tool/core/runtime/production 执行合同时，`agent-tool-change-governance` 作为 primary，本 Skill 只做模型可见说明的 secondary 检查。
1. 判断本次 prompt / model input 变更是否改变模型意图理解、工具调用策略、输出合同、grounding / repair / finalization 合同、训练计划生成规则或模型可见事实边界；只有这类语义或行为合同变化才必须先有 OpenSpec 边界。局部措辞、中文化、错别字修正或不改变原有含义的澄清小修，不自动要求 OpenSpec。
2. 读取 `docs/llm-prompt-guidance.md` 中与本次改动相关的章节，并把它作为 prompt / tool 模型可见提示词设计的基准；不要把指南整篇复制进 prompt。
3. 运行 `git status --short`。如有无关改动，不要混入当前 diff 或 commit。
4. 判断是否还需要同时使用 `agent-tool-change-governance`：
   - 新增业务 tool、修 Agent tool bug、改 LangChain runtime / wrapper 通用合同、改 production 接入、触碰 LangChain runtime 主循环、model factory provider payload、tool wrapper 通用执行、structured final response / finalization tool、production response adapter、trace summary 或 `/api/chat` 主链路时，先用 `agent-tool-change-governance` 定范围。
   - 涉及业务 tool `inputSchema`、`outputSchema`、handler、resource、projection、trace 或测试中的字段命名、弃用和重命名时，先用 `agent-tool-change-governance` 治理执行合同，再用本 Skill 检查模型可见说明。
   - 只修改 prompt、model input、tool description、schema description、examples、失败反馈、context package 或 tool result summary 时，用本 Skill 治理模型可见合同。
5. 实现前说明问题根因或产品需求、设计方向、预计影响模块和取舍。

## 历史回归审计触发

当 change 批量修改 Agent prompt、model input builder、LangChain tool description、schema description、examples、repair feedback、tool result summary、finalization tool description、structured final response 合同或 model-visible summary 时，本 Skill 先确认当前模型实际可见输入和分层边界。随后必须使用 `agent-regression-contract-audit` 做 secondary audit，回查归档 OpenSpec 和项目演进记录中已移除或收口的字段、workflow 文案、output contract 边界和 repair feedback 边界。

这不会替代 prompt 分层治理，也不会触发在普通局部文案小修上。只修改单个 prompt 片段、单个 tool description、单个 schema description、单个 examples description 或单个 repair feedback，且不属于 framework migration、核心链路替换、批量模型可见合同重组或历史回归调查时，不因本条自动触发 `agent-regression-contract-audit`。

触发历史回归审计的大范围 prompt / model-visible change 的 `tasks.md` 必须包含 Agent model-visible contract gate 验证，覆盖白名单 summary schema、production tool catalog contract tests、模型可见文本 linter 和历史禁止项补充扫描。

## 修改类型

把任务归为一个主类型，并写进方案或实现说明：

- 通用 Agent prompt 合同：provider tool calling、tool 选择、structured final response、finalization tool、final grounding、confirmation、失败收口规则。
- 单个业务 tool 模型可见说明：LangChain tool `description`、schema description、input schema 关键字段、成功结果含义、失败或 diagnostic 含义、受控业务事实角色、final response 引用方式。
- repair / feedback 合同：结构化错误、repair feedback、失败原因、可恢复建议。
- context / tool result 投影：context package、tool result summary、受控业务事实摘要、redaction 后内容。
- production prompt 规则：生产聊天接入的模型输入、空 registry 行为、能力边界说明。
- 模型可见描述语言：system / developer prompt、tool description、schema description、examples、失败反馈、tool result summary、final grounding 等描述性自然语言默认使用中文。

## Prompt / Tool 分层设计

每次修改发给 AI 的提示词或 tool 模型可见说明，都必须先按 `docs/llm-prompt-guidance.md` 判断职责层级：

- `System Prompt` 只放角色、硬约束、输出格式、安全边界和终态/工具动作区别；保持短句化，不承载字段长解释、工具流程、历史 bug 黑名单或 validator 修复细节。
- `Action Contract` 和 `Output Contract` 负责 provider tool call 形状、LangChain tool schema、structured final response 和最终结构形状；字段合法性依赖 JSON Schema、Zod、TypeScript type 或后端 validator，prompt 只解释语义和决策边界。
- `Glossary` 负责容易混淆的内部概念、ID、ref、resource、handle、key、状态和事实等级；相似概念优先用表格对照来源、用途、禁用场景和是否允许模型生成。
- `Planner Policy` 负责选择规则、优先级、tie-breaker、停止条件和合法失败出口；不要把字段类型或每个 tool 的参数细节写进 policy。
- `LangChain Tool Description / Schema Description` 负责工具能力、边界、输入来源、输出事实含义和 grounding；不要写成后端 API 文档，也不要承担完整业务 workflow。
- `Runtime Context` 只提供当前 run 的事实，例如用户输入、metadata、当前 tools、tool result summary、已验证可见输出和受控业务事实；不要混入长期规则。
- `Validator` 负责结构、字段、枚举、ID、事实来源和可渲染性校验；不要让 validator 重新理解用户意图、选择工具或生成业务字段。
- `Repair Prompt` 独立于主 prompt，只修正上一轮非法 action；必须基于错误路径、错误码、expected、actual、allowedFields、allowedValues 和当前合同做局部修复。

设计结论必须遵守：Prompt 定策略，Schema 定形状，Glossary 定概念，Tool 定能力，Runtime 给事实，Validator 守边界，Repair 修错误。

## 必查真实输入

不要只看源文件文案。先确认本次模型实际可见输入来自哪里、经过哪些 builder / projection / compression，再检查最终内容。

优先查这些对象，按当前代码真相取舍：

- prompt config 和 system / developer message builder。
- tool description、tool schema description、examples。
- `ContextPackage` 或等价上下文投影。
- 失败反馈、runtime context、tool result summary。
- 已校验可见输出、跨轮业务事实或等价受控摘要。
- 用户提供、刚导出或明确确认与当前问题对应的 model request / model input、trace 或真实黑盒报告。

如果源文件写了规则，但 builder 没带上、被压缩丢失、顺序被后续消息覆盖，必须把根因归为“模型可见合同缺失”，不要只继续润色源文件。

## 模型可见合同检查

prompt / model input 修复的目标不是把业务流程写死给服务端，而是让模型具备稳定自主规划和 tool calling 能力。修改前检查：

- 模型实际看到了哪些上下文、resource、tool 说明和历史摘要。
- 当前有哪些 tool 可用，每个 tool 适合/不适合解决什么问题，什么时候应先调用 tool 而不是直接回答。
- tool input 如何从用户目标、上下文、resource 和历史结果中构造。
- 模型是否能从可见输入中稳定区分相邻语义，例如 plan 与 routine、查看与生成、调整与新建、失败解释与成功回答？
- tool result 中哪些内容可以支撑 structured final response 或普通最终回答，哪些只能用于追问、解释失败或下一轮修正。
- 当 tool input 被拒绝、resource 不可消费或结果不足时，模型应该如何修正或澄清。
- 每条 prompt 规则是否长期稳定、是否放在正确层级、是否应该改由 schema / tool description / glossary / 失败反馈承担、是否重复、是否有优先级、是否能改成正向准入条件。
- Planner policy 是否明确直接回答、provider tool call、结构化终态输出、继续 tool、停止 tool、失败收口的优先级和 tie-breaker。
- 最终输出事实是否只能来自用户输入、metadata、成功 tool result summary、已校验可见输出或受控业务事实；不能来自模型记忆、示例 ID、未导入历史文本、失败工具结果、未注册工具或未暴露数据库事实。

不要把单个业务流程写成服务端隐藏编排；如果模型缺少判断依据，应补模型可见上下文、tool 说明、schema、examples、repair feedback、observation、final grounding 或结构化字段。prompt 修复必须覆盖语义类别，涉及可复现 bug 时至少覆盖原始输入和一个等价表达。

## 字段重命名同步检查

当业务 tool 的字段已经重命名、弃用或含义调整时，本 Skill 只负责模型可见合同同步，不负责替代 runtime/schema 迁移：

- 先确认 `agent-tool-change-governance` 已覆盖真实执行合同；不要用 prompt 继续兼容旧字段。
- 检查 tool description、schema description、examples、失败反馈、tool result summary、受控业务事实摘要和 final grounding 说明是否仍暴露旧字段名。
- 示例 input 必须使用新字段名，并继续严格匹配当前 schema。
- 如保留旧字段名只用于迁移说明或反例，必须明确告诉模型不要再输出旧字段；不要让旧字段同时表现为可用字段。
- 技术字段名保持英文原样；中文说明解释新字段当前业务含义和使用条件。

## 模型可见描述语言

所有发给模型的描述性自然语言默认使用中文，包括但不限于：

- system / developer prompt 中的业务规则、能力边界和输出格式说明。
- LangChain tool 的 `description` 和 schema description。
- JSON Schema / Zod schema 的 description 和字段说明。
- examples description、失败反馈、context package、tool result summary、受控业务事实摘要和 final grounding 说明。

以下内容保持英文原样，不要为了中文化而改动执行合同：

- `toolName`、字段名、枚举值、action type、resource type、schema id。
- 命令、路径、代码标识符、外部 API 标识、错误码和 trace event type。
- 示例 input 中必须匹配 schema 的结构化值。

如果必须引用英文原文或第三方术语，先保留原文，再补中文解释；不要让模型只看到英文业务规则、使用条件或失败含义。

## 通用 LangChain Agent 合同

修改通用 Agent prompt / model input 时，必须让模型可见输入表达这些规则：

- 生产主链使用 DeepSeek native `tool_calls` 和 LangChain tool schema，不要求模型输出旧自定义 `AgentAction` JSON。
- 模型只能调用当前 LangChain tool catalog 暴露的工具，不能调用未注册工具或编造 `toolName`。
- tool input 必须严格匹配模型可见 schema；字段缺失、枚举错误、类型错误应进入结构化工具失败、澄清或 finalizer，而不是由模型假装成功。
- 模型不能假装 tool 已执行，不能虚构 tool result，不能把未执行的结果写进最终回答或结构化输出。
- 普通最终回答必须基于当前用户输入、模型可见上下文、成功 tool result summary 或已验证业务事实。
- 训练卡片、routine、plan 等结构化业务交付必须通过 finalization tool / structured final response 和服务端 validator；正文 content 不能替代结构化事实。
- failed、diagnostic 或不可消费结果只能用于澄清、失败解释、阻断说明或下一轮修正，不能伪装成通过 validator 的结构化业务交付。
- write / high risk tool 必须经过服务端 policy / confirmation；模型不能自行宣称已确认、已写入或已绕过确认。
- 模型不能绕过 LangChain tool wrapper、服务端 validator、policy / confirmation、finalization tool 或 production response adapter。

## 业务 Tool 可见说明

新增或修改业务 Agent tool 时，同步补齐该 tool 的模型可见说明：

- tool 说明必须围绕六个问题组织：`Purpose`、`Use When`、`Do Not Use When`、`Input Source`、`Output Meaning`、`Grounding Rules`。
- `description` 说明稳定资源和能力，而不是当前页面或当前流程。
- tool 名称应表达动作和资源对象；避免 `handle*`、`process*`、`manage*`、`commonTool` 这类泛化命名。
- tool `description` 写稳定能力边界，不写用户关键词、短句模板或具体 phrasing 触发条件。
- schema description 只写字段来源、可用值和本工具特有边界，不重复全局禁止项。
- input schema 解释关键字段、必填条件、枚举、引用字段、filter、sort、limit、cursor、resource id、detailLevel 等结构化能力。
- 每个关键输入字段必须说明来源：用户明确表达、当前 metadata、当前 tool result summary、已验证可见输出、受控业务事实、schema 枚举、模型可解释推断或禁止模型生成。
- `id`、`resourceId`、`toolResultId`、`factRef`、`messageId`、`exerciseId`、`cursor`、`handle`、`version` 和 enum 默认不可编造；不要让模型从示例复制 ID，不要把用户自然语言或历史文本当成本轮可用 ID。
- 机器字段使用 schema 的 canonical value；用户可见自然语言和工具输入规范值不要混用。
- 除非工具本身是全文搜索或语义检索，不要让模型把完整聊天文本传给工具；能结构化提取就使用结构化 input。
- 成功、失败、diagnostic 或 unsatisfied 结果含义清晰；输出事实等级应标为 `diagnostic`、`candidate`、`resolved`、`consumable` 或 `terminal`。
- 区分索引、详情和可消费事实；查到索引不等于读取完整对象，读取详情不等于已经生成最终结果，导入资源不等于已经保存或渲染。
- 最终回答或结构化终态输出可以怎样引用结果，哪些结果只能用于解释、追问、下一轮 tool input 或修正。
- examples 必须匹配当前执行合同：LangChain tool 场景使用完整 provider tool call / tool input 示例，结构化终态场景使用当前 finalization / structured response 示例；不要继续用旧 `AgentAction` JSON 作为生产示例。

这些说明必须使用中文描述业务含义；`toolName`、input/output 字段名、枚举值和 resource type 保持英文原样。

通用 Agent prompt 只写稳定编排合同；业务 tool 的专属能力写进 tool description / schema description / examples，不要把单个业务 tool 的特例写成通用规则。

## Repair / Validator 可见反馈

修改 repair feedback、validator observation 或失败压缩结果时，必须让模型看到可操作的局部修复信息：

- Schema validation 只描述字段类型、必填、枚举、未知字段和 tool input schema 形状问题。
- Domain validation 只描述 ID 来源、事实可信度、引用是否来自当前 run、事实等级是否可消费和最终输出是否可渲染。
- 失败反馈应包含 `error.path`、`error.code`、`expected`、`actual`、`allowedFields`、`requiredFields`、`allowedValues`、domain facts、current contracts 和 current tool schemas。
- 修正提示要求模型只修正上一轮非法 tool input 或结构化输出，不重新规划用户目标，不引入新事实，不编造 ID，不扩大任务范围；事实不足时应移除结构化输出、澄清或失败收口。

## 禁止项

- 不要用服务端关键词、正则、同义词表、短句模板或业务 `toolName` 特判改写 LLM 的高层语义决策。
- 不要把用户自然语言理解问题修成服务端语义归一化。
- 不要让业务 tool prompt 反向要求修改 LangChain runtime、tool wrapper、policy 或 grounding 基础规则；如果确实需要，升级为通用合同设计。
- 不要把完整 tool output、secret、内部 handler payload 或不可消费 diagnostic 暴露成模型可成功消费的资源。
- 不要为了单个业务 tool 绕过 LangChain tool catalog、tool wrapper、服务端 validator、policy / confirmation、finalization tool 或 production response adapter。

## OpenSpec 要求

改变语义或行为合同的 Agent prompt change，必须先走 OpenSpec；对应 `proposal.md`、`design.md` 和 `tasks.md` 必须写清：

- prompt 修改类型。
- 已对照 `docs/llm-prompt-guidance.md` 的相关章节，以及本次规则属于哪个层级。
- 允许触碰的 prompt / model input 入口。
- 禁止触碰的 runtime / core 模块。
- 是否涉及业务 tool 模型可见说明。
- 是否涉及 LangChain runtime / wrapper 通用合同、受控业务事实、policy、grounding 或 production 接入。
- 验证计划。

这类 change 的 `tasks.md` 至少包含：

- `openspec validate <change> --strict`。
- 与改动范围相关的 prompt config、tool description、schema description、model input builder、Agent runtime、final grounding 或黑盒验证。
- 与 `docs/llm-prompt-guidance.md` 相关的分层、LangChain tool description / schema description 检查、输入来源、事实等级、停止条件、失败出口或失败反馈检查。
- 涉及字段重命名时，包含旧字段残留检查、示例 input 更新、schema description / tool description 快照或等价回归测试。
- 修改 TypeScript、API、Schema、AI 编排或共享业务逻辑时，包含 `npm test` 或相关自动化测试，并按需包含 `npm run typecheck`。
- 无法运行验证时，最终总结说明原因和剩余风险。

## 验证

优先运行最窄的相关检查：

- OpenSpec：`openspec validate <change> --strict`
- Skill 基础校验：`quick_validate.py <skill-folder>` 或等价 frontmatter / metadata 检查
- Prompt config 或 model input builder 测试
- Tool description / schema description 测试
- Prompt / Tool 指南对齐检查：确认规则放在正确层级，LangChain tool description / schema description 覆盖能力边界，input source、ID/ref 来源、output fact level、provider tool call / tool input examples、停止条件和失败出口清晰
- 模型可见描述语言测试：tool description、schema description、examples、失败反馈或 tool result summary 中的描述性自然语言默认中文
- 字段重命名同步测试：用 `rg` 检查旧字段残留，并验证模型可见 tool description、schema description、examples 和失败反馈使用新字段
- Agent runtime / final grounding 测试
- 修改 TypeScript、React、API、Schema、AI 编排或共享业务逻辑后运行 `npm run typecheck`

如果本次只新增 Skill 或文档，不修改真实 prompt runtime、业务 tool 或 TypeScript，说明未运行 prompt/runtime/typecheck 的原因。

## 收尾说明

完成后总结：

- 改了什么。
- 为什么这个设计优于局部 prompt 补丁。
- 如何验证。
- 是否仍有剩余风险。
