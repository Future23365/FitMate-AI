---
name: agent-tool-change-governance
description: 治理 AITest 中 Agent tool、执行合同、core runtime 和 production 接入相关变更的实现前流程。作为 primary skill 用于新增或修改 Agent tool、tool schema、handler、policy metadata、resource contract、projection、trace/replay、PlannerPort、Executor、Policy Guard、ResourceStore、Resource Contract Validator、Response Renderer 或 /api/chat 生产聊天接入；也用于业务 tool 输入/输出字段命名、弃用和重命名。纯 prompt/model input/model-visible 文案变更不以本 Skill 为主，应使用 agent-prompt-contract-governance；普通 trace 根因排查不自动触发。
---

# Agent Tool 变更治理

## 前置检查

0. 每个任务只选择一个 primary governance skill。本 Skill 只在执行合同、tool/core/runtime/production 边界是主问题时作为 primary；涉及模型可见说明时，`agent-prompt-contract-governance` 只作为 secondary 检查。
1. 在提出方案或修改实现前，读取 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节。
2. 对非平凡行为改动，先用 `openspec status --change <change> --json` 检查当前 OpenSpec change，并读取 proposal、design、spec 和 tasks。
3. 改文件前运行 `git status --short`。如果存在无关用户改动，不要混入当前 diff 或 commit。
4. 将任务归为一个主类型：新增业务 tool、Agent tool bug 修复、core contract 变更、production 接入变更。
5. 字段命名、弃用或重命名不是独立主类型：只影响单个业务 tool 时归为 Agent tool bug 修复或已有 tool 合同调整；影响两个以上无关 tool、`AgentAction`、resource、trace/replay 或通用 renderer 时归为 core contract 变更。
6. 实现前先说明问题根因或产品需求、设计方向、预计影响模块和取舍。

## 任务分类

### 新增业务 Tool

默认只新增 tool bundle 和局部接线：schema、policy metadata、必要的 `resourceContract`、handler、model/user/trace projection、`ToolRegistry` 注册、contract tests 和直接覆盖 `handler`、`executeTool` 或真实 runtime 入口的业务单测。manifest / schema / examples 的描述性自然语言默认中文，`toolName`、字段名、枚举值和 resource type 保持英文原样。

新增或重命名 tool 前必须做抽象层级检查：说明稳定 resource type、能力族（query / list / read / register / validate / policy / save / update）、同类变体、命名理由，以及当前需求限制哪些应落到 filter / sort / limit / cursor / detailLevel / resource reference。优先复用或扩展同类 tool；如果跨了不同资源、权限、policy、projection 或执行副作用，应拆分。

`toolName` 优先使用稳定资源 + 能力动词，例如 `queryXxxResources`、`listXxxResources`、`readXxxResource`。`recent`、`current`、`latest`、`fromCard`、`forThisFlow` 等只在属于永久业务边界时才写进名称；否则作为输入条件表达。

除非 OpenSpec design 明确证明需要 core contract 变更，否则不要为了单个业务 tool 修改 Agent core。测试不能只证明 registry、manifest 或 schema 暴露给模型，必须覆盖真实业务输入、拒绝、投影、留痕，以及至少一个同类功能变体。

### Agent Tool Bug 修复

从证据定位，不从表面现象直接补丁：

- 先判断证据来源是否对应当前问题。覆盖写的导出文件可能已经被替换；只有在用户提供、刚导出或明确确认导出证据对应当前 case 时，才把它作为证据使用。
- 在怀疑服务端流程前，先检查本次模型实际可见的 `prompt / model input`，包括 `system prompt`、`developer prompt`、tool manifest、schema summary、examples、repair feedback、context package、observations 和已压缩的 tool results。不要先入为主假设服务端 runtime、handler 或 response flow 有问题。
- 优先判断是否缺 tool 能力、tool 描述/Schema/examples 不清、context/resource 摘要不足、repair feedback 不足或 final grounding 不清；不要先新增业务端语义判断。
- 如果模型可见输入已经正确表达合同，再检查真实 Zod / JSON Schema、runtime validation、`ResourceStore`、`Policy Guard`、projection、response rendering、trace 和 production 接入。
- 将根因分类为 LLM 参数错误、模型可见合同缺失、tool 能力缺口、resource 缺失或不可消费、policy / confirmation 边界、projection / redaction 泄漏、final grounding 缺陷或 production 接入问题。
- 修改某个已有 tool 的功能或 bug 时，必须先定位并运行该 tool 已有的专属单测；如果没有专属单测，先补能复现问题的 tool-level 单测，再改实现。
- 如果修复方案需要读取用户原始自然语言关键词、同义词、短句模板或业务特定 phrasing，必须停止并改为 prompt / model input / schema / repair / resource contract 层面的方案，除非用户明确批准。
- 回归测试必须覆盖问题类别：至少包含原始失败 case 和一个等价语义变体；tool-level test 不能只断言当前 trace 的单个输入。

