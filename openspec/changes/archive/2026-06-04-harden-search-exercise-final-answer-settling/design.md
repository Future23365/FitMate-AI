## Context

当前 production 文本聊天已经接入 `searchExerciseResources`、动作刷新事实桥和 `readRecentExerciseRecommendationFact`。最新 trace 的失败链路是：

- 用户输入为“换一个”，当前 run metadata 中存在真实 `recentExerciseRecommendationFacts`，包含 `factRef: cmpya4if90000jvnbfafoidzn` 和上一轮 `messageId`。
- Planner 第 1 轮调用 `readRecentExerciseRecommendationFact`，input 为该真实 `factRef + messageId`，读取上一轮用户可见动作事实并产出 `ok=true`、`fulfillment.satisfied=true` 的结果。
- Planner 第 2、3 轮没有基于已有 read result 转向 `searchExerciseResources.excludeExerciseIds`、`final_answer` 或 `ask_user`，而是继续调用同一个 `readRecentExerciseRecommendationFact` 和同一个 `factRef`。
- 第 3 轮重复读取导致当前 run 内重复登记同一 consumable resource，最终触发 `Resource id is already registered in the current run.`，以 `invalid_action` hard failure 收口。

这次问题的核心不是“调用次数上限不够”，也不是需要服务端用“换一个 / 换一批”关键词替模型判断语义。真正根因是模型实际可见合同缺少 read/import 成功后的状态迁移：

- `run.metadata.recentExerciseRecommendationFacts` 每轮都会继续可见，模型容易再次复制同一个 `factRef`。
- `readRecentExerciseRecommendationFact` 的 `whenToUse` 使用了“user asks for another batch, a refresh, or no repeated exercises”这类表达，容易被模型理解成只要用户请求刷新就应先 read，而不是由 Planner 判断是否需要复用上一轮用户可见动作事实。
- `readRecentExerciseRecommendationFact.toModelObservation` 成功后给出完整 `displayedExercises` 和完整 `query`，但没有明确声明“该 fact 已在当前 run 导入，不要再次 read 同一 fact；下一步可使用 `displayedExerciseIds` 作为 `searchExerciseResources.excludeExerciseIds`，或基于现有结果收口”。
- 完整 `query` / observation 还可能把 `maxReturned` 等 output-only 字段通过嵌套结构继续暴露给模型，使 output-only 字段污染下一轮 input。
- runtime 目前只对重复非重试失败熔断；重复成功同参调用只记录 trace，仍会再次执行 handler 并尝试登记资源。

任务分类：

- 主类型：Agent tool bug 修复 + prompt / model input 合同修复。
- Prompt 修改类型：单个业务 tool 模型可见说明、模型 observation 投影、compressed tool results、repair / feedback 合同。
- core contract 变更：不新增业务特例；只允许通用重复成功 tool call feedback 兜底能力。
- production 接入变更：不改变 `/api/chat` 主路由，不新增服务端自然语言分流。

允许触碰模块：

- `readRecentExerciseRecommendationFact` 的 `description`、`whenToUse`、`whenNotToUse`、schema description、examples 和 `toModelObservation`。
- `searchExerciseResources` 的 model observation、manifest 文案、schema description 和 examples。
- 通用 Agent runtime 中重复 tool call 诊断 / feedback 的窄口模块，前提是实现不写业务 `toolName` 分支。
- observation / compressed tool results / model input builder 的安全投影测试；如实现需要改压缩策略，只能保持通用，不写业务 tool 特例。
- 与 manifest、schema summary、runtime feedback、chat service 回归相关的自动化测试。
- 本 change 的 OpenSpec 文档。

禁止触碰模块：

- 不修改 `PlannerPort` 接口、Executor 主流程、Policy Guard、Resource Contract Validator 或 Response Renderer 主流程。
- 不在 `/api/chat`、chat service、Agent core 或 tool handler 中使用关键词、正则、同义词表或短句模板判断“换一批 / 更多 / 推荐”等自然语言语义。
- 不把 `readRecentExerciseRecommendationFact` 做成隐藏刷新编排器。
- 不把 `searchExerciseResources` 改成分页工具、候选集合 builder、训练生成工具、保存工具或隐藏业务编排器。
- 不把 `maxReturned`、`limit`、`take`、`offset`、`page` 或 `pageSize` 开放给 LLM 输入控制。

## Goals / Non-Goals

**Goals:**

- 让 `readRecentExerciseRecommendationFact` 的模型可见合同表达“可考虑读取”的能力边界，而不是表达成“用户要求换一批就调用”。
- 成功读取同一 fact 后，Planner 可见 observation 必须清楚表达该 fact 已在当前 run 导入，不应再次 read 同一 fact。
- 成功 read/import 后，Planner 应能基于当前 run 已有 `toolResultId`、`displayedExerciseIds` 和必要筛选摘要，转向 `searchExerciseResources.excludeExerciseIds`、`final_answer` 或 `ask_user`。
- 避免 `readRecentExerciseRecommendationFact` 和 `searchExerciseResources` 的模型可见 observation 把 `maxReturned` 等 output-only / 服务端内部上限字段表达成可复制 input。
- 当同一 run 中重复调用同一 `toolName + toolVersion + normalizedInputHash` 且已有成功满足结果时，runtime 生成结构化 feedback，要求 Planner 基于既有结果收口或提出新的合法 action。
- 保持严格 schema，继续拒绝未知字段、分页字段和服务端内部控制字段。

