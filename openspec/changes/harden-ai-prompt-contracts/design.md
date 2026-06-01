## Context

当前聊天主链路已经把动作候选、artifact、reference resolution、用户记忆、policy 和 trace 放到服务端编排，但 prompt 仍承担了过多跨阶段职责。尤其是 `chatIntentResolution` 同时要求模型输出旧版 intent 字段和新版 resolved intent 字段，最终回复模型又会看到大量 server JSON block，导致默认值、历史摘要和服务端事实之间的边界不够清晰。

现有 token budget 和 prompt module registry 已经提供了可观测基础，但真实黑盒报告仍显示单轮 token 成本偏高，并且部分用户可见回复会把默认值表达成已确认条件，或输出“稍后生成”“马上整理”等流程感文案。

## Goals / Non-Goals

**Goals:**

- 让 resolved intent 成为聊天动作触发的唯一模型输出契约，旧字段只作为兼容派生结果。
- 让默认值、推断值、历史事实、artifact 事实和当前用户消息在模型输入中有明确优先级和用户可见表达规则。
- 减少执行型回复对自由生成 prompt 的依赖，优先由服务端 response writer 根据 resolved intent 和 artifact result 生成稳定过渡文案。
- 继续缩小 prompt module 和模型 payload，避免无关 schema、重复 repair 指令和完整 server JSON 块进入不需要的模型阶段。
- 保留当前服务端候选动作、Zod 校验、ReferenceResolver、PolicyEngine、ConfirmationGate 和黑盒测试链路。

**Non-Goals:**

- 不更换模型供应商，不引入新外部依赖。
- 不修改 Prisma schema 或数据库迁移。
- 不让服务端通过关键词、正则或同义词表重新解释用户自然语言语义。
- 不降低动作候选 grounding、训练草稿校验、权限隔离或真实黑盒测试覆盖。

## Decisions

### Decision 1: resolved intent 优先，旧字段降为兼容视图

`chatIntentResolution` 的目标输出应收敛到 resolved intent。旧的 `type`、`canTriggerAction`、`missingActionFields` 和 `suggestedReplies` 继续存在时，必须由 resolved intent 派生，不能让模型同时独立决定两套语义。

取舍：这比继续在长 prompt 里补更多例子改动更大，但能减少同一轮里 `type=exercise_recommendation`、`action.kind=workout_routine` 或 `workoutIntent.intentType=routine` 互相冲突的问题。

### Decision 2: 字段来源决定用户可见表达

模型可以继续使用默认值满足 schema，但所有默认字段必须通过 `fieldSources.default` 或等价来源标记进入回复阶段。最终回复不得把 default 字段说成用户明确提供；只有 `current_user_message`、`history`、`artifact` 等可信来源字段可以被自然表述为用户条件。

取舍：这会让部分回复更克制，但能避免“用户只说练胸，助手说按 30 分钟、每周 3 次”的错觉。

### Decision 3: 执行型 response writer 模板化优先

对 `action.shouldTrigger=true` 且 artifact 结果已成功的动作推荐、routine、plan 和 patch 场景，优先使用服务端 response writer 根据 action kind、字段来源和 artifact result 生成短回复。LLM 最终回复保留给普通问答、解释、澄清和工具补查场景。

取舍：模板化会降低一点自然语言多样性，但执行型回复的核心价值是与卡片结果一致、无流程泄漏、可回归。

### Decision 4: Summary 以结构化事实和内部动作摘要为主

summary 更新仍可使用模型压缩自然语言，但输入中 `assistantReply` 应被视为弱参考。服务端内部动作摘要、resolved intent、artifact result 和字段来源应优先于 assistant 自然语言，默认值不得被总结成用户事实。

取舍：summary 的文本可能更像事实账本，但后续多轮动作继承更稳定。

### Decision 5: prompt module 和 schema 按阶段裁剪

训练草稿生成只注入当前 `intent.intentType` 对应的 schema；repair prompt 只保留一处修复基础规则；只读工具决策 prompt 必须包含工具级 input schema 摘要和停止条件；最终回复只传 compact summary，而不是完整 server JSON。

取舍：需要更新测试断言和 trace 展示，但能降低 token 消耗并减少模型被无关结构干扰。

## Risks / Trade-offs

- [Risk] 旧字段兼容调整可能影响现有前端或测试读取字段。→ 通过兼容派生层保留旧字段输出，并补单测证明旧字段不再独立触发动作。
- [Risk] 执行型回复模板化后语气变得单一。→ 保留少量按 action kind 和来源组合的中文模板，但禁止 UI 流程承诺和默认值伪装。
- [Risk] 压缩模型输入可能削弱动作选择质量。→ 只删无关 schema 和重复指令，不删候选动作选择所需字段；用黑盒和服务端候选校验兜底。
- [Risk] Summary 事实边界收紧后短指令缺上下文。→ 继续保留 artifact summary、ReferenceResolver 和服务端 hydrated conversation context，summary 只承担自然语言摘要角色。

## Migration Plan

1. 先补齐 specs 和测试断言，固定 prompt contract 目标行为。
2. 调整 `prompt-config`、`token-budget` 和 resolved intent 解析链路，让旧字段由 resolved intent 派生。
3. 引入或收敛执行型 response writer，覆盖动作推荐、routine、plan 和 patch 成功/失败回复。
4. 调整 summary 更新输入和 prompt，确保默认值和 assistant 口误不会进入长期事实。
5. 裁剪训练草稿 schema、repair prompt、只读工具决策 prompt 和最终回复 server blocks。
6. 运行相关单测、typecheck，并在用户确认成本后运行真实 LLM 黑盒子集验证。
