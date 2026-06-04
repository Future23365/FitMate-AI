## Why

用户询问“有没有铅球动作”时，`searchExerciseResources` 已经成功查询发布态动作库并得到 `totalMatches = 0`，但工具合同把 0 条结果机械标记为 `fulfillment.satisfied = false`，导致模型无法合法引用这个事实回答“没有找到”。这会把正常的存在性查询结果误收口成 `terminal_reference_invalid` / `repair_limit_exceeded`。

需要修复的不是数据库查询，也不是让服务端判断用户语义，而是把“查询事实已完成”和“下游候选是否足够”从同一个 `satisfied=false` 标记里拆开。

## What Changes

- 调整 `searchExerciseResources` 的履约语义：只要只读查询成功执行，包含 `totalMatches = 0` 的结果也可以作为事实查询结果支撑普通 `final_answer`。
- 保留 `totalMatches`、`returnedCount`、`exercises` 等结构化事实，由模型决定如何解释“没有找到”或是否继续追问。
- 明确该 tool 仍不生成 routine、plan、训练卡片或候选消费资源；需要动作候选的下游流程必须自行校验候选数量，不得把空数组当成可用候选。
- 更新模型可见说明、observation 和测试，覆盖 0 条查询结果可以合法 grounding，“需要候选但为空”的消费边界仍不能被跳过。
- 不新增服务端关键词、正则、同义词或基于用户原文的“有没有/推荐”语义分流。

## Capabilities

### New Capabilities
- `agent-exercise-zero-result-grounding`: 规范 `searchExerciseResources` 对 0 条事实查询结果的 grounding 语义，以及候选消费不足应由下游消费方校验的边界。

### Modified Capabilities
- `agent-tool-production-hardening`: final grounding 安全边界保持不变，但 `searchExerciseResources` 的 0 条查询结果不再被工具合同降级为 unsatisfied 诊断结果。
- `agent-prompt-contract-governance`: 更新单个业务 tool 的模型可见说明，明确 0 条查询结果是事实输出，不是服务端语义失败。

## Impact

- 影响代码：
  - `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`
  - `tests/agent-tools/search-exercise-resources.test.ts`
  - `tests/chat-service.test.ts`
  - 必要时更新 manifest / contract 相关测试
- 影响文档：
  - 本 change 的 OpenSpec 文档与 spec
  - 如实现确认属于核心链路合同修正，更新 `docs/方案变更历史` 和 `docs/项目演变历程.md`
- 不影响：
  - `Action Validator` 的通用 grounding 规则
  - `/api/chat` 主链路
  - `Policy Guard`、`ResourceStore`、`Resource Contract Validator`、`Response Renderer`
  - 数据库结构、API 契约和权限隔离
