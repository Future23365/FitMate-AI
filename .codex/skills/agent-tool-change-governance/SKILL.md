---
name: agent-tool-change-governance
description: 治理 AITest 中 Agent tool、LangChain tool wrapper、执行合同、LangChain runtime 和 production 接入相关变更的实现前流程。作为 primary skill 用于新增或修改 LangChain tool、tool schema、handler、policy / confirmation metadata、model-visible summary、user projection、trace summary、production tool catalog、structured final response / finalization tool、response adapter、terminal failure finalizer 或 /api/chat 生产聊天接入；也用于业务 tool 输入/输出字段命名、弃用和重命名。Agent 主链迁移、framework migration、LangChain runtime 替换、production tool catalog 或跨模块 tool/runtime 大重构还必须在本 Skill 定边界后使用 agent-regression-contract-audit；普通单 tool 修改不因此扩大流程。纯 prompt/model input/model-visible 文案变更不以本 Skill 为主，应使用 agent-prompt-contract-governance；如果 tool 变更牵涉传给 AI 的 system prompt、tool description、schema description、examples、失败反馈、上下文摘要或 tool result summary，本 Skill 只定执行边界，并引导使用 agent-prompt-contract-governance 做模型可见合同检查；普通 trace 根因排查不自动触发。
---

# Agent Tool 变更治理

## 前置检查

0. 每个任务只选择一个 primary governance skill。本 Skill 只在执行合同、tool / LangChain runtime / production 边界是主问题时作为 primary；涉及模型可见说明时，`agent-prompt-contract-governance` 负责提示词细节，本 Skill 只保留执行边界和交接检查。
1. 在提出方案或修改实现前，读取 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节。
2. 对非平凡行为改动，先用 `openspec status --change <change> --json` 检查当前 OpenSpec change，并读取 proposal、design、spec 和 tasks。
3. 改文件前运行 `git status --short`。如果存在无关用户改动，不要混入当前 diff 或 commit。
4. 将任务归为一个主类型：新增业务 tool、Agent tool bug 修复、LangChain runtime / wrapper 通用合同变更、production 接入变更。
5. 字段命名、弃用或重命名不是独立主类型：只影响单个业务 tool 时归为 Agent tool bug 修复或已有 tool 合同调整；影响两个以上无关 tool、provider tool call 合同、结构化终态输出、trace summary 或通用 response adapter 时归为 LangChain runtime / wrapper 通用合同变更。
6. 实现前先说明问题根因或产品需求、设计方向、预计影响模块和取舍。

## 历史回归审计触发

当 change 属于 Agent 主链迁移、framework migration、LangChain runtime 替换、production tool catalog 重写、批量 tool wrapper / model-visible summary 重构，或跨模块改造 Agent tool / prompt / finalization 链路时，本 Skill 只负责先定当前 tool/runtime 可改边界。随后必须使用 `agent-regression-contract-audit` 做 secondary audit，对照归档 OpenSpec 和演进记录确认历史禁止字段、固定 workflow 文案、过时协议字段、业务目标满足度和 case-specific 生产规则没有回归。

这不会扩大普通单个 tool 修改的流程。只新增或调整单个业务 tool、tool schema、handler、policy metadata、model-visible summary、projection 或 trace summary，且不替换 runtime、不迁移 framework、不批量改模型可见合同、不恢复历史行为时，不因本条自动触发 `agent-regression-contract-audit`；仍按本 Skill 和必要的 `agent-prompt-contract-governance` 执行。

触发历史回归审计的大重构 change 的 `tasks.md` 必须包含 Agent model-visible contract gate 验证，覆盖白名单 summary schema、production tool catalog contract tests、模型可见文本 linter 和历史禁止项补充扫描。

## 任务分类

### 新增业务 Tool

默认只新增 LangChain tool wrapper 和局部接线：`inputSchema`、可选 `outputSchema`、policy / confirmation metadata、handler、`toModelVisibleSummary`、`toUserProjection`、`toTraceSummary`、production tool catalog 注册、contract tests 和直接覆盖 `handler`、`executeLangChainToolWrapper` 或真实 runtime 入口的业务单测。`toolName`、字段名、枚举值和 resource type 属于执行合同，本 Skill 负责命名和结构边界；tool description、schema description、examples、失败反馈、上下文摘要或 tool result summary 的提示词设计交给 `agent-prompt-contract-governance`。

