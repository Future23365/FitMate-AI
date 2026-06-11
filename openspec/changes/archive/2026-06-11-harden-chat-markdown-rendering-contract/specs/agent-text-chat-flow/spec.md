## ADDED Requirements

### Requirement: 前端聊天正文必须按受控 Markdown 子集渲染
前端聊天页面 SHALL 将 assistant `content` 渲染为受控 Markdown 子集。渲染层 MUST 保留 emoji 和普通训练说明，但 MUST 避免 GFM 或 HTML 结构造成删除线、水平线、表格、脚注、任务清单、代码块或 raw HTML 等不适合聊天正文的视觉结构。

#### Scenario: 数字范围不被渲染成删除线
- **WHEN** assistant `content` 包含 `8~12`、`2~3` 或等价单波浪线数字范围
- **THEN** 前端 MUST 将其显示为普通文本
- **AND** 前端 MUST NOT 生成 `<del>` 或删除线视觉样式

#### Scenario: 高风险 Markdown 结构被忽略或降级
- **WHEN** assistant `content` 包含 Markdown 水平分割线、删除线、raw HTML、表格、脚注、任务清单、代码块或一级大标题
- **THEN** 前端 MUST 不按这些高风险结构渲染聊天正文
- **AND** 前端 MAY 忽略水平分割线、raw HTML 和脚注
- **AND** 前端 MAY 将删除线、代码块、任务清单、表格内容或一级标题降级为普通聊天文本或较低层级正文结构
- **AND** 前端 MUST 保留 emoji 和普通文字内容
