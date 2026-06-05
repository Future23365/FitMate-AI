## ADDED Requirements

### Requirement: Agent LLM prompt 配置必须迁移到服务端集中配置目录
系统 SHALL 将生产 `LlmPlanner` 使用的 Agent LLM prompt 配置放在 `lib/server/config/` 下，与 Agent runtime TS config 统一管理。迁移 MUST 保持现有模型可见合同含义、`promptVersion`、请求默认值和测试注入能力。

#### Scenario: 默认 prompt 配置入口位于 lib/server/config
- **WHEN** 开发者查看生产 Agent LLM prompt 配置入口
- **THEN** 当前默认入口 MUST 位于 `lib/server/config/` 下
- **AND** 旧 `lib/server/agent-planners/prompts/agent-llm-prompt-config.ts` MUST 被删除或改为不承载生产默认内容的短期 re-export
- **AND** 若保留短期 re-export，tasks MUST 明确清理条件和测试覆盖

#### Scenario: Adapter 继续消费 prompt 配置而不内联 prompt
- **WHEN** `DeepSeekModelAdapter` 构造 system message
- **THEN** adapter MUST 从迁移后的 prompt 配置入口构造 system prompt
- **AND** adapter MUST NOT 在供应商请求构造函数中内联默认 prompt 句子
- **AND** adapter MUST 继续支持测试传入自定义 prompt 配置

#### Scenario: 迁移不改变 prompt 语义
- **WHEN** prompt 配置迁移完成
- **THEN** 生成的默认 system prompt 内容 MUST 与本 change 前的业务含义保持一致，除非实现任务明确列出独立 prompt 合同变更
- **AND** 本 change MUST NOT 借迁移新增服务端关键词分流、固定 tool 调用规则或新的业务 toolName 流程

#### Scenario: 文档和测试指向新入口
- **WHEN** 开发者阅读 prompt 相关文档或测试失败信息
- **THEN** 文档和测试 MUST 指向 `lib/server/config/` 下的新 prompt 配置入口
- **AND** 文档 MUST 不再把旧 `lib/server/ai/prompt-config.ts` 或旧 `lib/server/agent-planners/prompts/agent-llm-prompt-config.ts` 当作生产默认入口
