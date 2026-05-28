## Context

聊天主链路先由 `/api/chat` 做结构化意图解析，再把解析结果转换成内部 `assistant_action` 事件。当前服务端使用顶层 `type` 决定触发 `exercise_recommendation`、`workout_routine` 或 `workout_plan`，而 `workoutIntent.intentType` 只是下游生成训练内容时使用的训练语义。

最新 trace 显示，用户输入“练腿，20分钟，没有器械”时，模型识别到了 `sessionMinutes = 20`，但返回了顶层 `type = "exercise_recommendation"` 和内层 `workoutIntent.intentType = "routine"` 的混合结果，导致系统推送动作推荐卡片。

## Goals / Non-Goals

**Goals:**

- 通过 prompt 让 LLM 在顶层 `type` 上表达唯一意图。
- 明确“目标 + 本次训练时长 + 器械/场地条件”属于单次训练编排 `routine`。
- 保持服务端现有 `assistant_action` 分流方式，不新增硬编码归一化规则。
- 增加测试覆盖，防止典型明确时长输入再次落到动作推荐。

**Non-Goals:**

- 不改变 routine 草稿结构、保存逻辑或卡片 UI。
- 不新增服务端意图纠偏层。
- 不改变长期训练计划 `workout_plan` 的触发边界。

## Decisions

1. 收紧 `chatIntentResolution` prompt，而不是新增归一化逻辑。

   理由：本次问题是模型输出语义不一致。用户希望 LLM 的结构化回复本身不要有多个意思，因此优先让 prompt 明确顶层 `type` 是唯一分流依据。

   取舍：prompt 约束仍可能受模型波动影响；测试可以覆盖回归，但不能像硬规则一样保证所有自然语言变体。

2. 保留 `exercise_recommendation` 的边界，但要求它不能带有本次训练编排语义。

   理由：动作推荐仍是有效功能，例如“推荐几个练腿动作”“有哪些自重腿部动作”。这类请求没有训练时长、流程或本次执行约束时，不应被误判为 routine。

   取舍：当用户只说“练腿”时仍可能是推荐或宽泛建议；本次只处理已经给出时长和器械/场地的明确本次训练需求。

3. 用测试验证 `resolveAssistantAction` 能在 `type = "routine"` 时推送 `workout_routine`。

   理由：当前代码的分流逻辑本身正确，失败点在 prompt 让模型返回了错误顶层 `type`。测试应锁住期望路径，避免后续 prompt 回退。

## Risks / Trade-offs

- [Risk] prompt 仍依赖模型遵循程度。→ Mitigation：把互斥关系写成显式规则，并补充典型输入测试。
- [Risk] “20分钟”这类输入可能被过度解释为 routine。→ Mitigation：要求同时存在本次训练目标和器械/场地条件，纯动作示例请求仍保留为 `exercise_recommendation`。
