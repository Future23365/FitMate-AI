## Context

本次 trace 的用户路径是：先生成“30 分钟哑铃上肢训练”，随后用户输入“`不用哑铃了，换一个`”。模型初始输出 `type = "exercise_replacement"`，但没有给出可执行 `workoutIntent`；服务端随后没有把它收敛为对最近 routine 的器械调整，而是使用整句进入 `ReferenceResolver` 语义检索。

当前 `ReferenceResolver` 只有在用户消息包含“这个”“这套”“刚才”“上一个”等近指词时，才优先使用当前会话 recent artifacts。该句没有显式近指词，于是进入 `current_user` 范围检索。artifact hybrid search 又把“`不用哑铃`”中的“哑铃/用哑铃”当成正向命中，导致跨会话哑铃 artifact 排在当前会话最近 routine 前面。最终引用解析返回 `ambiguous`，确定性回复把候选用一整段文本拼接输出。

本设计遵守 AI 语义边界：LLM 仍负责判断用户是否在请求调整、替换、重新生成或普通回答。服务端不通过关键词把高层意图改写成另一个 action；服务端只在 LLM 已经表达可调整/可修改语义时，按结构化上下文、当前会话 artifact、否定约束和权限边界选择安全执行路径。

## Goals / Non-Goals

**Goals:**

- 让“已有 routine/plan 后，用户否定历史器械并要求换一个”的短指令能沿用最近训练目标和时长，并覆盖器械条件。
- 防止 `不用哑铃` 被 artifact 搜索当成“哑铃方案优先”的正向检索条件。
- 让当前会话唯一 recent routine/plan 在调整类短指令中优先于跨会话 artifact。
- 让引用澄清回复和确认建议可读、可点击，并避免优先展示违反当前否定约束的候选。
- 让 summary 更新保存覆盖后的器械事实，避免下一轮继续强化旧哑铃条件。
- 用测试覆盖 trace 复现路径和防回归边界。

**Non-Goals:**

- 不新增任意 SQL、客户端 patch 执行器或绕过 userId/sessionId 的 artifact 读取路径。
- 不让服务端基于原始中文关键词重新判断用户高层意图；高层意图仍来自 LLM / Structured Outputs / repair。
- 不要求所有器械限制都由规则穷举解析；本 change 只处理已进入训练调整链路后的确定性否定约束过滤和执行边界。
- 不把前端改造成正文解析器；候选按钮仍只来自 `assistantSuggestions`。

## Decisions

### 1. 调整类短指令优先绑定当前会话 recent artifact

当 resolved intent 已经表达 `workout_patch`、`exercise_replacement`、routine 重新生成或等价调整意图，并且当前会话只有一个可调整 active routine/plan 时，ReferenceResolver 应先解析到该 recent artifact。只有 recent artifact 不存在、类型不匹配或存在多个同等候选时，才进入语义检索或澄清。

替代方案是继续完全依赖用户显式说“这套/刚才”。这个方案已经导致短指令进入跨会话搜索，且用户真实语境中经常不会重复“这套”，因此不采用。

### 2. 否定器械是过滤约束，不是正向召回词

artifact hybrid search 需要在 query 规范化或 rerank 阶段识别已结构化传入的否定器械约束，避免把被否定词作为正向 textScore 或 vectorScore 的主要来源。对于 `不用哑铃` 这类输入，候选包含哑铃时不能因此获得“全文匹配哑铃”的加分；如果候选明显违反当前约束，应被降权、过滤或排到澄清候选之后。

替代方案是完全移除 query 中所有器械词。这样会损失“我有哑铃，找之前那套哑铃训练”的正向场景，因此不采用。修复应区分肯定器械和否定器械。

### 3. 器械变化可以走 Patch，也可以走受控重新生成

如果当前调整能安全映射为局部 patch，例如替换所有哑铃动作或替换单个被点名动作，则进入 `workout_patch` / `exercise_replacement`。如果用户表达是“这套不用哑铃，换一个”且影响整套训练动作选择，则服务端可以选择重新生成同目标、同时长、无哑铃的 routine，并保存新的 artifact revision。无论选择哪条路径，都必须保留原目标和时长，并校验新动作来自数据库和候选集合。

替代方案是把所有器械变化都做成逐个动作 patch。这个方案在整套哑铃训练中会引入复杂的多动作替换和时长校验，风险高；允许受控重新生成更清晰。

### 4. 澄清候选应结构化、可读并受当前约束过滤

当确实需要用户确认 artifact 时，服务端应输出短句加多行列表，或等价结构化可读文本；同时输出 `assistantSuggestions`。候选列表应优先展示符合当前器械约束、当前会话和 kind 的候选，明显违反“不要哑铃”的候选不得排在前列；如果所有候选都违反约束，应引导用户重新生成无哑铃方案，而不是让用户确认哑铃方案。

替代方案是只修 Markdown 换行。这样无法解决“候选仍违反用户约束”的核心问题，因此不单独采用。

### 5. Summary 更新要记录覆盖事实

本轮完成后，summary 输入应包含服务端内部动作摘要中的约束覆盖结果。模型总结和确定性兜底都必须把“器械改为不使用哑铃/无器械”视为当前事实，不能继续记录“器械：哑铃”作为有效条件。

## Risks / Trade-offs

- [Risk] 过度优先 recent artifact 可能误改用户想引用的历史 artifact。→ Mitigation: 只在 LLM 已表达调整类意图且当前会话唯一可调整 artifact 时高置信命中；多个候选仍澄清。
- [Risk] 否定器械解析不完整。→ Mitigation: 第一阶段覆盖常见结构化否定约束，并在 trace 中记录提取结果；后续可扩展到更多器械/场地约束。
- [Risk] 整套重新生成会改变未点名动作。→ Mitigation: 只有器械变化影响整套可执行性时才使用重新生成；局部替换仍走 Patch。
- [Risk] 确定性澄清模板变多影响回复自然度。→ Mitigation: 澄清模板只负责候选确认；复杂说明仍可交给最终回复模型，但必须消费真实 resolved intent 和 artifact 结果。
- [Risk] summary 模型仍可能写回旧器械事实。→ Mitigation: 增加 summary 更新测试和确定性兜底；必要时对内部动作摘要中的覆盖字段做强约束。

## Migration Plan

1. 增加复现测试：已有哑铃 routine 后发送“`不用哑铃了，换一个`”，断言不会返回哑铃候选澄清作为最终结果。
2. 调整 resolved intent / ReferenceResolver 接口，让调整类短指令可以携带 current artifact hint、allowed kinds 和否定器械约束。
3. 修正 artifact search query / rerank：否定器械不贡献正向分数，违反约束候选降权或过滤，并在 trace 记录原因。
4. 接入 Patch 或受控重新生成路径，确保输出无哑铃 routine/plan 或明确可恢复失败。
5. 改造引用澄清回复格式和 `assistantSuggestions` 过滤。
6. 修正 summary 更新输入和兜底逻辑。
7. 运行相关单元测试、`npm run typecheck`、`openspec validate fix-negative-equipment-routine-adjustment --strict`；如触及黑盒 runner，更新报告或说明未跑真实模型原因。

## Open Questions

无。
