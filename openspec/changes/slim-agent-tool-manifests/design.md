## Context

当前 `DeepSeekModelAdapter` 构造 Planner 请求时，system message 来自 `buildAgentActionSystemPrompt()`，user payload 中并列放入 `actionContract`、`run`、`step`、`tools`、`outputContracts`、`observations` 和 `toolResults`。其中 `tools` 来自 `ToolRegistry.serializeForPlanner()`，会原样暴露 `description`、`whenToUse`、`whenNotToUse`、JSON Schema description、metadata 和 examples。

现有 production business tools 的 manifest 存在两个模型可见问题：

- `whenNotToUse` 反复复制“不要生成 visibleTrainingProposal / 不保存 artifact / 不写用户记忆 / 不伪造 id / failed result 不能 grounding”等全局规则，使单个 tool 看起来风险过高。
- `examples` 只展示 tool input，Planner 的真实目标却是输出完整 `AgentAction`，因此长上下文或 repair 场景下容易输出半截 JSON。

本 change 分类为：通用 Agent prompt 合同 + 单个业务 tool 模型可见说明。允许触碰 prompt config、tool manifest 类型与序列化、安全 hardening、三个业务 tool 的模型可见说明和测试；禁止触碰 tool handler、runtime 主循环、Policy Guard、ResourceStore、Resource Contract Validator、Response Renderer、生产 route 或任何服务端自然语言语义分流。

## Decisions

### 1. Tool examples 改成完整 `tool_call` action

将 `ToolExample` 调整为：

- `description`: 中文说明业务意图。
- `action`: 完整 `{ type: "tool_call", toolName, input }`。

`toolName` 必须等于当前 tool 的真实 `name`，`input` 必须匹配该 tool 的 `inputSchema`。这样 Planner 看到的 few-shot 与真实 `AgentAction` 输出合同一致。

替代方案是继续保留 `input`，只在 description 里提醒“外层包裹 tool_call”。该方案仍要求模型在示例和目标形态之间做转换，不能解决半截 JSON 风险，因此不采用。

### 2. 全局规则进入 `actionContract`

把跨所有 tools 都成立的规则放进 `actionContract`：

- tool 只返回事实或执行受控能力，不生成最终 `visibleOutputs`、不保存 artifact、不写用户记忆、不伪造结果。
- `failed`、`diagnostic`、`satisfied=false` 结果不能支撑成功 `final_answer`。
- `resource.id` 才能进入 `final_answer.usedRefs[type="resource"]`；`factRef`、`messageId` 只能作为业务 tool 的读取引用。
- `diagnostic resource` 只能辅助推理，`consumable resource` 才能作为成功结构化输出事实来源。
- `factSchemaVersion` 与 `visibleOutputs[].schemaVersion` 不是同一概念。
- 复用/保留/派生使用正向事实或 `requiredExerciseIds`；替换/排除/避免重复使用 `excludeExerciseIds`，同一批动作不同时进入正负两侧。

这些规则是 Planner 全局合同，不依赖具体用户短句或服务端 `toolName` 分支。

### 3. 业务 tool manifest 固定为短结构

每个生产业务 tool 的模型可见说明控制在稳定短块：

- `description`: 一句话说明稳定资源和能力。
- `whenToUse`: 说明适用场景、关键输入和下游如何使用输出。
- `whenNotToUse`: 只保留该 tool 独有的误用边界，不重复全局禁令。
- `examples`: 1 到 3 个完整 `tool_call` action 示例。

具体收敛：

- `inspectVisibleTrainingProposals`: 只说明 `list_recent` 是轻量索引、`read_recent` 只能读取本轮 `list_recent` 返回的 `factRef` / `messageId`，成功后导入 consumable `visible_training_proposal_fact`。
- `resolveExerciseResourceMentions`: 只说明用户明确点名动作解析、`matched.exerciseId` 只能进入 `searchExerciseResources.requiredExerciseIds`，`ambiguous` / `not_found` 不直接支撑训练结构。
- `searchExerciseResources`: 只说明发布态 Exercise 查询、`groups.<section>.exercises[]` 是 section-scoped 动作事实来源、facet / section / canonical `no_equipment` / 过宽查询边界。

### 4. `no_equipment` 作为模型可见 canonical value

保留服务端现有确定性查询能力的同时，模型可见 manifest、schema description 和 examples 只引导输出 `equipment: "no_equipment"`。用户可见中文可以说“无器械”，但 tool input 不再把 `"无器械"` 展示为推荐值。

这不是服务端兼容层扩张，也不新增自然语言改写；只是收窄 Planner 可见输出目标，减少同义值漂移。

### 5. 抽象层级门禁

本 change 不把“换一批”“刚才那个计划”等具体短语写成通用 prompt 触发条件，也不在服务端根据用户原文选择 tool 或 operation。具体业务 tool 名只出现在该 tool 的 manifest、schema description、resource contract 和测试中。

结论：可继续

1. 抽象问题类型：模型可见合同分层混乱、tool example 与 `AgentAction` 目标形态不一致、资源术语缺少集中 glossary。
2. 通用合同修复：把跨 tool 的 action、resource、grounding、repair 和引用策略放入 `actionContract`。
3. 业务 tool 局部说明：每个 tool 只说明自身稳定事实能力、输入字段和输出消费边界。
4. 回归测试样例：覆盖完整 `tool_call` examples、`list_recent` / `read_recent` 关系、mention -> `requiredExerciseIds`、section-scoped exercise facts、canonical `no_equipment`。
5. 服务端语义分流检查：未新增关键词规则、自然语言模板路由、phrasing 特判或具体 `toolName` 语义分支。

## Risks

- Risk: `ToolExample` 类型变化影响 fixture tests。Mitigation：同步更新 fixture 示例和 manifest hardening 测试，确保安全示例仍可 lint。
- Risk: manifest 过度瘦身导致模型缺少关键边界。Mitigation：全局规则集中到 `actionContract`，业务 tool 保留“输出如何被下游消费”的最短必要说明。
- Risk: `no_equipment` 可见合同和 repository 仍支持 `"无器械"` 的实现细节出现漂移。Mitigation：测试只断言 Planner 可见 manifest/examples 不推荐 `"无器械"`，不借此修改 repository 行为。

## Validation

- `openspec validate slim-agent-tool-manifests --strict`
- `npm test -- tests/agent-core/agent-llm-prompt-config.test.ts tests/agent-core/tool-registry-manifest.test.ts tests/agent-core/manifest-hardening.test.ts tests/agent-core/contract-helper.test.ts`
- `npm run typecheck`
