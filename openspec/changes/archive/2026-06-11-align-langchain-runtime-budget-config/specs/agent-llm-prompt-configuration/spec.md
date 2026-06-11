## ADDED Requirements

### Requirement: 默认 prompt 必须区分业务 tool 预算和 activity report 预算
系统 SHALL 在默认 LangChain Agent system prompt 的运行预算说明中区分业务 tool 调用预算和 `reportAgentActivity` 活动汇报预算。该说明 MUST 保持短句化，只表达稳定运行边界，不得写入具体用户 phrasing、具体 trace 条件或业务 tool 固定流程。

#### Scenario: Prompt 说明业务工具调用预算
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明业务工具调用有集中配置的次数上限
- **AND** system message MUST NOT 把 `reportAgentActivity` 描述为会消耗业务 tool 预算
- **AND** system message MUST NOT 要求模型为了消耗预算而调用工具

#### Scenario: Prompt 说明活动汇报不是业务事实
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 继续说明 `reportAgentActivity` 只用于当前请求活动条展示
- **AND** system message MUST 说明 activity report 有独立次数上限或等价受控边界
- **AND** system message MUST 说明 activity report 不支撑最终回答 grounding、不替代业务工具、不保存到聊天历史
