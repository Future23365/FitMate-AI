## Why

最新 AI trace 显示，意图模型已经返回了可展示的 `suggestedReplies`，但同一个 JSON 中的 `workoutIntent: null` 未通过服务端 schema，导致整包意图被兜底意图替换，最终建议回复按钮被清空。`suggestedReplies` 属于用户可见交互层，不应被非执行场景下的 `workoutIntent` 校验失败拖垮。

## What Changes

- 将聊天意图解析拆成交互层和执行层两个校验边界：`suggestedReplies`、`clarificationReplies`、`responseMode` 等交互字段独立保留；`workoutIntent` 仅在需要触发动作推荐、单次编排、长期计划或训练修改时强校验。
- 允许 `general_fitness_advice`、`non_fitness`、`answer_only`、`ask_clarification` 等非执行场景将 `workoutIntent: null` 归一化为缺省值，不再让整包意图失败。
- 当模型返回 `canTriggerAction=false` 且存在合法建议回复时，服务端必须继续产出 `suggested_replies` 流事件；只有建议回复自身不合法时才清空或降级。
- 增强 trace 记录，区分“完整意图校验成功”“非执行字段归一化成功”“执行层字段校验失败并降级”，便于定位是模型输出漂移还是服务端校验边界过窄。
- 为本次问题补充自动化回归测试，覆盖问候/信息收集场景中 `suggestedReplies` 与 `workoutIntent:null` 同时出现时按钮仍展示。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `api-layer-boundaries`: 聊天意图解析必须保留合法的用户可见建议回复，不能因非执行场景下 `workoutIntent` 为空或缺省而丢弃整包意图。
- `chat-blackbox-flow-regression-fixes`: 补充黑盒运行时回归场景，要求问候或信息收集场景中模型给出的建议回复能被服务端流式返回为按钮。

## Impact

- 影响 `lib/server/chat/chat-service.ts` 的 `chatIntentSchema`、意图解析失败处理、兜底意图和 `suggested_replies` 流事件写入。
- 可能影响 `lib/server/ai/prompt-config.ts` 中聊天意图输出约束，但 prompt 不是唯一修复点，服务端仍需容忍模型在非执行场景返回 `workoutIntent:null`。
- 影响 `tests/chat-service.test.ts` 的意图解析、建议回复展示和兜底边界测试。
- 不改变数据库结构、HTTP 路由、前端消息组件结构或训练计划生成 API 契约。
