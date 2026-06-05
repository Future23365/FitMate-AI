## ADDED Requirements

### Requirement: Agent prompt 合同治理必须检查规则分层和重复度
系统 SHALL 在后续修改 Agent prompt、model input、tool manifest、schema summary、examples、repair feedback、observations 或 compressed tool results 时，要求实现前检查规则是否放在正确模型可见层级。治理过程 MUST 明确哪些规则属于通用 system prompt，哪些属于单个 tool manifest，哪些属于动态 observation / repair feedback。

#### Scenario: 实现前完成模型可见输入分层审查
- **WHEN** 开发者或 Codex 准备修改 Agent prompt / model input / manifest / schema summary / examples / repair feedback / observations
- **THEN** prompt contract governance preflight MUST 读取或确认当前真实模型可见输入来源
- **AND** preflight MUST 区分 system message、tool manifest、schema description、examples、observations、toolResults 和 repair feedback
- **AND** preflight MUST 说明本次规则新增、删除或移动属于哪个层级
- **AND** preflight MUST 说明是否存在同类规则在多个层级重复出现

#### Scenario: 重复规则不得简单累加
- **WHEN** 后续 change 发现同类规则已同时存在于 system prompt、tool manifest、schema description 或 observation
- **THEN** 实现 MUST 优先判断该规则应保留在哪个最稳定层级
- **AND** 实现 MUST 避免继续在多个层级逐字重复同一终态规则
- **AND** 如果某条规则必须在多个层级出现，design 或 tasks MUST 说明原因，例如首轮必须可见和结果态必须可见分别需要一条短表达

### Requirement: prompt 优化必须保留关键例子和模型理解能力
系统 SHALL 将 prompt / manifest 优化视为模型可见合同重组，而不是纯文本压缩。实现 MUST 保留帮助模型稳定输出合法 action 和合法 tool input 的关键例子，并验证优化后没有削弱相邻语义区分。

#### Scenario: 保留关键结构例子
- **WHEN** 后续 change 压缩 system prompt 或 tool examples
- **THEN** 实现 MUST 保留至少一个合法 `AgentAction` 最小 JSON 形状示例
- **AND** 对存在复杂 tool input 的业务 tool，manifest examples MUST 保留至少一个符合 schema 的关键输入示例，除非该 tool 的 schema description 已足以表达字段关系并有测试证明
- **AND** examples MUST NOT 包含 fake 引用、过时字段、非 schema 字段或固定用户短语路由

#### Scenario: 优化后验证相邻语义仍可区分
- **WHEN** prompt / manifest 优化涉及训练输出结构、引用对象、动作查询或点名动作解析
- **THEN** 验证计划 MUST 覆盖 `exercise_selection`、`routine`、`plan` 的区分
- **AND** 验证计划 MUST 覆盖引用对象存在和缺失两类收口
- **AND** 验证计划 MUST 覆盖 `requiredExerciseIds` 正向锚点和 `excludeExerciseIds` 负向排除边界
- **AND** 验证计划 MUST 覆盖 `routine` / `plan` 缺少 `warmup` / `stretch` section 时的合法下一步

#### Scenario: 优化不得变成语义硬编码
- **WHEN** 实现 prompt / manifest 优化
- **THEN** 系统 MUST NOT 新增服务端关键词、正则、同义词表、短句模板或基于用户原文的业务分流
- **AND** 系统 MUST NOT 根据用户原文替模型选择 `toolName`、action、`payload.kind`、`requiredExerciseIds` 或 `excludeExerciseIds`
- **AND** 回归测试可以使用具体用户原话作为样例，但生产规则 MUST 使用稳定抽象表达

### Requirement: prompt / manifest 测试必须断言合同而不是长句全文
系统 SHALL 要求 prompt / manifest 优化相关测试验证关键合同、结构字段和禁止项，而不是绑定完整长篇自然语言。测试 MUST 能防止关键规则丢失，同时允许后续进行等价短句优化。

#### Scenario: prompt 测试使用合同级断言
- **WHEN** 本 change 或后续 prompt 优化更新自动化测试
- **THEN** 测试 MUST 断言关键技术字段、action type、resource role、output type、schema version 和禁止旧字段仍符合合同
- **AND** 测试 MUST 断言描述性自然语言默认中文，技术标识保持英文原样
- **AND** 测试 MUST NOT 要求完整长句逐字一致，除非该长句本身就是稳定用户可见文案或固定错误码

#### Scenario: manifest / observation 测试覆盖禁止项
- **WHEN** 测试验证 tool manifest、schema description、examples 或 observation
- **THEN** 测试 MUST 覆盖不包含 fake `factRef`、fake `messageId`、fake `resourceId` 或过时字段
- **AND** 测试 MUST 覆盖不包含固定用户短语路由、服务端语义分流说明或旧 action 协议
- **AND** 测试 MUST 覆盖关键动态字段仍存在，例如 `missingSectionsForRoutineOrPlan`、`supportsOutputKinds`、`facts[]`、`requiredExerciseIds` 或 `excludeExerciseIds` 中与该 tool 相关的字段
