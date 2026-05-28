## Context

聊天链路分为结构化意图解析和用户可见回复生成。当前意图解析已经能把“练腿，20分钟，没有器械”识别为 `routine`，并传入 `serverWorkoutIntent.sessionMinutes = 20`。错误发生在可见回复生成阶段，模型受 prompt 中固定示例句影响，误说用户没有提供训练时长。

## Goals / Non-Goals

**Goals:**

- 让可见回复优先沿用 `serverWorkoutIntent.sessionMinutes`。
- 将默认估算时长提示改成宽泛说明，避免模型照抄固定模板。
- 保留缺少时长时可以提示估算的产品语义。

**Non-Goals:**

- 不新增服务端后处理或回复文本过滤。
- 不改变 routine 草稿生成、校验、保存逻辑。
- 不改变意图解析的 `canTriggerAction` 规则。

## Decisions

1. 调松 prompt，而不是增加硬性反向约束。

   理由：用户希望避免 prompt 内部互相拉扯。更稳妥的方式是移除具体模板句，并用“按服务端上下文表达”的正向规则减少误套。

2. 将默认估算提示绑定到“服务端上下文没有明确 `sessionMinutes`”。

   理由：用户自然语言可能复杂，但服务端传入的 `serverWorkoutIntent` 是这一步最可靠的结构化来源。可见回复应优先对齐它。

## Risks / Trade-offs

- [Risk] 模型仍可能在少数场景误解“估算时长”。→ Mitigation：不再提供可照抄的错误模板，并用测试锁定 prompt 文案边界。
- [Risk] 缺少时长场景的提示变得不够明确。→ Mitigation：保留“先按估算时长整理、可补充时长调整”的语义，但不写固定句式。
