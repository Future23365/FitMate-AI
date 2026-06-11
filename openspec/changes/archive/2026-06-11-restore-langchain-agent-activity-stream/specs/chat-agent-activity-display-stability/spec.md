## ADDED Requirements

### Requirement: 模型活动摘要展示校验必须宽松
聊天页 SHALL 将服务端投影的模型活动摘要视为大模型自然语言总结，并采用宽松展示校验。前端 MUST 防止明显破坏 UI 的 payload 污染页面，但 MUST NOT 因摘要没有命中固定 stage 文案、包含普通英文或使用非模板表达而拒绝展示。

#### Scenario: 宽松接受自然语言摘要
- **WHEN** 前端收到 `activitySummary`
- **AND** `activitySummary` 是 trim 后非空字符串
- **THEN** 前端 SHOULD 展示该摘要
- **AND** 前端 MAY 对过长摘要做裁剪或依赖 CSS truncate
- **AND** 前端 MUST NOT 要求摘要只包含中文字符
- **AND** 前端 MUST NOT 要求摘要匹配固定服务端文案或固定 stage 映射

#### Scenario: 拒绝明显不可展示摘要
- **WHEN** `activitySummary` 不是字符串、trim 后为空或包含控制字符导致无法安全展示
- **THEN** 前端 MUST 忽略该摘要
- **AND** 前端 MUST 保持 stream 消费不中断
- **AND** 前端 MUST 回退到当前 stage fallback、已有活动文案或 loading 状态

#### Scenario: 宽松校验不改变生命周期
- **WHEN** stream 收到 `done`、`error`，请求 abort、timeout、会话切换或新建会话
- **THEN** 前端 MUST 立即清理模型活动摘要
- **AND** 裁剪、fallback、动画或摘要重复保护 MUST NOT 延迟清理
- **AND** 清理后活动条 MUST NOT 继续显示旧模型摘要
