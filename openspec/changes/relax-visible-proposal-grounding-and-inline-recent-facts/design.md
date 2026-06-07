## Context

当前生产聊天链路中，`visibleTrainingProposal` 的终态输出既要通过数据库动作事实校验，又要通过当前 run 动作来源校验。后者会从本轮 `toolResults` 中收集 `groups.<section>.exercises[]`，再要求最终卡片中的 `exerciseId + section` 必须出现在该来源集合中。这个规则能提供强 provenance，但也让新生成训练卡片过度依赖模型是否按 validator 期望的 section-scoped tool result 组装。

当前 `inspectVisibleTrainingProposals` 也把历史训练方案事实拆成 `list_recent` 和 `read_recent` 两步。`list_recent` 只返回轻量索引，`read_recent` 才读取完整事实并导入 consumable resource。这让模型必须在“是否需要详情、选择哪个 ref、使用 factRef 还是 messageId、读取后如何 grounding”之间连续做多个结构选择，增加了无意义的失败面。

同类问题还存在于通用 Agent 合同：模型可见 `AgentAction` 让 Planner 手写 `usedRefs`、`resourceId`、`toolResultId`、`factRef`、`messageId` 或 `consumes` 等内部引用字段。业务上模型只需要看到训练方案、动作、历史事实和用户约束；这些内部 ID 的真实作用是服务端 provenance、权限、trace 和资源隔离。把它们暴露给 LLM 会扩大 schema / repair 失败面，并让业务正确的输出被引用协议错误阻断。

本 change 属于 Agent core contract、已有 Agent tool 合同、模型可见 prompt/input 和 terminal output validator 的联合调整；不新增业务 tool，不新增 `/api/chat` 语义分流，不把自然语言理解搬到服务端。

## Goals / Non-Goals

**Goals:**

- 让 `visibleTrainingProposal` 新卡片生成以数据库确定性事实作为 hard 校验核心。
- 将“当前 run 动作来源缺失”降级为 provenance / trace diagnostic，不阻断数据库合法、section 合法的结构化训练卡片。
- 将模型可见 `AgentAction` 收敛为业务动作，不再要求 LLM 输出或修复内部 grounding 引用 ID。
- 将 `ResourceStore`、tool result id、历史 fact id 和 terminal provenance 保留为服务端内部机制，而不是 Planner 输出字段。
- 将历史可见训练方案事实读取从 `list_recent -> read_recent` 收敛为一次 `list_recent` 调用，并在服务端内部完成读取、权限校验、状态校验、schema 校验和 consumable resource 登记。
- 更新模型可见合同，减少模型需要选择的操作分支。
- 保持服务端只做结构、权限、数据库事实和可渲染性校验，不引入自然语言语义判断。

**Non-Goals:**

- 不让服务端根据用户原文、关键词、短句模板或同义词判断用户是否要复用历史方案。
- 不让 validator 根据“全身”“不要太难”“20 分钟”等语义约束判断动作质量。
- 不新增隐藏编排 tool，不把 `inspectVisibleTrainingProposals` 做成生成训练方案的 super tool。
- 不改变 `visibleTrainingProposal` payload schema 的业务含义，不引入 A/B 多模板计划或多日不同动作模板。
- 不删除服务端内部 `ResourceStore`、tool result、trace、policy 或 provenance 能力。
- 不允许模型绕过 tool input schema、terminal output validator、权限隔离、数据库事实校验或 Response Renderer。
- 不修改 `/api/chat` 生产入口的语义路由职责。

## Decisions

### 1. 数据库事实是新卡片的 hard grounding

选择：`visibleTrainingProposal` 的新卡片 hard 校验只要求 payload 结构合法、`exerciseId` 通过数据库事实校验、发布态/可展示、当前用户可访问、`section` 被 `allowedSections` 覆盖，且 `prescription` / `schedule` 自洽。

取舍：当前 run 来源仍然有诊断价值，但不再作为新卡片准入条件。这样接受模型直接输出一个数据库中存在且合法的 `exerciseId`，服务端只验证确定性边界，不要求模型先通过 tool result 证明它“见过”这个 ID。

替代方案：继续要求当前 run 来源。该方案 provenance 最强，但会让模型在普通新卡片生成中因为 section-scoped 来源不匹配而失败，和“服务端只守确定性边界”的目标冲突。

### 2. 当前 run 来源降级为 trace diagnostic

选择：保留 `collectCurrentRunExerciseSources` 或等价逻辑作为诊断能力，输出 `current_run_source_missing` 或更明确的 warning metadata，但该结果不得阻断数据库合法的 `visibleTrainingProposal`。

取舍：trace 仍能看到模型是否基于本轮 tool result 组装卡片；生产用户不再因为缺 provenance 被失败兜底打断。

替代方案：完全删除来源收集。该方案更简单，但会损失排查模型是否绕过查询工具的证据。

### 3. `list_recent` 一次导入历史可消费事实

选择：删除模型可见 `read_recent` operation。`inspectVisibleTrainingProposals(operation = "list_recent")` 查询当前 actor 和当前 conversation 中历史已展示 `visibleTrainingProposal`，返回可消费压缩事实，并由 runtime 登记 `visible_training_proposal_fact` consumable resource。

返回给模型的事实应足够支持复用、沿用、替换或派生，至少包含：

- 稳定的事实顺序或用户可理解标签，例如 `index` / `displayLabel`，但不得暴露可复制的 `factRef`、`messageId`、`resourceId` 或 `toolResultId`；
- `proposalKind`、`visibleOutputSchemaVersion`、`factSchemaVersion`；
- `exerciseItems` 的 `exerciseId`、`section`、`order`、`prescription`；
- 必要 `schedule` 摘要；
- 动作展示名、`allowedSections` 和必要有限详情。

