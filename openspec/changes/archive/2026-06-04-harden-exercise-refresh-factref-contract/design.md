## Context

`support-agent-exercise-refresh-fact-bridge` 已经把刷新链路设计为 Agent-first：`/api/chat` 只恢复最近动作事实摘要，Planner 基于 `recentExerciseRecommendationFacts` 和 tool manifest 决定是否调用 read/import tool，再用 `searchExerciseResources.excludeExerciseIds` 查询新动作。

最新失败暴露的是该合同的窄口缺陷：

- trace 中 `recentExerciseRecommendationFacts: []`，说明本轮没有可复制的真实 fact 引用。
- `readRecentExerciseRecommendationFact` 的 manifest example 暴露 `factRef: "cbf_previous_response"`，模型把它当成真实引用。
- read/import tool 对 store 抛错没有在 handler 内归一，executor 只能转成通用 `handler_error`。
- repair 轮重复同一 tool + 同一 input 后触发 `duplicate_tool_failure`。

任务分类：

- 主类型：Agent tool bug 修复。
- Prompt 修改类型：单个业务 tool 模型可见说明和 examples。
- core contract 变更：不涉及。
- production 接入变更：不涉及 `/api/chat` 主链路语义或路由，只补生产聊天回归测试证明没有服务端关键词分流。

允许触碰模块：

- `readRecentExerciseRecommendationFact` 的 manifest、schema description、handler 失败归一化和 projection。
- 该 tool 的 tool-level tests。
- production registry manifest 测试。
- chat service 回归测试。
- 本 change 的 OpenSpec 文档。

禁止触碰模块：

- 不修改 Agent runtime 主循环、`PlannerPort`、Executor 主流程、Policy Guard、Resource Contract Validator 或 Response Renderer。
- 不在 `/api/chat`、chat service 或 tool handler 中按用户原文关键词选择 tool。
- 不把 `readRecentExerciseRecommendationFact` 做成隐藏刷新编排器。
- 不让服务端决定“换一批”应该解释、澄清还是重新查询。

## Goals / Non-Goals

**Goals:**

- 模型可见合同必须说明 `factRef/messageId` 只能来自当前 run metadata 中真实存在的 `recentExerciseRecommendationFacts`。
- manifest examples 不得包含可被模型照抄但并非真实上下文引用的占位 factRef。
- fact store 抛出的读取异常必须变成结构化 `status: "failed"` 输出，不触发 `handler_error`。
- 测试覆盖空 recent fact + 模型误用占位 factRef 的回归形态。

**Non-Goals:**

- 不改变“换一批”的语义归属，仍由 LLM / Planner 理解自然语言。
- 不新增服务端自然语言判断、关键词表、正则、同义词映射或 action 改写。
- 不新增数据库表、迁移、分页、旧 route 或训练生成工具。
- 不调整 tool budget、ResourceStore 或 final grounding core 合同。

## Decisions

### Decision 1: 删除占位 factRef example，改成真实上下文引用示例

manifest example 应使用明显来自 `recentExerciseRecommendationFacts` 的字段，例如 `factRef: "fact_recent_01"`，并在 description / `whenToUse` 中要求模型只复制当前 run metadata 中真实出现的值。

理由：模型会把 example 当作可执行模板。`cbf_previous_response` 不像占位符，且 trace 已证明模型会照抄它。

备选方案：保留 example 并在 prompt 中追加“不要照抄”。该方案仍让假值进入模型可见合同，放弃。

### Decision 2: handler 捕获 store 异常并返回结构化失败

`readExerciseRecommendationFact()` 的正常失败已经能返回 `{ ok: false, code, message }`。handler 需要额外捕获 store 抛出的异常，返回 `status: "failed"`，使用稳定 code，例如 `fact_store_read_failed`。

理由：读取历史事实失败是业务 tool 的可诊断失败，不应退化成 executor 的通用 `handler_error`。结构化失败可以进入 observation，让模型决定解释、澄清或换路径。

备选方案：修改 executor 暴露原始异常。该方案扩大 core 行为且有泄漏风险，放弃。

### Decision 3: 不做服务端“空 recent fact”语义处理

当 `recentExerciseRecommendationFacts` 为空时，服务端不基于用户文本决定是否澄清或查询。修复只保证模型看不到误导性引用，且工具对无效引用稳定失败。

理由：这保持“LLM 是自然语言语义理解唯一来源”的边界。服务端只校验结构、权限、存在性、会话归属和失败投影。

### Decision 4: 用测试锁住模型可见合同

回归测试需要覆盖 manifest JSON 不包含 `cbf_previous_response`，并包含“只使用 run metadata 真实 factRef/messageId”的说明。同时 tool-level test 覆盖 store exception 不再产生 `handler_error`。

理由：本次根因来自模型实际可见合同，不是 TypeScript 类型本身；只测 handler 成功路径不够。

## Risks / Trade-offs

- [Risk] 模型在没有 recent fact 时仍可能凭空构造其他 factRef。→ Mitigation: read/import tool 按 actor、conversationId、factRef/messageId 继续确定性拒绝，并返回结构化失败；不让失败结果支撑成功回答。
- [Risk] 结构化失败 code 过泛。→ Mitigation: 仅用于 store 异常兜底，正常不可访问、not found、不唯一、schema 不兼容继续使用 store 返回的具体 code。
- [Risk] 去掉占位 example 降低模型学习刷新路径的能力。→ Mitigation: example 使用真实上下文字段形态，并在 `whenToUse` / schema description 中明确来源。
- [Risk] chat service 回归测试可能用 ReplayPlanner 模拟了模型错误。→ Mitigation: 该测试只验证服务端不把 tool handler 异常变成硬错误和不做关键词分流，真实语义仍由模型负责。

## Migration Plan

1. 更新 OpenSpec artifacts 并验证。
2. 先补 tool-level 和 manifest 回归测试，复现当前占位 factRef / store exception 风险。
3. 更新 `readRecentExerciseRecommendationFact` manifest 和 handler。
4. 补 chat service 回归，验证空 recent fact + 错误引用不会导致 `handler_error` / `duplicate_tool_failure`。
5. 运行最窄测试、OpenSpec validate 和 typecheck。
6. 检查 diff 并提交。

回滚策略：如修复引发异常，可回滚 manifest / handler 改动；不会影响数据库结构或 production route 接线。

## Open Questions

无。
