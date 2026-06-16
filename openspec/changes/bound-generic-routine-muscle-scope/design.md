## Context

当前生产主链通过 LangChain tool calling 让模型自主决定是否查询动作库、何时提交结构化训练结果。最新 trace 中，模型在用户没有指定具体肌群时，把泛化单次训练请求扩展成胸、背、腿、肩、腹等候选补齐流程。现有合同已经说明候选池可以选择子集消费，但该规则位于查询结果之后，无法稳定阻止首次规划阶段的全肌群展开。

本次修复属于模型可见合同变更，不属于服务端意图识别或 runtime 分支。服务端仍只校验 schema、权限、数据库事实和结构化输出，不根据用户原文替模型改写 tool call。

## Goals / Non-Goals

**Goals:**

- 在 Planner Policy 中前置训练请求范围判定，让模型先判断当前任务是单次 `routine`、周期 `plan`、动作集合还是普通文本回答。
- 明确“未指定具体肌群”不是待补齐的全身肌群列表，泛化训练请求应按目标、时长、器械和可执行性收敛成代表性训练课。
- 让 `searchExerciseResources` 的 `muscles` 字段只承载明确或已收敛的目标肌群，不承担从宽泛训练目标展开全身 inventory 的职责。
- 让 `submitVisibleTrainingProposal` 明确接收未全肌群覆盖但可执行的单次 `routine`。
- 用合同测试验证模型可见规则存在，并检查没有新增服务端语义分流。

**Non-Goals:**

- 不实现服务端关键词、正则、同义词表、短句模板或基于用户原文的 `payload.kind` / `tool_calls` 改写。
- 不修改 LangChain runtime 连续工具上限、provider payload、tool wrapper 执行合同或 terminal failure finalizer。
- 不修改动作查询 repository 过滤逻辑、数据库 schema、训练方案 validator 或 response adapter。
- 不把具体用户话术写成生产规则；具体 trace 只作为回归测试样例。

## Decisions

### 1. 范围判定放在 Planner Policy，作为首次查询前的稳定规则

`buildLangChainAgentSystemPrompt()` 将新增“训练请求范围判定”段落，表达：

- 用户只给出训练目标、单次时长、场地、器械或强度条件，但没有周期、多天、训练日、休息日、分化训练或具体目标肌群时，默认交付单次 `routine`。
- 未指定具体肌群时，不把所有主要肌群、所有细分肌群或完整全身覆盖当作隐含硬约束。
- 泛化训练请求只需要形成受时长约束的代表性训练课；动作选择围绕当前 `routine` 的目标、时长、器械和可执行性收敛。
- 只有用户明确要求全身覆盖、指定身体部位、指定分化训练、指定目标肌群，或已有候选无法组成任何可执行训练主体时，才把肌群拆分成动作库查询条件。

替代方案是只加强“候选足够后停止查询”的规则。该方案已经验证不足，因为模型会在收到候选前先把任务拆成全肌群查询链。

### 2. `searchExerciseResources` 只说明字段来源和查询禁用边界

`searchExerciseResources` 的 tool description 和 `muscles` 字段 schema description 将补充：

- `muscles` 来自用户明确指定的目标肌群、已验证上下文目标肌群，或模型为当前可执行训练课收敛出的少量必要目标。
- 宽泛训练目标、常规训练知识或未指定肌群不得扩展成全身肌群清单。
- 用户没有指定肌群且 broad query 已返回可用于当前 `routine` 的 `training` 候选时，不要继续为了完整覆盖拆成胸、背、腿、肩、手臂、核心等 `muscles` 查询。

这些规则只改变模型可见查询合同，不新增 repository 规则，也不让服务端判断候选是否“够”。

### 3. `submitVisibleTrainingProposal` 说明可执行 `routine` 的提交准入

结构化收口 tool 将补充：

- 未指定具体肌群的 `routine` 不要求覆盖所有主要肌群。
- 当前候选能组成受时长约束的可执行训练主体时，应提交结构化 `routine`，而不是继续按未指定肌群补查。

这样把“能不能提交”的判断留给模型和 validator：模型负责选择候选子集并构造 prescription，validator 只校验结构和数据库事实。

### 4. 抽象层级门禁结论

结论：可继续。

1. 抽象问题类型：训练请求范围判定缺失，导致模型把未指定肌群解释成全肌群候选补齐。
2. 通用合同修复：在 Planner Policy 中前置 routine / plan / 全身覆盖的范围判定，不使用具体用户短句作为触发规则。
3. 业务 tool 局部说明：`searchExerciseResources` 说明 `muscles` 字段来源和禁用边界；`submitVisibleTrainingProposal` 说明可执行 `routine` 的提交边界。
4. 回归测试样例：使用原始失败语义和等价表达验证“泛化单次训练请求不触发全肌群 inventory”，具体话术只在测试中出现。
5. 服务端语义分流检查：不新增关键词规则、自然语言模板路由、phrasing 特判或具体 `toolName` 语义分支。

## Risks / Trade-offs

- [Risk] prompt 继续变长。→ Mitigation：新增规则只放在范围判定和字段来源，不复制 schema 细节。
- [Risk] 模型过早提交过窄训练。→ Mitigation：保留“已有候选无法组成任何可执行训练主体时才继续查询或澄清”的出口，服务端 validator 继续校验结构和动作事实。
- [Risk] 用户确实想要全身覆盖时被误收敛。→ Mitigation：规则明确“用户明确要求全身覆盖、分化训练、目标肌群或身体部位时”可以拆分查询。
