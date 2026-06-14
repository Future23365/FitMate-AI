## ADDED Requirements

### Requirement: 未指定器械默认无器械必须保留澄清出口

当用户请求动作推荐或动作集合，且没有明确提供可用器械时，系统 SHALL 继续允许模型使用无器械 / 自重作为保守默认。该默认 SHALL 不阻止模型在场地、器械、时长、经验或偏好显著影响结果质量时，向用户追问一个关键补充问题。

#### Scenario: 默认无器械继续
- **WHEN** 用户请求某个训练目标、身体部位或动作类别的动作推荐
- **AND** 当前消息、已确认上下文和用户记忆中没有正向可用器械事实
- **AND** 模型判断无器械 / 自重默认足以给出有用结果
- **THEN** 系统 MUST 允许 Agent 使用无器械或自重候选继续生成动作推荐或动作集合
- **AND** 最终正文 MUST 说明本次按无器械或自重口径处理

#### Scenario: 偏好影响结果质量时澄清
- **WHEN** 用户请求动作推荐或动作集合
- **AND** 缺少的器械、场地、时长、经验或偏好会显著影响候选选择或用户体验
- **THEN** 系统 MUST 允许 Agent 向用户追问一个关键补充问题
- **AND** 系统 MUST NOT 把“未指定器械默认无器械”解释为禁止澄清

#### Scenario: 不新增服务端语义分流
- **WHEN** `/api/chat` 处理用户自然语言输入
- **THEN** route、handler、renderer、LangChain runtime 和 production response adapter MUST NOT 根据用户原文关键词、正则、同义词表、短句模板或固定 phrasing 选择默认无器械、追问或具体工具调用
