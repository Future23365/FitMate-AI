## Context

当前 production 文本聊天已经接入 `searchExerciseResources` 和动作刷新事实桥。最新 trace 的失败链路是：

- Planner 第 1、2 轮调用 `searchExerciseResources`，工具成功返回 `ok=true`、`fulfillment.satisfied=true`，查询到 652 个发布态动作并返回 12 个摘要。
- Planner 没有基于已有结果输出 `final_answer`，而是继续重复调用同一 tool。
- 第 3、4 轮模型把 `maxReturned` 这个 output-only 字段当成 input 传入，Action Validator 以 `invalid_tool_input` 拒绝。
- repair budget 耗尽后，最终响应为 `repair_limit_exceeded`。

任务分类：

- 主类型：Agent tool bug 修复。
- Prompt 修改类型：单个业务 tool 模型可见说明、模型 observation 投影、repair / feedback 合同。
- core contract 变更：不新增业务特例；只允许通用重复成功 tool call 反馈能力。
- production 接入变更：不改变 `/api/chat` 主路由，不新增服务端自然语言分流。

允许触碰模块：

- `searchExerciseResources` 的 model observation、manifest 文案、schema description 和 examples。
- 通用 Agent runtime 中重复 tool call 诊断 / feedback 的窄口模块，前提是实现不写业务 `toolName` 分支。
- 与 manifest、schema summary、runtime feedback、chat service 黑盒相关的自动化测试。
- 本 change 的 OpenSpec 文档。

禁止触碰模块：

- 不修改 `PlannerPort` 接口、Executor 主流程、Policy Guard、Resource Contract Validator 或 Response Renderer 主流程。
- 不在 `/api/chat`、chat service、Agent core 或 tool handler 中使用关键词、正则、同义词表或短句模板判断“换一批 / 更多 / 推荐”等自然语言语义。
- 不把 `searchExerciseResources` 改成分页工具、候选集合 builder、训练生成工具、保存工具或隐藏业务编排器。

## Goals / Non-Goals

**Goals:**

- 避免模型把 `maxReturned` 等输出摘要字段误用为 `searchExerciseResources` input。
- 让模型可见合同明确：成功且 `satisfied=true` 的动作查询结果可以支撑 `final_answer.usedToolResultIds`。
- 当同一 run 中重复调用同一 `toolName + normalizedInput` 且已有成功满足结果时，runtime 生成结构化 feedback，要求基于既有结果收口或提出新的合法 action。
- 保持严格 schema，继续拒绝未知字段、分页字段和服务端内部控制字段。
- 用测试覆盖 trace 中“成功查询后重复同参调用 -> `maxReturned` 误入 input -> repair 耗尽”的回归形态。

**Non-Goals:**

- 不强制模型推荐哪些具体动作，不在服务端生成用户可见回答内容。
- 不让服务端判断用户是否要求“换一批”“更多”或“排除已展示动作”；这些仍由 Planner 语义理解。
- 不新增 `limit`、`page`、`pageSize`、`take`、`offset` 或 `maxReturned` 作为 LLM 可控输入。
- 不修复数据库迁移、动作事实持久化或跨 run 刷新事实桥问题。
- 不新增训练计划、routine / plan / artifact 写入能力。

## Decisions

### Decision 1: 从模型 observation 中移除或显式弱化 output-only 字段

`searchExerciseResources.toModelObservation` 不应把 `maxReturned` 作为普通顶层字段暴露给 Planner；如果保留输出上限信息，必须以明确的 output-only 摘要表达，不能出现在 input schema、examples 或可复制 input 片段中。

理由：`maxReturned` 是服务端固定上限和输出摘要，不是用户意图或可执行筛选条件。trace 已证明模型会把它照抄回 input，导致严格 schema 拒绝。

备选方案：把 `maxReturned` 加入 input schema。该方案会把分页 / 数量控制交给 LLM，违反 `searchExerciseResources` 单一职责和生产查询边界，放弃。

### Decision 2: 业务 tool manifest 说明收口协议，不写通用 prompt 业务特例

`searchExerciseResources` 的 description / whenToUse / whenNotToUse / schema description 应表达：

- input 只包含结构化筛选字段和受控排除字段。
- `maxReturned`、`returnedCount`、`totalMatches`、`truncated` 是 output summary。
- 已有成功且 `satisfied=true` 的结果可以通过 `final_answer.usedToolResultIds` 支撑普通回答。
- 需要新结果集合时，Planner 应通过改变结构化 input 或使用当前可见合法 tool 表达新动作，而不是重复同参查询。

