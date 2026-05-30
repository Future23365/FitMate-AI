## ADDED Requirements

### Requirement: Trace overview explains request metadata
`/dev/ai-traces` SHALL 在开发者查看单个步骤前展示请求概览，并解释主要 trace metadata 字段及其本次取值。

#### Scenario: 查看请求概览
- **WHEN** 开发者选择一条 AI trace
- **THEN** 页面 MUST 展示 route、status、createdAt、durationMs、token usage 和 metadata 中主要字段的中文含义与本次值
- **AND** 页面 MUST 保留查看原始 metadata 的入口

### Requirement: Trace flow is step-oriented
`/dev/ai-traces` SHALL 将 AI 调用链路展示为有顺序的流程，让开发者能识别哪个阶段已运行、失败或产生关键输出。

#### Scenario: 查看流程节点
- **WHEN** trace 包含 user input、intent、candidate selection、model request、model response、validation 或 final response steps
- **THEN** 页面 MUST 按链路顺序展示阶段节点、阶段状态、事件数量、耗时和 token usage
- **AND** 开发者 MUST 可以选择某个阶段，并在不展开多层子模块的情况下检查该阶段

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
- **WHEN** trace, stage, step, input, output, metadata, or error contains fields without explicit explanation
- **THEN** 页面 MUST 为这些值提供原始 JSON 入口
- **AND** 现有保存 log 动作 MUST 继续支持全链路、阶段和单事件目标
