## ADDED Requirements

### Requirement: 聊天训练编排必须按目标语义选择输出结构
聊天入口处理训练相关请求时，Agent SHALL 按用户目标语义选择 `exercise_selection`、`routine` 或 `plan`。当用户目标需要一次可执行训练或多天计划时，候选足够的情况下不得停留在动作列表；候选不足时应给出可恢复缺口说明。

#### Scenario: 单次训练语义进入 routine 边界
- **WHEN** 用户目标语义需要一套训练、一次训练、当次训练、某目标或部位的单次训练、某个时长内完成训练、循环训练、居家或无器械单次训练，且不是只询问动作清单
- **AND** 当前动作库可返回 `warmup`、`training`、`stretch` 候选
- **THEN** Agent MUST 生成 `visibleTrainingProposal.payload.kind = "routine"`
- **AND** routine MUST 包含 `warmup`、`training`、`stretch` 三类动作项和处方
- **AND** 用户可见结果 MUST NOT 只是动作推荐、`exercise_selection`、正文动作列表或用户自行组合建议

#### Scenario: 多天或频次语义进入 plan 边界
- **WHEN** 用户目标语义包含每周频次、周期长度、多天安排、训练日 / 休息日安排、每周几练、连续几周目标或长期训练计划
- **AND** 当前动作库可返回支撑训练结构的候选
- **THEN** Agent SHOULD 生成 `visibleTrainingProposal.payload.kind = "plan"`
- **AND** plan MUST 包含可校验训练结构和 `schedule.assignments`
- **AND** 用户可见结果 MUST NOT 只是动作推荐、`exercise_selection`、正文动作列表或只承诺下一轮再生成计划

#### Scenario: 动作清单语义保留 exercise_selection
- **WHEN** 用户目标语义只需要动作推荐、动作清单、动作库查询、动作替代候选或动作事实说明
- **THEN** Agent MAY 输出 `visibleTrainingProposal.payload.kind = "exercise_selection"` 或普通文本
- **AND** Agent MUST NOT 因本 change 固定补查 `warmup` / `stretch`
- **AND** Agent MUST NOT 强制输出 `routine` 或 `plan`

#### Scenario: 代表性样例只用于回归测试
- **WHEN** 回归测试覆盖“居家背部 30 分钟训练”“胸部 20 分钟无器械训练”“循环胸部训练”“每周 3 练，每次 25 分钟”或等价表达
- **THEN** 这些样例 MUST 只作为测试覆盖同类语义边界
- **AND** 生产实现 MUST NOT 以这些具体短语作为服务端触发条件
