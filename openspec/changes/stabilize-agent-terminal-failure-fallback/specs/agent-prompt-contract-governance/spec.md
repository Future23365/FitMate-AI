## ADDED Requirements

### Requirement: terminal output repair feedback 必须表达可恢复边界

系统 SHALL 要求修改 Agent prompt、model input、tool manifest、observations、compressed tool results 或 repair feedback 时，确保 terminal output validation failure 的模型可见信息表达可恢复边界。模型可见说明 MUST 帮助 Planner 在结构冲突、字段缺失、引用不可用或资源覆盖不足时选择合法的 `tool_call`、`final_answer`、`ask_user` 或安全失败收口，而不是重复输出同一个非法结构。

#### Scenario: visible output 校验失败进入模型可见 repair

- **WHEN** Planner 的 `final_answer.visibleOutputs[]` 因 schema、section 覆盖、数据库动作事实、resource grounding 或 terminal reference 校验失败
- **AND** repair budget 尚未耗尽
- **THEN** 下一轮模型可见 observation / repair feedback MUST 包含稳定失败 code、失败 path、失败边界摘要和可恢复方向
- **AND** 模型可见内容 MUST 区分可消费 resource、satisfied tool result、diagnostic / failed / unsatisfied result 和不可引用事实
- **AND** 模型可见内容 MUST NOT 暴露完整数据库对象、secret、跨用户 payload 或内部 stack

#### Scenario: routine / plan section 覆盖失败不变成语义分流

- **WHEN** repair feedback 需要说明 `visibleTrainingProposal.payload.kind = "routine"` 或 `payload.kind = "plan"` 缺少必要 section
- **THEN** 模型可见内容 MUST 表达 `warmup`、`training`、`stretch` 的结构化覆盖要求
- **AND** 模型可见内容 MUST 表达正文建议不能替代 `exerciseItems[]` 中可校验的 section 动作事实
- **AND** 模型可见内容 MUST NOT 使用具体用户原话、关键词、短句模板、同义词表或 phrasing 作为触发条件
- **AND** 模型可见内容 MUST NOT 要求服务端基于用户原文选择或改写 `payload.kind`

#### Scenario: 业务实例只进入局部合同或测试

- **WHEN** 修复方案涉及 `visibleTrainingProposal`、`searchExerciseResources`、`inspectVisibleTrainingProposals` 或等价业务名
- **THEN** 这些业务名 MUST 只作为 tool manifest、schema description、observation projection、resource contract、validator diagnostics 或回归测试样例出现
- **AND** 通用 Agent prompt、runtime、Response Renderer 和 `/api/chat` route MUST NOT 新增针对具体业务 toolName 的语义分支
- **AND** 回归测试 MAY 使用真实用户输入和 trace 条件，但测试样例 MUST NOT 反向决定生产规则
