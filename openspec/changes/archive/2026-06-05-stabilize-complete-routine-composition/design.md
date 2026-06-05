## Context

当前 `/api/chat` 生产链路没有服务端 routine draft tool，`visibleTrainingProposal.payload.kind = "routine"` 由模型在 `final_answer.visibleOutputs[]` 中生成，服务端负责校验动作事实、section、处方和数据库存在性。`searchExerciseResources` 已能按 `suitabilities` 查询 `training`、`warmup`、`stretch` 动作事实，且旧 change 已禁止缺 section 时提交不完整 `routine` / `plan`。

基础黑盒报告显示，模型在明确单次 routine 请求里常先查到 `training` 动作，然后停止为动作列表、建议用户自行组合，或提示“如需完整计划我可以继续查询热身和拉伸”。这不是动作候选能力缺失，而是模型可见合同把“继续补查缺失 section”表达成可选恢复动作，没有把它作为明确 routine 请求的正常完成路径。

本 change 使用 `agent-prompt-contract-governance` 作为 primary skill；因为主要改动是模型实际可见输入、tool manifest / schema description / examples / observation。`agent-tool-change-governance` 作为 secondary 边界检查，确保不修改 tool handler 查询语义、Agent core、production route 或 renderer。

## Goals / Non-Goals

**Goals:**

- 让明确单次 routine 请求在已有主训练候选且可继续查询缺失 section 时，稳定走向完整 `warmup` / `training` / `stretch` routine。
- 让模型看到“候选足够时生成完整 routine；候选不足时给可恢复缺口说明”的终态合同。
- 防止模型把明确 routine 目标降级成 `exercise_selection`、正文动作列表或让用户自行组合。
- 补充自动化回归，覆盖直接 routine 请求和同类语义变体，而不是只覆盖基于上一轮动作的编排。

**Non-Goals:**

- 不新增服务端关键词、正则、同义词表、短句模板或自然语言语义分流。
- 不新增 `generateRoutineDraft`、`generatePlanDraft` 或隐藏训练生成 service。
- 不让 `searchExerciseResources` 生成最终 routine、plan、处方、schedule、卡片或保存事件。
- 不改变数据库 schema、Prisma migration、`/api/chat` 请求/响应合同、Agent runtime 主循环、Policy Guard、ResourceStore 或 Response Renderer。
- 不解决 F03/F05/F12 的信息不足问题，也不放宽 `harden-insufficient-training-info-clarification` 已建立的 broad query / 随机卡片边界。

## Decisions

### Decision 1: 收紧正向 routine 完成路径，而不是服务端生成 routine

默认 prompt 增加稳定规则：当模型判断目标需要 `routine`，且当前上下文已有足以解释 routine 的目标、部位或训练形式，并已获得 `training` 动作事实时，如果可见 tool 可查询缺失 section，模型应继续获取 `warmup` / `stretch` 动作事实；候选足够后输出 `payload.kind = "routine"`，并把处方绑定到每个动作项。

替代方案是新增服务端 composition service 或 routine draft tool。该方案被排除，因为当前生产链路已经将动作选择和处方生成交给模型，问题来自模型可见合同优先级不足；新增服务端编排会扩大架构边界，并容易把训练规则写入服务端语义分支。

### Decision 2: 只用稳定抽象描述，不写 F04/F17/F18 触发规则

修复规则只使用稳定抽象：`routine` 目标、当前 run 可消费动作事实、缺失 section、`searchExerciseResources` 查询能力、`visibleOutputs` 终态和可恢复失败。F04/F17/F18 只作为测试样例，不进入生产 prompt 的触发条件。

替代方案是写“胸部 20 分钟无器械时必须生成 routine”或“循环胸部训练必须生成 routine”。该方案违反 Agent 抽象层级门禁，也不能覆盖同类目标。

### Decision 3: `searchExerciseResources` observation 区分“可补查缺口”和“候选不足”

当一次查询只返回 `training` 时，observation 应说明：如果目标已经是 `routine`，且约束足够解释方案，下一步应继续用相同目标约束查询缺失 section；不要把该状态表述成“问用户是否需要完整计划”。当缺失 section 查询返回 0 条或 diagnostics 表示无法纳入候选时，observation 应指导模型说明缺口、建议放宽条件或给出下一步，而不是让用户自行组合。

替代方案是让 tool handler 根据用户目标决定是否继续内部查询。该方案被排除，因为 handler 不应读取用户自然语言或代替 Planner 决定最终输出结构。

### Decision 4: 回归测试覆盖真实 production replay 的成功路径和降级负例

新增或更新测试应覆盖：

- 直接 routine 请求先查 `training`，再查 `warmup` / `stretch`，最后输出三段式 `routine`。
- 模型在 routine 目标下只输出 `exercise_selection` 或正文动作列表时，不应被当作满足 routine 目标的成功路径。
- `searchExerciseResources` 的 manifest / observation 包含正向补查合同和候选不足的可恢复收口说明。

真实 LLM 黑盒调用仍需要用户明确允许消耗模型调用；本 change 先用自动化合同验证封住可控边界。

## Risks / Trade-offs

- [Risk] prompt 更强后可能让普通动作推荐过度查询 `warmup` / `stretch`。→ Mitigation：规则只约束模型已判断目标需要 `routine` 的场景；`exercise_selection` 仍不要求三段式。
- [Risk] 仅改模型可见合同仍依赖真实模型遵守。→ Mitigation：补 production replay、manifest / observation 测试和负例，若真实黑盒仍失败，再评估是否需要新增显式训练生成 tool 的独立 change。
- [Risk] 对缺省时长或器械的表达过强可能冲突信息不足修复。→ Mitigation：不声明所有缺时长/器械都可默认；只允许目标、部位或训练形式已足够解释 routine 时继续，关键约束不足时仍澄清。
- [Risk] token 增加。→ Mitigation：只调整现有 prompt/manifest/observation 中的相关句子，不新增长篇业务样例或完整输出模板。

## Migration Plan

1. 更新默认 Agent prompt 的 routine 正向组合合同。
2. 更新 `searchExerciseResources` 的 manifest、schema description、examples 和 `routinePlanCompositionBoundary` observation。
3. 补充 production replay、manifest / observation 和降级负例测试。
4. 运行 `openspec validate stabilize-complete-routine-composition --strict`、相关测试和 `npm run typecheck`。

回滚策略：如真实黑盒显示普通动作推荐被误伤，可回退 prompt / manifest / observation 文案；本 change 不包含数据库或 API migration。

## Open Questions

- 是否在本轮消耗真实模型调用复跑 F04/F17/F18，取决于用户是否明确允许手动黑盒测试成本。
