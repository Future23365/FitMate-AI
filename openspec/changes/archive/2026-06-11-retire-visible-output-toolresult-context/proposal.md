## Why

当前生产 `/api/chat` 已迁移到 LangChain Agent Runtime，`submitVisibleTrainingProposal` 也只通过当前 payload、数据库动作事实和 renderer 投影完成 finalization。但旧 `VisibleOutputValidationContext` 仍保留 `toolResults.fulfillment.satisfied` 视图，`visibleTrainingProposal` validator 也仍能从旧 tool result projection 中收集当前 run 动作来源。

这不会直接造成当前 LangChain 模型可见泄漏，但会让旧 Agent-era 的“tool result 满足度”概念继续停留在结构化输出 validator 边界，增加后续误复用和审查噪音。现在需要把该旧上下文退休，确保 `visibleTrainingProposal` validator 只依赖 payload、数据库动作事实和受控 resource inventory。

## What Changes

- 删除 `VisibleOutputValidationContext` 中的旧 `toolResults` 输入视图，以及对应的 `VisibleOutputValidationToolResult` 类型。
- 删除 `visibleTrainingProposal` validator 从 `context.toolResults` / `projection.model.groups` / `fulfillment.satisfied` 收集动作来源的逻辑。
- 保留 `resourceStore.inventory()` 作为服务端受控、可消费 `visible_training_proposal_fact` 的 provenance diagnostic 来源。
- 保留并强化数据库动作事实校验：`exerciseId` 存在性、发布态和 `allowedSections` 仍是最终训练卡片的硬边界。
- 更新 validator 单测，删除围绕 `toolResults.fulfillment.satisfied` 的 fixture 和断言，改为覆盖无 toolResults context、数据库合法但缺少 current-run resource source、以及 consumable resource 可消除 provenance diagnostic 的场景。
- 更新文档记录，说明旧 tool result 满足度上下文已从结构化输出 validator 退出。
- 不修改 LangChain runtime 主循环、production tool catalog、`/api/chat`、provider payload、模型可见 prompt 或 tool description。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `visible-training-proposal-validation`: `visibleTrainingProposal` validator 的当前 run provenance diagnostic 不再读取旧 `toolResults.fulfillment.satisfied`，只可使用受控 resource inventory 和数据库事实。
- `agent-tool-contract-kernel`: `submitVisibleTrainingProposal` finalization 的 validator context 不得重新接入旧 Agent-era tool result 满足度视图。

## Impact

- 预计影响：
  - `lib/server/visible-outputs/contracts.ts`
  - `lib/server/visible-training-proposals/visible-training-proposal-validator.ts`
  - `lib/server/langchain-agent/tools/visible-training-proposal-finalization-tool.ts`
  - `tests/visible-training-proposal-validator.test.ts`
  - 相关 OpenSpec change 文档和项目演变文档
- 不涉及数据库 schema、Prisma migration、API request / response 契约、用户可见训练卡片 payload schema 或渲染 UI。
- 不新增服务端自然语言关键词、正则、同义词表、短句模板或具体业务 `toolName` 分支。
