## 1. 前置审计与边界确认

- [x] 1.1 运行 `git status --short --branch`，确认仅处理本 change 范围内文件，不混入无关脏文件。
- [x] 1.2 使用 `agent-prompt-contract-governance` 完成实现前审查，确认本次属于 prompt / model-visible contract 优化，不触碰 runtime / core 执行合同。
- [x] 1.3 盘点当前真实模型输入链路：`buildAgentActionSystemPrompt()`、`DeepSeekModelAdapter.createRequestBody()`、`ToolRegistry.serializeForPlanner()`、tool manifest、schema description、examples、observations 和 toolResults。
- [x] 1.4 列出重复规则清单，并为每条规则标记保留层级：system prompt、tool manifest、schema description、model observation、repair feedback 或 tests。
- [x] 1.5 确认本 change 不新增服务端关键词、正则、同义词表、短句模板、用户原文分流或业务 `toolName` 特判。

## 2. system prompt 分层优化

- [x] 2.1 收敛 `lib/server/config/agent-llm-prompt-config.ts` 中默认 system prompt，保留 `AgentAction`、`content`、`usedRefs`、`suggestedQuestions`、`visibleOutputs[]` 和医疗安全主合同。
- [x] 2.2 保留 `visibleTrainingProposal.payload.kind`、`routine` / `plan` section coverage、引用对象推理和资源消费的首轮必须可见规则，并压缩重复解释。
- [x] 2.3 从 system prompt 中移除或压缩只属于 `searchExerciseResources`、`inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions` 的 operation / 字段细节。
- [x] 2.4 保留至少一个合法 `AgentAction` 最小 JSON 形状示例，并确认示例不包含 fake `toolResultId`、fake `resourceId`、fake `factRef` 或 fake `messageId`。
- [x] 2.5 更新 `agentLlmPromptVersion`，使 prompt 版本能明确反映本次模型可见合同优化。

## 3. 业务 tool manifest 与 schema description 优化

- [x] 3.1 收敛 `searchExerciseResources` 的 `description`、`whenToUse`、`whenNotToUse` 和 schema description，只保留动作事实查询、facet、section-scoped 来源、`requiredExerciseIds` / `excludeExerciseIds` 和不能生成最终训练结构的独有边界。
- [x] 3.2 精简 `searchExerciseResources` examples，保留受约束动作查询、补 `warmup` / `stretch` 查询，以及必要的 `requiredExerciseIds` 链路示例；删除长篇终态解释和非 schema 字段。
- [x] 3.3 收敛 `inspectVisibleTrainingProposals` 的模型可见说明，聚焦 `list_recent` / `read_recent`、真实 `ref` 来源、resource role、`factRef` / `messageId` 与 `usedRefs.resource.id` 的区别。
- [x] 3.4 收敛 `resolveExerciseResourceMentions` 的模型可见说明，聚焦 `mentions`、`matched` / `ambiguous` / `not_found` 和 `searchExerciseResources.requiredExerciseIds` 衔接。
- [x] 3.5 使用 `rg` 检查 tool manifest / examples 中不存在 fake 引用、过时字段、固定短语路由或旧 action 协议。

## 4. observation / repair feedback 优化

- [x] 4.1 收敛 `searchExerciseResources.toModelObservation()` 的文本边界，保留 `availableSections`、`sectionSummary`、`missingSectionsForRoutineOrPlan`、`supportsOutputKinds`、query specificity、required / excluded 状态和 group semantics。
- [x] 4.2 收敛 `inspectVisibleTrainingProposals.toModelObservation()` 和 resource summary，保留 `facts[]` 空结果、`read_recent` 导入状态、resource role、source reference boundary 和可消费事实边界。
- [x] 4.3 收敛 `resolveExerciseResourceMentions.toModelObservation()`，保留匹配计数、候选摘要、`allowedSections` 和后续 `requiredExerciseIds` 衔接边界。
- [x] 4.4 检查 schema validation / domain validation repair feedback 是否仍能帮助模型修正非法 action、缺 section、不可用引用和不可消费资源。

## 5. 测试与回归

- [x] 5.1 更新 prompt / adapter 测试，验证 system prompt 仍包含关键合同且不包含固定短语路由或业务 tool 强制流程。
- [x] 5.2 更新 `searchExerciseResources` manifest / observation / tool-level tests，改为合同级断言关键字段和边界，不依赖长句逐字匹配。
- [x] 5.3 更新 `inspectVisibleTrainingProposals` tests，覆盖 `list_recent` 空事实、`read_recent` 导入事实、resource id 边界和不提供 fake 引用。
- [x] 5.4 更新 `resolveExerciseResourceMentions` tests，覆盖点名动作解析、ambiguous / not_found、projection 和 `requiredExerciseIds` 衔接边界。
- [x] 5.5 覆盖至少四类 replay 或生产聊天回归：普通动作查询、routine / plan 缺 section 后继续补事实、上一套 visibleTrainingProposal 刷新、引用对象缺失时合法收口。
- [x] 5.6 运行 `npm test`，确认默认自动化测试仍 token-safe 且全部通过。
- [x] 5.7 按需运行 `npm run typecheck`；若改动影响构建、路由或服务端/客户端模块边界，再运行 `npm run build` 或说明无法运行原因。
- [x] 5.8 如需真实模型黑盒验证，使用显式手动命令执行，不纳入默认 `npm test`；验证报告只保留用户可见输出、失败原因和 token 诊断，不写 full prompt/raw response/tool dump。

## 6. OpenSpec 与收口

- [x] 6.1 运行 `openspec validate streamline-agent-model-visible-prompt-contract --strict`。
- [x] 6.2 复查 `openspec/changes/streamline-agent-model-visible-prompt-contract` 的 proposal、design、tasks 和 specs，确认中文说明不改变需求含义，技术标识保持英文原样。
- [x] 6.3 实现总结中说明：改了什么、为什么优于简单删除 prompt 文案、如何验证、是否存在剩余风险。
- [x] 6.4 完成实现后按项目规则提交当前 change 范围内改动，不提交无关脏文件。
