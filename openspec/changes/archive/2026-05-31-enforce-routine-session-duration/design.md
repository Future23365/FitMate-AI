## Context

最近日志显示，用户明确要求 40 分钟 routine 后，LLM 初稿被服务端估算为 59 分钟并触发 `session_too_long`，自动修复后实际估算降到 25 分钟，但仍声明 `estimatedSessionMinutes = 40`。当前校验只把这种偏差记为 `day_estimate_mismatch` warning，导致接口返回可展示草稿，前端卡片按确定性时间线显示 25 分钟。

该问题跨越三层：LLM 生成/修复提示词、服务端校验恢复分类、前端卡片的确定性估算展示。前端显示逻辑是正确方向，修复重点应放在生成闭环和服务端验收。

## Goals / Non-Goals

**Goals:**
- 把 `intent.sessionMinutes` 作为 routine 可执行估算的目标区间，而不是只作为 LLM 声明字段。
- 当实际估算明显低于目标时长时，触发可恢复校验失败和自动修复。
- 让修复 prompt 明确区分“太长要压缩”和“太短要补足”，减少减量过头。
- 用自动化测试锁住时长不足校验、恢复策略和修复提示词。

**Non-Goals:**
- 不改变训练时间线估算算法本身。
- 不改变 routine / plan API 响应结构。
- 不新增数据库字段或迁移。
- 不要求真实模型测试作为本次必要验收。

## Decisions

1. 服务端新增 `session_too_short` 错误，而不是继续依赖 `day_estimate_mismatch` warning。

   理由：用户明确给出 40 分钟时，25 分钟不是展示层误差，而是生成结果没有满足用户约束。把它设为错误可以阻止错误卡片展示，并复用现有自动修复闭环。

   备选方案：只加强 prompt。该方案成本低，但不能稳定约束 LLM 算术，且仍可能让不合格草稿通过。

2. 使用目标时长容差区间判断太短。

   建议规则：当 `estimatedMinutes < intent.sessionMinutes - 10` 且目标时长至少 20 分钟时，判定为 `session_too_short`。这样与现有 `day_estimate_mismatch` 的 10 分钟阈值一致，避免 10 分钟以内的自然误差被频繁阻断。

   备选方案：使用百分比阈值。百分比对短训练更敏感，容易让 15-20 分钟的轻量 routine 被过度修复。

3. 自动修复 prompt 根据错误方向给出不同策略。

   - `session_too_long`：压缩动作数量、组数、循环轮数或休息。
   - `session_too_short` / `day_estimate_mismatch` 且实际低于目标：补足主训练容量，优先增加循环轮数、主训练动作组数、合理次数、合适动作或合理休息。

   理由：当前统一“保守可执行”和“太长压缩”会让模型减量过头，需要给出与失败方向一致的修复指令。

## Risks / Trade-offs

- [Risk] 太短变成 error 后，某些本来可用的轻量 routine 会进入修复或失败引导。  
  Mitigation：只在用户目标时长明确且偏差超过 10 分钟时触发。

- [Risk] 自动补足训练量可能导致新手容量偏高。  
  Mitigation：保留已有 `beginner_volume_high`、`too_many_daily_sets` 等校验，修复后仍走同一套服务端校验。

- [Risk] LLM 仍可能通过改声明字段而不是改动作参数来“修复”。  
  Mitigation：服务端重新估算实际时长；声明字段不再决定通过与否。
