## Why

基础黑盒中的 F03、F05、F12 仍会暴露同一类问题：当用户只表达笼统训练需求或目标不清的动作推荐时，Agent 可能先查询宽泛动作事实，再把这些结果包装成 `visibleTrainingProposal`，导致用户看到不可解释的默认方案或随机动作。

之前多次修复主要收紧了 section readiness、refresh 和 judge 宽容度，但没有把“新训练输出的信息充分性”和“当前 run 可消费动作事实来源”同时写成稳定合同，所以模型仍有路径绕过澄清。

## What Changes

- 收紧默认 Agent LLM prompt：新生成 `visibleTrainingProposal` 前，模型必须确认当前对话或已导入事实中已有足够可解释的训练目标和约束；不足时应使用 `ask_user` 或无 `visibleOutputs` 的可选方向说明。
- 明确 `exercise_selection`、`routine`、`plan` 的信息充分性边界：动作选择至少需要明确训练目标、部位、动作类别、器械限制或点名动作之一；单次训练需要目标/部位、单次时长和可用器械/场地等关键约束；长期计划需要目标、频率/周期、单次时长和器械/场地等关键约束。
- 收紧 `searchExerciseResources` 的 broad query 合同：当输入除了默认 `suitabilities` / `published` / `sort` 外没有任何目标、facet、器械、场地、点名动作或正向/负向锚点时，tool result 仍可作为诊断事实返回，但 `fulfillment.satisfied` 必须为 `false`，不能支撑成功 `final_answer` 或训练卡片。
- 收紧 `visibleTrainingProposal` validator：最终 `exerciseItems` 必须能在当前 run 的已满足动作查询结果或可消费 `visible_training_proposal_fact` 中找到同一 `exerciseId + section` 事实；仅数据库存在不能作为新卡片事实来源。
- 增加 prompt / manifest / observation / validator / production replay / 基础黑盒 fixture 回归，覆盖 F03、F05、F12 和等价语义变体。
- 不新增服务端用户原文关键词、正则、同义词表、短句模板或具体 phrasing 分流；不让服务端替模型选择 `toolName`、`action`、调用顺序或 `payload.kind`。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-llm-prompt-configuration`: 默认 prompt 必须表达训练结构化输出的信息充分性门槛和缺信息时的合法收口方式。
- `agent-exercise-resource-query-tool`: `searchExerciseResources` 必须把无目标 broad query 表达为诊断/未满足结果，不能支撑成功训练输出。
- `visible-training-proposal`: `visibleTrainingProposal` 终态 validator 必须复核动作项来自当前 run 可消费事实，而不是只复核数据库存在性。
- `chat-blackbox-llm-flow-tests`: 基础黑盒必须继续覆盖 F03、F05、F12 的信息不足澄清行为，且不能把泛泛建议或随机卡片判为通过。

## Impact

- 影响 prompt / model input：
  - `lib/server/config/agent-llm-prompt-config.ts`
- 影响业务 tool 合同和 projection：
  - `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`
- 影响可见训练方案终态校验：
  - `lib/server/visible-training-proposals/visible-training-proposal-validator.ts`
- 影响用户安全 fallback 分类：
  - `lib/server/chat/agent-text-chat-service.ts`
- 影响测试：
  - `tests/agent-tools/search-exercise-resources.test.ts`
  - `tests/agent-core/agent-llm-prompt-config.test.ts`
  - `tests/visible-training-proposal-validator.test.ts`
  - `tests/chat-service.test.ts`
  - `tests/manual-llm-basic-blackbox.test.ts`
  - `llm基础测试.md`
- 不影响：
  - `/api/chat` 请求 / 响应合同
  - Agent runtime 主循环、`PlannerPort`、Executor、Policy Guard、ResourceStore、Response Renderer
  - 数据库 schema、Prisma migration 或权限模型
