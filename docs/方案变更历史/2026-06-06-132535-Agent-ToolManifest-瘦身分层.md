# Agent ToolManifest 瘦身分层

记录时间：2026-06-06 13:25:35 CST

## 背景

当前 Agent tool manifest 已经能表达工具能力，但每个 tool 同时塞入了工具说明、业务编排策略、全局安全禁令、资源生命周期、validator 约束和历史 bug 修复提示。模型在短上下文下能大致读懂，但在长上下文或 repair 场景里容易抓住局部限制，忽略当前主目标，甚至输出只有 tool input 的半截 JSON。

典型风险是 tool example 只展示：

```json
{ "operation": "list_recent" }
```

而 Planner 真实必须输出的是完整 `AgentAction`：

```json
{
  "type": "tool_call",
  "toolName": "inspectVisibleTrainingProposals",
  "input": { "operation": "list_recent" }
}
```

## 调整思路

本次改为三层模型可见合同：

1. `system prompt` 只保留 Planner 身份、只能输出 `AgentAction`、安全边界和最小执行规则。
2. `actionContract` 集中表达通用字段字典、tool / resource glossary、grounding、引用和 repair 边界。
3. 单个 tool manifest 只表达该 tool 的稳定事实能力、关键 input、输出如何被下游消费，以及完整 `tool_call` examples。

这样做的核心目标不是减少字数本身，而是让模型更稳定地区分“通用执行合同”和“某个 tool 的事实能力”。

## 关键改动

- `ToolExample` 从 `{ description, input }` 改为 `{ description, action }`，其中 `action` 必须是完整 `tool_call`。
- `defineTool()` 增加 example 启动期校验：`action.toolName` 必须等于 tool 自身，`action.input` 必须通过该 tool 的 input schema。
- `actionContract` 新增 `factRef`、`messageId`、`resource.id`、`diagnostic resource`、`consumable resource`、`factSchemaVersion`、`visibleOutputs[].schemaVersion` 等 glossary。
- `actionContract` 集中表达：tool result 不是最终回答，failed / diagnostic / `satisfied=false` 不能支撑成功结构化输出，不得伪造 id。
- `requiredExerciseIds` / `excludeExerciseIds` 的正负锚点策略进入通用引用策略，而不是散落在每个 tool 长说明里。
- `inspectVisibleTrainingProposals`、`resolveExerciseResourceMentions`、`searchExerciseResources` 的 manifest 瘦身，只保留各自能力和下游消费边界。
- `searchExerciseResources` 的模型可见无器械输入值收敛为 canonical `equipment: "no_equipment"`；服务端仍可识别旧中文值，但 Planner manifest / examples / facet catalog 不再推荐 `"无器械"` 作为 tool input。

## 取舍

本次没有修改 tool handler、Agent runtime 主循环、Policy Guard、ResourceStore、Response Renderer 或 `/api/chat` route，也没有新增服务端关键词、正则、同义词或 phrasing 分流。业务 tool 名只留在各自 manifest、schema、resource contract 和测试里。

`repairPolicy` 没有做新的消息通道拆分，而是先从常驻 `actionContract` 中移除 `schema_validation_failed` / `domain_validation_failed` 的细节提示，改为只说明失败后按 observations 中的 validator repair details 修正。这样先解决主合同污染问题，后续如果需要更彻底的 repair-only payload，可以单独做 change。

## 验证结果

- `openspec validate slim-agent-tool-manifests --strict`
- `npm test -- tests/agent-core/agent-llm-prompt-config.test.ts tests/agent-core/tool-registry-manifest.test.ts tests/agent-core/manifest-hardening.test.ts tests/agent-core/contract-helper.test.ts`
- `npm test`
- `npm run typecheck`

完整测试结果：73 个测试文件、492 个用例通过。
