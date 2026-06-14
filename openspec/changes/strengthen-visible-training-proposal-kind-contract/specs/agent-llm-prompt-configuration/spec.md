## ADDED Requirements

### Requirement: 默认 prompt 必须避免对 exercise_selection 产生结构偏置
默认 LangChain Agent system prompt SHALL 只表达结构化训练交付的高层边界，并把具体 `visibleTrainingProposal.payload.kind` 选择规则交给结构化收口 tool description、schema description 或等价模型可见说明。默认 prompt MUST NOT 将所有具体动作条目默认绑定到 `exercise_selection`，也 MUST NOT 内联完整 `visibleTrainingProposal` payload 规则。

#### Scenario: 具体动作条目需要结构化训练结果
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 表达具体数据库动作条目不能只通过正文 content 替代结构化训练结果
- **AND** system message MUST 表达结构化训练结果需要通过当前可见结构化收口工具和服务端 validator
- **AND** system message MUST NOT 将所有具体动作条目默认描述为 `exercise_selection`

#### Scenario: kind 选择由业务 tool 合同承载
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MAY 简短说明训练卡片、单次训练和多天计划属于结构化训练结果
- **AND** system message MUST 指向当前结构化收口 tool 的 description/schema 作为具体结构选择依据
- **AND** system message MUST NOT 内联 `exercise_selection`、`routine`、`plan` 的完整字段表、examples 或 validator 修复细节

#### Scenario: 默认 prompt 不新增语义分流
- **WHEN** 实现本 change
- **THEN** 默认 prompt MUST NOT 根据用户原文、关键词、正则、同义词表、短句模板或具体业务 `toolName` 规定 `payload.kind`
- **AND** `/api/chat` route、LangChain runtime、tool wrapper、validator 和 response adapter MUST NOT 新增服务端语义分流
