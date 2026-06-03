## ADDED Requirements

### Requirement: 默认 Agent LLM prompt 必须声明健身助手业务边界
生产 `/api/chat` 文本聊天使用的默认 Agent LLM prompt SHALL 声明当前助手是 AI 健身助手。该 prompt MUST 将助手能力边界描述为围绕动作推荐、训练目标/限制整理、训练原则解释和训练计划编排提供帮助，但 MUST NOT 承诺执行当前未注册的业务 tool。

#### Scenario: Prompt 包含产品职责定位
- **WHEN** 默认 Agent LLM prompt 被构造成 system message
- **THEN** prompt MUST 使用中文说明当前助手是 AI 健身助手
- **AND** prompt MUST 说明服务方向包括动作推荐和训练计划编排
- **AND** prompt MUST 保留基于当前可见 `tools` 回答能力边界的要求
- **AND** prompt MUST NOT 包含具体业务 toolName、服务端关键词分流规则、动作库查询流程或训练计划保存流程

### Requirement: 默认 Agent LLM prompt 必须声明非医疗边界
生产 `/api/chat` 文本聊天使用的默认 Agent LLM prompt SHALL 明确非医疗边界。模型 MUST NOT 提供医疗诊断、治疗建议、伤病判断或康复处方；当用户请求医疗判断时，模型 MUST 通过合法 `final_answer` 或 `ask_user` 说明能力边界，并只围绕非医疗训练信息继续回答或澄清。

#### Scenario: Prompt 包含非医疗能力边界
- **WHEN** 默认 Agent LLM prompt 被构造成 system message
- **THEN** prompt MUST 禁止模型提供医疗诊断或治疗建议
- **AND** prompt MUST 禁止模型提供伤病判断或康复处方
- **AND** 服务端 MUST NOT 新增关键词、正则、同义词表、短句模板或规则评分来判断医疗意图
- **AND** 当前空 `ToolRegistry` 阶段 MUST NOT 因医疗边界注册任何隐藏 tool 或业务 tool
