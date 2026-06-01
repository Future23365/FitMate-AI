## ADDED Requirements

### Requirement: 动作替换候选必须使用 assistantSuggestions

系统 SHALL 使用统一的 `assistantSuggestions` 表达动作替换候选，前端 SHALL 继续只按统一建议协议渲染候选按钮。

#### Scenario: 返回替换候选

- **WHEN** 服务端已定位要替换的 source exercise
- **AND** 本轮需要用户从候选 replacement exercises 中选择一个
- **THEN** 服务端 MUST 输出 `assistant_suggestions` 或等价统一流事件
- **AND** 每个候选 MUST 包含 `label`、`message`、`kind`、`blocking` 和 `source`
- **AND** `label` MUST 使用用户可识别的替代动作展示名

#### Scenario: 候选点击 payload

- **WHEN** 服务端输出替换候选 suggestion
- **THEN** suggestion 的 `message` MUST 是用户点击后可直接发送的完整替换表达
- **AND** `message` MUST 同时包含被替换动作和替代动作
- **AND** 前端 MUST 发送该 `message` 作为下一轮用户消息

#### Scenario: 正文列表不作为按钮来源

- **WHEN** 助手自然语言正文包含动作名称列表
- **THEN** 前端 MUST NOT 从 Markdown、纯文本列表或回复正文中提取替换候选按钮
- **AND** 服务端 MUST NOT 依赖正文列表作为后续候选选择的事实来源

#### Scenario: 候选建议可追踪

- **WHEN** 服务端生成、过滤或去重替换候选建议
- **THEN** AI Trace MUST 记录候选建议来源、最终可见数量和被过滤原因
- **AND** Trace MUST 能区分候选建议来自 pending replacement selection、Patch 失败恢复还是引用澄清
