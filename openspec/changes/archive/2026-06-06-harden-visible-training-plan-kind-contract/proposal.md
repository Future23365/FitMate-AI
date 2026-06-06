## Why

当前生产聊天中，用户已经表达“每周 3 练”这类频次 / 周期目标时，模型可能在 `final_answer.content` 里复述周期安排，却在 `visibleTrainingProposal.payload` 中输出 `kind = "routine"` 且不带 `schedule`。这会让用户看到看似是周计划的回复，但结构化卡片实际只是单次训练编排。

需要收紧模型可见的 `visibleTrainingProposal` 输出合同，让模型稳定区分单次 `routine` 和多天 / 周期 `plan`，并确保正文承诺与结构化 payload 保持一致。

## What Changes

- 强化 `visibleTrainingProposal` output contract 中 `routine` / `plan` 的语义边界：
  - `routine` 只表示一次可执行训练编排，不得承诺每周、多天或周期安排。
  - `plan` 表示 `one routine template + schedule`，同一套 `exerciseItems` 通过 `schedule.assignments` 安排训练日和休息日。
- 强化 `final_answer.content` 与 `visibleOutputs[].payload` 的一致性说明：
  - 如果正文承诺训练频次、周期或多天安排，结构化输出必须使用 `payload.kind = "plan"` 并提供 `schedule.assignments`。
  - 如果结构化输出只能是 `routine`，正文只能描述单次训练编排。
- 更新 `visibleTrainingProposal` output contract 的 plan 示例，使用 7 天周期 / 每周 3 练示例替代过弱的 2 天周期示例。
- 增加回归测试计划，覆盖 output contract、prompt/model input builder、脚本化聊天链路和手动 LLM 黑盒用例。
- 保持服务端语义中立：不新增用户原文关键词、正则、短句模板、同义词表或具体 phrasing 分流。
- 本 change 不修改 `searchExerciseResources` 或其他 tool observation 的 `supportsOutputKinds`、`nextActionHints` 等投影字段；相关工作由独立 change 处理。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-visible-output-contracts`: 收紧 `visibleTrainingProposal` 的 `routine` / `plan` kind 选择、正文一致性和 plan 示例要求。
- `visible-training-proposal`: 明确 `routine` 和 `plan` 的结构语义边界，要求正文不能承诺 payload 未表达的周期 / 多天计划。
- `manual-llm-consistency-tests`: 增加真实模型黑盒回归，覆盖每周训练计划不得退化为无 `schedule` 的单次 routine。

## Impact

- 预计影响：
  - `lib/server/config/agent-visible-output-contracts.ts`
  - `tests/agent-core/agent-visible-output-contracts.test.ts`
  - `tests/agent-core/adapter-llm-planner.test.ts` 或等价模型输入构造测试
  - `tests/chat-service.test.ts`
  - `manual-tests/llm/basic-chat-fixtures.ts`
  - `manual-tests/llm/basic-chat-judge.ts` 或等价黑盒 judge 文案
- 不应影响：
  - `/api/chat` 请求 / NDJSON 外部事件契约
  - `agent-core` runtime 主循环
  - `Response Renderer` 主流程
  - `searchExerciseResources` handler、manifest、observation projection
  - 数据库 schema、Prisma migration、训练持久化结构
