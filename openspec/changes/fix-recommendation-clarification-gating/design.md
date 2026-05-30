## Context

聊天链路目前由模型解析 `ChatIntent`，再由服务端根据 `resolveAssistantAction()` 转成内部动作事件。为了支持“我想练腿”这类目标明确但信息较少的纯动作推荐，服务端曾给 `exercise_recommendation` 增加兜底：只要目标字段非空且候选动作可用，就触发推荐。

最新 trace 暴露了边界问题：模型已经返回 `canTriggerAction = false`、`missingActionFields` 和 `suggestedReplies`，服务端仍绕过追问触发了 `exercise_recommendation`。这说明“目标明确即可推荐”的兜底缺少一个更高优先级的澄清阻断规则。

## Goals / Non-Goals

**Goals:**

- 当意图解析明确产生建议追问时，服务端不得再触发动作推荐事件。
- 保留纯动作推荐的轻量触发体验：模型按提示返回 `canTriggerAction = true`、无追问时，仍直接推荐。
- 让聊天回复、建议回复按钮和内部动作事件三者状态一致。
- 用单测固定 trace 中出现的回归场景。

**Non-Goals:**

- 不重写整体意图解析 Prompt。
- 不改变动作候选筛选、动作推荐生成模型、数据库或前端卡片结构。
- 不恢复健康/伤病信息作为默认阻断项。

## Decisions

1. **把建议追问作为服务端硬阻断。**
   - 当 `chatIntent.canTriggerAction = false` 且 `suggestedReplies` 非空时，服务端视为模型明确要求用户补充信息，`resolveAssistantAction()` 不生成内部动作。
   - 选择这个方案，是因为 `suggestedReplies` 是用户可见交互承诺；如果同时推送动作，会产生最直接的产品矛盾。

2. **不再让 `exercise_recommendation` 无条件绕过缺失字段。**
   - `canTriggerAssistantAction()` 继续保留动作候选不足时阻断。
   - 对 `exercise_recommendation`，仅在没有建议追问时才允许目标字段兜底。
   - 这样既兼容模型严格遵守 Prompt 的直接推荐场景，也避免 trace 中的“有追问还推送”回归。

3. **同步更新 Prompt 文案，减少模型输出矛盾。**
   - Prompt 继续要求纯动作推荐在目标明确时返回 `canTriggerAction = true` 且不返回 `suggestedReplies`。
   - 增加说明：如果确实返回建议追问，服务端会把它视为阻断，不会同时推荐动作。

## Risks / Trade-offs

- **Risk: 模型误给目标明确请求返回 suggestedReplies，导致本可推荐的请求被追问。** → 通过 Prompt 强化“目标明确的纯动作推荐不要返回 suggestedReplies”，并用测试覆盖直接推荐路径。
- **Risk: 只依赖 suggestedReplies 阻断可能漏掉少数无建议回复但 `canTriggerAction=false` 的情况。** → 当前修复聚焦用户可见矛盾；后续若要统一所有 `missingActionFields` 语义，应单独做更大的意图归一化变更。
