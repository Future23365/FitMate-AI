## Context

`/api/chat` 当前会先解析 `ChatIntent`，再查询动作候选，最后由 `resolveAssistantAction()` 决定是否发送 `assistant_action`。前端只有收到 `assistant_action` 才会继续调用动作推荐或训练生成接口。

这次 trace 显示，“我想练腿”被识别为 `exercise_recommendation`，动作候选状态为 `enough`，但模型同时返回 `canTriggerAction = false` 和 `missingActionFields = ["equipmentOrLocation"]`。服务端因此没有发送 `assistant_action`，前端无法推送动作推荐。

## Goals / Non-Goals

**Goals:**

- 让目标或部位明确的纯动作推荐请求可以直接触发 `exercise_recommendation`。
- 保留 `candidateStatus = "insufficient"` 的阻断能力，避免候选不足时推送空推荐。
- 保留 `routine` 和 `workout_plan` 的信息完整性要求，避免把宽泛请求直接生成训练编排或长期计划。
- 让 prompt 与服务端 gating 规则一致，减少模型输出和服务端决策冲突。

**Non-Goals:**

- 不改变动作候选筛选算法。
- 不改变 `/api/ai/exercise-recommendations` 的请求或响应契约。
- 不把“我想练腿”升级成 `workout_routine`，除非用户提供本次训练编排语义。
- 不新增浏览器交互验证。

## Decisions

1. 对 `exercise_recommendation` 使用独立 gating。

   当顶层 `type = "exercise_recommendation"`，且动作候选可用时，服务端只要求 `goal` 或请求语义明确，不再因为 `equipmentOrLocation`、`sessionMinutes` 等字段缺失而阻断触发。这样符合纯动作推荐的产品语义：先给可用动作，再让用户按器械或场地细化。

   备选方案是只改 prompt，让模型尽量返回 `canTriggerAction = true`。这个方案不够稳定，因为最终触发仍完全依赖模型布尔值，未来仍可能因为类似缺失字段被拦住。

2. `routine` 和 `workout_plan` 继续使用现有缺失字段过滤。

   单次训练编排和长期计划会生成结构化训练内容，缺少目标、时长、器械或场地时继续追问更安全。此次改动只放宽动作推荐，不改变训练生成边界。

3. prompt 明确 `exercise_recommendation` 不需要器械或场地才能触发。

   服务端规则负责最终兜底，prompt 负责减少错误解析和误导性 suggested replies。两者保持一致可以降低 trace 中 `candidateStatus = enough` 但 `assistant_action` 被跳过的概率。

## Risks / Trade-offs

- [Risk] 用户只给部位时推荐动作可能不完全符合器械条件。→ Mitigation：动作推荐服务继续基于已有条件筛选；缺失条件不阻断，但后续用户仍可换一批或补充器械细化。
- [Risk] 放宽规则可能误触发不完整的训练编排。→ Mitigation：只对顶层 `exercise_recommendation` 放宽，不对 `routine` 或 `workout_plan` 放宽。
- [Risk] 模型仍可能返回混合语义。→ Mitigation：服务端按顶层 `type` 分支处理，并用测试覆盖目标明确但缺少器械/场地的推荐场景。
