# 2026-06-11 20:15:09 CST visible output 旧 tool result context 退休

## 原问题

LangChain 主链已经把结构化训练输出收口到 `submitVisibleTrainingProposal` finalization tool：模型提交 payload，服务端用 schema、数据库动作事实、section 边界和 renderer 投影做确定性校验。但旧 `VisibleOutputValidationContext` 仍保留 `toolResults.fulfillment.satisfied` 视图，`visibleTrainingProposal` validator 也还能从旧 tool result projection 中收集当前 run 动作来源。

这条路径当前没有直接进入 LangChain 模型可见 summary，但会让旧 Agent-era 的“tool result 满足度”概念继续停留在 validator 边界。后续维护者或 AI 容易误以为结构化输出校验仍应该消费旧 `ToolResult.fulfillment.satisfied`，从而把已经收回的业务满足度语义重新接回主链。

## 调整思路

本次不改 `visibleTrainingProposal` schema，也不改 LangChain runtime、prompt、tool catalog 或 `/api/chat`。调整重点是把 terminal output validator 的输入合同收窄为真实需要的服务端事实：

- payload 自身结构；
- PostgreSQL 动作事实；
- 动作发布态和 `allowedSections`；
- 受控 `resourceStore.inventory()` 中的 consumable `visible_training_proposal_fact` provenance。

旧 `toolResults`、`projection.model.groups` 和 `fulfillment.satisfied` 不再是 validator context 的一部分。

## 关键改动

- 删除 `VisibleOutputValidationToolResult` 类型和 `VisibleOutputValidationContext.toolResults` 字段。
- `visibleTrainingProposal` validator 不再从旧 tool result projection 收集动作来源。
- `currentRunSourceDiagnostic` 只基于受控 consumable `visible_training_proposal_fact` resource 判断 provenance 缺失。
- `submitVisibleTrainingProposal` 调用 validator 时不再传 `{ toolResults: [] }`。
- 更新 validator 测试，删除旧 `satisfied` fixture，保留数据库 hard validation 和 resource provenance 覆盖。

## 结果

结构化训练卡片的硬边界保持不变：动作仍必须来自数据库、发布态可用，并符合 `allowedSections`。缺少当前 run provenance 仍只是 diagnostic，不阻断数据库合法训练卡片。不同的是，provenance 不再从任意 tool result shape 推断，避免旧 `fulfillment.satisfied` 语义被重新误用。