不要用服务端关键词、正则、同义词表、短句模板或业务 `toolName` 特判修复自然语言理解问题。

### 过时字段重命名

当业务变化导致 tool 字段过时、含义漂移或需要重命名时，把它当作执行合同变更处理，不要只在 prompt 或局部 handler 里补别名：

- 先追踪旧字段的完整产生和消费链路：`inputSchema`、`outputSchema`、handler、policy metadata、`resourceContract`、`toModelObservation`、`toUserProjection`、trace projection、response rendering、fixtures、tests 和真实 model-visible manifest / schema summary。
- 字段新名称必须表达当前业务含义；不要为了兼容旧语义保留误导性字段名。
- 默认删除旧字段和旧别名，不新增长期兼容层；如果生产迁移确实需要短期兼容，必须写清兼容入口、清理条件、测试覆盖和 OpenSpec 边界。
- 字段名、枚举值、resource type 等执行合同保持英文标识；描述性自然语言使用中文解释新字段业务含义。
- 字段重命名后同步使用 `agent-prompt-contract-governance` 检查模型可见输入，确认 manifest、schema summary、examples、repair feedback、observations 和 compressed tool results 不再引导模型使用旧字段。

### Core Contract 变更

只有在需求确实具备通用性时，才升级为 core contract 设计：

- 如果只有一个 tool 需要，优先修改该 tool 的合同。
- 如果两个以上无关 tool 都需要，设计通用 core 扩展点，并补 core contract tests。
- 如果问题涉及安全、权限、resources、trace、replay、stream 或 confirmation，必须回到 core contract 统一设计，不要开业务特例。

### Production 接入变更

将 `/api/chat` 和等价 production entrypoint 视为高风险边界：

- production routing 必须留在 Agent loop 内，不要新增业务关键词路由。
- 不要绕过 `ToolRegistry`、`Policy Guard`、`ResourceStore`、`Resource Contract Validator` 或 `Response Renderer`。
- 除非 OpenSpec change 明确包含该 production 能力，否则必须证明 route 没有注册 fixture tools、隐藏业务服务或临时自然语言分流。

## 默认禁止项

新增业务 tool 或普通 tool bug 修复时，默认不要修改这些模块：

- orchestrator main loop
- `PlannerPort`
- Executor main flow
- `Policy Guard`
- `Resource Contract Validator`
- `Response Renderer`
- `/api/chat` main route 或 chat production chain
- Agent core 内基于具体业务 `toolName` 的分支
- 服务端关键词、正则、同义词或自然语言模板路由
- handler 内绕过 confirmation、permission 或 resource registration

如果必须触碰以上区域，先停下来确认 OpenSpec design 已写清任务分类、允许模块、禁止模块、验证计划和 core contract 理由。

## OpenSpec 要求

非文案类 Agent tool change 的 `proposal.md`、`design.md` 和 `tasks.md` 必须说明：

- 任务分类
- 允许触碰模块
- 禁止触碰模块
- core contract 变更是否在范围内
- 验证计划
- 无法运行验证时的剩余风险

新增业务 tool 时，checklist 必须覆盖 tool bundle、`ToolRegistry` 注册、schema、policy、`resourceContract`、model projection、user projection、trace projection 或 trace summary、模型可见描述语言、contract tests，以及该 tool 的业务单元测试。

新增业务 tool 的 `tasks.md` 必须包含以下测试门禁，按真实文件名替换 `<toolName>` 和测试路径：

