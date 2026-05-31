## ADDED Requirements

### Requirement: 用户问答记录可导出
`/dev/ai-traces` SHALL 允许开发者从当前选中的 trace 导出用户问答记录，用于后续回归测试样本整理。

#### Scenario: 保存当前 trace 的用户问答记录
- **WHEN** 开发者选择一条 AI trace
- **THEN** 页面 MUST 在「保存全链路log」按钮左侧展示「保存用户问答记录」按钮
- **AND** 开发者点击该按钮后，系统 MUST 将记录追加写入 `codex_logs/prompt.js`
- **AND** 现有「保存全链路log」按钮 MUST 继续写入 `codex_logs/ai_trace_log.js`
- **AND** 多次保存用户问答记录 MUST NOT 覆盖 `prompt.js` 中已有记录

#### Scenario: 多轮对话只保存用户问题和最终文本回答
- **WHEN** trace 中包含多轮对话历史或模型请求 messages
- **THEN** `prompt.js` MUST 按原始顺序保存 trace 可见的用户问题
- **AND** `prompt.js` MUST 保存最终展示给用户的文本回答
- **AND** `prompt.js` MUST NOT 保存动作卡片、训练计划卡片、候选动作池、校验详情或完整 trace payload

#### Scenario: 输出格式便于人工阅读
- **WHEN** `prompt.js` 被写入
- **THEN** 文件内容 MUST 使用清晰命名的 CommonJS 记录列表
- **AND** 文件内容 MUST 包含保存时间、trace 标题或标识、用户问题列表和最终回答文本
- **AND** 保存时间 MUST 使用本地时区格式，便于和本机调试日志对齐
