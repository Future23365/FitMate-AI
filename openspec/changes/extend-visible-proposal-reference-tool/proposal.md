## Why

最新 trace 暴露了两个同源合同问题：模型在没有可引用上一轮训练方案时把省略表达补全为动作刷新并直接调用 `searchExerciseResources`，同时模型可见 prompt 把 `visibleOutputs[].schemaVersion` 表达成数字 `1`，与服务端字符串 schema 不一致。现在需要把修复点收敛到 tool-first 合同：将现有 `readRecentVisibleTrainingProposal` 重命名并扩展为 `inspectVisibleTrainingProposals`，让模型先查询当前会话是否存在可引用 `visibleTrainingProposal`，再自主判断是否读取最近事实、查询动作、澄清或普通回复。

## What Changes

- 将现有 `readRecentVisibleTrainingProposal` 重命名并扩展为 `inspectVisibleTrainingProposals`，不新增独立 tool，不保留旧 toolName alias：同一个 tool SHALL 支持 `operation = "list_recent"` 和 `operation = "read_recent"`。
- `list_recent` SHALL 返回当前 actor、当前 conversation 可访问的最近 `visibleTrainingProposal` 轻量索引，包括 `factRef`、`messageId`、`proposalKind`、section 摘要、动作数量、可复用训练动作摘要、`visibleOutputSchemaVersion`、`factSchemaVersion` 和状态；不得返回完整 payload、未展示候选或跨用户数据。
- `read_recent` SHALL 保持读取最近可见训练方案事实的职责：按 `list_recent` 返回的真实 `factRef` 或 `messageId` 读取并导入完整可消费事实到当前 run。
- `inspectVisibleTrainingProposals` 的模型可见 `description`、`whenToUse`、`whenNotToUse`、input schema、output schema、examples 和 observations SHALL 清楚表达：当模型需要确认当前是否有可引用可见训练方案时先使用 `list_recent`；当需要复用具体方案时再使用 `read_recent`。
- `searchExerciseResources` SHALL 继续保持只读动作库结构化查询职责，不负责判断当前会话是否已有上一轮推荐，也不替代 `inspectVisibleTrainingProposals` 的 `list_recent` / `read_recent` 事实查询职责。
- 模型调用链 SHALL 由 LLM 根据 tool result 自主决策：`list_recent` 返回空时，模型可选择 `ask_user` 或 `final_answer`；`list_recent` 返回可引用事实时，模型可选择 `read_recent`、再调用 `searchExerciseResources` 刷新候选，或根据用户目标直接收口。
- 服务端 SHALL NOT 根据用户原文关键词、正则、同义词表、短句模板或业务 `toolName` 特判选择 `list_recent` / `read_recent` / search，也不得在 `/api/chat` 中新增刷新语义分流。
- 修正 `visibleOutputs[].schemaVersion` 的模型可见合同：`visibleTrainingProposal` 输出统一使用字符串 `"1"`；prompt、schema summary、examples、业务 observation 和 tests SHALL 不再引导模型输出数字 `1`。通用 `agent-core` repair feedback SHALL 只表达该字段必须是字符串，不硬编码 `visibleTrainingProposal` 的业务版本。
- 保持 `final_answer.visibleOutputs[]` 通用 envelope 的 core 边界：`agent-core` 只校验通用结构和 grounding，不硬编码 `visibleTrainingProposal` 业务语义。
- 回归测试 SHALL 覆盖一组省略 / 指代 / 上下文断裂表达，而不是只覆盖“换一批”单句；测试目标是证明模型能通过 `inspectVisibleTrainingProposals` 查询事实状态后自行规划。

## Capabilities

### New Capabilities
- `visible-proposal-reference-tool`: 定义重命名后的 `inspectVisibleTrainingProposals` `list_recent` / `read_recent` 合同、模型可见说明、结果投影、权限隔离、resource 注册和刷新前事实查询流程。
- `visible-output-schema-version-contract`: 定义 `final_answer.visibleOutputs[].schemaVersion` 的模型可见字符串合同、repair feedback 和回归验证要求。

### Modified Capabilities
- `agent-exercise-resource-query-tool`: 收紧 `searchExerciseResources` 在刷新链路中的职责边界，明确它只查询动作库，不判断当前是否存在上一轮可见训练方案，也不承担事实列表 / 读取职责。

## Impact

- 业务 tool 合同：`readRecentVisibleTrainingProposal` 到 `inspectVisibleTrainingProposals` 的 delete-only 重命名，及新 tool 的 input schema、output schema、handler、policy metadata、resourceContract、`toModelObservation`、`toUserProjection`、trace summary、examples 和 tool-level tests。
- 模型可见输入：Agent system prompt、tool manifest、schema summary、examples、repair feedback、observations、compressed tool results 和 final grounding 说明。
- 生产聊天链路：`/api/chat` 仍只通过 `ToolRegistry -> Planner -> Agent runtime -> Response Renderer` 执行，不新增服务端语义分流。
- `searchExerciseResources`：只更新模型可见职责边界和相关 tests，不把刷新状态查询塞进动作库查询 tool。
- 测试：OpenSpec strict validate、`inspectVisibleTrainingProposals` tool-level tests、tool manifest / prompt contract tests、chat service replay tests、schemaVersion repair/validation tests、architecture boundary scan 和 `npm run typecheck`。
