# legacy-chat-interface-cleanup Specification

## Purpose
TBD - created by archiving change remove-legacy-chat-ai-interfaces. Update Purpose after archive.
## Requirements
### Requirement: 旧聊天 AI 独立接口必须删除
系统 SHALL 删除聊天主链遗留的独立 AI Route Handler。旧 workout-plan AI route 和旧 exercise recommendation AI route MUST NOT 继续作为聊天计划、routine、动作推荐或推荐刷新的生产入口。

#### Scenario: 代码库暴露 API route
- **WHEN** 实现完成后扫描 `app/api`
- **THEN** 系统 MUST NOT 存在 active 旧 workout-plan AI Route Handler
- **AND** 系统 MUST NOT 存在 active 旧 exercise recommendation AI Route Handler

#### Scenario: 前端请求聊天 AI 结果
- **WHEN** 聊天页面需要生成计划、routine、动作推荐或刷新推荐
- **THEN** 前端 MUST 使用 `/api/chat` 的 Agent-first 合同或已存在 Agent result 的确定性操作
- **AND** 前端 MUST NOT 调用旧 workout-plan AI route 或旧 exercise recommendation AI route

### Requirement: 旧 trigger JSON 不得参与新聊天流
系统 SHALL 删除前端新聊天流中的旧 trigger JSON 解析和执行路径。新运行 MUST NOT 从 assistant 文本中解析 `workout_plan_trigger`、`exercise_recommendation_trigger` 或等价旧 trigger JSON 来触发训练卡片。

#### Scenario: 新聊天流接收 assistant 文本
- **WHEN** assistant 回复包含普通文本或历史遗留 JSON 片段
- **THEN** 前端 MUST NOT 将文本中的旧 trigger JSON 解析成可执行卡片
- **AND** 卡片、patch、推荐和保存状态 MUST 来自 `agent_execution_result`、artifact / patch / suggestion 事件或 done metadata

#### Scenario: 历史消息需要兼容展示
- **WHEN** 历史聊天消息中包含旧 trigger JSON
- **THEN** 兼容逻辑 MUST 仅用于历史展示清理或测试 fixture
- **AND** 兼容逻辑 MUST NOT 被前端新流解析、生产 `/api/chat` 或领域服务导入为执行事实源

### Requirement: 生产目录 legacy 模块必须删除或隔离
系统 SHALL 对旧聊天语义解析、旧 reference resolver、旧 trigger helper、旧 workout patch chat 入口和旧推荐/计划接口 helper 执行 deny-by-default 清理。allowlist 外的 legacy 模块 MUST NOT 保留在生产导出边界。

#### Scenario: Legacy 模块只被测试使用
- **WHEN** 旧模块不再被生产新聊天流程调用，但仍被测试引用
- **THEN** 系统 MUST 删除该模块或将其移动到测试 fixture、历史兼容或离线迁移边界
- **AND** 该模块 MUST NOT 继续从生产目录导出给应用代码使用

#### Scenario: Legacy 模块确需保留
- **WHEN** 实现阶段确认某段旧解析逻辑仍需保留用于历史展示或离线迁移
- **THEN** 该逻辑 MUST 被加入 legacy allowlist 并标明边界
- **AND** 自动化检查 MUST 证明生产 `/api/chat`、Agent runtime、Response Writer、前端新流解析和领域服务均不可导入该逻辑

### Requirement: 当前规格不得正向要求旧接口存在
系统 SHALL 修正当前 OpenSpec 主规格中仍要求旧 AI route、旧 trigger parser 或旧前端 fallback 的正向合同。测试和验收 MUST 断言旧接口缺席，而不是要求旧接口继续通过。

#### Scenario: OpenSpec 主规格被扫描
- **WHEN** 实现完成后扫描 `openspec/specs`
- **THEN** 当前主规格 MUST NOT 要求旧 workout-plan AI route 或旧 exercise recommendation AI route 继续存在
- **AND** 当前主规格 MUST NOT 要求前端新聊天流测试旧 trigger parser 的成功解析

#### Scenario: Legacy 防回归测试运行
- **WHEN** 测试套件运行旧接口清理相关测试
- **THEN** 测试 MUST 覆盖旧 route 缺席、旧前端调用缺席、旧 trigger parser 不参与新流和 allowlist 外 legacy 模块不可被生产路径导入