新增或重命名 tool 前必须做抽象层级检查：说明稳定 resource type、能力族（query / list / read / register / validate / policy / save / update）、同类变体、命名理由，以及当前需求限制哪些应落到 filter / sort / limit / cursor / detailLevel / resource reference。优先复用或扩展同类 tool；如果跨了不同资源、权限、policy、projection 或执行副作用，应拆分。

`toolName` 优先使用稳定资源 + 能力动词，例如 `queryXxxResources`、`listXxxResources`、`readXxxResource`。`recent`、`current`、`latest`、`fromCard`、`forThisFlow` 等只在属于永久业务边界时才写进名称；否则作为输入条件表达。

除非 OpenSpec design 明确证明需要 LangChain runtime / wrapper 通用合同变更，否则不要为了单个业务 tool 修改 LangChain runtime 主循环、model factory provider payload 或 production response adapter 主流程。测试不能只证明 tool catalog、description 或 schema 暴露给模型，必须覆盖真实业务输入、拒绝、投影、留痕，以及至少一个同类功能变体。

### Agent Tool Bug 修复

从证据定位，不从表面现象直接补丁：

- 先判断证据来源是否对应当前问题。覆盖写的导出文件可能已经被替换；只有在用户提供、刚导出或明确确认导出证据对应当前 case 时，才把它作为证据使用。
- 在怀疑服务端流程前，先判断本次问题是否主要来自模型可见输入。如果根因是 `prompt / model input`、tool description、schema description、examples、失败反馈、上下文摘要或 tool result summary 不清，停止把本 Skill 当 primary，改用 `agent-prompt-contract-governance`。
- 本 Skill 继续处理的前提是：模型可见输入不是主根因，或者提示词问题只是 tool 执行合同变更的 secondary 检查。
- 如果模型可见输入已经正确表达合同，再检查真实 Zod / JSON Schema、LangChain tool wrapper validation、output schema、model-visible summary、user projection、response adapter、trace summary 和 production catalog 接入。
- 将根因分类为 LLM 参数错误、模型可见合同缺失、tool 能力缺口、resource 缺失或不可消费、policy / confirmation 边界、projection / redaction 泄漏、final grounding 缺陷或 production 接入问题。
- 修改某个已有 tool 的功能或 bug 时，必须先定位并运行该 tool 已有的专属单测；如果没有专属单测，先补能复现问题的 tool-level 单测，再改实现。
- 如果修复方案需要读取用户原始自然语言关键词、同义词、短句模板或业务特定 phrasing，必须停止；属于模型可见合同缺口时改用 `agent-prompt-contract-governance`，属于执行资源或 schema 缺口时才回到本 Skill 处理。
- 回归测试必须覆盖问题类别：至少包含原始失败 case 和一个等价语义变体；tool-level test 不能只断言当前 trace 的单个输入。

不要用服务端关键词、正则、同义词表、短句模板或业务 `toolName` 特判修复自然语言理解问题。

### 过时字段重命名

当业务变化导致 tool 字段过时、含义漂移或需要重命名时，把它当作执行合同变更处理，不要只在 prompt 或局部 handler 里补别名：

- 先追踪旧字段的完整执行链路：`inputSchema`、`outputSchema`、handler、policy metadata、`resourceContract`、`toModelObservation`、`toUserProjection`、trace projection、response rendering、fixtures 和 tests。
- 字段新名称必须表达当前业务含义；不要为了兼容旧语义保留误导性字段名。
- 默认删除旧字段和旧别名，不新增长期兼容层；如果生产迁移确实需要短期兼容，必须写清兼容入口、清理条件、测试覆盖和 OpenSpec 边界。
- 字段名、枚举值、resource type 等执行合同保持英文标识；模型可见自然语言解释不在本 Skill 展开。
- 字段重命名后必须把模型可见同步交给 `agent-prompt-contract-governance`，确认 tool description、schema description、examples、失败反馈、上下文摘要和 tool result summary 不再引导模型使用旧字段。

### LangChain Runtime / Wrapper 通用合同变更

只有在需求确实具备通用性时，才升级为通用合同设计：

- 如果只有一个 tool 需要，优先修改该 tool wrapper 的合同。
- 如果两个以上无关 tool 都需要，设计通用 LangChain tool wrapper、runtime trace、response adapter 或 finalization 扩展点，并补通用合同测试。
- 如果问题涉及安全、权限、受控业务事实、trace、stream、structured final response 或 confirmation，必须回到通用合同设计，不要开业务特例。

### Production 接入变更

将 `/api/chat` 和等价 production entrypoint 视为高风险边界：

