## Why

最新 `docs/manual-llm-blackbox-flow-latest-report.md` 显示基础首页聊天黑盒流程仍存在真实链路失败：长期计划补齐和已有 plan 的频率调整在 `/api/chat` 真实请求中丢失结构化历史事实，导致系统降级为 `exercise_recommendation` 或重新追问；序号动作讲解的用户可见结果基本正确，但报告无法记录 resolved 引用状态。

这些问题说明当前链路把 `conversationSummary` 当作历史提示参考，但服务端 action gate 缺少稳定、可信的结构化会话事实来源；同时黑盒 runner 对确定性回复的诊断事件覆盖不足。

## What Changes

- 在 `/api/chat` 服务端请求准备阶段，根据 `conversationId` 和 current user 读取已保存会话，恢复历史 `messages`、`conversationContext`、训练卡片索引和最近 artifact summaries。
- 将服务端读取到的会话事实作为 `internalConversationContext` 的优先来源；客户端提交的 `messages` / `conversationContext` 只能作为未保存会话或保存缺失时的校验后 fallback。
- 保持模型可见上下文克制：模型仍主要看 `conversationSummary + latestUserMessage + recentArtifactSummaries`，但服务端确定性 gate 使用 hydrated 结构化事实判断是否触发 `workout_plan`、`workout_routine` 或引用解释。
- 修复长期计划多轮流程：
  - “给我一个每周训练计划” -> “每周4练，每次45分钟” -> “增肌，有健身房器械” 必须在第三轮触发 `workout_plan`。
  - 已有 `workout_plan` 后，“改成每周6练” 必须保持 plan 语义并触发 `workout_plan` 调整，而不是重新追问或静默无卡片。
- 为服务端确定性引用讲解输出可诊断的引用解析状态，使黑盒报告能区分“用户可见结果正确但报告缺字段”和真实引用失败。
- 校准手动 LLM 黑盒测试 token 预估，优先使用最近一次真实运行报告的均值或总量，不再在已有真实报告时落回过低 fallback。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `chat-intent-decision-flow`: `/api/chat` 的服务端意图决策必须使用当前用户、当前会话的已保存结构化历史事实作为 action gate 的可信上下文。
- `manual-llm-consistency-tests`: 黑盒报告必须能记录确定性引用讲解的 resolved 诊断状态，并用真实运行结果校准 token 预估。
- `chat-blackbox-flow-regression-fixes`: 最新基础黑盒失败样例必须被确定性自动化回归覆盖，避免只依赖真实模型手测。

## Impact

- 影响 `app/api/chat/route.ts` 的会话读取与请求准备边界。
- 影响 `lib/server/chat/chat-service.ts` 的 `PreparedAiChatRequest`、`prepareAiChatRequest()` 或等价服务端 hydration 流程。
- 影响 `features/chat/api/chat-client.ts` 和 `features/chat/hooks/use-chat-controller.ts` 的可选上下文字段传递策略，但服务端不得信任客户端上下文作为唯一事实源。
- 影响 `manual-tests/llm/blackbox-runner.ts`、`manual-tests/llm/assertions.ts`、`manual-tests/llm/llm-consistency.test.ts` 的诊断采集、断言和 token 估算逻辑。
- 影响 `tests/chat-service.test.ts`、`tests/manual-llm-flow-policy.test.ts` 或新增相关测试。
- 不涉及数据库 schema 变更、模型输出 schema 破坏性变更或前端视觉结构调整。
