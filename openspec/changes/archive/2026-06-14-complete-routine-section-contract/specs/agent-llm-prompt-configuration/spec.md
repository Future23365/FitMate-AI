## ADDED Requirements

### Requirement: 完整 routine 合同必须按模型可见分层承载
系统 SHALL 将完整 `routine` 的 section 组成合同放在业务 tool description、schema description、tool result summary 或等价模型可见业务合同中。默认 Agent system prompt MAY 保留“routine / plan 需通过结构化训练收口工具和服务端 validator 交付”的高层边界，但 MUST NOT 承载固定业务 tool 调用流程、关键词分流或详细 section coverage workflow。

#### Scenario: 默认 system prompt 不写固定 section workflow
- **WHEN** 默认 Agent system prompt 生成模型可见输入
- **THEN** system prompt MUST NOT 表达缺少 `warmup` 或 `stretch` 时必须调用某个业务 tool
- **AND** system prompt MUST NOT 根据用户原文、关键词、正则、同义词表或短句模板决定 `payload.kind`
- **AND** system prompt MUST NOT 根据具体业务 `toolName` 或 tool result 字段组合规定下一步

#### Scenario: 业务合同层表达 routine 三段组成
- **WHEN** LangChain runtime 构造生产模型请求
- **THEN** 模型可见输入 MUST 在 `submitVisibleTrainingProposal` 的 tool description、schema description、tool result summary 或等价业务合同中表达完整 `routine` 默认由 `warmup`、`training`、`stretch` 组成
- **AND** 模型可见输入 MUST 表达 `training` section 承载用户主训练目标
- **AND** 模型可见输入 MUST 保留用户明确只要部分范围或事实不足时的合法收口出口
- **AND** 描述性自然语言 MUST 使用中文，技术标识保持英文原样
