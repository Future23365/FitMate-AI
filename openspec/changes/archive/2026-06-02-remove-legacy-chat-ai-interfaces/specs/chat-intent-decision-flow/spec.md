## ADDED Requirements

### Requirement: 旧聊天接口面必须纳入 intent 架构删除边界
系统 SHALL 将旧 intent 架构删除边界扩展到 active Route Handler、前端新流解析和生产目录 legacy 模块。生产 `/api/chat` 不走旧主链不足以完成清理；任何仍可被聊天体验触发的旧 AI 接口或旧 trigger 面都 MUST 删除或隔离。

#### Scenario: 旧 API route 仍存在
- **WHEN** 代码库仍存在 `/api/ai/workout-plan`、`/api/ai/exercise-recommendations` 或等价旧聊天 AI route
- **THEN** 系统 MUST 将其视为旧 intent 架构残留
- **AND** 实现 MUST 删除该 route 或证明它只属于非生产离线迁移边界

#### Scenario: 前端新流仍解析旧 trigger
- **WHEN** 前端聊天页面、hook、client 或 message parser 仍解析旧 trigger JSON 或调用旧 AI route
- **THEN** 系统 MUST 将其视为旧 intent 架构残留
- **AND** 实现 MUST 迁移到 Agent-first stream/result 合同

#### Scenario: 服务端清理旧接口
- **WHEN** 实现旧接口清理
- **THEN** 服务端 MUST NOT 使用关键词、正则、短句模板、同义词表或用户原文规则替 LLM 判断高层语义
- **AND** 清理后的执行选择 MUST 继续来自 Agent 结构化输出、tool result、repair、澄清或阻断合同
