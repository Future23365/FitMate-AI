## Why

当前 AI 聊天链路的 prompt 已经覆盖意图解析、回复生成、上下文总结、动作推荐、训练草稿生成、草稿修复和只读工具决策，但部分 prompt 承担了过多职责，导致默认值容易进入用户可见回复、多轮短指令存在意图漂移风险，并且真实黑盒报告显示 token 消耗仍然偏高。

本 change 目标是收紧模型输入契约：让 LLM 更少依赖长篇补丁式提示词，更明确地区分语义决策、结构化执行契约、服务端事实、默认值来源和用户可见回复边界。

## What Changes

- 收紧聊天意图解析契约，减少旧字段与 resolved intent 字段并行决策造成的冲突。
- 明确默认值、推断值、历史事实和当前用户消息的可见表达边界，避免把系统默认值说成用户明确条件。
- 将执行型场景的用户可见过渡回复收敛到 resolved intent、artifact 结果和字段来源，减少模型自由承诺“马上生成”“稍后生成”等流程文案。
- 调整 summary 更新边界，避免把 assistant 自然语言中的口误或默认值固化为长期用户事实。
- 继续压缩 prompt 和模型 payload：按任务加载更窄的 prompt modules，训练草稿只注入当前 kind 的 schema，去除重复 repair 指令。
- 补强只读工具决策 prompt 的工具级输入 schema 和停止条件，减少无效 tool call。
- 更新 LLM 黑盒与 trace 验收口径，覆盖默认值泄漏、意图漂移、流程文案泄漏和 token 回归。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `chat-intent-decision-flow`: 收紧 resolved intent 与旧 intent 字段的派生关系、默认值来源、用户可见回复消费规则和执行型 response writer 边界。
- `chat-context-summarization`: 调整 summary 更新的事实来源优先级，禁止把默认值或 assistant 口误固化为用户事实。
- `ai-token-budgeting`: 要求 prompt module 按阶段进一步瘦身，避免向单次调用注入无关 schema 或重复指令，并记录 token 回归。
- `ai-model-payload-budget`: 补充训练草稿 schema 和候选 payload 的按任务裁剪要求。
- `readonly-llm-tool-calling`: 补强 JSON tool decision prompt 必须携带工具级输入契约和停止条件。
- `manual-llm-consistency-tests`: 扩展黑盒报告和断言，覆盖 prompt contract 回归。

## Impact

- 影响服务端 AI 编排：`lib/server/chat/chat-service.ts`、`lib/server/ai/prompt-config.ts`、`lib/server/ai/token-budget.ts`、`lib/server/chat/conversation-summary-service.ts`。
- 影响训练生成服务：`lib/server/workout-plans/ai-workout-plan-service.ts`、`lib/server/exercise-recommendations/ai-exercise-recommendation-service.ts`。
- 影响只读工具循环：`lib/server/ai/tools/*`。
- 影响测试和验收：`tests/chat-service.test.ts`、`tests/ai-workout-plan-service.test.ts`、`tests/readonly-tools.test.ts`、`manual-tests/llm/*`、`docs/manual-llm-blackbox-flow-*.md`。
- 不引入新外部依赖，不改变数据库 schema，不改变公开 API 路径。
