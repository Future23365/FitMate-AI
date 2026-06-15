## Context

生产 `/api/chat` 使用 LangChain Agent Runtime 和 DeepSeek native `tool_calls`。当前 `searchExerciseResources` 能返回动作候选事实，`submitVisibleTrainingProposal` 负责校验并投影 `visibleTrainingProposal`。本次失败发生在模型已经多次获得动作候选后，仍继续查询更多动作，触发 `tool_consecutive_call_limit_exceeded`，没有进入结构化收口。

问题不在动作库查询 handler、runtime 熔断或 `visibleTrainingProposal` validator。缺口在模型可见合同：模型没有稳定区分“缺动作候选事实”和“缺 `prescription` / `schedule` 结构字段”。后者不来自动作库查询，应由模型基于本轮目标、动作候选事实和保守训练编排常识构造，再交给服务端 validator 校验。

## Goals / Non-Goals

**Goals:**

- 让默认 prompt 表达直接生成 `plan` 的停止条件：已有动作候选足以组成计划时停止同类动作查询。
- 让 `submitVisibleTrainingProposal` 说明 `routine` / `plan` 的 `prescription` 可由模型基于本轮目标和动作候选事实生成。
- 让 `searchExerciseResources` 说明它只提供动作候选事实，不能产出 `prescription`、`schedule`、`routine` 或 `plan`。
- 补充合同测试，避免模型可见说明回退为重复动作查询或固定 workflow。

**Non-Goals:**

- 不修改 LangChain runtime 主循环、model factory provider payload、production response adapter 或 `/api/chat` 主链路。
- 不新增服务端关键词、正则、同义词表、短句模板或业务 `toolName` 特判。
- 不调整 `visibleTrainingProposal` payload schema、validator 规则、数据库模型或动作库查询执行逻辑。
- 不通过调大 `maxToolCallsPerTool` 掩盖模型重复查询问题。

## Decisions

### 1. 停止条件放在默认 prompt 的 Planner Policy 层

默认 prompt 的多天计划示例会表达：`searchExerciseResources` 只负责动作候选；当候选动作足以组成 `plan` 时，不应因为缺 `prescription` 或 `schedule` 继续查动作库。模型可以基于用户目标、每周频率、单次时长、动作候选和保守训练编排常识构造这些结构字段，并提交 `submitVisibleTrainingProposal`。

替代方案是只改 `searchExerciseResources` description。该方案不足，因为模型在选择下一步前还需要通用停止条件来判断“继续 tool”还是“结构化收口”。

### 2. 处方来源放在 `submitVisibleTrainingProposal` description

`prescription` 是 `visibleTrainingProposal` 的结构化业务字段，来源边界应由 finalization tool 的模型可见说明承载。说明会明确：`routine` / `plan` 的 `prescription` 不要求来自动作库查询结果，但必须与动作项绑定，并通过 schema 与服务端 validator 校验。

替代方案是在 validator 中自动生成 `prescription`。该方案会让服务端承担训练编排语义，违反“模型能力优先，服务端只管契约”的边界。

### 3. 动作查询能力边界放在 `searchExerciseResources` description

`searchExerciseResources` description 会补充输出含义和 grounding：该 tool 不返回处方、日程或训练计划事实；如果当前缺口是 `prescription` / `schedule`，重复查询不会新增这类事实。只有动作候选不足、查询约束变化或用户明确要求更多候选时，才应继续查询动作库。

该说明属于业务 tool 局部能力边界，不是通用 prompt 的业务 `toolName` 语义分支。

### 4. 测试验证模型可见合同，而不是模拟服务端意图分流

测试会覆盖 prompt 和 tool description 中的关键合同文本，确保：

- plan 停止条件表达“`prescription` / `schedule` 不来自动作库查询”。
- `submitVisibleTrainingProposal` 表达 `prescription` 可由模型构造并交给 validator 校验。
- `searchExerciseResources` 表达自身不产出处方、日程或计划。
- 模型可见说明不新增固定用户短句、固定 workflow 或服务端语义分流。

## Risks / Trade-offs

- [Risk] 文案过强导致模型在动作候选不足时过早收口。Mitigation: 使用正向准入条件，只有“已有候选足以组成计划”时停止同类查询；事实不足时仍允许继续查询、澄清或失败收口。
- [Risk] 模型把 `prescription` 来源理解为可以随意编造。Mitigation: 同时强调必须基于本轮用户目标、动作候选事实和保守训练编排，并由 schema / validator 校验。
- [Risk] 具体业务名进入通用 prompt 后变成固定流程。Mitigation: 通用 prompt 只表达稳定结构化收口边界；具体业务能力边界放在对应 tool description 和 spec / tests 中。
