## Why

最新 `docs/manual-llm-blackbox-flow-latest-report.md` 显示首页聊天黑盒流程仍有真实回归：纯动作推荐在 stream 前抛出 `Cannot read properties of undefined (reading '0')`，长期计划补齐流程在仍缺目标和器械时过早推送 `workout_plan`。这些问题会直接影响用户可见聊天主路径，需要修复核心编排，而不是放宽测试用例。

## What Changes

- 修复动作推荐 artifact 生成链路，确保传给推荐生成服务的候选动作保留完整展示字段或具备安全默认值，不再因 `imageUrls` 缺失在 stream 前崩溃。
- 修复长期计划补齐门控：用户在笼统每周计划后只补充频率和时长时，系统继续追问目标或器械，不推送空泛 `workout_plan`。
- 修复手动 LLM 黑盒报告记录：同一流程中非首轮失败后，后续轮次也应被记录为 skipped，避免报告轮次数缺失。
- 为上述失败补充确定性自动化回归测试，并保留真实 LLM 黑盒测试作为人工验收入口。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `chat-exercise-recommendation-trigger`: 动作推荐触发后必须稳定生成可展示推荐卡片，不能因候选展示字段缺失抛运行时异常。
- `chat-blackbox-flow-regression-fixes`: 补充黑盒报告中“长期计划只补频率/时长不应推 plan”的服务端门控要求。
- `manual-llm-consistency-tests`: 手动黑盒流程报告必须完整记录每个 fixture 轮次，包括中途失败后的跳过轮次。

## Impact

- 影响 `lib/server/chat/chat-service.ts` 的动作推荐 artifact 候选传递和长期计划触发门控。
- 影响 `lib/server/exercise-recommendations/ai-exercise-recommendation-service.ts` 的动作展示字段安全处理。
- 影响 `manual-tests/llm/llm-consistency.test.ts` 的失败后续轮次记录。
- 影响 `tests/chat-service.test.ts` 和相关手动 LLM 测试报告行为。
- 不改变 API 契约、数据库结构、前端组件结构或默认测试隔离策略。
