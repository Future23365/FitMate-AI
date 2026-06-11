## ADDED Requirements

### Requirement: Prompt 合同大重组必须执行历史回归审计
系统 SHALL 要求大范围 Agent prompt、model input、output contract、tool description、schema description、repair feedback 或模型可见 summary 重组在实现前执行历史回归审计。

#### Scenario: Prompt 或模型可见合同大重组触发审计
- **WHEN** 后续 change 批量修改 Agent prompt、model input builder、LangChain tool description、schema description、examples、repair feedback、tool result summary、finalization tool description 或 structured final response 合同
- **THEN** 该 change MUST 使用 `agent-regression-contract-audit`
- **AND** 该 change MUST 对照归档 OpenSpec 查找历史上已移除或收口的模型可见字段、workflow 文案、output contract 边界和 repair feedback 边界
- **AND** 该 change 的 `tasks.md` MUST 包含 Agent model-visible contract gate 验证任务

#### Scenario: Prompt 局部小修不触发历史审计
- **WHEN** 后续 change 只修改单个 prompt 片段、单个 tool description、单个 schema description、单个 examples description 或单个 repair feedback 文案
- **AND** 该 change 不属于 framework migration、核心链路替换、批量模型可见合同重组或历史回归调查
- **THEN** 该 change MUST NOT 仅因涉及模型可见文本而强制执行 `agent-regression-contract-audit`
- **AND** 该 change 仍 MUST 执行 `agent-prompt-contract-governance` 要求的实际模型可见输入检查

#### Scenario: 历史审计不替代 prompt 分层治理
- **WHEN** 历史回归审计发现某个旧 change 禁止过特定业务字段或 workflow 文案
- **THEN** 当前 change MUST 继续区分 system prompt、tool description、schema description、outputContracts、observation、repair feedback 和测试样例
- **AND** 当前 change MUST NOT 将旧 trace 的具体用户短句、toolName、字段组合或 phrasing 写入通用 prompt 触发规则