**Non-Goals:**

- 不让服务端判断用户是否要求“换一批”“更多”或“排除已展示动作”；这些仍由 Planner 语义理解。
- 不强制模型必须使用 `readRecentExerciseRecommendationFact`、`searchExerciseResources` 或任何具体 tool。
- 不强制模型推荐哪些具体动作，不在服务端生成用户可见回答内容。
- 不新增 `limit`、`page`、`pageSize`、`take`、`offset` 或 `maxReturned` 作为 LLM 可控输入。
- 不修复数据库迁移、动作事实持久化或跨 run 刷新事实桥的其他问题。
- 不新增训练计划、routine / plan / artifact 写入能力。

## Decisions

### Decision 1: `readRecentExerciseRecommendationFact` 的 whenToUse 改为模型判断条件

`readRecentExerciseRecommendationFact` 的模型可见说明应表达：

- Planner 只有在判断当前用户目标需要复用当前 run metadata 中真实可见的上一轮动作推荐事实时，才考虑调用该 tool。
- `factRef` / `messageId` 只能从 `run.metadata.recentExerciseRecommendationFacts` 中复制，不能编造。
- 该 tool 的目的只是把上一轮用户可见动作事实安全导入当前 run，用于后续排除重复动作或解释刷新边界。

它不得表达成“用户说换一批 / 换一个 / 再推荐一批就调用本 tool”。这些自然语言语义由模型判断，服务端和 manifest 只提供能力边界。

理由：模型重复调用不是因为不知道工具存在，而是因为模型可见合同把“有 fact + 用户刷新”表达得太像固定触发条件。修复应提升模型判断边界，而不是把关键词路由写进服务端。

### Decision 2: 成功 read/import observation 必须表达状态迁移

`readRecentExerciseRecommendationFact.toModelObservation` 成功后应投影最小、面向下一步决策的摘要：

- `status: "succeeded"`。
- `factRef` / `messageId`。
- `displayedExerciseIds`。
- 必要的可复用查询筛选摘要，例如 `appliedFilters`、`bodyRegions`、`suitability`、`published`、`sort`。
- 明确该 fact 已在当前 run 成功导入，后续不要再次调用同一 `factRef` 的 read/import tool。
- 明确下一步可选方向：使用 `searchExerciseResources.excludeExerciseIds` 查询新动作，或基于已有结果输出 `final_answer` / `ask_user`。

该 observation 不应投完整 `displayedExercises`、完整 `query` 或 `maxReturned` 等 output-only 字段。完整事实可留在原始 tool result、trace 或 ResourceStore summary，但模型可见投影必须服务于下一步决策。

理由：模型真正缺的是“当前 run 已完成 read/import，下一步怎么走”。投一大块事实字段会稀释执行合同，还可能在压缩时把关键状态迁移信息挤掉。

### Decision 3: `searchExerciseResources` 继续收紧 output-only 字段边界

`searchExerciseResources.toModelObservation` 不应把 `maxReturned` 作为普通顶层字段暴露给 Planner；如果保留输出上限信息，必须以明确 output summary 表达，不能出现在 input schema、examples 或可复制 input 片段中。

`searchExerciseResources` 的 description / whenToUse / whenNotToUse / schema description 应表达：

- input 只包含结构化筛选字段和受控排除字段。
- `maxReturned`、`returnedCount`、`totalMatches`、`truncated` 是 output summary。
- 已有成功且 `satisfied=true` 的结果可以通过 `final_answer.usedToolResultIds` 支撑普通回答。
- 需要新结果集合时，Planner 应改变结构化 input，例如使用合法 `excludeExerciseIds` 或调整筛选字段，而不是重复同参查询。

理由：`maxReturned` 是服务端固定输出上限，不是用户意图或可执行筛选条件。trace 已证明 output-only 字段容易被模型照抄回 input。

### Decision 4: 重复成功同参调用走通用 runtime feedback 兜底

runtime 在执行 tool 前已经能计算 normalized input hash 并记录重复调用。该能力应扩展为：

- 如果同一 `toolName + toolVersion + normalizedInputHash` 已经产生 `ok=true && fulfillment.satisfied=true` 的结果；
- 且 Planner 又请求相同调用；
- runtime 不再执行 handler，也不消耗真实 tool call，不再次登记 resources；
- runtime 生成结构化 `AgentDecisionFeedback`，引用首次成功 `toolResultId`、重复次数和建议的合法收口方向，例如基于既有 result 输出 terminal action，或提交改变后的合法 tool input。

