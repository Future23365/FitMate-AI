## Why

近期诊断显示，生产 LangChain Agent 的模型可见合同已经把训练请求范围、动作查询策略、候选消费边界、结构化收口、Markdown 输出格式和历史修复约束堆叠到同一个 system prompt / tool description 链路中。DeepSeek V4 Flash 在这类长上下文下容易抓住“可以继续查动作库”，却忽略“何时停止查询并消费候选”的近场边界，导致泛化 routine 请求连续多轮调用 `searchExerciseResources` 而不进入结构化收口。

本 change 先做 OpenSpec 设计，不实现代码。目标是把规则放回正确层级，减少冗余和注意力负担，同时修正 `searchExerciseResources` 模型可见 summary 中可能把可消费候选标成 `diagnostic` 的误导风险。

## What Changes

- 重平衡默认 LangChain Agent system prompt：只保留 provider tool calling、服务端校验、安全边界、结构化终态和最高层停止原则，不再承载大段训练编排细则、字段说明或 Markdown 细则。
- 重写 `searchExerciseResources` 的模型可见说明结构：保留 `Purpose`、`Use When`、`Do Not Use When`、`Input Source`、`Output Meaning`、`Grounding Rules`，每段只保留少量高优先级边界，突出一次性批量查询、字段来源和停止查询条件。
- 调整 schema description 分层：字段 description 保留类型、枚举、字段来源和不可复制边界；跨字段 workflow、候选消费策略和结构化收口策略下沉到对应 tool description 或 finalization tool description。
- 缩短 decision examples：保留场景、工具链路和收口边界，并在 routine 示例中明确展示一次性合并查询 `suitabilities = ["warmup", "training", "stretch"]` 且未指定肌群时不填写 `muscles`。
- 将最终正文 Markdown 细则从 system prompt 下沉到 `fitmate_final_response.content` schema description 或等价 structured final response 合同；system prompt 只保留“最终回答必须通过结构化终态工具提交”的高层规则。
- 修正 `searchExerciseResources` 的模型可见事实等级边界：有可消费 `candidateGroups[].exercises[]` 的成功结果应表达为候选事实；查询宽窄应通过单独的查询边界字段表达，不应把可消费候选降级为 `diagnostic`。
- 明确禁止新增服务端关键词、正则、自然语言模板路由、具体 phrasing 特判、复杂 `currentRoutineDraft` / 拼图状态、LangChain runtime 主循环分支或 `/api/chat` 语义分流。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-llm-prompt-configuration`: 重平衡 system prompt、decision examples 和 final response Markdown 约束的模型可见层级。
- `agent-exercise-resource-query-tool`: 重写 `searchExerciseResources` 模型可见说明分层，并修正可消费候选的 `factLevel` / 查询边界语义。
- `visible-training-proposal`: 保持结构化收口边界，但将 routine / plan 的收口规则集中到 `submitVisibleTrainingProposal` 说明中，避免 system prompt 重复承载。
- `agent-text-chat-flow`: 将聊天正文 Markdown 限制优先放入 `fitmate_final_response.content` schema description 或等价结构化 final response 合同。

## Impact

- 预计影响模型可见 prompt 与工具说明：
  - `lib/server/langchain-agent/prompt.ts`
  - `lib/server/langchain-agent/tools/exercise-resource-tools.ts`
  - `lib/server/langchain-agent/tools/visible-training-proposal-finalization-tool.ts`
  - structured final response / `fitmate_final_response` schema 定义入口
- 预计影响测试：
  - `tests/langchain-agent-tools/production-tool-catalog.test.ts`
  - `tests/langchain-agent-tools/search-exercise-resources.test.ts`
  - `tests/langchain-agent-tools/submit-visible-training-proposal.test.ts`
  - `tests/langchain-agent-tools/model-visible-contract-gate.test.ts`
  - `tests/shadow-llm-probe.test.ts` 或等价模型可见输入黑盒验证
- 不修改 LangChain runtime 主循环、model factory provider payload、tool wrapper 通用执行、response adapter、数据库 schema、动作查询 repository、训练方案 validator 或 `/api/chat` route。
