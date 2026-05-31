# ai-trace-debugger Specification

## Purpose
TBD - created by archiving change redesign-ai-trace-debugger. Update Purpose after archive.
## Requirements
### Requirement: Trace overview explains request metadata
`/dev/ai-traces` SHALL 在开发者查看单个步骤前展示请求概览，并解释主要 trace metadata 字段及其本次取值。

#### Scenario: 查看请求概览
- **WHEN** 开发者选择一条 AI trace
- **THEN** 页面 MUST 展示 route、status、createdAt、durationMs、token usage 和 metadata 中主要字段的中文含义与本次值
- **AND** 页面 MUST 保留查看原始 metadata 的入口

### Requirement: Trace flow is step-oriented
`/dev/ai-traces` SHALL 将 AI 调用链路展示为有顺序的流程，让开发者能识别哪个阶段已运行、失败或产生关键输出。

#### Scenario: 查看流程节点
- **WHEN** trace 包含 user input、intent、candidate selection、reference resolution、tool call、patch proposal、model request、model response、validation、persistence 或 final response steps
- **THEN** 页面 MUST 按链路顺序展示阶段节点、阶段状态、事件数量、耗时和 token usage
- **AND** 阶段节点 MUST 默认收起，便于开发者先扫描并定位模块
- **AND** 开发者展开某个阶段后，页面 MUST 在当前阶段下方直接展示该阶段的事件内容，不需要滚动到其他区域查看内容
- **AND** 阶段内部的失败事件、草稿生成事件或首个事件 SHOULD 默认展开，便于快速定位关键输出
- **AND** 页面 MUST 为 reference resolution、tool call、patch proposal 和 validation step 展示可读摘要

#### Scenario: 请求概览默认收起
- **WHEN** 开发者进入某条 trace 详情
- **THEN** 请求概览 MUST 默认处于收起状态
- **AND** 展开后 MUST 解释 route、status、createdAt、durationMs、tokenUsage、userId、sessionId、messageId、model、promptVersion、finalDecision 和 continuedRoutes 等字段含义

#### Scenario: 查看模型 prompt 和计划草稿
- **WHEN** trace 包含 `model_request` step
- **THEN** 页面 MUST 在 Raw JSON 之外展示模型调用配置、system prompt、user prompt 和可识别 JSON 上下文预览
- **AND** 上下文预览 SHOULD 突出 latestUserMessage、conversationSummary、intent、validation、recovery 和候选动作池数量
- **AND** 每条发送给模型的 `message.content` MUST 像模型回复一样以独立纵向长文本块展示，不得只依赖 JSON 或与 preview 挤在同一横向卡片内
- **AND** 模型请求或输出中直接出现的长文本 `content`、`preview` 字段 MUST 从 JSON 中提取为独立纵向长文本块；被截断为 `{ preview }` 的长文本也 MUST 按原字段展示
- **WHEN** trace 包含训练 routine 或 plan 草稿输出
- **THEN** 页面 MUST 在 Raw JSON 之外展示计划标题、kind、时长、周期、训练日/休息日、阶段和动作摘要

#### Scenario: 查看重点调试信息
- **WHEN** step 包含 token usage、错误 code、toolName、Patch operation、candidate counts、validation errors、persistence revision 或 response write metadata
- **THEN** 页面 MUST 优先以可读字段说明展示这些信息
- **AND** 页面 MUST 保留完整 input、output、metadata 和 error 的 Raw JSON 入口

### Requirement: Intent result is explained
`/dev/ai-traces` SHALL 同时解释主要意图字段的字段含义和本次识别值。

#### Scenario: 查看意图解析结果
- **WHEN** 选中阶段包含 intent step 或 intent extraction model response
- **THEN** 页面 MUST 在字段存在时解释 intentType、targetMuscles、equipmentOrLocation、sessionMinutes、canTriggerAction、missingActionFields 和 confidence 等关键字段
- **AND** 页面 MUST 展示一段简短解释，说明该结果对触发内部动作或继续追问意味着什么

### Requirement: Model request is readable
`/dev/ai-traces` SHALL 让模型调用配置和 prompt messages 比单纯原始 JSON 更容易检查。

#### Scenario: 查看模型请求
- **WHEN** 选中阶段包含带 messages 的 model_request step
- **THEN** 页面 MUST 将模型调用配置和 messages 分开展示
- **AND** 配置字段 MUST 为常见参数提供可读标签和字段含义
- **AND** messages MUST 按 role 和顺序展示为可读内容块

### Requirement: Raw trace data remains available
`/dev/ai-traces` SHALL 为解释层未覆盖的字段保留原始 trace 数据入口。

#### Scenario: 查看低频字段
- **WHEN** trace, stage, step, input, output, metadata, error, reference resolution result, tool call result, patch proposal, validation result, or persistence result contains fields without explicit explanation
- **THEN** 页面 MUST 为这些值提供原始 JSON 入口
- **AND** 现有保存 log 动作 MUST 继续支持全链路、阶段和单事件目标

### Requirement: Conversation memory update is outside the main flow
`/dev/ai-traces` SHALL 将会话记忆更新作为流程步骤切换区中的后处理模块展示，避免和本轮回复生成混在一起。

#### Scenario: 查看会话记忆更新
- **WHEN** trace 包含 `聊天上下文总结` 相关 step
- **THEN** 页面 MUST 在主流程节点之后展示这些 step 的切换入口
- **AND** 页面 MUST 在接口返回后的切换入口前通过分割线标记后处理模块
- **AND** 该模块 MUST 继续支持查看字段解释、原始 JSON 和保存 log

### Requirement: Trace 展示 AI 阶段 token 分账
`/dev/ai-traces` SHALL 按 AI 阶段展示 token usage、耗时、执行状态和跳过原因，使开发者能判断每轮 token 消耗来自哪个阶段。

#### Scenario: 查看已执行阶段的 token 分账
- **WHEN** trace 包含已执行的意图解析、上下文总结、动作推荐、训练计划生成或最终回答阶段
- **THEN** 页面 MUST 展示每个阶段的 `prompt_tokens`、`completion_tokens` 和 `total_tokens`
- **AND** 页面 MUST 展示每个阶段的模型名称、耗时和阶段状态
- **AND** 页面 MUST 保留全链路 token 总计

#### Scenario: 查看被跳过阶段
- **WHEN** trace 包含被 token budget 决策跳过的 AI 阶段
- **THEN** 页面 MUST 展示该阶段为 skipped
- **AND** 页面 MUST 展示服务端记录的跳过原因
- **AND** 页面 MUST 能区分“未命中该流程”和“经过预算决策后跳过”

### Requirement: Trace 展示上下文裁剪摘要
`/dev/ai-traces` SHALL 展示模型输入的上下文裁剪结果，帮助开发者确认 LLM 没有接收完整历史消息或完整动作数据库记录。

#### Scenario: 查看模型请求上下文边界
- **WHEN** 开发者查看 model_request step
- **THEN** 页面 MUST 展示本次启用的 prompt modules
- **AND** 页面 MUST 展示是否使用 `conversationSummary` 和最新用户消息
- **AND** 页面 MUST 展示候选动作裁剪前数量、裁剪后数量和模型可见字段摘要

#### Scenario: 查看原始 trace
- **WHEN** 开发者打开原始 JSON
- **THEN** 原始 trace MUST 包含 token budget 决策结果
- **AND** 原始 trace MUST 不要求默认保存完整模型响应正文才能理解 token 分账

