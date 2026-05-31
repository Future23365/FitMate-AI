## Context

本次失败来自真实 `npm run test:llm` 黑盒报告。动作推荐相关失败都发生在服务端编排准备返回 stream 之前，说明不是前端展示或测试断言漂移，而是内部 artifact 生成路径抛出了运行时异常。长期计划失败则是门控逻辑把“每周4练，每次45分钟”当成可直接生成计划的完整意图，但上一轮只是笼统计划请求，仍缺训练目标和器械条件。

当前架构要求 LLM 负责语义理解，服务端负责候选动作、触发边界、校验和 artifact 生成。修复应继续保留这个边界，避免用测试用例特判替代业务规则。

## Goals / Non-Goals

**Goals:**

- 动作推荐 artifact 生成路径不再依赖半截 `Exercise` 对象，不因 `imageUrls` 等展示字段缺失抛异常。
- 长期计划补齐流程在缺少目标或器械时继续追问，即使用户已经补充周频率和单次时长。
- 手动黑盒报告完整记录所有 fixture 轮次，让失败和级联跳过数量可读。
- 增加单元测试覆盖，不依赖真实模型才能发现这类确定性回归。

**Non-Goals:**

- 不调整 DeepSeek 模型、prompt 模块或 token 预算策略。
- 不改变数据库 schema、动作库 seed、API 返回契约或前端卡片结构。
- 不自动运行真实 LLM 黑盒测试，除非用户明确接受 token 成本。

## Decisions

1. 动作推荐候选使用完整服务端动作对象，而不是在 `generateChatArtifact()` 中手动拼半截对象。

   备选方案是给半截对象补 `imageUrls: []`。这能修掉当前异常，但仍保留 `as Exercise` 掩盖字段缺失的问题。更稳妥的做法是让 `ExerciseContext` 的 `providedExercises` 携带完整 `Exercise`，模型可见字段继续通过 `toModelVisibleChatExercises()` 裁剪，artifact 生成时复用完整对象补展示字段。

2. 动作推荐服务对展示图片字段做防御式读取。

   即使上游应该传完整对象，推荐卡片的 `imageUrl` 本身是 optional，服务端不应因为单个动作没有图片而崩溃。使用 `exercise.imageUrls?.[0]` 可以让无图动作正常生成卡片。

3. 长期计划补齐门控以具体目标作为最低可执行边界。

   仅有“每周4练，每次45分钟”不代表训练目标，不能靠默认目标生成空泛计划。具体的“6 天训练计划”仍保留可触发，因为它是已有黑盒用例要求的明确计划语义；已有 plan artifact 的调整也继续允许更新频率或时长。

4. 手动黑盒 runner 在任意轮次失败后记录剩余轮次为 skipped。

   这样报告的 `turns` 始终等于 fixture 轮次数，便于比较真实失败和级联跳过。命令仍保持非零退出码，不降低测试严格度。

## Risks / Trade-offs

- [Risk] `ExerciseContext` 携带完整动作对象会增加服务端内存对象大小。→ Mitigation: 模型可见 payload 仍然使用裁剪后的白名单字段，不增加发送给 LLM 的 token。
- [Risk] 长期计划门控过严可能多问一轮。→ Mitigation: 只阻断没有具体目标的补齐流程；明确目标、明确周期或已有 plan 上下文仍可生成计划。
- [Risk] 手动黑盒报告记录更多 skipped 可能改变历史报告数字。→ Mitigation: 这是报告完整性的修复，不改变失败判定和退出码。
