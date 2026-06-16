## Context

生产 `/api/chat` 使用 LangChain Agent Runtime 和 DeepSeek native `tool_calls`。Runtime 已经能在某个业务 tool 连续调用达到 `maxToolCallsPerTool` 后，从后续 provider request 的 `tools` 列表中移除该 tool，并在模型仍返回已移除 tool call 时拒绝执行 handler。

当前缺口在模型可见合同：默认 system prompt 只说“只能使用当前 LangChain tool catalog 暴露的工具”。这容易被理解为静态 production catalog，而不是本次 provider request 实际传入的 `tools` schema。模型在历史消息中看到过某个 `toolName` 后，即使后续 request 已不再暴露该工具，也可能继续生成旧 tool call。

## Goals / Non-Goals

**Goals:**

- 让默认 LangChain Agent prompt 明确：每次工具调用只能来自当前 provider request 实际暴露的 `tools` schema。
- 明确历史消息、历史 `tool_calls` 或历史 tool result 不能证明某个 `toolName` 当前仍可调用。
- 保留当前 runtime 执行前拒绝作为硬边界，降低模型重复调用已移除工具的概率。
- 使用通用规则覆盖未来新增 tool，不写死 `searchExerciseResources` 或任何业务 tool。

**Non-Goals:**

- 不修改 LangChain runtime 主循环、provider payload builder、production tool catalog、tool wrapper handler 或 `/api/chat` route。
- 不向主模型注入不可用工具列表或不可用原因。
- 不新增服务端关键词、正则、同义词、短句模板或具体业务 `toolName` 分支。
- 不改变 `maxToolCallsPerTool`、`maxToolCalls` 或 `maxModelCalls` 的执行语义。

## Decisions

### 1. 将规则放在默认 system prompt 的工具边界段

选择：在现有“服务端边界”附近补充短句，表达当前 provider request `tools` schema 是唯一可调用工具目录，历史中出现过但当前未暴露的 `toolName` 不可调用。

理由：`docs/llm-prompt-guidance.md` 将“工具只能来自当前 tools”归为 System Prompt 适合承载的最高级行为约束。该规则稳定、通用，不依赖业务 tool 或当前 trace。

替代方案：把不可用工具和原因作为 runtime context 注入主模型。暂不采用，因为这会把已循环的工具名再次放入模型注意力，可能干扰收口。不可用工具和原因保留在 trace、失败 execution 和 terminal failure finalizer 输入中。

### 2. 不改 runtime 执行边界

选择：继续使用现有 `CurrentRequestToolAvailabilityState` 和执行前拒绝作为确定性硬边界，本 change 只补模型可见 prompt 合同。

理由：模型提示不能替代服务端校验。即使 prompt 已明确当前 request tools 边界，provider 仍可能生成历史 `toolName`，runtime 必须继续拒绝执行未暴露工具。

替代方案：在 runtime 中为具体业务 tool 增加分支或直接改写 provider tool call。拒绝原因是这会违反 Agent 边界：服务端不能根据具体业务 tool 或用户自然语言改写模型 action。

### 3. 测试只断言通用合同，不引入 case-specific 规则

选择：更新 prompt 测试，断言 system prompt 包含“当前 provider request 实际暴露的 `tools` schema”和“历史 `toolName` 不代表当前可调用”的通用表达，并继续断言不包含 `toolName =` 等特判形态。

理由：该测试覆盖本次修复类别，同时防止把当前 trace 的具体业务 tool 升级成通用规则。

## Risks / Trade-offs

- [Risk] 只补 prompt 不能保证模型绝不输出历史 toolName。→ Mitigation: 保留 runtime 执行前拒绝，测试覆盖 prompt 合同和 runtime 现有行为。
- [Risk] 规则过长会稀释 system prompt。→ Mitigation: 只增加两条短句，不列不可用工具清单，不解释具体业务 case。
- [Risk] 未来新增 tool 后忘记更新 prompt。→ Mitigation: prompt 使用 `request.tools` / `tools` schema 的通用边界，不依赖具体 tool 名称。
