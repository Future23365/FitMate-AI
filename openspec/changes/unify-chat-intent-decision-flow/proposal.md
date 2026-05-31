## Why

最新聊天 trace 暴露出同一轮对话里“用户回复在追问、内部动作却已经生成计划”的分裂问题：LLM 能在自然语言里理解用户要连续多天训练，但结构化意图漏掉关键约束后，计划生成层又用默认 21 天补齐，最终推送结果违背用户期望。现在需要把 `/api/chat`、卡片生成和用户回复收敛到同一个意图决策主线，避免只靠 prompt 或单点规则继续漂移。

## What Changes

- 将现有聊天意图结果升级为唯一的 `ResolvedChatIntent` 执行契约，统一表达用户意图、触发动作、回复模式、缺失字段、澄清回复和生成后调整建议。
- 明确 `ResolvedChatIntent` 的共享 schema、字段来源、action 事件和下游生成请求之间的映射关系，避免前后端各自解释 `intent: unknown`。
- 增加服务端一致性门控：只校验结构化 intent 内部是否自洽，以及生成 artifact 是否符合 resolved intent，不让服务端替代 LLM 理解开放自然语言。
- 增加一次 LLM repair 流程：当 `ResolvedChatIntent` 内部冲突时，把冲突原因反馈给 LLM 修复；修复后仍冲突则不触发卡片生成，只进入澄清回复。
- 收敛卡片生成链路：训练推荐、routine、plan、patch、动作替换或动作讲解只能使用 `/api/chat` 的 resolved intent，不再从自然语言回复或专用生成接口里重新决策关键字段。
- 清理旧 trigger 事实来源：聊天 hook、消息展示清理、上下文摘要和历史消息解析不得再把正文里的 trigger JSON 当成新决策来源。
- 调整用户回复生成顺序：回复根据最终 resolved intent 和 artifact 生成结果产出；追问时不得生成卡片，生成时不得再问用户“要不要生成”。
- 将“建议”与“阻断”分离：用户明确可执行需求应先完成，训练风险或更稳妥方案通过生成后的 `adjustmentReplies` 给用户选择，只有缺少必要字段、引用不可用或安全硬边界才阻断。

## Capabilities

### New Capabilities

- `chat-intent-decision-flow`: 约束聊天主链路中的唯一 resolved intent、执行门控、冲突 repair、回复模式和卡片生成一致性。

### Modified Capabilities

- `plan-push-composition`: 长期 plan 推送必须服从 resolved intent 中的周期、频率、引用对象和回复模式，不能由默认值覆盖用户明确约束。
- `domain-plan-engine`: `PlanStrategy` 和 DomainPlanEngine 展开结果必须从 resolved intent 派生，并在输出前校验 strategy 与草稿周期、周频率、引用 artifact 一致。

## Impact

- 影响 `lib/server/chat/chat-service.ts` 的聊天意图解析、归一化、内部动作事件、回复生成和 trace 记录。
- 影响 `lib/server/ai/prompt-config.ts` 的聊天意图解析、repair 和回复生成提示词。
- 影响 `features/chat/hooks/use-chat-controller.ts`、`features/chat/components/chat-page.tsx`、`features/chat/lib/chat-client.ts` 和 `features/chat/lib/workout-plan-trigger.ts` 的卡片触发来源，前端应只信服务端 action，不再从回复正文提取 trigger。
- 影响 `lib/shared/chat/fitness-conversation-context.ts` 的历史 trigger 解析和上下文构建，旧 trigger 只能作为历史兼容展示数据，不得参与新一轮决策。
- 影响 `app/api/ai/workout-plan/route.ts`、`lib/server/workout-plans/ai-workout-plan-service.ts` 和 `lib/server/workout-plans/domain-plan-engine.ts` 的计划生成入口与默认值处理。
- 需要补充服务端单测、计划生成校验测试和必要的黑盒回归用例；不涉及数据库 schema 变更。
