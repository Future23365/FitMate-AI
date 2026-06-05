## ADDED Requirements

### Requirement: 目标明确的聊天 routine 请求必须稳定完成三段式编排
聊天入口处理目标明确的单次训练编排请求时，Agent SHALL 在动作候选足够的情况下生成包含热身、主训练和拉伸的 `routine` 可见输出；候选不足或关键约束不足时 SHALL 给出可恢复的缺口说明或澄清，而不是返回安全错误、动作列表或让用户自行组合。

#### Scenario: 直接 routine 请求生成完整编排
- **WHEN** 用户提供足以解释单次 routine 的目标、部位或训练形式，并提供或可合理沿用单次训练关键约束
- **AND** 发布态动作库可按当前结构化约束返回 `training`、`warmup` 和 `stretch` 候选
- **THEN** Agent MUST 生成 `visibleTrainingProposal.payload.kind = "routine"`
- **AND** routine MUST 包含 `warmup`、`training`、`stretch` 三类动作项
- **AND** routine MUST 为每个动作项绑定处方字段
- **AND** 用户可见结果 MUST NOT 是安全错误、纯动作推荐或要求用户自行组合的正文

#### Scenario: 缺失 section 候选可恢复
- **WHEN** 用户目标需要 routine
- **AND** 当前结构化约束下缺少 `warmup`、`training` 或 `stretch` 候选
- **THEN** Agent MUST 说明具体缺少的候选类型或约束冲突
- **AND** Agent MUST 给出可恢复下一步，例如放宽器械、场地、难度、目标肌群或继续澄清
- **AND** Agent MUST NOT 展示未通过 section / 动作事实 / 处方校验的 routine 卡片

#### Scenario: 同类语义变体进入同一能力边界
- **WHEN** 用户请求“居家背部 30 分钟训练”“胸部 20 分钟无器械训练”“循环胸部训练”或等价表达
- **THEN** 这些样例 MUST 只作为回归测试覆盖同类 routine 目标
- **AND** 生产实现 MUST NOT 以这些具体短语作为服务端触发条件
