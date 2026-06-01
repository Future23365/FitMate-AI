## Context

当前 `/api/chat` 链路中，LLM 先输出聊天意图，服务端随后会执行一层意图归一化。该归一化层混合了两种职责：

- 契约归一化：解析 schema、清理空值、校验 `type` / `action.kind` / `responseMode` / `workoutIntent` 的一致性。
- 语义归一化：通过关键词、短句规则和历史上下文推断，重新决定用户到底要动作推荐、routine、plan、patch、替换还是讲解。

近期日志显示，LLM 原始输出已正确判断为 `exercise_replacement`，但服务端因为缺少 `workoutIntent` 且命中“换成”类规则，将它改写成 `routine`，最终触发整套训练重新生成。这个问题说明语义归一化层已经越过了服务端职责边界。

## Goals / Non-Goals

**Goals:**

- 删除服务端所有会改写高层语义意图的规则，包括基于关键词、正则、短句模板或历史摘要推断 `type` / `action.kind` / `workoutIntent.intentType` 的逻辑。
- 保留服务端确定性契约校验：schema、枚举、字段一致性、引用需求、权限、数据库存在性、patch 范围、artifact 校验和 trace 诊断。
- 将不可执行或结构冲突的 LLM 输出导向 repair、澄清或拒绝执行，而不是服务端擅自替换为另一类 action。
- 确保 `exercise_replacement`、`workout_patch`、`exercise_explanation` 这类依赖历史 artifact 的请求优先进入引用解析和对应确定性执行流程。

**Non-Goals:**

- 不重写 LLM prompt 的整体语义理解策略。
- 不新增前端编排能力，前端仍只消费服务端 action、artifact、patch 和建议事件。
- 不用服务端规则枚举自然语言同义表达，也不新增“更强”的关键词识别表。
- 不改变 Prisma schema、数据库迁移或用户数据模型。

## Decisions

### 1. 将 `normalizeChatIntentForBlackboxFlows` 拆为契约处理和语义处理，并删除语义处理

`normalizeChatIntentForBlackboxFlows` 当前承担了黑盒短句修正、历史继承、长期计划补全、动作推荐 refine、routine 调整等语义职责。实现时应移除或停止调用会改写高层意图的分支，只保留可证明确定性的契约处理。

取舍：这会减少服务端对高频短句的兜底能力，但这些短句本质上属于自然语言理解，应由 LLM 和结构化输出 schema 负责。服务端继续保留一致性门控，避免无效结构直接执行。

### 2. 允许补齐确定性字段，但禁止改写高层动作类型

服务端可以处理 `null` / `undefined`、默认数组、字段来源、trace metadata、引用解析结果、缺失字段列表和可执行门控。服务端不得因为用户文本包含某个词而把 LLM 输出的 `exercise_replacement` 改为 `routine`，或把 `routine` 改为 `workout_plan`。

取舍：实现需要区分“字段规范化”和“语义修正”。判断标准是：如果逻辑需要解释用户自然语言含义，它就不属于服务端契约归一化。

### 3. 结构冲突走 repair 或澄清，不走服务端改写

当 LLM 输出 `type`、`action.kind`、`workoutIntent.intentType`、`referenceRequirement` 之间冲突时，服务端应按现有 resolved intent repair 机制处理。repair 失败后降级为澄清或拒绝执行。

取舍：相比直接服务端改写，这会多一次 LLM repair 或多一次用户澄清，但能避免确定性规则把正确语义改坏。

### 4. 引用型动作不强制要求 `workoutIntent`

`exercise_replacement`、`workout_patch`、依赖 artifact 的 `exercise_explanation` 的执行核心是历史 artifact 引用、目标 item 和确定性 patch/读取结果，不是新生成训练所需的 `workoutIntent`。这些动作应校验 `referenceRequirement` 和 `referenceResolution`，不能因 `workoutIntent` 缺失而被改成新 routine 或 plan。

取舍：需要让契约门控按 action 类型区分必需字段。生成型 action 仍需要训练意图；引用型 action 需要引用对象和目标边界。

## Risks / Trade-offs

- [Risk] 移除语义归一化后，部分历史上靠服务端规则兜底的短句可能更依赖 LLM 输出质量。  
  Mitigation: 使用结构化 prompt、schema、repair 和黑盒测试覆盖这些短句；服务端只在不可执行时澄清。

- [Risk] 契约归一化和语义归一化边界不清，后续可能重新引入关键词兜底。  
  Mitigation: 在 spec 和测试中明确禁止基于关键词判断 LLM 高层意图准确性；新增回归测试锁住失败模式。

- [Risk] 引用型动作缺少 `workoutIntent` 后，旧门控可能仍误判为不可执行。  
  Mitigation: 按 action 类型重构必需字段检查，引用型动作校验 artifact、目标动作和 patch 范围。
