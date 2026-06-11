# Agent 终态 Provenance 与历史方案事实内联

时间：2026-06-07 20:35:48 CST

## 原问题

`visibleTrainingProposal` 之前把“动作必须来自当前 run 可消费事实来源”作为 hard fail。只要模型输出的动作没有正确挂到本轮 tool result / resource 引用上，即使动作在数据库中真实存在、发布态合法、section 也合法，结构化训练卡片仍可能被拒绝。

同时，`inspectVisibleTrainingProposals` 采用 `list_recent -> read_recent` 两步读取历史方案事实，模型必须复制 `factRef`、`messageId`、`resourceId`、`toolResultId` 或 `usedRefs` 等内部 ID。这个要求并不属于健身业务理解，反而扩大了 schema repair 和 grounding 失败面。

## 调整思路

本次把内部引用机制收回服务端：Planner 只输出业务 action、业务结构和用户可见文本；tool result、ResourceStore、历史事实引用和 terminal provenance 由 runtime 自动维护。

核心边界变成：

- `final_answer` / `ask_user` 不再要求或支持 `usedRefs`。
- `tool_call` 不再支持模型手写 `consumes` / `resourceId`。
- `inspectVisibleTrainingProposals(operation = "list_recent")` 一次返回可复用的历史 `visibleTrainingProposal` 压缩业务事实，并由服务端内部登记后续可用事实。
- `visibleTrainingProposal` validator 保留数据库 hard validation：`exerciseId`、发布态、权限和 `allowedSections` 仍必须通过；缺少 current-run 来源只写入 `currentRunSourceDiagnostic`，不再直接 hard fail。
- terminal trace 从 `terminal_grounding` 调整为 `terminal_provenance`，用于审计服务端自动关联的工具结果、可见输出校验和资源状态。

## 关键改动

- 收敛 `AgentAction` schema、action validator、repair feedback 和 prompt contract，删除模型可见的 `usedRefs` / `resourceId` / `toolResultId` / `factRef` / `messageId` 输出要求。
- 调整 `PlannerVisibleToolResult`，模型只看到 `toolName`、`ok`、`projection.model` 和压缩 `fulfillment`，不再看到可复制的 tool result / resource ID。
- 重构 `inspectVisibleTrainingProposals` 为单步 `list_recent`，输出 `facts[]`、`index`、`displayLabel`、`exerciseItems`、`sectionSummary`、`schedule` 等业务事实，不再暴露 `read_recent`。
- 修改 `ResourceContract` 消费逻辑，由服务端基于 tool contract 和 ResourceStore 自动匹配可消费资源。
- 更新聊天链路、trace/progress、terminal failure finalizer 输入和相关 tests，确保旧内部引用字段只作为负向 repair 样例出现。

## 结果

模型不再需要复制内部 ID 才能完成普通回答、历史方案复用或训练卡片交付。服务端继续负责确定性校验、权限隔离、数据库事实复核、ResourceStore 和 trace provenance；语义选择仍由模型基于业务事实完成，没有新增用户短语、关键词或 `toolName` 特判。
