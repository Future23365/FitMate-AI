## ADDED Requirements

### Requirement: Trace 导出必须携带 tool 输出可见性元数据
系统 SHALL 在保存全链路 log 时，为 LangChain tool execution 的模型可见摘要、用户投影和调试摘要提供稳定可见性元数据，使离线排查能判断每个区块是否进入模型上下文。

#### Scenario: 导出 tool execution 可见性边界
- **WHEN** 开发者在 `/dev/ai-traces` 保存包含 LangChain tool execution 的全链路 log
- **THEN** `codex_logs/ai_trace_log.js` 或对应 `detailRef` 详情 MUST 区分 `modelVisibleSummary`、`userProjection` 和 `traceSummary`
- **AND** `modelVisibleSummary` MUST 标注为 `llm_visible`、`modelVisible: true` 或等价语义
- **AND** `userProjection` MUST 标注为 `user_projection`、`modelVisible: false` 或等价语义
- **AND** `traceSummary` MUST 标注为 `debug_only`、`modelVisible: false` 或等价语义

#### Scenario: 导出候选数量诊断字段
- **WHEN** 导出报告或 `detailRef` 详情包含 `traceSummary.totalMatches`、`traceSummary.returnedCount`、`traceSummary.truncated` 或等价候选数量诊断字段
- **THEN** 对应字段或所属区块 MUST 标注为 debug-only / not model-visible
- **AND** 导出报告 MUST 保留这些字段用于数据库筛选、候选截断和 tool 执行排查
- **AND** 导出报告 MUST NOT 将这些字段复制到 `modelVisibleSummary` 或 LLM 可见区块中

#### Scenario: 导出 enteredModelContext 语义
- **WHEN** 导出报告展示 `enteredModelContext = true` 或等价状态
- **THEN** 报告 MUST 明确该状态表示 `modelVisibleSummary` 已回填模型
- **AND** 报告 MUST 明确 `userProjection` 和 `traceSummary` 不因该状态进入模型上下文
- **AND** 报告 MAY 保留原始字段名以兼容既有 trace，但默认摘要 MUST 使用精确语义说明

#### Scenario: 长文本和详情映射保留可见性
- **WHEN** `modelVisibleSummary`、`userProjection`、`traceSummary` 或包含这些字段的详情被替换为 `contentRef` 或 `detailRef`
- **THEN** header record MUST 保留可见性元数据或足够从路径推导的可见性说明
- **AND** chunk record MUST 能通过 `parentRef` 关联回带有可见性元数据的 header
- **AND** 导出层 MUST 继续执行现有脱敏、截断和大 payload 外置规则
