## Context

当前 routine / plan 生成链路中，AI 负责输出三段式训练草稿，服务端再做结构、动作候选、时长和训练量校验。最近日志中，用户说“30分钟，练这个”后，意图解析、近指引用和候选动作都成功，但服务端因为 `Knee_Circles`、`Wrist_Circles` 不允许进入 `warmup` 而让草稿失败。

这暴露出当前 `allowedSections` 的职责过重：它既用于候选筛选和提示词约束，又被当作最终硬校验。对于动作是否属于热身、主训练或拉伸这类训练语义，LLM 通常比粗粒度标签更能理解动作说明和上下文。服务端继续用静态规则穷举会扩大误杀面。

## Goals / Non-Goals

**Goals:**

- 明确服务端训练草稿硬校验只覆盖确定性事实和安全边界。
- 将动作阶段归属、动作顺序、动态热身与拉伸区分等语义判断交给 LLM。
- 保留服务端 trace warning，方便观察 LLM 与本地元数据不一致的情况。
- 修复 `section_exercise_mismatch` 导致合理 routine 进入失败恢复的链路。
- 为 `Knee_Circles`、`Wrist_Circles` 这类动态关节活动进入 `warmup` 增加回归覆盖。

**Non-Goals:**

- 不移除服务端 Schema、候选集合、动作 ID、权限、安全、时长或训练量校验。
- 不让 LLM 直接写入数据库或绕过服务端保存流程。
- 不要求本次重建完整动作元数据体系。
- 不改变聊天流事件、前端卡片 payload 或数据库结构。

## Decisions

### Decision 1: 硬校验只管确定性事实

服务端继续 hard fail 以下问题：动作 ID 不存在、动作不在本轮候选集合、缺少 `warmup / training / stretch` 必要结构、Schema 解析失败、用户权限或私有数据越界、器械/伤病限制被绕过、时长和训练量明显离谱。

取舍：这保留了服务端必须承担的事实、安全和可执行边界，同时避免用弱元数据替代训练语义判断。

### Decision 2: Section 语义不再 hard fail

`section_exercise_mismatch` 不再作为 routine / plan 草稿的终止型错误。若动作真实存在、来自候选池，且不违反用户限制，则 AI 可以将动态活动、灵活性或拉伸类动作放入 `warmup` 或 `stretch`。

替代方案是继续细化 `allowedSections`，为每个动作补更多规则。但该方案会把开放语义问题变成持续膨胀的硬编码规则，仍然会在边界案例上误杀合理编排。

### Decision 3: `allowedSections` 降级为提示和诊断信号

`allowedSections` 可继续用于候选预分池、prompt 提示、trace 诊断和候选排序，但不应作为唯一依据拒绝 AI 草稿。服务端可以记录 warning，例如“动作本地元数据偏向 stretch，但 AI 放入 warmup”，供后续评估动作数据质量。

取舍：这样保留了本地元数据的价值，又不会让它覆盖 LLM 对动作说明和训练上下文的判断。

### Decision 4: 恢复策略不处理非确定性语义分歧

自动修复应处理时长、训练量、结构缺失、候选外动作等可明确修复的问题。对于 section 语义分歧，系统不应进入“计划生成失败”，也不应要求用户补充目标、器械或时长。

取舍：用户不需要为系统内部元数据分歧买单，聊天体验会更符合“动作已合理生成就直接展示”的预期。

## Risks / Trade-offs

- [Risk] LLM 可能把明显主训练动作放入热身。→ Mitigation：保留训练量、强度、时长和伤病限制校验；对高风险或明显超量场景继续 hard fail。
- [Risk] 本地动作元数据质量问题被隐藏。→ Mitigation：保留 warning 和 trace 统计，后续可用真实失败样本反向修正元数据。
- [Risk] 候选预分池仍可能因为 `allowedSections` 过窄影响模型可选动作。→ Mitigation：实现时同步检查候选分池逻辑，确保总候选池仍能提供给模型，section 分池只作为优先级而非唯一来源。
- [Risk] 旧测试依赖 `section_exercise_mismatch` hard fail。→ Mitigation：重写测试期望，保留候选外动作、缺结构、非法 ID 等确定性失败覆盖。

## Migration Plan

1. 调整 validation issue 分类，将 `section_exercise_mismatch` 从 hard boundary 中移出，或改成 warning。
2. 调整 routine / plan 草稿校验，让 section 语义分歧不影响 `valid`。
3. 调整 recovery 分类，确保 section 语义 warning 不触发生成失败。
4. 补充 `Knee_Circles`、`Wrist_Circles` 进入 `warmup` 的单元测试和服务测试。
5. 运行相关测试与类型检查。

## Open Questions

- 是否需要在 trace UI 中单独展示“语义 warning”和“硬失败”的区别？
- 是否需要保留一个开发环境开关，用于调试阶段观察 section 元数据分歧，但生产不阻断？
