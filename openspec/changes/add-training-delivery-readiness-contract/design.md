## Context

当前 LangChain Agent Runtime 已经通过 `searchExerciseResources` 向模型暴露动作候选，并通过 `submitVisibleTrainingProposal` 校验和投影训练方案。现有 prompt / tool description 已说明“候选足够时停止同类查询”，但没有定义训练编排语义下什么叫“足够”，模型容易继续补查候选而不进入结构化提交。

本次问题属于模型可见合同缺口，不属于 runtime 主循环、handler、response adapter 或数据库查询问题。修复应增强模型自主规划能力，而不是由服务端根据用户自然语言或具体 tool result 字段组合改写 tool call。

## Goals / Non-Goals

**Goals:**

- 在 Planner Policy 中表达训练编排交付判据，让模型能判断何时停止动作查询并提交 `routine` 或 `plan`。
- 在 `searchExerciseResources` tool description 中表达查询结果事实边界，避免模型把候选池或辅助阶段局部缺口误读成继续查询指令。
- 在 `submitVisibleTrainingProposal` tool description 中表达结构化提交准入，让模型在候选事实足够时选择子集、生成处方和日程。
- 用测试覆盖模型可见合同，确认没有新增服务端关键词规则、自然语言模板路由、phrasing 特判或 runtime 业务 toolName 分支。

**Non-Goals:**

- 不修改 LangChain runtime 主循环、连续调用上限、tool wrapper 执行合同或 provider payload。
- 不新增服务端语义分流、关键词判断、正则、同义词表或基于用户原文的 `payload.kind` 改写。
- 不修改训练方案 schema、validator、数据库模型或 response adapter。
- 不承诺用 prompt 解决所有训练合理性问题；服务端仍只校验确定性边界。

## Decisions

### 1. 交付判据放在 Planner Policy，字段细节留给 tool description / schema

Planner Policy 负责“什么时候继续 tool、什么时候停止、什么时候提交结构化结果”。本次会在 `buildLangChainAgentSystemPrompt()` 的训练相关决策示例附近补充稳定的训练编排交付判据，说明：

- `training` 候选已能覆盖主要训练目标时，可以选择子集构造主训练。
- `warmup` / `stretch` 是辅助阶段，除非用户明确要求特定覆盖，否则有可用候选即可纳入或按当前事实范围交付。
- `prescription` 和 `schedule` 不来自动作库查询，动作候选足够后应由模型基于目标、时长、频率或保守默认构造。
- 缺少周期或频率时，默认交付 `routine`；只有目标明确要求多天、每周或周期安排时才交付 `plan`。

替代方案是只修改 `searchExerciseResources` tool description。该方案不足，因为 tool description 讲能力和输出事实，不能承担完整业务编排策略。

### 2. `searchExerciseResources` 只补事实边界，不输出“已满足目标”

动作查询结果仍然只暴露候选事实和安全覆盖边界，不新增 `supportsOutputKinds`、`visibleDeliveryBoundary`、`fulfillment` 或等价业务目标满足度字段。tool description 只澄清：

- `candidateGroups[].exercises` 是可选择候选池，不是最终清单。
- 辅助阶段候选不要求逐个目标肌群都有 primary 命中。
- 局部窄查询缺口不等于整体 `routine` / `plan` 不可交付；内部诊断字段不进入 Planner-visible 说明。
- `coverage` 不是下一步 tool 调用指令。

替代方案是在 tool result summary 中新增 ready 字段。该方案会把业务目标满足度放进查询 tool 输出，容易回退到历史上过度指挥模型的投影形态。

### 3. `submitVisibleTrainingProposal` 表达提交准入，不替模型生成计划

结构化收口 tool 的 description 将补充“当前可见候选已经能组成主训练，并有可用辅助阶段候选或可合理省略辅助阶段时，应选择子集提交”的准入条件。它仍不生成动作、不补处方、不保存计划，只让模型知道何时可以把自身构造的 payload 交给 validator。

### 4. 抽象层级门禁结论

结论：可继续。

1. 抽象问题类型：训练编排 ready-to-submit 判据缺失，导致模型无法稳定判断候选事实是否足以进入结构化收口。
2. 通用合同修复：补 Planner Policy 的停止条件和正向交付准入，不使用具体用户短句作为触发规则。
3. 业务 tool 局部说明：`searchExerciseResources` 只说明候选事实能/不能支撑什么；`submitVisibleTrainingProposal` 只说明结构化训练方案提交准入。
4. 回归测试样例：使用原始失败语义和至少一个等价表达覆盖“候选足够后应收口”的模型可见合同，不把样例反向写成生产触发规则。
5. 服务端语义分流检查：不新增关键词规则、自然语言模板路由、phrasing 特判或具体 toolName 语义分支。

## Risks / Trade-offs

- [Risk] prompt 增加业务判据后可能变长，增加模型输入负担。→ Mitigation：Planner Policy 只写停止条件和准入条件，不复制 schema 字段细节。
- [Risk] 过度强调交付可能让模型在事实不足时提前提交。→ Mitigation：保留 `training` 至少可消费、动作 id 必须来自受控事实、validator 继续拒绝不合法结构的边界。
- [Risk] `warmup` / `stretch` 不要求逐肌群覆盖可能降低辅助阶段精确性。→ Mitigation：仅在用户未明确要求特定覆盖时适用；用户明确要求时仍需按目标补查或澄清。
