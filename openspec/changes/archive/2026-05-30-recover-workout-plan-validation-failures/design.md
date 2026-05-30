## Context

聊天推送训练计划当前分为两段：`/api/chat` 触发内部动作事件，前端 silent generation 调用 `/api/ai/workout-plan` 生成草稿。草稿生成后服务端会用 Zod Schema、动作候选集合和训练规则做校验；任何错误都会让接口返回失败，前端展示“计划生成失败”。

最新日志中的失败是 `session_too_long`：AI 声明 30 分钟，但服务端估算 49 分钟。这个错误不是权限、安全或数据污染问题，而是生成草稿需要压缩。它适合自动修复或引导用户继续对话，而不是直接终止。

## Goals / Non-Goals

**Goals:**

- 保留服务端校验，继续防止无效动作 ID、候选外动作、缺失三段式结构和 Schema 错误进入卡片。
- 将可调整类校验问题转成可恢复流程：先自动修复一次，仍失败再返回聊天式引导。
- 让前端显示“计划生成失败”时附带可操作的继续对话选项，而不是只显示技术错误。
- 记录 AI Trace 中原始失败、修复请求、修复结果和最终引导，便于继续排查。

**Non-Goals:**

- 不删除 `session_too_long`、训练量、动作候选等校验规则。
- 不让前端展示未通过校验的草稿。
- 不新增数据库表或持久化失败草稿。
- 不实现无限重试；本次最多自动修复一次。

## Decisions

### Decision 1: 校验失败分为 recoverable 和 hard failure

将校验问题分类：

- 可恢复：`session_too_long`、`day_estimate_mismatch`、`too_many_daily_sets`、`beginner_volume_high`、`rest_too_short`、`weekly_frequency_mismatch`。
- 硬失败：`invalid_exercise_id`、`outside_candidate_exercise_id`、`empty_candidate_set`、`missing_routine_section`、`cycle_structure_mismatch`、`day_similarity_high`、Schema 解析失败。

可恢复问题代表“训练方案需要调整”；硬失败代表“结构或候选边界不可信”。硬失败不应直接放行，但可以进入一次结构修复；如果修复后仍失败，则给用户引导或失败提示。

### Decision 2: 服务端自动修复一次

`/api/ai/workout-plan` 在首次校验失败后构造修复请求，把原始草稿、校验错误、警告、用户 intent、候选动作和明确修复目标传给 LLM。修复请求要求模型保留 `kind`、候选动作约束和三段式结构，同时针对错误压缩或调整草稿。

选择服务端修复而不是前端二次请求，是为了让 API 保持单次调用体验，并让 trace 包含完整恢复链路。

### Decision 3: 修复失败返回可恢复响应而不是终止型异常

如果自动修复后仍未通过，接口返回结构化失败结果，包含：

- `ok: false`
- `code: "plan_validation_failed"`
- `recoverable: true | false`
- `guidanceMessage`
- `suggestedReplies`
- `validation.errors`
- `validation.warnings`

前端根据 `recoverable` 展示聊天式引导。对于用户可以决策的问题，建议回复应使用第一人称，例如“压缩到 30 分钟”“保留完整训练量”“减少动作数量”。

### Decision 4: 前端不展示失败草稿

无论失败是否可恢复，前端都不能展示未通过校验的训练卡片。可恢复失败只展示引导消息或错误提示，并允许用户继续发送选择。

## Risks / Trade-offs

- [Risk] 自动修复增加一次模型调用成本和延迟。→ Mitigation: 最多修复一次，只在校验失败时触发。
- [Risk] 修复请求仍可能生成无效草稿。→ Mitigation: 修复结果继续走同一套服务端校验，不通过不展示。
- [Risk] 可恢复失败分类过宽会隐藏真实结构问题。→ Mitigation: 候选、动作 ID、Schema 和三段式结构默认保持硬边界。
- [Risk] 前端引导和聊天消息状态重复。→ Mitigation: 失败恢复只作为当前气泡的 plan generation 状态展示，不持久化为 AI 正文，后续可再统一为系统消息。
