## ADDED Requirements

### Requirement: 手动 LLM 黑盒报告必须区分完成度 outcome
系统 SHALL 在手动 LLM 黑盒 runner 和报告中区分直接完成、建议可恢复通过、需要用户输入、阻断和失败。报告 MUST 继续只面向用户可见结果与安全 trace 摘要，不把内部 prompt、tool 调用次数或候选分数当作通过条件。

#### Scenario: 建议可恢复通过单独统计
- **WHEN** 某轮没有直接生成预期卡片或完整回复
- **AND** 用户可见输出提供了可点击或明确可执行的恢复建议
- **THEN** 报告 MUST 将该轮标记为建议可恢复通过或等价非直接完成状态
- **AND** 报告 MUST NOT 将该轮混入直接完成通过数
- **AND** 报告 MUST 记录缺失的用户可见能力、建议内容摘要和 trace 中的 terminal outcome 摘要

#### Scenario: routine 或 plan 降级为动作列表失败
- **WHEN** 用例期望生成单次训练编排或长期计划
- **AND** 用户可见结果只给出动作推荐、正文动作列表、不完整 visible output 或下一轮再生成的承诺
- **THEN** 报告 MUST 将该轮判为失败或建议可恢复通过，不能标记为直接完成
- **AND** 报告 MUST 记录实际卡片类型、预期卡片类型和 terminal outcome 摘要
- **AND** 该判定 MUST NOT 依赖内部 prompt 文本、测试编号或服务端关键词规则

### Requirement: 手动 LLM 测试必须覆盖状态视图合同的用户可见边界
系统 SHALL 用根目录基础和完整 LLM 黑盒用例覆盖 Agent Loop 状态视图合同的用户可见效果，包括卡片类型稳定、上下文继承、当前轮覆盖、引用对象、追问、阻断和内部字段不泄漏。

#### Scenario: P0 冒烟集用于 Agent Loop 核心改动最低验收
- **WHEN** Agent Loop core、PlannerStateView、Evidence pipeline、TerminalGate 或 trace/replay 被修改
- **THEN** 验证计划 MUST 至少包含基础 LLM 黑盒 P0 冒烟集或等价 fixture 覆盖
- **AND** 覆盖 MUST 包含动作推荐、routine 升级、plan 补齐、非健身切回健身和最近卡片引用
- **AND** 生产规则 MUST NOT 引入测试 ID、用户短句或具体 phrasing 特判
