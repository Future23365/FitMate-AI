## Context

当前 `/api/chat` 的意图解析把模型返回的所有字段放进一个原子 schema 校验中。这个结构在执行型请求里是合理的，因为动作推荐、routine、plan 都需要可信的 `workoutIntent`；但在问候、信息收集、普通回答等非执行型请求里，`suggestedReplies` 本身已经足够驱动用户可见按钮，不依赖 `workoutIntent`。

最新 trace 中，模型返回：

- `type = general_fitness_advice`
- `canTriggerAction = false`
- `suggestedReplies` 非空
- `workoutIntent = null`

由于 `chatIntentSchema` 只允许 `workoutIntent` 缺省或合法对象，不接受 `null`，整包校验失败。服务端随后使用 `createFallbackChatIntent()`，而兜底意图默认 `suggestedReplies: []`，最终丢失按钮。这说明问题不在前端渲染，而在服务端把交互建议和执行意图误绑定到了同一个失败边界。

## Goals / Non-Goals

**Goals:**

- 让 `suggestedReplies` 在非执行场景中独立于 `workoutIntent` 被解析、校验和流式返回。
- 让 `workoutIntent:null` 在非执行场景归一化为缺省值，而不是触发整包兜底。
- 保持执行型请求的强校验：只要要触发动作推荐、routine、plan、patch、替换或讲解，执行所需字段仍必须符合服务端 schema。
- 让 trace 明确展示建议回复是否被保留、被清空或被兜底替换。
- 用自动化测试覆盖当前 trace 暴露的问题，避免后续 prompt 或模型漂移重新破坏按钮。

**Non-Goals:**

- 不把所有模型字段都宽松化；执行层字段仍要强校验。
- 不让前端从正文里抽取示例文本并伪造成按钮。
- 不改变 `suggested_replies` 流事件格式。
- 不改变训练计划、动作推荐或 routine 生成服务的输入契约。
- 不引入新的数据库字段或持久化结构。

## Decisions

### Decision 1: 将聊天意图解析分成交互层和执行层

服务端应先解析一个轻量交互层 envelope，至少包含：

- `type`
- `canTriggerAction`
- `responseMode`
- `suggestedReplies`
- `clarificationReplies`
- `adjustmentReplies`
- `missingActionFields`

这些字段决定本轮用户可见交互是否需要按钮、是否需要追问、是否允许进入执行层。它们不应因为 `workoutIntent` 的 `null`、缺省或非执行场景无意义而整体丢失。

执行层再校验：

- `workoutIntent`
- `action`
- `fieldSources`
- `referenceRequirement`
- 与生成 artifact 相关的结构化字段

只有当 `canTriggerAction=true`、`action.shouldTrigger=true` 或 `type` 属于可执行训练动作时，执行层校验失败才应阻止内部动作。非执行场景下，执行层字段可以被归一化为空。

### Decision 2: `workoutIntent:null` 在非执行场景归一化为空

模型供应商和 prompt 都可能在“没有训练执行意图”的场景返回 `workoutIntent:null`。服务端应把这类值视为缺省，而不是非法：

- `general_fitness_advice` 且 `canTriggerAction=false`：允许 `workoutIntent:null`。
- `non_fitness` 且 `canTriggerAction=false`：允许 `workoutIntent:null`。
- `responseMode=answer_only` 或 `ask_clarification` 且没有触发动作：允许 `workoutIntent:null`。

归一化后的内部 `ChatIntent` 仍保持现有类型约定：`workoutIntent` 为 `undefined` 或合法对象，不把 `null` 继续向下游传递。

### Decision 3: 执行型请求继续强校验

以下场景不能因为要保留建议回复而放松执行校验：

- `exercise_recommendation`
- `routine`
- `workout_plan`
- `exercise_replacement`
- `exercise_explanation`
- `workout_patch`
- `action.shouldTrigger=true`

如果这些场景缺少必要 `workoutIntent` 或引用字段，系统必须进入澄清或失败恢复路径，而不是用默认值静默生成。建议回复可以作为澄清选项保留，但内部动作不能触发。

### Decision 4: 不从自然语言正文生成按钮

聊天回复正文里的示例，例如“想减脂+在家练+每周3次每次30分钟”，只是一段普通内容。按钮只能来自结构化 `suggestedReplies` 或兼容的 `suggestedQuestions` 字段。这样可以避免前端根据正文格式猜测用户可点击操作，也能保证按钮来源可测试、可 trace。

### Decision 5: Trace 需要暴露部分恢复边界

意图解析 trace 应能区分以下情况：

- 模型输出完整通过 schema。
- 模型输出经过非执行字段归一化后通过，例如 `workoutIntent:null` 被归一化。
- 模型输出的交互层有效但执行层无效，系统保留建议回复并阻止内部动作。
- 模型输出无法恢复，系统使用兜底意图。

这能避免调试时只看到“使用兜底意图”，却不知道原始 `suggestedReplies` 曾经存在。

## Risks / Trade-offs

- [Risk] 分层解析可能让无效模型输出部分进入系统。→ Mitigation: 只对交互层字段做宽容恢复，执行层保持强校验；所有下游生成仍使用合法 `workoutIntent`。
- [Risk] 过度保留建议回复可能展示不合适按钮。→ Mitigation: `suggestedReplies` 自身仍要经过长度、数量、非空字符串和第一人称约束测试；不合法时清空。
- [Risk] 仅修 schema 容忍 `null` 可能掩盖更深层耦合。→ Mitigation: 实现时优先抽出交互层解析或至少为 schema 归一化加测试，避免未来新增执行字段再次拖垮按钮。
- [Risk] Prompt 仍可能继续输出不一致字段。→ Mitigation: 服务端负责最终边界；prompt 可补充约束，但不能作为唯一修复。

## Migration Plan

1. 调整聊天意图 schema 或解析函数，让 `workoutIntent:null` 在非执行场景归一化为缺省值。
2. 抽出或强化 `suggestedReplies` 的独立校验，确保合法建议回复不会因执行层字段失败被丢弃。
3. 调整兜底逻辑：当原始模型输出的交互层可恢复时，不直接使用空建议回复兜底。
4. 更新 trace step，记录归一化、部分恢复和最终可见建议回复。
5. 补充自动化测试，覆盖当前 trace 中问候场景、执行型请求缺少 `workoutIntent`、非法建议回复清空等边界。
6. 运行相关单测、类型检查和 OpenSpec 校验。
