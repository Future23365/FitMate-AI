## ADDED Requirements

### Requirement: Agent 模型可见合同高风险变更必须运行通用门禁
项目 SHALL 要求高风险 Agent / model-visible contract 变更在验收中运行通用合同门禁，验证模型实际可见输入没有重引入旧字段、旧 workflow 提示或同类换名规则。

#### Scenario: 高风险 Agent 合同变更验收
- **WHEN** OpenSpec change 修改 Agent 主链路、LangChain runtime、production tool catalog、批量 tool wrapper、批量 model-visible summary、system prompt、outputContracts、repair feedback、finalization tool description 或 trace summary
- **THEN** `tasks.md` MUST 包含 Agent model-visible contract gate
- **AND** 验收 MUST 覆盖白名单 summary schema、production tool catalog contract tests、模型可见文本 linter 和历史禁止项补充扫描

#### Scenario: 固定黑名单不能作为充分验收
- **WHEN** change 只添加了固定字段名或固定短语的 `not.toContain` 断言
- **THEN** 该验证 MUST NOT 被视为 Agent model-visible contract gate 的完整实现
- **AND** 验收 MUST 证明同类换名字段、同类工作流指导和同类 case-specific 生产规则也会失败

#### Scenario: 门禁无法运行
- **WHEN** Agent model-visible contract gate 因环境、依赖、数据库 fixture、外部服务或生产 catalog 初始化限制无法运行
- **THEN** 最终交付 MUST 说明未运行命令、原始限制原因和剩余风险
- **AND** 实现者 MUST 尽量运行可替代的较低层 schema / linter / catalog 静态检查
- **AND** 替代检查 MUST NOT 被描述为完全等价于完整 Agent model-visible contract gate
