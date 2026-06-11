## Context

当前生产 `/api/chat` 已迁移到 `LangChain Agent Runtime + @langchain/deepseek + DeepSeek native tool_calls`。迁移后，旧自研 `AgentAction` / `PlannerPort` / `ToolRegistry` 主链已退出生产目标，但迁移过程中把旧 tool observation 和 support section readiness 中的部分业务决策提示重新放进了 LangChain 模型可见层。

这导致两个问题叠加：

1. Tool result summary 又开始表达业务目标满足度，例如 `fulfillment.satisfied=false`。这会让模型把“查询事实是否完成”和“用户目标是否完成”混在一起。
2. Tool description / model-visible summary 又开始写下一步 workflow，例如“缺少 warmup / stretch 应继续查询”“若要交付应通过结构化收口工具”。这让服务端模型可见层替模型选择后续动作，违背“模型负责选择干什么，服务端只做确定性校验”的边界。

具体失败 trace 中，模型实际已经拿到热身动作事实，但因为模型可见 summary 把 warmup-only 查询打成 `fulfillment.satisfied=false`，又把普通建议推向结构化收口，而结构化 validator 又不接受 warmup-only routine，最终形成重复查询和预算耗尽。这是模型可见合同失衡，不是单个文案缺失。

## Goals / Non-Goals

**Goals:**

- 恢复 LangChain tool model-visible summary 的事实边界：表达执行事实、查询事实、受控业务事实、结构化 diagnostics，不表达业务目标满足度。
- 恢复 tool description 的能力边界：描述 tool 能做什么、输入从哪里来、输出是什么事实，不描述固定业务 workflow 或下一步必须调用哪个 tool。
- 恢复默认 prompt 的通用边界：普通文本建议可以基于成功事实直接回答；结构化训练结果才进入 finalization / validator。
- 恢复 finalization tool 的边界：`submitVisibleTrainingProposal` 只负责提交结构、接受服务端 validator、返回 accepted / rejected 事实，不负责指挥补查流程。
- 建立重复同参成功 tool call 的通用 runtime 保护，避免模型重复请求已存在事实时依赖大预算耗尽收场。
- 用负面测试固定边界，禁止再次引入 `fulfillment.satisfied`、`visibleDeliveryBoundary`、`supportSectionCompletionBoundary` 和固定 workflow 文案。

**Non-Goals:**

- 不新增业务 tool。
- 不修改动作库查询的数据库 hard filter 语义。
- 不修改 `visibleTrainingProposal` payload schema、renderer、事实桥或持久化结构。
- 不修改 `/api/chat` route 的请求 schema、认证、权限或 NDJSON 白名单事件合同。
- 不新增服务端自然语言意图判断、关键词分流、正则、同义词表、用户短句模板或具体 phrasing 兜底。
- 不把“健身前应该怎么热身？”这类具体用户原话写进生产 prompt 或 runtime 分支。

## Decisions

### 1. Tool model-visible summary 只表达事实，不表达业务满足度

选择：所有 LangChain tool 的 `toModelVisibleSummary()` 只能输出以下类别：

- 执行状态事实，例如成功、失败、schema invalid、handler error。
- 查询事实，例如 `query`、`filters`、`totalMatches`、`returnedCount`、`truncated`。
- 业务数据事实，例如有限动作摘要、`groups`、`sectionSummary`、`availableSections`、`missingSections`。
- 确定性 diagnostics，例如非法 enum、section 不匹配、动作不存在、字段路径错误。
- 输出事实等级，例如 `factLevel` 可以表达 `diagnostic`、`query_facts`、`resolved_candidates`、`validated_output` 等事实类型，但不能表达用户目标是否完成。

禁止：`fulfillment`、`satisfied`、`fulfillment.satisfied`、`visibleDeliveryBoundary`、`supportSectionCompletionBoundary`、`nextActionHints`、`finalAnswerSupport`、`supportsSuccessfulVisibleOutputs`、固定 “must call / should call next” workflow 文案。

