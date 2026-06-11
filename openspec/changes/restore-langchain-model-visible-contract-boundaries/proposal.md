## Why

LangChain 迁移后，部分 tool 的 model-visible summary、tool description、失败反馈和 prompt 又重新暴露了已经移除过的业务满足度字段与下一步指导，例如 `fulfillment.satisfied`、`visibleDeliveryBoundary`、`supportSectionCompletionBoundary`，以及“缺少某 section 时应继续查询 / 若要交付应调用结构化收口 tool”这类固定 workflow 文案。

这破坏了当前 Agent / Tool / Prompt 分层：模型负责根据用户目标、上下文和工具事实自主选择做什么；服务端只负责 schema、权限、数据库事实、预算、受控投影和结构化输出 validator 这些确定性边界。Tool result 只能暴露事实、约束和诊断，不能替模型判断业务目标是否完成，也不能指导模型下一步必须调用哪个 tool。

本 change 目标不是删除单句提示，而是重新收口 LangChain 迁移后的模型可见合同，恢复“Tool 给事实，Prompt 给通用边界，Validator 守确定性校验，模型自主规划”的边界，并用测试防止后续迁移或局部修复再次把旧问题加回来。

## What Changes

- 统一删除 LangChain tool model-visible summary 中的业务目标满足度字段，尤其是 `fulfillment`、`satisfied`、`fulfillment.satisfied`。
- 收口 `searchExerciseResources` 模型可见摘要：只返回事实类字段，例如 `query`、`filters`、`groups`、`sectionSummary`、`availableSections`、`missingSections`、`diagnostics`；不返回 `visibleDeliveryBoundary`、`supportSectionCompletionBoundary` 或固定结构化收口提示。
- 收口所有 LangChain tool description / schema description / model-visible summary：只描述稳定能力、输入来源、输出事实和确定性边界，不写“下一步应调用哪个 tool”、固定 workflow、用户短句触发规则或业务补查流程。
- 收口默认 system prompt：普通文本建议允许基于成功事实直接回答；只有明确需要用户可见、可后续引用并需要服务端 validator 的结构化训练结果时，才通过结构化收口能力提交。
- 收口 `submitVisibleTrainingProposal` 模型可见说明：只描述 finalization 能力、输入结构、accepted / rejected 含义和 validator 确定性边界，不指导模型补查 warmup / stretch / training 或按固定流程重试。
- 建立通用重复 tool input 合同：同一 run 内同 tool、同版本、同归一化 input 已成功时，runtime 不应反复执行 handler 或烧到总预算；应提供事实已存在的可恢复反馈，并保留模型自主选择澄清、回答或调用其他合法工具的空间。
- 补充负面测试门禁，确保模型可见 summary、tool description、schema description、失败反馈和 prompt 不再包含被禁止字段与固定 workflow 文案。

## Capabilities

### New Capabilities

- `agent-tool-contract-kernel`: LangChain tool model-visible summary 必须保持事实摘要和确定性诊断边界，不得暴露业务目标满足度或下一步 workflow 指令。
- `langchain-agent-runtime`: Runtime 必须对同 run 内重复成功的同 tool / 同版本 / 同归一化 input 提供通用可恢复反馈，避免依赖 20 多轮预算耗尽来终止重复调用。

### Modified Capabilities

- `agent-exercise-resource-query-tool`: `searchExerciseResources` 的模型可见摘要必须收敛为查询事实、分组事实、section 覆盖事实和 diagnostics，不得承载业务满足度、结构化交付指令或 support section 补查流程。
- `agent-llm-prompt-configuration`: 默认 prompt 和模型可见工具说明必须区分普通文本建议与结构化训练结果交付；不得把普通建议强制卡片化，也不得把 tool description 写成完整业务编排。
- `agent-tool-contract-kernel`: `submitVisibleTrainingProposal` 的模型可见说明必须只描述 finalization / validator 边界，不得指导模型继续查询特定业务 tool 或补齐特定训练 section。

## Impact

- 预计影响模型可见合同和对应测试：
  - `lib/server/langchain-agent/prompt.ts`
  - `lib/server/langchain-agent/tools/exercise-resource-tools.ts`
  - `lib/server/langchain-agent/tools/visible-training-proposal-tools.ts`
  - `lib/server/langchain-agent/tools/visible-training-proposal-finalization-tool.ts`
  - `lib/server/langchain-agent/runtime.ts`
  - `tests/langchain-agent-tools/*.test.ts`
  - `tests/langchain-agent-runtime/runtime.test.ts`
- 不修改数据库 schema、前端卡片渲染、Prisma 模型、`/api/chat` 请求 schema 或 response adapter 用户事件合同。
- 不新增服务端关键词、正则、同义词表、用户短句模板、具体 phrasing 特判或具体业务 `toolName` 语义分支。
- 不把失败 trace 中的用户原话写成生产 prompt 规则；具体 trace 只用于回归测试样例。
