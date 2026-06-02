## ADDED Requirements

### Requirement: Trace 必须记录 Agent decision JSON 恢复证据
系统 SHALL 在 Agent decision 模型输出发生 JSON 格式恢复时记录可诊断 trace，使开发者能区分严格解析失败、非语义格式恢复、恢复后 schema 失败和最终执行结果。

#### Scenario: Agent decision JSON 恢复成功
- **WHEN** Agent decision 模型响应严格 JSON 解析失败，但非语义 JSON 格式恢复成功
- **THEN** trace MUST 记录原始解析失败 code 和错误详情
- **AND** trace MUST 记录恢复方式、恢复后的 parse status 和模型阶段
- **AND** trace MUST 记录恢复后的 decision action、toolName 或 final result status

#### Scenario: Agent decision JSON 恢复后继续执行工具
- **WHEN** 恢复后的 Agent decision 通过 Schema、registry 和工具输入校验
- **THEN** trace MUST 能关联恢复后的 decision step、后续 tool call、tool result 和 dependency graph
- **AND** trace MUST 保留原始模型响应摘要，便于确认恢复没有改变语义字段

#### Scenario: Agent decision JSON 恢复失败
- **WHEN** Agent decision 模型响应无法恢复为唯一合法 JSON object
- **THEN** trace MUST 继续记录 `invalid_json` 或等价失败 code
- **AND** trace MUST 记录失败边界为 `agent_tool_decision`
- **AND** trace MUST NOT 标记为已恢复
