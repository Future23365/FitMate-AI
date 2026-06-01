## ADDED Requirements

### Requirement: 黑盒测试必须验证 Tool-first Agent 用户可见闭环

系统 SHALL 用真实 `/api/chat` 多轮黑盒流程验证 Tool-first Agent 主链，重点断言用户可见回复、工具执行结果和 artifact 事件一致。

#### Scenario: 保留现有业务 flow
- **WHEN** 系统迁移到 Tool-first Agent 主链
- **THEN** 现有 basic/detail 黑盒 flow 的用户输入序列和业务期望 MUST 默认保留
- **AND** 测试 MUST NOT 为适配内部 Agent 实现而重写成工具级白盒用例
- **AND** 如确需调整某个 flow，MUST 说明是业务期望变化、报告诊断变化还是旧兼容字段退出导致

#### Scenario: 多轮器械调整
- **WHEN** 黑盒流程先生成一套 30 分钟哑铃上肢 routine
- **AND** 用户随后输入“`不用哑铃了，换一个`”
- **THEN** 测试 MUST 断言系统读取最近 artifact
- **AND** 测试 MUST 断言最终结果不再推荐哑铃训练作为首选执行结果
- **AND** 测试 MUST 断言用户可见回复与 artifact、patch 或澄清事件一致

#### Scenario: 动作库真实查询
- **WHEN** 用户请求具体动作推荐、routine 或替代动作
- **THEN** 黑盒报告 MUST 记录是否发生动作库工具查询
- **AND** 用户可见具体动作 MUST 来自工具候选或已保存 artifact

#### Scenario: 旧 intent 字段不是验收核心
- **WHEN** Tool-first Agent 已返回正确用户可见结果和 artifact 事件
- **THEN** 测试 MUST NOT 仅因为缺少旧 `assistant_action`、旧 resolved intent 字段或旧 trigger JSON 判失败
- **AND** 报告 MUST 优先展示 Agent tool trace、ExecutionResult 和用户可见断言

#### Scenario: 黑盒 runner 采集 Agent 执行证据
- **WHEN** runner 消费 `/api/chat` NDJSON stream 并保存会话
- **THEN** runner MUST 采集 `AgentExecutionResult` 或等价 done metadata
- **AND** runner MUST 采集 Agent stage、tool call、tool result、dependency graph 摘要和 legacy path skip 诊断
- **AND** runner MUST 记录关键 `toolResultId`、`candidateSetId`、`validationId`、`policyDecisionId`、`confirmationId`、`revisionId` 或明确 blocking reason
- **AND** runner MUST 继续回读 artifact payload 和 recent artifact summaries，用于验证用户可见结果与持久化结果一致

#### Scenario: 卡片类型从 Agent 结果推导
- **WHEN** 黑盒断言需要判断动作推荐、routine、plan、patch 或澄清结果
- **THEN** 测试 MUST 优先从 `AgentExecutionResult`、artifact/patch/suggestion 事件和 done metadata 推导稳定结果类型
- **AND** 测试 MUST NOT 把旧 `AssistantAction["action"]` 作为唯一卡片类型来源
- **AND** 如果兼容期仍输出 `assistant_action`，测试 MAY 记录它为 derived/diagnostic 字段

#### Scenario: 架构级防回归断言
- **WHEN** 黑盒流程触发动作推荐、routine、plan、Patch 或 Regenerate
- **THEN** 报告 MUST 断言执行结果来自 `AgentExecutionResult`
- **AND** 报告 MUST 断言没有由旧 intent-first 分支、summary-only 上下文、旧 normalize 或裸 query RAG 直接触发卡片
- **AND** 报告 MUST 展示关键 toolResultId、candidateSetId、validationId、revisionId 或阻断原因

#### Scenario: Prompt 与 token budget 防回归断言
- **WHEN** 黑盒流程进入 `/api/chat` Tool-first Agent 主链
- **THEN** 报告 MUST 展示 Agent prompt module、Agent stage、ContextPackage 可见性摘要和关键 tool result 引用
- **AND** 报告 MUST NOT 把旧 `chat_intent_resolution`、`chat_final_response` 或 `conversation_summary_context` 作为主链执行依据
- **AND** 如果 summary 更新存在，报告 MUST 标注其为后台或调试材料，而不是执行事实源

#### Scenario: 黑盒报告分层展示失败原因
- **WHEN** 黑盒流程失败或需要复核
- **THEN** 报告 MUST 区分用户可见闭环失败、Agent 执行证据失败、语义质量失败和人工复核项
- **AND** 用户可见闭环失败 MUST 包含空回复、卡片缺失、意外卡片、请求/stream 错误或回复承诺与 artifact 事件不一致
- **AND** Agent 执行证据失败 MUST 包含缺少 `AgentExecutionResult`、缺少必需 tool result id、写入缺少 validation/revision、旧路径触发执行或 trace 无法复盘
- **AND** 语义质量失败 MUST 包含目标继承错误、器械/动作排除未生效、引用对象错误或应澄清时擅自猜测

#### Scenario: fixture 增加 Agent 期望字段
- **WHEN** 某个 flow 需要验证 Agent 行为而不只验证用户可见文本
- **THEN** fixture MAY 声明预期 Agent status、必需工具、禁用工具、必需候选集合、必需校验、必需 revision、引用解析和 legacy path 禁用断言
- **AND** 这些字段 MUST 只描述可观测执行证据，不得锁定模型 prompt 文案、内部思考文本或非合同化的工具排序细节

#### Scenario: 兼容字段退出验证
- **WHEN** 前端和报告已经支持 AgentExecutionResult
- **THEN** 测试 MUST 覆盖关闭旧 `assistant_action` / resolved intent 兼容事件后的主流程
- **AND** 用户可见回复、artifact 事件、assistantSuggestions 和 done metadata MUST 仍然通过
