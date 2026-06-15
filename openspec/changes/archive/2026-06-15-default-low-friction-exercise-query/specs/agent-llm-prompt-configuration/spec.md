## ADDED Requirements

### Requirement: 默认 Agent LLM prompt 必须表达训练助手边界

生产 `/api/chat` 文本聊天使用的默认 Agent LLM prompt SHALL 声明当前助手是 AI 健身助手。该 prompt MUST 将助手能力边界描述为围绕动作推荐、训练目标/限制整理、训练原则解释和训练计划编排提供帮助，但 MUST NOT 承诺执行当前未注册的业务 tool。

#### Scenario: 宽泛动作推荐默认低门槛无器械口径
- **WHEN** 用户请求宽泛动作推荐、动作筛选或结构化训练候选
- **AND** 当前用户输入、上下文或已验证事实没有明确器械、场地或可用设施偏好
- **THEN** 默认 prompt MUST 指示模型按低门槛无器械条件继续
- **AND** 默认 prompt MUST 表达该低门槛无器械默认对应当前请求可在地面或瑜伽垫完成
- **AND** 默认 prompt MUST 表达该默认只服务当前请求，不代表用户长期偏好
- **AND** 默认 prompt MUST 指示最终正文说明默认按无器械、地面或瑜伽垫条件推荐
- **AND** 默认 prompt MUST NOT 指示模型先做无执行场景的宽泛动作查询，再为同一推荐目标补查低门槛无器械候选
- **AND** 默认 prompt MUST NOT 把具体用户短句、关键词、正则、同义词表或 phrasing 写成触发规则

#### Scenario: 未确认的居家支撑不得作为默认条件
- **WHEN** 用户请求宽泛动作推荐、动作筛选或结构化训练候选
- **AND** 用户没有明确表示可用椅子、墙面、台阶、小器械、健身房设施、搭档或户外空间
- **THEN** 默认 prompt MUST NOT 指示模型把这些未确认条件纳入动作查询口径
- **AND** 默认 prompt MUST NOT 把低门槛无器械默认升级为更宽的居家支撑、健身房或户外偏好

#### Scenario: 低门槛默认不引入服务端语义分流
- **WHEN** 实现低门槛无器械默认口径
- **THEN** `/api/chat`、LangChain runtime、tool wrapper、validator、tool handler、repository 和 response adapter MUST NOT 根据用户原文、关键词、正则、同义词表或短句模板自动补写 `executionProfile`
- **AND** 系统 MUST NOT 根据具体用户短句改写 provider `tool_calls`、`toolName`、调用顺序、`payload.kind` 或最终回答策略
