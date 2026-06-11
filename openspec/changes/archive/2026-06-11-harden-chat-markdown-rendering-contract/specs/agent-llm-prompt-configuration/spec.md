## ADDED Requirements

### Requirement: 最终正文格式必须使用聊天 Markdown 子集
系统 SHALL 在模型可见 final response 合同中约束 `content` 输出格式。模型生成的用户可见正文 MUST 使用适合聊天气泡的 Markdown 子集，并避免会改变渲染结构或造成误解的高风险 Markdown / HTML 语法。

#### Scenario: content 只使用安全正文结构
- **WHEN** 默认 prompt 配置或 `fitmate_final_response.content` schema description 暴露给模型
- **THEN** 模型可见说明 MUST 允许 emoji、段落、短标题、编号列表、项目列表、加粗、斜体和行内代码
- **AND** 模型可见说明 MUST 禁止 raw HTML、Markdown 水平分割线、删除线、表格、脚注、任务清单和代码块
- **AND** 模型可见说明 MUST 要求数字范围使用 `8-12`、`8 到 12` 或 `8 至 12`
- **AND** 模型可见说明 MUST 要求不要使用 `~` 表达数字范围
- **AND** 模型可见说明 MUST NOT 禁止 emoji

#### Scenario: content 禁止 Markdown 水平分割线
- **WHEN** 默认 prompt 配置或 `fitmate_final_response.content` schema description 暴露给模型
- **THEN** 模型可见说明 MUST 禁止单独一行的 `---`、`***`、`___`、`<hr>` 或只由横线、星号、下划线组成的分隔行
- **AND** 模型可见说明 MUST 要求需要分段时使用标题、编号列表、项目列表或空行
- **AND** 模型可见说明 MUST NOT 要求模型输出 raw HTML 控制分段
