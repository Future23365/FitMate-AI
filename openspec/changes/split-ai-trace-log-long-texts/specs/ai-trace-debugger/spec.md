## MODIFIED Requirements

### Requirement: Trace 页面导出必须包含文本聊天 trace 摘要
`/dev/ai-traces` SHALL 支持将当前文本聊天 trace 导出到现有开发日志文件。导出 MUST 保留可读分组摘要、长文本映射入口和 Raw trace 摘要，并继续遵守脱敏边界。

#### Scenario: 保存全链路 log
- **WHEN** 开发者选择当前文本聊天 trace 并点击保存全链路 log
- **THEN** 系统 MUST 写入轻量报告 `codex_logs/ai_trace_log.js`
- **AND** 系统 MUST 写入长文本映射 `codex_logs/ai_trace_texts.jsonl`
- **AND** `ai_trace_log.js` MUST 包含 trace 标题、route、状态、runtime event 摘要、响应事件摘要、模块分组、模型调用摘要、token usage 和 Raw trace 摘要
- **AND** `ai_trace_log.js` MUST NOT 内联完整 `rawTrace` 或完整 `trace` payload
- **AND** `ai_trace_log.js` MUST 使用 `contentRef`、`path`、`kind`、`originalLength`、`hash` 和 `preview` 引用被抽离的长文本
- **AND** `ai_trace_log.js` MUST 使用 `detailRef` 引用被瘦身掉的完整 `trace` 和 runtime event 结构化详情
- **AND** `ai_trace_texts.jsonl` MUST 以一行一个 JSON object 保存与 `contentRef` 对应的脱敏长文本 header/chunk records
- **AND** `ai_trace_texts.jsonl` MUST 保存与 `detailRef` 对应的脱敏结构化详情 header/chunk records
- **AND** 模型请求 trace 中超过 adapter 摘要阈值的 message content MUST 能以分块 envelope 进入导出层，并在 `ai_trace_texts.jsonl` 中恢复为单条长文本映射
- **AND** `ai_trace_texts.jsonl` SHOULD 按 hash 去重保存重复长文本，并在记录中保留出现路径
- **AND** `ai_trace_texts.jsonl` SHOULD 将超长 content 拆成多个 chunk records，避免单条 JSONL 记录过长
- **AND** 两个文件 MUST 在每次保存全链路 log 时覆盖上一次导出，不新增导出目录或历史版本
- **AND** 两个文件 MUST 包含注释，说明默认先读轻量报告，并按 `contentRef` 到 `ai_trace_texts.jsonl` 查询长文本
- **AND** 保存内容 MUST NOT 包含 API key、authorization、cookie、跨用户 payload、完整敏感 payload 或完整 tool output

#### Scenario: 保存用户问答记录
- **WHEN** 开发者选择当前文本聊天 trace 并点击保存用户问答记录
- **THEN** 系统 MUST 追加写入 `codex_logs/prompt.js`
- **AND** 保存内容 MUST 只包含保存时间、trace 标识、用户问题列表和最终文本回答
- **AND** 保存内容 MUST NOT 保存完整 tool payload、候选池、校验详情、完整 trace payload 或长文本映射文件

### Requirement: Agent loop log export is readable
`/dev/ai-traces` SHALL export Agent loop logs in the same causal structure used by the page, while separating long text from the default report.

#### Scenario: 保存全链路 log
- **WHEN** 开发者点击保存全链路 log
- **THEN** 系统 MUST 写入包含 Agent loop timeline 的轻量报告 `codex_logs/ai_trace_log.js`
- **AND** 保存内容 MUST 包含每轮 LLM 输入摘要、LLM 输出解析、tool 执行结果、resource links、diagnostic findings、final result 和用户可见回复摘要
- **AND** 保存内容 MUST 将超过导出阈值的长文本替换为 `contentRef` 引用
- **AND** 被引用的长文本 MUST 写入 `codex_logs/ai_trace_texts.jsonl`
- **AND** 模型请求 message content 已在上游 trace 中以 chunks 保存时，导出层 MUST 合并 chunks 并只在报告中留下 `contentRef`
- **AND** 保存内容 MUST 使用 step summary 或 trace summary 代替完整 Raw trace 对象
- **AND** 被 step summary 或 trace summary 代替的完整结构化详情 MUST 能通过 `detailRef` 在映射文件中找回
- **AND** 报告 MUST 保留足够定位问题的 code、id、状态、step、token usage、hash 和路径信息，便于只读报告完成常规排查

#### Scenario: 保存用户问答记录
- **WHEN** 开发者点击保存用户问答记录
- **THEN** 系统 MUST 继续只写入用户问题列表和最终文本回答
- **AND** 保存内容 MUST NOT 包含完整 prompt、tool payload、动作卡片、训练计划卡片、权限 token、敏感字段或长文本映射

### Requirement: 页面默认只显示排查有用信息
`/dev/ai-traces` SHALL 默认展示对定位问题有用的模块摘要和关键字段，低频或大体积字段必须保留在展开区或 Raw JSON / 保存 log 中；保存 log 时长文本 MUST 可按引用追溯。

#### Scenario: 默认查看 trace
- **WHEN** 开发者打开 trace 详情
- **THEN** 页面 MUST 优先展示模块状态、关键 code、关键 id、LLM 调用轮次、token usage、失败边界和用户可见响应摘要
- **AND** 页面 MUST 默认隐藏完整 messages、完整 Raw JSON、长文本 payload 和低频 metadata
- **AND** 页面 MUST 提供明确入口展开这些隐藏诊断

#### Scenario: 保存全链路 log
- **WHEN** 开发者点击保存全链路 log
- **THEN** 保存 payload MUST 包含页面模块结构、每个模块的关键摘要、模型调用诊断详情、runtime traceEvents、response summary 和 Raw trace 摘要
- **AND** 保存 payload MUST 将长文本外置为 `contentRef` 映射，并在报告中保留查询长文本所需的路径、hash、长度和预览
- **AND** 保存 payload MUST NOT 因 adapter 级 800 字符摘要丢失完整模型请求 message 的尾部内容
- **AND** 保存 payload MUST NOT 重复保存完整 `rawTrace` 和完整 `trace` 对象
- **AND** 保存 payload MUST NOT 丢弃被默认报告瘦身掉的完整 `rawTrace` / `trace`、runtime event `input` / `output` / `metadata` / `error`，这些内容 MUST 通过 `detailRef` 外置
- **AND** 保存 payload 和长文本映射 MUST 继续经过脱敏

#### Scenario: 保存用户问答记录
- **WHEN** 开发者点击保存用户问答记录
- **THEN** 保存内容 MUST 继续只包含保存时间、trace 标识、用户问题列表和最终文本回答
- **AND** 保存内容 MUST NOT 包含完整 prompt、模型 raw output、tool payload、traceEvents、Raw trace payload 或长文本映射
