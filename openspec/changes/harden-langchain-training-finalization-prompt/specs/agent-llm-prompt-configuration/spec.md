## MODIFIED Requirements

### Requirement: 默认 prompt 必须只描述通用 LangChain Agent 合同
系统 SHALL 将默认 LangChain Agent system prompt 限定为通用决策合同、provider tool calling、structured final response、grounding、安全边界和不可执行能力边界。默认 system prompt MUST NOT 承载具体业务 output type 的完整 payload 规则、业务 examples、固定 tool 调用流程、动作库、训练生成、保存、用户记忆或业务语义分流规则。

#### Scenario: 默认 prompt 不包含业务输出完整规则
- **WHEN** 开发者查看默认 prompt 配置
- **THEN** 默认 system prompt MUST NOT 包含 `visibleTrainingProposal` 的完整 payload 结构说明、`routine` / `plan` section coverage 细则、`prescription` / `schedule` 细则、业务 examples 或具体业务 toolName 的恢复流程说明
- **AND** 默认 system prompt MAY 简短说明当本轮要交付可展示、可后续引用或可继续调整的训练动作集合、单次训练 routine 或多天训练 plan 时，模型必须通过当前 tool catalog 中的结构化训练收口工具和服务端 validator 交付
- **AND** 默认 system prompt MUST 表达普通训练知识、动作教学、注意事项、热身或拉伸方法、筛选结果说明等不形成可后续引用训练结构的回答可以基于成功事实直接通过 `fitmate_final_response.content` 回答
- **AND** 具体业务能力和业务输出结构的模型可见说明 MUST 来自 LangChain tool description、schema description、tool result summary、受控业务事实摘要或失败反馈
- **AND** 默认 system prompt MUST NOT 根据用户原文、关键词、正则、同义词表、短句模板或具体业务 `toolName` 规定 action、toolName、outputType 或 payload kind

### Requirement: Agent LLM prompt 必须表达训练输出结构能力而非固定意图映射
系统 SHALL 通过 LangChain tool description、schema description、tool result summary 或等价模型可见输入表达训练结构输出的结构能力、字段要求和事实边界。该能力 MUST 由 `submitVisibleTrainingProposal` 等结构化收口 tool 的 schema / description 或等价说明承载；默认 system prompt 只负责要求模型遵守当前可见工具和服务端 validator。模型可见合同 MUST NOT 通过固定关键词、正则、同义词表、短句模板或示例短语规定模型必须选择某个 `payload.kind`。

#### Scenario: 结构化训练结果正文不可替代
- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 简短表达 `content` 不能替代用户可见、可后续引用或可继续调整的训练动作集合、routine 或 plan 的结构化交付
- **AND** system message MUST 要求这类结构化训练结果通过当前 tool catalog 中的结构化训练收口工具和服务端 validator 交付
- **AND** system message MUST 表达 `content` 只负责解释推荐理由、注意事项、训练建议或补充说明
- **AND** system message MUST NOT 包含 `visibleTrainingProposal` 的完整 payload 结构、固定 `payload.kind` 选择规则或具体业务 tool 调用流程

### Requirement: 最终正文格式必须避免装饰性分隔线
系统 SHALL 在模型可见 final response 合同中约束 `content` 输出格式。模型生成的用户可见正文 MUST NOT 使用 Markdown 水平分割线或装饰性分隔行。

#### Scenario: content 禁止 Markdown 水平分割线
- **WHEN** 默认 prompt 配置或 `fitmate_final_response.content` schema description 暴露给模型
- **THEN** 模型可见说明 MUST 禁止单独一行的 `---`、`***`、`___`、`<hr>` 或只由横线、星号、下划线组成的分隔行
- **AND** 模型可见说明 MUST 要求需要分段时使用标题、编号列表、项目列表或空行
- **AND** 模型可见说明 MUST NOT 要求 response adapter、renderer 或前端清洗这些分隔线
