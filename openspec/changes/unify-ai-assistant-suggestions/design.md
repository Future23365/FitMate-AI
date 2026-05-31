## Context

聊天链路目前同时存在多种建议字段：`suggestedReplies` 用于缺信息快捷回复，`clarificationReplies` 用于阻断追问，`adjustmentReplies` 用于生成后的调整建议，artifact 失败结果也有自己的 `suggestedReplies`。这些字段的语义来源不同，但前端最终都渲染成用户可点击的 chips，导致状态分散、trace 排查困难，也容易出现“请重新说明你的训练目标、时间和器械条件”这类 AI 对用户说话的文本。

用户期望的是统一的 AI 建议系统：建议内容由 LLM 基于当前阶段语义生成，但前端只消费一套建议模型；服务端不硬编码建议文案，只负责约束结构、事实和口吻。

## Goals / Non-Goals

**Goals:**

- 将用户可见建议统一为 `assistantSuggestions`。
- 保留建议来源：意图解析、动作推荐、routine/plan 生成、生成失败恢复、引用确认、patch 确认。
- 不默认新增独立 suggestion LLM 调用；已有阶段的 LLM 在自己的结构化输出中产出建议。
- 强制建议的点击消息使用用户口吻，可直接作为下一轮用户消息发送。
- 通过服务端统一归一化、去重、限量和 trace 记录，让前端只处理一种建议事件。
- 兼容旧字段，允许渐进迁移。

**Non-Goals:**

- 不让服务端硬编码通用建议文案。
- 不要求普通闲聊每轮都额外调用 LLM 生成建议。
- 不一次性删除 `suggestedReplies` 等旧字段。
- 不改变数据库结构或聊天消息持久化模型。
- 不让建议绕过意图解析、引用解析、权限或 artifact 校验。

## Decisions

### Decision 1: 阶段内 LLM 产出建议，服务端统一收口

每个已有 LLM 阶段应在自己最了解上下文时产出建议候选：

- 意图解析 LLM：信息不足时产出补充信息建议。
- 动作推荐 LLM：推荐成功后产出下一步建议，例如基于推荐动作生成训练、换一批或调整偏好。
- routine / plan 生成 LLM：生成成功后产出调整建议，生成失败或修复失败时产出恢复建议。
- 引用解析或 patch 相关 LLM / 服务：引用不明确或需要确认时产出确认建议。

服务端将这些候选统一归一化为 `assistantSuggestions`。这样不需要固定新增一次模型调用，也不会让最终自然语言回复 LLM 兼顾结构化按钮输出。

### Decision 2: 对外统一结构，内部保留来源

建议结构使用统一字段：

```ts
type AssistantSuggestion = {
  label: string;
  message: string;
  kind: "clarification" | "next_action" | "adjustment" | "retry" | "confirmation";
  blocking: boolean;
  source:
    | "intent"
    | "exercise_recommendation"
    | "workout_generation"
    | "artifact_failure"
    | "reference_resolution"
    | "patch_confirmation"
    | "legacy";
};
```

`label` 用于按钮短文本，`message` 是点击后发送的真实用户消息。两者可以相同，但 `message` 必须是完整用户表达。

### Decision 3: 用户口吻是服务端校验边界

建议不是助手说给用户的话，而是用户点击后要发出去的话。因此服务端必须过滤或修正以下文本：

- “请重新说明你的训练目标、时间和器械条件”
- “这次大概多久？”
- “在家还是去健身房练？”
- “告诉我你的器械条件”

合法建议应类似：

- “我在家自重练 30 分钟全身”
- “按这些动作生成 30 分钟训练”
- “换一批更简单的动作”
- “把训练压缩到 20 分钟”

如果 LLM 产出的建议不符合口吻要求，服务端应丢弃该条，并在 trace 中记录被过滤原因。

### Decision 4: Blocking 决定建议优先级，不决定 UI 分叉

`blocking=true` 表示当前必须先补信息、确认引用或确认 patch，系统不应同时展示会误导用户继续生成的 next action。`blocking=false` 表示这是可选下一步或调整建议。

前端仍只渲染一套 chips，但可以根据 `kind` 和 `blocking` 做轻量样式或排序，不需要维护两套逻辑。

### Decision 5: 旧字段进入兼容输入层

迁移期内，旧字段仍作为输入来源：

- `suggestedReplies` → `source: "legacy"` 或 `source: "intent"`
- `clarificationReplies` → `kind: "clarification"`、`blocking: true`
- `adjustmentReplies` → `kind: "adjustment"`、`blocking: false`
- artifact 失败 `suggestedReplies` → `kind: "retry"` 或 `adjustment`

服务端对旧字段也执行同一套口吻和事实校验。新流事件优先输出 `assistant_suggestions`，旧 `suggested_replies` 可以短期继续输出或由前端兼容读取。

## Risks / Trade-offs

- [Risk] 各阶段 prompt 输出结构扩展会增加模型 JSON 复杂度。→ Mitigation：先允许旧字段进入归一化层，再逐步让各阶段输出新结构。
- [Risk] 不新增独立 suggestion call 可能让部分普通回答没有建议。→ Mitigation：健身主路径优先覆盖缺信息、推荐、训练生成、失败恢复；普通闲聊没有强制建议时可以不展示 chips。
- [Risk] 口吻校验过严导致建议被清空。→ Mitigation：trace 记录过滤原因，测试覆盖典型合法和非法表达，必要时保留简单确定性 fallback 但不硬编码业务建议。
- [Risk] 前端迁移期间同时存在旧事件和新事件。→ Mitigation：以 `assistant_suggestions` 为优先，旧事件只作为兼容，不重复展示同一条建议。

## Migration Plan

1. 定义共享 `AssistantSuggestion` schema 和服务端归一化函数。
2. 将意图解析、artifact 成功/失败、引用确认和 patch 确认的旧建议字段接入归一化层。
3. 增加建议口吻校验，过滤 AI 指令式、追问式或系统口吻文本。
4. 输出 `assistant_suggestions` 流事件，并让 trace 展示原始来源、过滤结果和最终可见建议。
5. 前端优先消费 `assistant_suggestions`，保留旧 `suggested_replies` 兼容。
6. 逐步扩展各阶段 LLM prompt，让其直接输出 `assistantSuggestions` 候选。