理由：Tool 执行成功与业务目标完成不是同一件事。0 条查询、warmup-only 查询、候选不足都可能是有效事实，模型可以基于事实解释、澄清、继续查询或直接回答。服务端不应把这些事实提前包装成目标未满足。

### 2. `searchExerciseResources` 收敛为动作库事实查询

选择：`searchExerciseResources` 模型可见摘要保留事实字段：

- `query`
- `filters`
- `groups`
- `sectionSummary`
- `availableSections`
- `missingSections`
- `diagnostics`
- `totalMatches`
- `returnedCount`
- `truncated`

它不得返回：

- `fulfillment`
- `satisfied`
- `visibleDeliveryBoundary`
- `supportSectionCompletionBoundary`
- `routinePlanCompositionBoundary`
- `exerciseSelectionRelation`
- “若要交付应调用结构化收口工具”
- “缺少 warmup 或 stretch 应继续查询”

理由：动作查询 tool 只回答“数据库里有哪些符合条件的动作事实”。是否需要再查其他 section、是否输出普通建议、是否提交结构化训练结果，应由模型基于用户目标、当前事实和可见工具能力自主判断。

### 3. Tool description 不写完整编排流程

选择：LangChain tool description / schema description 只围绕稳定能力组织：

- Purpose：这个 tool 查询、读取、解析、校验或提交什么资源。
- Input Source：字段来自用户明确表达、当前上下文、当前 tool result summary、受控业务事实、schema enum 或模型可解释推断。
- Output Meaning：输出是什么事实，哪些字段可作为后续结构化输入的事实来源。
- Deterministic Boundary：服务端会校验哪些确定性边界。
- Do Not Use When：本 tool 不承担哪些能力。

禁止在 description / schema description 中写：

- 用户短句触发规则。
- 具体 `toolName` 调用顺序。
- “先查 A，再提交 B”的固定 workflow。
- “缺少某业务 section 时应继续调用某 tool”的补查流程。
- “正文不能替代结构化收口”这类跨 tool 的完整交付编排长规则。

理由：Tool description 讲能力，Planner policy / system prompt 只讲通用边界，模型负责规划。业务 tool 局部说明可以说“本 tool 输出不是最终卡片”，但不能替模型决定下一步。

### 4. 普通文本建议不强制结构化卡片

选择：默认 system prompt 必须允许普通文本建议基于成功事实直接回答。只有满足以下条件时才要求通过结构化收口能力提交：

- 用户明确请求生成用户可见、可后续引用、可渲染的训练卡片、routine 或 plan；或
- 模型选择输出需要进入服务端 validator 和用户可见结构化投影的训练结果；或
- 当前产品合同明确该输出必须作为 `visibleTrainingProposal` 等结构化业务事实保存 / 渲染。

普通解释、注意事项、动作名称建议、热身方法说明、筛选结果说明，可以用 `fitmate_final_response.content` 直接回答，前提是事实来源合法且没有伪造 tool result。

理由：不是所有“一组动作建议”都等同于训练卡片。把普通建议一律推向 `submitVisibleTrainingProposal` 会让 warmup-only、stretch-only、解释性回答被结构化 routine / plan validator 错误约束。

### 5. `submitVisibleTrainingProposal` 只描述 finalization 能力和 validator 边界

选择：`submitVisibleTrainingProposal` 的模型可见说明只描述：

- 该 tool 提交 `visibleTrainingProposal` 结构。
- accepted 表示服务端 validator 接受并生成可渲染投影。
- rejected 表示结构、动作数据库事实、section、prescription、schedule 或 renderer 边界未通过。
- rejected summary 可以返回错误 code、path、expected、actual、allowedValues、section coverage 和 diagnostics。

禁止描述：

- 缺少 warmup / stretch / training 时必须调用 `searchExerciseResources`。
- 继续补查 support section 的固定流程。
- 指挥模型“重新调用某 tool”。
- 根据具体业务字段组合替模型选择下一步。

