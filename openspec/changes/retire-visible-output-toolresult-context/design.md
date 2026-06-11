## Context

当前生产聊天主链使用 LangChain Agent Runtime 和 DeepSeek native `tool_calls`。结构化训练输出通过 `submitVisibleTrainingProposal` 提交 payload，再由 `validateVisibleTrainingProposalOutput()` 校验 schema、数据库动作事实、section 边界和 renderer 投影。

旧自研 Agent 阶段曾把当前 run 的 tool result 作为 terminal output validator 的上下文，其中 `fulfillment.satisfied` 既表达过 tool 执行结果，也被用于判断动作来源是否可消费。LangChain 迁移后，当前 finalization tool 已经传入 `{ toolResults: [] }`，但通用类型和 validator 内部仍保留这条旧入口。它不是当前线上主链的直接泄漏点，但会让后续维护者误以为 structured output validator 仍应消费旧 Agent tool result 满足度。

## Goals / Non-Goals

**Goals:**

- 从 `VisibleOutputValidationContext` 删除旧 `toolResults` 视图和 `VisibleOutputValidationToolResult` 类型。
- 让 `visibleTrainingProposal` validator 的 provenance diagnostic 只读取受控 `resourceStore.inventory()`，不再解析旧 tool result projection。
- 保持 `exerciseId` 数据库存在性、发布态、`allowedSections`、schema、prescription 和 schedule 的硬校验不变。
- 更新测试和 OpenSpec 文档，防止旧 `toolResults.fulfillment.satisfied` 重新进入 validator 边界。

**Non-Goals:**

- 不删除 `visibleTrainingProposal` 功能、payload schema、renderer 或事实桥。
- 不修改 LangChain runtime 主循环、provider payload、production tool catalog、`/api/chat` 或 response adapter。
- 不修改模型可见 prompt、tool description、schema description 或 tool result summary。
- 不处理历史文档和 archived OpenSpec 中对旧 `fulfillment.satisfied` 的描述。
- 不新增服务端自然语言分流、关键词规则或具体业务 `toolName` 分支。

## Decisions

### 1. 删除 validator context 的旧 toolResults，而不是保留 deprecated 字段

选择：直接从 `VisibleOutputValidationContext` 移除 `toolResults`，同步删除 `VisibleOutputValidationToolResult`。

取舍：保留 deprecated 字段能减少测试改动，但会继续让旧 Agent-era 合同停留在结构化输出校验边界。当前生产 LangChain finalization 已不依赖该字段，删除更符合长期维护目标。

### 2. Provenance diagnostic 只读取受控 resource inventory

选择：`currentRunSourceDiagnostic` 只根据 `resourceStore.inventory()` 中 `role = "consumable"` 且 `resourceType = visible_training_proposal_fact` 的摘要收集动作来源。数据库合法但没有对应 resource 的动作仍通过 validator，并在 metadata 中保留 `current_run_source_missing` 诊断。

取舍：这会移除“从当前 search tool projection 推断动作来源”的历史路径。当前 LangChain finalization 入口已经不传 toolResults，因此不会改变生产 accepted / rejected 结果；同时减少 validator 对任意 tool output shape 的耦合。

### 3. 数据库事实仍是最终硬边界

选择：不放宽 `validateVisibleTrainingProposalExerciseFacts()`。无论是否有 resourceStore provenance，最终 payload 里的动作都必须通过数据库存在性、发布态和 `allowedSections` 校验。

取舍：这避免把 cleanup 误做成“只要 resource 存在就可跳过数据库校验”的兼容层。历史可见训练事实也必须在当前数据库状态下重新验证。

### 4. 保留 trace viewer 的历史兼容读取

选择：本 change 不修改 dev trace viewer 读取旧 trace 的 `output.satisfied` 展示逻辑。它是历史数据展示兼容，不是 production validator context。

取舍：这会让全仓搜索仍可能命中 `satisfied`，但避免为了 cleanup 破坏历史 trace 可读性。验证时应区分生产 validator / LangChain 模型可见路径和 dev 历史展示路径。

## Risks / Trade-offs

- [Risk] 某个未发现的旧调用方仍传入 `toolResults`。
  → Mitigation：用 TypeScript 类型检查和 `rg` 扫描发现所有调用点；删除字段后编译会暴露调用方。

- [Risk] 单测 fixture 只删除旧字段，未覆盖新 provenance 路径。
  → Mitigation：保留“数据库合法但无 current-run source 只产生 diagnostic”的测试，并保留 consumable resource 消除 diagnostic 的测试。

- [Risk] 历史 OpenSpec / docs 中仍有 `fulfillment.satisfied` 字样，被误认为本 change 未完成。
  → Mitigation：最终说明中区分历史文档、archived change、现行 spec 和生产代码；不改写历史记录。

## Migration Plan

1. 补 OpenSpec spec delta 和任务清单。
2. 删除旧 context 类型和 validator 中的 tool result source collector。
3. 更新 `submitVisibleTrainingProposal` 调用 context，从 `{ toolResults: [] }` 改为不携带旧字段。
4. 更新 validator 单测和 helper。
5. 运行 OpenSpec validate、相关 validator / LangChain finalization 测试、typecheck。
6. 自动提交本次 cleanup。

## Open Questions

无。