取舍：一次调用会比轻量索引占用更多 token，但避免了模型二次读取和 ref 选择失败。可通过限制返回数量、压缩字段、只返回最近 1 到 3 条可消费事实来控制体积。

替代方案：保留 `detailLevel` 或 `includeConsumableFacts` 让模型选择。该方案看似灵活，但仍把“是否需要详情”交给模型，不能解决本次讨论的选择困难。

### 4. run metadata 仍保持轻量状态摘要

选择：`run.metadata.recentVisibleTrainingProposals` 继续只表达当前会话是否存在历史可见方案的轻量状态，不携带完整可消费事实，也不作为训练方案 payload 事实源。需要历史方案事实时，模型仍调用 `inspectVisibleTrainingProposals(operation = "list_recent")`，但不再需要 `read_recent`。

取舍：metadata 保持低成本和低泄漏；真正可消费事实由 tool 统一读取、校验和投影。

### 5. 模型可见 AgentAction 不再承载内部引用

选择：将 Planner 可见 action 形状收敛为业务动作：

- `tool_call` 只包含 `type`、`toolName`、`input` 和可选活动摘要，不让模型手写 `consumes` 或 resource 引用；
- `final_answer` 只包含 `type`、`content`、可选 `suggestedQuestions`、可选 `visibleOutputs` 和可选活动摘要，不让模型手写 `usedRefs`；
- `ask_user` 只包含 `type`、`content`、可选 `suggestedQuestions` 和可选活动摘要，不让模型手写 `usedRefs`。

服务端内部仍可在 runtime result、trace、ResourceStore 和持久化事实中记录 terminal provenance，例如“本回答基于哪些 tool results、哪些可消费历史事实、哪些 validator metadata”。这些 provenance 不进入 Planner 输出 schema，也不要求模型修复。

取舍：这会触碰 Agent core schema、action validator、prompt、adapter、repair 和 tests，范围比单个业务 validator 更大；收益是模型只处理业务内容，内部引用 ID 不再成为业务结果失败原因。

替代方案：继续保留 `usedRefs` 但把它设为可选。该方案仍让模型看到并可能误用内部 ID，repair 也会继续围绕 ID 失败，不能真正消除问题。

### 6. 服务端内部 provenance 仍然保留

选择：不删除 `ResourceStore`、tool result id、policy、trace 或 response rendering 的内部事实链。Runtime 在执行 tool、校验 visible output、调用 finalizer 和写 trace 时继续记录受控来源；只是这些来源由服务端生成和消费，不再由 LLM 填写。

取舍：保持权限隔离、debug 和可审计性，同时减少模型可见合同复杂度。

## Risks / Trade-offs

- [Risk] 模型可以输出数据库中存在但语义质量不佳的动作。→ Mitigation：服务端不做语义 hard fail，动作质量继续通过工具候选、模型可见合同、黑盒测试和后续模型能力优化保障；数据库只守确定性事实。
- [Risk] `list_recent` 返回更多事实导致 prompt token 增加。→ Mitigation：返回受控压缩事实，限制数量，避免完整 UI payload、完整历史消息和冗余 handler output。
- [Risk] 删除 `read_recent` 会影响现有 tests、fixtures 和 manifest 快照。→ Mitigation：在 change tasks 中覆盖 tool-level、manifest、chat-service、validator 和 OpenSpec strict 校验。
- [Risk] 历史方案事实一次导入后被误认为已生成新方案。→ Mitigation：observation 必须明确该 tool 只导入历史事实，最终新方案仍必须由合法 `final_answer.visibleOutputs[]` 承载并通过 validator。
- [Risk] current-run provenance 降级后 trace 证据变弱。→ Mitigation：保留 provenance warning / metadata，便于排查模型是否绕过动作查询。
- [Risk] 移除模型可见 `usedRefs` 后，普通文本回答的来源更依赖 runtime 自动记录。→ Mitigation：runtime / trace summary 自动关联最近成功 tool result、terminal visible output validation metadata 和 failure context；测试覆盖普通文本、结构化卡片、ask_user 和 failure finalizer。
- [Risk] 旧 prompt、repair 或 manifest 残留内部 ID 说明会把模型拉回旧合同。→ Mitigation：tasks 中加入 `rg` 残留检查和 manifest / prompt / schema summary 测试，确保模型可见内容不再要求输出内部 ID。

## Migration Plan

1. 先更新 OpenSpec、模型可见合同和测试期望，固定新边界。
2. 调整 Planner 可见 `AgentAction` schema、action contract、adapter 和 validator，移除 `usedRefs` / `consumes` 等模型手写内部引用字段。
3. 调整 runtime / trace / finalizer summary，使 terminal provenance 由服务端内部生成和记录。
4. 调整 `visibleTrainingProposal` validator，将当前 run 来源 hard fail 改为 non-blocking diagnostic。
5. 调整 `inspectVisibleTrainingProposals` schema / handler / resources / projections，删除模型可见 `read_recent`，并确保模型可见事实不包含可复制内部引用 ID。
6. 同步更新 prompt output contract、tool manifest、examples、repair feedback 和 tests。
7. 运行相关自动化测试和 `openspec validate <change> --strict`。

## Open Questions

- `list_recent` 默认返回最近几条可消费事实需要按 token 预算在实现时确定，建议从 1 到 3 条开始，并受集中配置控制。
- provenance diagnostic 是否继续使用 `current_run_source_missing` code，还是重命名为不带 hard-fail 语义的 warning code，需要实现时结合 trace UI 命名确认。
- runtime 自动 terminal provenance 的 trace 字段名需要实现时确定，建议使用与模型输出字段区分明显的 server-owned 名称，例如 `internalGrounding` 或 `serverProvenance`。
