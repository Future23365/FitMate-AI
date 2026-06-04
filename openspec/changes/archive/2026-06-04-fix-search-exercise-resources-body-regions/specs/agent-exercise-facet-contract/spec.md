## MODIFIED Requirements

### Requirement: Agent 动作检索必须使用受控 facet 合同
Agent 通过动作检索 tool 查询动作候选或动作资源时，系统 SHALL 区分动作库真实 facet 和高层身体区域，不得要求模型把高层范围词写入精确肌群字段。

#### Scenario: 用户表达高层身体区域
- **WHEN** 用户请求“上肢”“下肢”“腿部”“核心”或“全身”训练
- **THEN** Agent MUST 使用 `bodyRegions` 表达高层身体区域
- **AND** Agent MUST NOT 将 `upper body`、`lower body`、`full body`、`腿部`、`下肢` 或等价范围词写入 `targetMuscles` 或 `muscle`

#### Scenario: 用户表达具体肌群
- **WHEN** 用户明确请求胸部、肩部、背部、肱二头肌、臀部、股四头肌、腘绳肌、小腿或腹部等具体训练重点
- **THEN** Agent MAY 使用动作库真实 `targetMuscles` 或 `muscle` facet
- **AND** `targetMuscles` 或 `muscle` MUST 使用动作库中存在的肌群字段值

### Requirement: 服务端必须确定性执行 bodyRegions
服务端 SHALL 只根据结构化 `bodyRegions` 枚举展开动作库真实肌群 facet，不得读取用户自然语言原文做语义重解释。

#### Scenario: bodyRegions 包含 lower_body
- **WHEN** 动作检索 tool 输入包含 `bodyRegions = ["lower_body"]`
- **THEN** 服务端 MUST 将其展开为动作库真实下肢肌群 facet
- **AND** 动作检索 MUST 能命中符合发布态、器械和 section 条件的下肢动作候选或动作资源

#### Scenario: 服务端执行区域映射
- **WHEN** 服务端展开 `bodyRegions`
- **THEN** 展开函数 MUST 只接收结构化枚举字段
- **AND** 展开函数 MUST NOT 接收 latest user message、conversationSummary 或其他自然语言文本作为输入
