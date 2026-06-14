## ADDED Requirements

### Requirement: Trace 页面必须区分 tool 输出可见性边界
`/dev/ai-traces` SHALL 在展示 LangChain tool execution 输出时，明确区分 LLM 可见内容、用户投影内容和仅调试内容，避免开发者把 debug-only 字段误判为模型输入。

#### Scenario: 查看 tool execution 输出区块
- **WHEN** trace 中的 tool execution record 包含 `modelVisibleSummary`、`userProjection` 和 `traceSummary`
- **THEN** 页面 MUST 将三者展示为独立区块或等价清晰结构
- **AND** `modelVisibleSummary` 区块 MUST 标注为 LLM 可见或 ToolMessage 内容
- **AND** `userProjection` 区块 MUST 标注为用户投影或前端投影，且不得标注为 LLM 可见
- **AND** `traceSummary` 区块 MUST 标注为 debug-only 或调试摘要，且不得标注为 LLM 可见

#### Scenario: 查看候选数量诊断字段
- **WHEN** 页面展示 `traceSummary.totalMatches`、`traceSummary.returnedCount`、`traceSummary.truncated` 或等价候选数量诊断字段
- **THEN** 页面 MUST 在字段所在区块或字段旁标注这些字段为 debug-only / not model-visible
- **AND** 页面 MUST NOT 将这些字段展示在 LLM 可见内容区块中
- **AND** 页面 MUST 保留 Raw JSON 或详情入口，便于开发者继续排查数据库筛选和截断问题

#### Scenario: 查看 enteredModelContext 语义
- **WHEN** tool execution record 包含 `enteredModelContext = true` 或等价字段
- **THEN** 页面 MUST 说明该状态只表示 `modelVisibleSummary` 已进入模型上下文
- **AND** 页面 MUST NOT 暗示 `userProjection`、`traceSummary`、完整 handler output 或完整 execution record 已进入模型上下文

#### Scenario: 可见性标签不替代脱敏
- **WHEN** 页面展示 `debug_only`、`user_projection` 或 `llm_visible` 等可见性标签
- **THEN** 页面 MUST 继续遵守现有 trace 脱敏和长文本外置规则
- **AND** 页面 MUST NOT 因字段被标注为 debug-only 而展示 secret、跨用户 payload、完整敏感 handler output 或未脱敏大 payload
