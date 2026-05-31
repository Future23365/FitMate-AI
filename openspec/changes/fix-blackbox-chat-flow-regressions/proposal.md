## Why

最新 `docs/manual-llm-blackbox-flow-latest-report.md` 显示首页聊天黑盒流程仍有 3 个主路径失败：动作推荐条件细化被误升级为 routine、笼统长期计划过早生成 plan、上一轮器械事实没有被后续 routine 继承。现在需要把这些真实失败固化为服务端确定性边界，避免只靠 LLM 提示词漂移。

## What Changes

- 修正已有动作推荐后的条件细化语义：用户继续说“推荐几个不用器械的”时保持 `exercise_recommendation`，不触发 `workout_routine`。
- 修正笼统长期计划门控：用户只说“给我一个每周训练计划”时先追问关键目标或条件，不直接推送空泛 `workout_plan`。
- 修正上下文事实继承：上一轮只记录“我有哑铃”后，下一轮“今天练胸30分钟”应继承哑铃条件并触发 `workout_routine`。
- 为上述失败补充自动化回归测试，并保留真实 LLM 黑盒报告作为手动验收来源。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `chat-blackbox-flow-regression-fixes`: 补充最新黑盒报告暴露的失败场景，要求服务端确定性归一化覆盖推荐细化、空泛 plan 追问和器械事实继承。

## Impact

- 影响 `lib/server/chat/chat-service.ts` 的聊天意图归一化与触发边界。
- 影响 `tests/chat-service.test.ts` 的确定性回归用例。
- 不改变 API 契约、数据库结构、前端组件结构或默认测试隔离策略。