该 feedback 是确定性执行合同，不基于用户原文判断语义，也不替模型写回答。

理由：主要修复在模型可见状态迁移；runtime feedback 只做安全网，防止模型错误继续扩大为 handler 重复执行、资源重复登记、预算浪费或 hard failure。

### Decision 5: 通用 prompt 只补稳定状态迁移合同，不写业务 toolName 特例

如果需要调整通用 Agent prompt，只能补稳定合同，例如：

- 成功且 `satisfied=true` 的 tool result 已经可用于下一步决策。
- 不要重复调用相同 tool 和相同 input 来获取同一事实。
- 需要新事实时必须改变合法 input 或使用当前可见的其他合法 tool。

不得把 `readRecentExerciseRecommendationFact` 或 `searchExerciseResources` 的专属语义写进通用 prompt。

理由：业务 tool 的能力边界属于 manifest / observation；通用 prompt 只负责 AgentAction、tool loop、resource、grounding 和 repair 的稳定规则。

### Decision 6: 回归测试必须覆盖模型实际可见输入

测试应覆盖：

- `readRecentExerciseRecommendationFact` manifest 不把“换一批”表达成强制触发条件。
- 成功 read/import 后的 observation 明确当前 fact 已在当前 run 导入，且指导 Planner 使用 `displayedExerciseIds` 进入 `searchExerciseResources.excludeExerciseIds`、`final_answer` 或 `ask_user`。
- 成功 read/import observation 不包含完整 `displayedExercises`、完整 `query` 或 `maxReturned`。
- `searchExerciseResources` 拒绝 `maxReturned` input，manifest / schema summary 不把 `maxReturned` 表达为 input 或 example。
- runtime 对重复成功同参调用生成结构化 feedback，不再次执行 handler，不再次登记 resources。
- production chat 回归覆盖“换一个 + recent fact + 重复 read/import”不会触发 `Resource id is already registered in the current run.`。

理由：本次根因在模型实际可见输入与 runtime loop 共同作用；只测 handler 成功路径或只测重复调用次数不够。

## Risks / Trade-offs

- [Risk] 模型不再被强烈提示 read/import，可能在刷新场景直接回答或澄清。→ Mitigation: manifest 保留能力说明和真实 fact 来源，但明确由 Planner 判断是否需要复用上一轮事实。
- [Risk] 精简 read/import observation 后模型缺少动作名称细节。→ Mitigation: 刷新排除只需要 `displayedExerciseIds` 和必要筛选摘要；用户可见详情可由后续 `searchExerciseResources` 结果或 final answer 使用的 tool result 支撑。
- [Risk] 移除 `maxReturned` 后模型不知道结果被服务端截断。→ Mitigation: 保留 `returnedCount` 和 `truncated` 等 output summary，但不暴露可复制输入字段。
- [Risk] 重复成功 feedback 过早阻止模型刷新。→ Mitigation: 只在 normalized input 完全相同且已有 satisfied result 时触发；如果 Planner 改变筛选条件或使用 `excludeExerciseIds` 等合法字段，则不触发。
- [Risk] feedback 文案被误解成强制 final_answer。→ Mitigation: feedback 只说明已有同等成功结果，并要求选择合法 terminal action 或改变后的合法 tool input；最终语义仍由 Planner 决定。
- [Risk] 通用 runtime feedback 需要触碰 agent-core。→ Mitigation: 限定为已有重复调用诊断附近的窄口扩展，不改 `PlannerPort`、Executor 主流程、Policy Guard、Resource Contract Validator 或 Response Renderer 主流程。
- [Risk] 黑盒模型仍可能输出非法 input。→ Mitigation: 严格 schema 和 repair budget 继续保留；新增 feedback 只降低重复成功查询造成的失败概率，不取消确定性校验。

## Migration Plan

1. 更新 OpenSpec artifacts 并验证。
2. 先补测试，复现“换一个 + recent fact + 成功 read/import 后重复同参 read/import -> resource 重复登记 hard failure”的失败形态。
3. 调整 `readRecentExerciseRecommendationFact` manifest、schema description、examples 和 model observation，表达模型判断条件与成功后的状态迁移。
4. 调整 `searchExerciseResources` model observation 和 manifest / schema description，继续收紧 output-only 字段边界和 final grounding 说明。
5. 在通用重复 tool call 诊断窄口增加“重复成功同参调用”结构化 feedback。
6. 运行 tool-level、manifest、contract helper、runtime / chat 回归、typecheck 和 OpenSpec validate。
7. 检查 diff，确认没有服务端关键词分流、没有业务 toolName core 特判、没有分页输入开放、没有无关数据库或训练生成改动。

回滚策略：如 runtime feedback 引发异常，可回滚通用 feedback 扩展，但保留 manifest / observation 状态迁移修复；不会影响数据库结构或用户数据。

## Open Questions

无。
