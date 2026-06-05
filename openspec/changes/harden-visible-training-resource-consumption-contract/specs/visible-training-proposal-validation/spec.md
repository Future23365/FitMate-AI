## ADDED Requirements

### Requirement: visibleTrainingProposal 校验失败必须提供结构化资源覆盖诊断
当 `visibleTrainingProposal` 终态输出因动作 section 或结构覆盖不足而失败时，系统 SHALL 提供可进入 repair observation 的结构化诊断。诊断 MUST 表达确定性失败事实、当前资源覆盖和缺失边界；诊断 MUST NOT 替 Planner 指定固定 tool、固定 action、固定回复或固定调用顺序。

#### Scenario: section_not_allowed 反馈允许 section
- **WHEN** `visibleTrainingProposal.exerciseItems[*].section` 不存在于该动作数据库 `allowedSections`
- **THEN** validation failure MUST 包含稳定 code `section_not_allowed`
- **AND** validation failure MUST 包含失败字段路径、`exerciseId`、模型输出的 `section` 和数据库允许的 `allowedSections`
- **AND** repair observation MUST 表达该动作不能放入模型输出的 section
- **AND** 系统 MUST NOT 渲染或保存该 `visibleTrainingProposal`

#### Scenario: routine 或 plan 缺少必要 section 时反馈缺口
- **WHEN** Planner 输出 `payload.kind = "routine"` 或 `payload.kind = "plan"`
- **AND** `exerciseItems` 未覆盖 `warmup`、`training`、`stretch` 中任一 section
- **THEN** validation failure 或 repair observation MUST 表达缺失 section
- **AND** repair observation MUST 表达当前可见事实覆盖哪些 section
- **AND** repair observation MUST 表达可恢复方向包括继续获取缺失 section、输出当前事实可支撑结构、澄清或失败收口

#### Scenario: Repair feedback 不替模型选择下一步
- **WHEN** 系统生成 terminal output validation repair feedback
- **THEN** feedback MUST NOT 包含固定用户短语作为触发条件
- **AND** feedback MUST NOT 包含“必须调用 `searchExerciseResources`”或等价固定 tool 流程
- **AND** feedback MUST NOT 根据具体 `toolName` 和字段组合改写 Planner 的语义目标

### Requirement: repair budget 耗尽前必须保留可恢复诊断
系统 SHALL 在 repair budget 允许的范围内向 Planner 暴露足够的字段级和资源覆盖诊断，使模型能够修正结构而不是重复输出不可支撑方案。

#### Scenario: 第一次校验失败进入 repair observation
- **WHEN** `visibleTrainingProposal` 终态校验失败
- **AND** repair budget 尚未耗尽
- **THEN** 下一轮 Planner 输入 MUST 包含结构化 invalid action observation
- **AND** observation MUST 包含失败 code、失败路径和可恢复边界摘要
- **AND** observation MUST NOT 泄漏完整数据库对象、secret 或跨用户 payload

#### Scenario: repair 耗尽后不输出无效方案
- **WHEN** repair budget 已耗尽
- **AND** 最新 terminal action 仍未通过 `visibleTrainingProposal` 校验
- **THEN** Response Renderer MUST NOT 输出 `visible_output`
- **AND** fact bridge MUST NOT 保存该无效方案
- **AND** 最终响应 MUST 以安全错误边界收口
