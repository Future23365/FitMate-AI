## ADDED Requirements

### Requirement: DeepSeek 模型与 Thinking Mode 默认值必须集中配置
系统 SHALL 在 `lib/server/config/` 中集中定义生产 DeepSeek adapter 的默认模型、Thinking Mode 默认推理强度和相关请求策略。默认聊天模型 MUST 为 `deepseek-v4-flash`，Thinking Mode 开启时默认 `reasoning_effort` MUST 为 `high`。

#### Scenario: 默认模型来自集中配置
- **WHEN** `DeepSeekModelAdapter` 构造生产模型请求
- **THEN** 默认 model MUST 为 `deepseek-v4-flash`
- **AND** `DEEPSEEK_MODEL` MAY 继续覆盖部署环境中的最终 model
- **AND** adapter MUST NOT 在集中配置之外重复硬编码生产默认模型名

#### Scenario: Thinking 推理强度来自集中配置
- **WHEN** `DeepSeekModelAdapter` 构造开启 Thinking Mode 的请求
- **THEN** `reasoning_effort` MUST 来自 `lib/server/config/` 下的集中配置
- **AND** 默认值 MUST 为 `high`
- **AND** 配置项 MUST 有中文注释说明它影响推理深度、延迟、成本和模型输出稳定性

#### Scenario: Thinking 配置不扩大业务能力
- **WHEN** `/api/chat` 接收用户消息
- **THEN** Thinking Mode 配置 MUST NOT 新增业务 tool、训练生成能力、保存能力或服务端语义分流
- **AND** 系统 MUST NOT 基于用户原文关键词、正则、同义词表或短句模板动态改变 `reasoning_effort`
