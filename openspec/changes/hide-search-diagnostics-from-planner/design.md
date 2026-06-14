## Context

生产 `/api/chat` 已使用 `LangChain Agent Runtime + DeepSeek native tool_calls`。`searchExerciseResources` 是只读动作库查询 tool，它的 handler 当前会返回 `candidateGroups` 和 `diagnostics`，并通过 `toModelVisibleSummary` 把两者一起回填给模型。

最近 trace 显示：工具已经成功返回可用动作候选和明确 `exerciseId`，但模型同时看到了 `exercise_name_ambiguous` 诊断文案，误把内部名称歧义诊断理解成候选不可消费，继续重复查询同一 tool，最终触发连续调用上限。该问题不是单个动作名问题，而是内部诊断事实泄漏到 Planner 决策层的问题。

## Goals / Non-Goals

**Goals:**

- 让 `searchExerciseResources` 的模型可见 summary 只暴露可消费候选事实，不暴露原始 `diagnostics`、命中数量、截断状态或内部过滤诊断。
- 保留 `diagnostics` 在 `userProjection`、`traceSummary`、日志和测试中的排查价值。
- 让模型可见合同门禁阻止 `diagnostics` 和嵌套诊断重新泄漏到 Planner-visible summary。
- 在 LangChain runtime 中补通用工具可用性强校验，provider 返回当前 request 未暴露工具时不得执行业务 handler。

**Non-Goals:**

- 不删除 `searchExerciseResourcesOutputSchema.diagnostics` 或 repository/service 层诊断能力。
- 不根据用户原文、关键词、具体动作名、短句模板或业务字段组合改写 provider `tool_calls`。
- 不新增 `searchExerciseResources` 专属 runtime 分支。
- 不改变训练方案生成、动作选择、数据库 schema 或 UI 展示逻辑。

## Decisions

### 1. 将 Planner-visible summary 视为白名单投影

`searchExerciseResources.toModelVisibleSummary` 继续返回 `status`、`factLevel`、受控 `query` 摘要和 `candidateGroups[]`。其中 `candidateGroups[].exercises[]` 只保留模型选择动作所需的有限事实，例如 `exerciseId`、名称、器械/场地展示摘要、`executionTaxonomy` 和肌群摘要。

`diagnostics`、`totalMatches`、`returnedCount`、`truncated`、`filterApplications`、`filterSemantics`、`zeroMatchMuscles` 等内部诊断字段只保留在 `userProjection` 和 `traceSummary`。这比改写单个 `exercise_name_ambiguous` 文案更稳，因为它把内部诊断和可消费候选事实从结构上分开。

### 2. Tool description 同步表达 diagnostics 边界

`searchExerciseResources` 的 description 不再说 Planner-visible 结果包含 `diagnostics`。description 应说明内部 diagnostics 只用于 trace / userProjection，不作为模型成功候选事实。这样模型不会从 tool 能力说明中预期或依赖 diagnostics。

### 3. Contract gate 作为防回归边界

`model-visible-contract-gate` 已递归检查 `searchExerciseResources` summary 的 forbidden keys 和 forbidden text。本次将 `diagnostics` 加入 forbidden key，并补测试覆盖嵌套 JSON 字符串，避免后续通过字符串化 summary 或嵌套对象绕回模型上下文。

### 4. Runtime 使用当前 request tool names 做通用执行拦截

连续调用上限 middleware 会从下一轮 model request 的 `tools` 中移除达到上限的业务 tool。runtime 还需要记录每次 model request 实际暴露的 tool name 集合，并在 provider response 返回后检查 `tool_calls`。如果返回的 `tool_call.name` 不在当前 request 暴露集合中，runtime MUST NOT 执行对应 wrapper handler，并将该 run 归一化为受控 `unknown_tool` / tool failure。

该校验只依赖当前 request 的工具集合和 provider 返回的 tool name，不读取用户原文，也不写具体业务 `toolName` 分支。

## Risks / Trade-offs

- [Risk] 模型失去部分解释空结果的细节。
  Mitigation: 模型仍能看到查询口径和空 `candidateGroups`；具体原因保留在 trace / userProjection，后续如需给模型可恢复失败原因，应新增经过白名单过滤的中性 `availabilityBoundary`，而不是回灌原始 diagnostics。

- [Risk] 现有测试期望 `modelMessage.diagnostics`。
  Mitigation: 更新测试语义，让 `modelVisibleSummary` 断言不含 diagnostics，同时确认 `userProjection` / `traceSummary` 仍保留 diagnostics。

- [Risk] runtime 拦截未暴露工具可能改变已有失败分类。
  Mitigation: 使用现有 `unknown_tool` / tool failure 归一化，不新增业务错误码；补 runtime 单测证明 handler 没执行、trace 有可审计失败。