理由：finalization tool 是结构化收口和 validator 的边界，不是 planner。它可以告诉模型“哪些确定性校验失败”，不能告诉模型业务上下一步必须怎么做。

### 6. 重复同参成功调用采用通用事实复用反馈

选择：LangChain runtime 在同一 run 内对同一 `toolName + toolVersion + normalizedInputHash` 的重复成功调用提供通用保护：

- 如果已有成功结果，runtime 不再重复执行 handler。
- runtime 返回可恢复反馈，表达该同参工具调用已经产生过成功事实，重复调用不会产生新的事实。
- 反馈可以引用可见事实摘要或稳定事实状态，但不得暴露内部引用 id，也不得要求模型下一步调用具体业务 tool。
- 该保护必须通用于所有业务 tool，不写具体用户 phrasing、业务 `toolName` 语义分支或字段组合特判。

理由：重复同参调用是 runtime 通用幂等 / 预算问题，不是动作查询业务问题。用通用重复调用反馈可以避免模型连续撞 per-tool limit 或总预算，同时不替模型选择后续业务动作。

## Abstraction Gate Result

结论：可继续。

1. 抽象问题类型：模型可见 tool result summary 越界、tool description 承载 workflow、普通文本回答与结构化业务交付边界混淆、重复同参 tool call 缺少通用可恢复反馈。
2. 通用合同修复：收口 LangChain model-visible summary、tool description、system prompt、finalization feedback 和 runtime duplicate-success 反馈。
3. 业务 tool 局部说明：`searchExerciseResources`、`resolveExerciseResourceMentions`、`inspectVisibleTrainingProposals`、`submitVisibleTrainingProposal` 只作为各自 tool 的能力和事实边界出现。
4. 回归测试样例：可以包含本次 warmup-only 查询 trace 和等价语义变体，但测试样例不得反向决定生产规则。
5. 服务端语义分流检查：不得新增关键词规则、自然语言模板路由、phrasing 特判或具体 `toolName` 语义分支。

## Risks / Trade-offs

- [Risk] 删除业务下一步提示后，模型可能偶发少调用结构化收口 tool。  
  Mitigation: 只在通用 prompt 和 finalization tool description 中保留结构化输出必须经 validator 的能力边界，同时用回归测试覆盖结构化训练结果目标。

- [Risk] 过度删除导致模型看不懂工具输出事实用途。  
  Mitigation: 保留事实等级、section 覆盖、`allowedSections`、diagnostics、accepted / rejected 等确定性事实，但不写下一步 workflow。

- [Risk] 重复同参保护被误写成具体业务 tool 特判。  
  Mitigation: 以 `toolName + toolVersion + normalizedInputHash` 作为通用 key，测试覆盖至少两个无关 tool，禁止用户原文和业务字段组合分支。

- [Risk] 现有测试已经反向固化错误字段。  
  Mitigation: 将这些测试改为负面断言：不包含 `fulfillment`、`satisfied`、`visibleDeliveryBoundary`、`supportSectionCompletionBoundary` 和固定 workflow 文案。

## Validation Plan

- 运行 `openspec validate restore-langchain-model-visible-contract-boundaries --strict`。
- 运行 LangChain tool contract tests，覆盖 `searchExerciseResources`、`resolveExerciseResourceMentions`、`inspectVisibleTrainingProposals`、`submitVisibleTrainingProposal` 的 model-visible summary 禁止项。
- 运行 prompt / catalog 测试，覆盖 tool description / schema description 不包含固定 workflow 文案。
- 运行 runtime tests，覆盖重复同参成功调用不会重复执行 handler，也不会烧到 `maxModelCalls` / 总 tool budget。
- 运行 `npm run typecheck`。
- 使用 `rg` 做最终禁止项扫描，确认生产 prompt、tool description、schema description、summary、失败反馈和测试快照没有重新引入被禁字段。
