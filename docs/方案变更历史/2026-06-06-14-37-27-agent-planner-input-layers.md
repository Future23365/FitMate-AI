# Agent Planner 输入分层与 Repair 语境独立化

时间：2026-06-06 14:37:27 CST

## 原方案问题

Planner 模型请求此前把稳定 `AgentAction` 合同、`outputContracts`、当前 run facts、observations、toolResults 和 repair 反馈放在同一层 user payload。长上下文下，模型容易把长期协议当成本轮普通数据，也可能在首轮正常规划时提前受到 repair 规则影响。

同时，部分 output contract 示例把自然语言决策说明写在 `expectedAction`，production tool observation 也包含较长下一步说明和固定流程暗示，容易让模型学习到半截 action 或固定 tool flow。

## 调整思路

本次按 `docs/llm-prompt-guidance.md` 的分层原则拆开模型可见输入：

- `protocol` 承载稳定 `AgentAction` 合同、Planner policy、glossary 和 output contract。
- `context` 只承载当前 run 的事实：run、step、tools、observations 和 toolResults。
- `repairContext` 只在 validator 拒绝上一轮 action 后出现，包含脱敏 failed action、错误 code、字段路径、expected / actual 和 allowed / required 信息。

Tool observation 改为结构化事实摘要，保留事实等级、可消费边界、缺口字段、diagnostics 和短枚举 `nextActionHints`，不再复制长篇全局禁止项或固定 tool flow。

## 关键改动

- `PlannerInput` 增加 `context` 和可选 `repairContext` 类型边界。
- `DeepSeekModelAdapter` 将 `protocol` 渲染到 system message，user payload 只发送 `context` 和可选 `repairContext`。
- request trace summary 增加 `layers.protocol`、`layers.context` 和 `layers.repairContext` 计数摘要。
- `AgentVisibleOutputContractExample.expectedAction` 收紧为完整 `AgentAction` object，自然语言说明迁移到 `expectedDecision`。
- `inspectVisibleTrainingProposals.read_recent.ref` 模型可见来源只指向本轮 `list_recent` 返回的 `factRef` / `messageId`。
- 三个 production tool 的 `toModelObservation()` 瘦身为事实摘要和 `nextActionHints`。
- 架构边界测试补充 planner input layer 的无业务 toolName 分支和无用户文本路由检查。

## 验证结果

- `openspec validate separate-agent-planner-input-layers --strict` 通过。
- 相关 prompt / adapter / repair / manifest / observation 单测通过：9 个测试文件、89 个用例。
- `npm run typecheck` 通过。
- `npm test` 通过：73 个测试文件、494 个用例。
