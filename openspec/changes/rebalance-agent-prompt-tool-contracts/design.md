## Context

当前生产 `/api/chat` 已使用 LangChain Agent Runtime、DeepSeek native `tool_calls` 和结构化终态工具。近期诊断暴露的问题不是 `searchExerciseResources` 执行能力不足，而是模型可见合同的注意力分配不稳定：system prompt、tool description、schema description、decision examples 和 tool result summary 中重复承载了训练编排、动作查询、候选消费、Markdown 输出和历史修复规则。

这会让 DeepSeek V4 Flash 在多轮 tool calling 中更容易记住“可以继续查动作库”，却漏掉“当前候选已经可以消费并提交结构化方案”的近场边界。另一个风险是模型可见 summary 使用 `factLevel = "diagnostic"` 表达 broad query，可能让模型把真实可消费动作候选误解为“初步诊断信息”，从而继续发起更窄查询。

## Goals

- 降低默认 system prompt 的规则密度，只保留通用 Agent 合同、结构化终态、安全边界和高层停止原则。
- 让每个业务 tool 的 description 在自身附近自洽表达能力边界、输入来源、输出含义和停止查询条件。
- 让 schema description 聚焦字段语义、字段来源和不可复制边界，不承载跨字段 workflow。
- 让 decision examples 更短，覆盖关键路径，而不是把示例写成固定工具链路。
- 让 `fitmate_final_response.content` 的 Markdown 规则靠近最终文本字段。
- 保持服务端语义中立，不新增关键词、正则、短句模板、toolName 分支或拼图式运行时状态。

## Non-Goals

- 不新增 `currentRoutineDraft`、当前轮聚合字段、复杂拼图状态或服务端候选编排器。
- 不修改 LangChain runtime 主循环、provider payload 协议、tool wrapper 通用执行、response adapter 或 `/api/chat` route 语义。
- 不改变动作库 repository 查询能力、数据库 schema、训练方案 validator 或用户可见 NDJSON 事件协议。
- 不通过服务端自然语言规则替模型决定 `searchExerciseResources`、`submitVisibleTrainingProposal` 或 `fitmate_final_response` 的调用顺序。

## Design

### 1. System prompt 只保留高层 Agent 合同

默认 system prompt 继续承担通用约束：当前助手身份、provider tool calling、只能使用当前 tool catalog、不能伪造工具结果、结构化终态必须走 `fitmate_final_response`、普通文本可直接收口、安全和非医疗边界、缺事实时自然澄清。

它不再承载完整训练编排细则、动作查询字段说明、`visibleTrainingProposal` payload 细节、Markdown 输出细则、业务 examples 或具体业务 tool 的恢复流程。这些内容迁移到最接近模型决策的位置。

### 2. `searchExerciseResources` description 改为短结构

`searchExerciseResources` 的模型可见说明保留固定段落：`Purpose`、`Use When`、`Do Not Use When`、`Input Source`、`Output Meaning`、`Grounding Rules`。每段只保留少量高优先级规则，重点表达：

- 该 tool 只查询动作库候选，不生成 routine、plan 或最终回答。
- 支持一次性使用多个 `suitabilities` 查询热身、主训练和拉伸候选。
- 未从用户或已验证上下文得到明确肌群时，不应填写 `muscles`。
- 已有可消费候选足以支撑当前输出时，不应继续为了完整 inventory 拆分查询。
- 查询结果是候选事实，不是最终必须全部使用的动作列表。

### 3. Schema description 保留字段边界但不写 workflow

字段 description 应保留模型填参时必须看见的信息，例如枚举含义、字段来源、边界限制、不可复制的旧字段、`candidateCountPerSection` 不是分页 / offset / 最终展示数量。字段 description 不应写“先查 A 再查 B 再提交 C”这类跨字段 workflow，也不应重复 tool description 已经表达的完整停止策略。

### 4. Tool result summary 区分候选事实和查询边界

`searchExerciseResources` 成功返回 `candidateGroups[].exercises[]` 时，模型可见 summary 应表达这些动作是可消费候选事实。查询宽窄、是否 broad query、是否默认查询等只表达为查询边界或诊断维度，不能把可消费候选降级为 `diagnostic`。

如果确实只有空结果、结构失败、不可消费诊断或服务端错误，才可以使用非候选语义。这样模型不会把 broad query 的可用候选误解为“还不能用于提交”的初步诊断。

### 5. `submitVisibleTrainingProposal` 承担结构化收口边界

训练方案结构的收口规则集中在 `submitVisibleTrainingProposal` description / schema description 中表达：动作推荐、一次训练编排和多天计划分别对应 `payload.kind`，候选动作 id 必须来自可见且可被服务端复核的动作事实，`routine` / `plan` 的处方和 schedule 需要由 payload 支撑。

该 tool 的说明应明确：当模型已有足够候选事实支撑当前 `routine` 或 `plan` 时，应提交结构化方案，而不是继续扩大动作库查询。该规则属于业务 finalization tool 的局部说明，不写成通用 system prompt 的固定 tool 流程。

### 6. Decision examples 缩短为链路示例

示例只保留场景、关键 tool input 和收口边界。routine 示例应覆盖首次查询可以一次性传入：

```json
{
  "suitabilities": ["warmup", "training", "stretch"],
  "executionProfile": "gym_equipment"
}
```

当用户没有指定肌群时，示例不填写 `muscles`。示例不得表达成“凡是某个固定用户短句就必须调用某个 tool”的生产规则。

### 7. Markdown 规则靠近最终文本字段

最终正文的 Markdown 细则优先放到 `fitmate_final_response.content` schema description 或等价 structured final response 合同中。system prompt 只保留“最终用户可见正文通过 `fitmate_final_response.content` 提交”的高层规则。

## Alternatives Considered

- **新增当前轮聚合字段或拼图状态**：暂不采用。当前问题主要是模型可见规则分层和 tool 结果语义不清，而不是 runtime 缺少状态容器。新增聚合字段会扩大主链合同和测试面。
- **把更多停止规则塞进 system prompt**：不采用。system prompt 已经过载，继续增加规则会加重注意力衰减。
- **只在 system prompt 声明一次，tool description 写“参见系统提示”**：不采用。模型填 tool input 时最靠近决策的是 tool description 和 schema description，关键边界必须在对应 tool 附近自洽表达。
- **服务端按用户原文阻止重复查询**：不采用。LLM 仍是自然语言语义理解和 tool calling 决策来源，服务端只做结构、权限、事实和预算校验。

## Risks

- 过度压缩 system prompt 可能遗漏真正需要全局约束的规则。实现时需要通过模型可见合同门禁测试确认 provider tool calling、结构化终态、安全和非医疗边界仍存在。
- Tool description 变短后，如果 schema description 没保留字段来源，模型可能填入不受控字段。实现时需要覆盖关键字段 description。
- `factLevel` 语义调整会影响既有测试，需要同步把测试从“broad 等于 diagnostic”改为“有可消费候选等于 candidate，broadness 单独表达”。

## Validation Strategy

- 使用 OpenSpec strict validation 校验 change 文档结构。
- 实现阶段更新 prompt / production catalog / model-visible contract tests，断言 system prompt 不承载业务 workflow，tool description 和 schema description 自洽承载局部边界。
- 更新 `searchExerciseResources` tool tests，覆盖批量 `suitabilities`、未指定 `muscles`、可消费 broad query 候选和 `factLevel` / query boundary 分离。
- 更新 `submitVisibleTrainingProposal` tests，覆盖已有候选后结构化收口边界。
- 更新 final response schema tests，覆盖 Markdown 规则下沉到 `fitmate_final_response.content`。