- production routing 必须留在 LangChain Agent loop 和受控 tool catalog 内，不要新增业务关键词路由。
- 不要绕过 production LangChain tool catalog、`defineLangChainToolWrapper` / `executeLangChainToolWrapper`、服务端 validator、policy / confirmation、structured final response / finalization tool 或 production response adapter。
- 除非 OpenSpec change 明确包含该 production 能力，否则必须证明 route 没有注册 fixture tools、隐藏业务服务或临时自然语言分流。

## 默认禁止项

新增业务 tool 或普通 tool bug 修复时，默认不要修改这些模块：

- LangChain runtime main loop
- model factory 的 provider payload 合同
- tool wrapper 通用执行主流程
- structured final response / finalization tool 通用合同
- production response adapter 主流程
- `/api/chat` main route 或 chat production chain
- LangChain runtime 或 response adapter 内基于具体业务 `toolName` 的分支
- 服务端关键词、正则、同义词或自然语言模板路由
- Tool handler / validator / 服务端 route 不得编码业务建议、训练合理性建议、语义偏好或模型决策策略；只能校验 schema、enum、权限、存在性、引用可达性、受控事实可消费性、policy / confirmation、成本限流、安全边界和可渲染性。
- handler 内绕过 schema、permission、confirmation、projection 或 finalization 校验

如果必须触碰以上区域，先停下来确认 OpenSpec design 已写清任务分类、允许模块、禁止模块、验证计划和通用合同理由。

## OpenSpec 要求

非文案类 Agent tool change 的 `proposal.md`、`design.md` 和 `tasks.md` 必须说明：

- 任务分类
- 允许触碰模块
- 禁止触碰模块
- LangChain runtime / wrapper 通用合同变更是否在范围内
- 验证计划
- 无法运行验证时的剩余风险

新增业务 tool 时，checklist 必须覆盖 LangChain tool wrapper、production tool catalog 注册、schema、policy / confirmation、model-visible summary、user projection、trace summary、contract tests，以及该 tool 的业务单元测试。若本次新增或修改会改变传给 AI 的 tool description、schema description、examples、失败反馈、上下文摘要或 tool result summary，额外加入 `agent-prompt-contract-governance` 的模型可见合同检查任务。

新增业务 tool 的 `tasks.md` 必须包含以下测试门禁，按真实文件名替换 `<toolName>` 和测试路径：

- [ ] 完成 Tool 抽象层级检查，说明稳定 resource type、能力族、同类变体、命名理由，以及哪些需求限制应落到 filter / sort / limit / cursor / resource reference。
- [ ] 为 `<toolName>` 新增或更新 tool-level unit tests，直接覆盖 `handler`、`executeLangChainToolWrapper` 或当前真实 runtime 执行入口。
- [ ] 覆盖 `<toolName>` 的成功路径、schema 拒绝、领域边界、失败归一化、model-visible summary、user projection / redaction、trace summary、policy / permission 边界和同类功能变体。
- [ ] 如变更 `<toolName>` 的 description、schema description、examples、失败反馈、上下文摘要或 tool result summary，使用 `agent-prompt-contract-governance` 检查模型可见合同；本 Skill 不维护提示词细节清单。
- [ ] 按 tool 业务职责覆盖 AITest 真实健身场景，不只使用抽象 fixture。
- [ ] 运行 `npm test -- tests/langchain-agent-tools/<toolName>.test.ts` 或该 tool 对应的最窄测试文件。
- [ ] 如修改 tool wrapper 通用执行，运行 `npm test -- tests/langchain-agent-runtime/runtime.test.ts tests/langchain-agent-runtime/response-adapter.test.ts` 或对应最窄 runtime 测试。
- [ ] 如修改注册、description 或 schema description，运行 `npm test -- tests/langchain-agent-tools/production-tool-catalog.test.ts` 或对应 catalog / prompt 测试。
- [ ] 如修改 TypeScript、schema、AI orchestration 或共享业务逻辑，运行 `npm run typecheck`。

修复 Agent tool bug 时，checklist 必须覆盖证据来源有效性、真实 schema、LangChain wrapper validation、output schema、projection、response adapter 和 trace summary 影响；如果排查发现根因在模型实际可见的 `prompt / model input`、tool description、schema description 或 examples，转交 `agent-prompt-contract-governance` 作为 primary。

涉及过时字段重命名时，`tasks.md` 必须额外包含字段迁移检查：列出旧字段和新字段，覆盖所有执行产生方、消费方、trace/replay、fixtures 和回归测试，并明确是否删除旧字段或短期保留兼容入口；模型可见说明同步由 `agent-prompt-contract-governance` 检查。