通用 Agent prompt 只保留稳定合同，例如 AgentAction、tool input 必须匹配 schema、final grounding 和 repair 规则，不写 `searchExerciseResources` 专属分流。

理由：单个业务 tool 的能力边界属于 manifest；写进通用 prompt 会造成业务 toolName 特例扩散。

### Decision 3: 重复成功同参调用走通用 runtime feedback

runtime 在执行 tool 前已经能计算 normalized input hash 并记录重复调用。该能力应扩展为：

- 如果同一 `toolName + toolVersion + normalizedInputHash` 已经产生 `ok=true && fulfillment.satisfied=true` 的结果；
- 且 Planner 又请求相同调用；
- runtime 不再执行 handler，也不消耗真实 tool call；
- runtime 生成结构化 `AgentDecisionFeedback`，引用首次成功 tool result id、重复次数和建议的合法收口方向，例如基于既有 result 输出 terminal action，或提交改变后的合法 tool input。

该 feedback 是确定性执行合同，不基于用户原文判断语义，也不替模型写回答。

理由：重复失败熔断已经存在，但本次问题是“重复成功结果没有被收口”。继续执行同一查询只会放大 token、预算和错误机会。

备选方案：只改 prompt 让模型“不要重复查询”。该方案不能阻止同类模型错误再次消耗 tool / repair 预算，放弃。

### Decision 4: 严格 schema 保持不变

`maxReturned`、`limit`、`take`、`offset`、`page`、`pageSize` 继续不属于 `searchExerciseResources` input。Action Validator 仍必须拒绝未知字段。

理由：严格 schema 是生产安全边界。修复方向是让模型看清合同和 runtime 反馈，而不是放宽执行入口。

### Decision 5: 回归测试先覆盖模型可见合同和 runtime 收口

测试应覆盖：

- `searchExerciseResources` 拒绝 `maxReturned` input。
- manifest / schema summary 不把 `maxReturned` 表达为 input 或 example。
- model observation 不把 output-only 字段暴露成可复制 input。
- runtime 对重复成功同参调用生成结构化 feedback，不再次执行 handler。
- production chat 或黑盒回归证明“既练腿又练胸肌的动作”在工具成功后能收口成用户可见回答。

理由：本次根因在模型实际可见输入与 runtime loop 共同作用；只测 handler 查询成功不够。

## Risks / Trade-offs

- [Risk] 移除 `maxReturned` 后模型不知道结果被服务端截断。→ Mitigation: 保留 `returnedCount` 和 `truncated`，必要时用自然语言摘要表达“结果已截断”，不暴露可复制输入字段。
- [Risk] 重复成功 feedback 过早阻止模型刷新。→ Mitigation: 只在 normalized input 完全相同且已有 satisfied result 时触发；如果 Planner 改变筛选条件或使用 `excludeExerciseIds` 等合法字段，则不触发。
- [Risk] feedback 文案被误解成强制 final_answer。→ Mitigation: feedback 只说明已有同等成功结果，并要求选择合法 terminal action 或改变后的合法 tool input；最终语义仍由 Planner 决定。
- [Risk] 通用 runtime feedback 需要触碰 agent-core。→ Mitigation: 限定为已有重复调用诊断附近的窄口扩展，不改 `PlannerPort`、Executor 主流程、Policy Guard、Resource Contract Validator 或 Response Renderer 主流程。
- [Risk] 黑盒模型仍可能输出非法 input。→ Mitigation: 严格 schema 和 repair budget 继续保留；新增 feedback 只降低重复成功查询造成的失败概率，不取消确定性校验。

## Migration Plan

1. 更新 OpenSpec artifacts 并验证。
2. 先补测试，复现 `searchExerciseResources` 成功结果后重复同参调用与 `maxReturned` 误入 input 的失败形态。
3. 调整 `searchExerciseResources` model observation 和 manifest / schema description。
4. 在通用重复 tool call 诊断窄口增加“重复成功同参调用”结构化 feedback。
5. 运行 tool-level、manifest、contract helper、runtime / chat 回归、typecheck 和 OpenSpec validate。
6. 检查 diff，确认没有业务关键词分流、没有分页输入开放、没有无关数据库或训练生成改动。

回滚策略：如 runtime feedback 引发异常，可回滚通用 feedback 扩展并保留 manifest / projection 收紧；不会影响数据库结构或用户数据。

## Open Questions

无。