- [ ] 完成 Tool 抽象层级检查，说明稳定 resource type、能力族、同类变体、命名理由，以及哪些需求限制应落到 filter / sort / limit / cursor / resource reference。
- [ ] 为 `<toolName>` 新增或更新 tool-level unit tests，直接覆盖 `handler`、`executeTool` 或当前真实 runtime 执行入口。
- [ ] 覆盖 `<toolName>` 的成功路径、schema 拒绝、领域边界、失败归一化、resource contract、projection / redaction、policy / permission 边界和同类功能变体。
- [ ] 覆盖 `<toolName>` 的模型可见描述语言，验证 `description`、`whenToUse`、`whenNotToUse`、schema description 和 examples description 默认中文。
- [ ] 按 tool 业务职责覆盖 AITest 真实健身场景，不只使用抽象 fixture。
- [ ] 运行 `npm test -- tests/agent-tools/<toolName>.test.ts` 或该 tool 对应的最窄测试文件。
- [ ] 运行 `npm test -- tests/agent-core/contract-helper.test.ts`。
- [ ] 如修改注册、manifest 或 schema summary，运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`。
- [ ] 如修改 TypeScript、schema、AI orchestration 或共享业务逻辑，运行 `npm run typecheck`。

修复 Agent tool bug 时，checklist 必须覆盖证据来源有效性、模型实际可见的 `prompt / model input`、真实 schema、model-visible manifest 或 schema summary、`ResourceStore`、`Policy Guard`、projection、response rendering 和 trace/replay 影响。

涉及过时字段重命名时，`tasks.md` 必须额外包含字段迁移检查：列出旧字段和新字段，覆盖所有产生方、消费方、模型可见说明、trace/replay、fixtures 和回归测试，并明确是否删除旧字段或短期保留兼容入口。

修复或修改已有 tool 时，`tasks.md` 必须额外包含该 tool 的回归单测任务：先补复现用例，再更新实现，并运行该 tool 对应的最窄单测。仅运行 registry、manifest、contract helper、黑盒 LLM 或全量 smoke tests，不能替代 tool-level unit tests。

每个非文案类 Agent tool `tasks.md` 必须包含 `openspec validate <change> --strict`、相关自动化测试、触碰 core 或 production 边界时的 architecture scan，以及最终 diff 检查。

## Tool 单测要求

tool-level unit tests 应优先放在 `tests/agent-tools/<toolName>.test.ts`；如果项目已有更贴近的业务测试文件，可以放在现有文件中，但最终回复必须说明对应测试文件。

每个新增或修改的业务 tool 至少覆盖：

- 成功路径：使用接近真实用户请求的输入，断言关键业务输出，而不是只断言 `ok: true`。
- 输入合同：非法枚举、缺失必填字段、错误 resource id、越界分页或数量、无效 `exerciseId` 等必须在执行前或确定性边界被拒绝。
- 业务边界：候选为空、候选不足、多个候选冲突、用户限制冲突、默认值、可选字段缺失、重复调用和幂等行为。
- 权限与隔离：涉及用户私有数据、artifact、memory、schedule、routine 或 plan 时，必须覆盖 `userId` 隔离、不可访问资源和 stale / archived / superseded 状态。
- resource 合同：生产 consumable / diagnostic resource 的 tool 要断言 resource type、role、id、summary 和下游可消费边界。
- projection 与 trace：断言 `toModelObservation`、`toUserProjection`、trace projection 或 trace summary 不泄漏完整 handler 输出、敏感字段、服务端内部枚举或仅供诊断的资源。
- policy 与确认：写操作、高风险操作、长期记忆、覆盖已有计划或批量影响日程的 tool 必须覆盖 confirmation、permission、idempotency 和拒绝执行路径。
- 失败路径：数据库未命中、权限不匹配、resource 不可消费、handler exception、外部服务失败或验证失败要返回结构化错误，不能用用户可见文案掩盖合同问题。

按 tool 领域选择更具体的健身业务场景：

- 动作检索 / 详情 tool：覆盖结构化过滤优先于语义排序、`query` 不是 hard filter、器械约束、目标肌群、训练目的、warmup / stretch 补齐、分页 / count / detail 读取和候选不足。
- routine / plan draft tool：覆盖训练目标、每周频率、单次时长、热身 / 主训练 / 拉伸结构、候选证据、非法动作 id、动作 section 不匹配和 duration / frequency 边界。
- validate / policy tool：覆盖 deterministic hard fail、warning、needs clarification、需要确认和不可执行结果，避免把语义判断写成服务端关键词规则。
- artifact / reference tool：覆盖当前用户、active revision、stale revision 恢复、archived artifact、跨会话引用和 final grounding 可消费性。
- memory / preference tool：覆盖长期偏好、临时上下文、明确用户限制、健康相关信号和不提供医疗诊断的边界。

## 验证

优先运行最窄的相关检查：

- OpenSpec：`openspec validate <change> --strict`
- Tool 行为单测：新增或修改业务 tool 时，必须运行该 tool 对应的专属单测；registry、manifest、contract helper 或黑盒 LLM 测试不能替代 tool-level unit tests
- Architecture boundary：`npm test -- tests/agent-core/architecture-boundary.test.ts`
- Tool contract helper：`npm test -- tests/agent-core/contract-helper.test.ts`
- Tool registry / manifest：修改注册、manifest 或 schema summary 时，运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`
- 修改 policy、resource、confirmation、renderer、trace 或 production integration 时，运行对应 runtime safety 和 projection tests
- 字段重命名时，用 `rg` 检查旧字段残留，并运行覆盖该字段的 tool-level、manifest/schema summary、projection 或 trace/replay 测试
- 修改 TypeScript、React、API、schema、AI orchestration 或共享业务逻辑后，运行 `npm run typecheck`

结束时总结改了什么、为什么这个设计优于局部补丁、如何验证，以及是否还有剩余风险。