修复或修改已有 tool 时，`tasks.md` 必须额外包含该 tool 的回归单测任务：先补复现用例，再更新实现，并运行该 tool 对应的最窄单测。仅运行 catalog、description、schema description、黑盒 LLM 或全量 smoke tests，不能替代 tool-level unit tests。

每个非文案类 Agent tool `tasks.md` 必须包含 `openspec validate <change> --strict`、相关自动化测试、触碰 core 或 production 边界时的 architecture scan，以及最终 diff 检查。

## Tool 单测要求

tool-level unit tests 应优先放在 `tests/langchain-agent-tools/<toolName>.test.ts`；如果项目已有更贴近的业务测试文件，可以放在现有文件中，但最终回复必须说明对应测试文件。

每个新增或修改的业务 tool 至少覆盖：

- 成功路径：使用接近真实用户请求的输入，断言关键业务输出，而不是只断言 `ok: true`。
- 输入合同：非法枚举、缺失必填字段、错误 resource id、越界分页或数量、无效 `exerciseId` 等必须在执行前或确定性边界被拒绝。
- 业务边界：候选为空、候选不足、多个候选冲突、用户限制冲突、默认值、可选字段缺失、重复调用和幂等行为。
- 权限与隔离：涉及用户私有数据、artifact、memory、schedule、routine 或 plan 时，必须覆盖 `userId` 隔离、不可访问资源和 stale / archived / superseded 状态。
- 受控事实合同：生产 consumable / diagnostic 事实的 tool 要断言事实类型、role、id、summary 和下游可消费边界。
- projection 与 trace：断言 `toModelVisibleSummary`、`toUserProjection`、trace projection 或 trace summary 不泄漏完整 handler 输出、敏感字段、服务端内部枚举或仅供诊断的事实。
- policy 与确认：写操作、高风险操作、长期记忆、覆盖已有计划或批量影响日程的 tool 必须覆盖 confirmation、permission、idempotency 和拒绝执行路径。
- 失败路径：数据库未命中、权限不匹配、resource 不可消费、handler exception、外部服务失败或验证失败要返回结构化错误，不能用用户可见文案掩盖合同问题。

按 tool 领域选择更具体的健身业务场景：

- 动作检索 / 详情 tool：覆盖结构化过滤优先于语义排序、`query` 不是 hard filter、器械约束、目标肌群、训练目的、warmup / stretch 补齐、分页 / count / detail 读取和候选不足。
- routine / plan draft tool：覆盖训练目标、每周频率、单次时长、热身 / 主训练 / 拉伸结构、候选证据、非法动作 id、动作 section 不匹配和 duration / frequency 边界。
- validate / policy tool：覆盖 deterministic hard fail、warning、needs clarification、需要确认和不可执行结果，避免把语义判断写成服务端关键词规则。
- artifact / reference tool：覆盖当前用户、active revision、stale revision 恢复、archived artifact、跨会话引用和最终结构化输出可消费性。
- memory / preference tool：覆盖长期偏好、临时上下文、明确用户限制、健康相关信号和不提供医疗诊断的边界。

## 验证

优先运行最窄的相关检查：

- OpenSpec：`openspec validate <change> --strict`
- Tool 行为单测：新增或修改业务 tool 时，必须运行该 tool 对应的专属单测；catalog、description、schema description 或黑盒 LLM 测试不能替代 tool-level unit tests
- Architecture boundary：运行当前 LangChain 架构扫描或最接近的 production chain 测试，例如 `npm test -- tests/langchain-agent-runtime/runtime.test.ts tests/api-routes.test.ts`
- Tool wrapper / catalog：修改注册、description 或 schema description 时，运行 `npm test -- tests/langchain-agent-tools/production-tool-catalog.test.ts`；description / schema description 的提示词设计细节由 `agent-prompt-contract-governance` 检查
- 修改 policy、受控事实、confirmation、response adapter、trace 或 production integration 时，运行对应 runtime safety 和 projection tests
- 字段重命名时，用 `rg` 检查旧字段残留，并运行覆盖该字段的 tool-level、description / schema description、projection 或 trace summary 测试
- 修改 TypeScript、React、API、schema、AI orchestration 或共享业务逻辑后，运行 `npm run typecheck`

结束时总结改了什么、为什么这个设计优于局部补丁、如何验证，以及是否还有剩余风险。
