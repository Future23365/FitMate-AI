## ADDED Requirements

### Requirement: AgentAction 必须支持受控活动摘要
系统 SHALL 允许生产 Planner 在 `AgentAction` 中输出可选 `activitySummary` 字段，用于表达本轮 action 的用户可见短活动摘要。该字段 MUST 由 `AgentAction` schema 和模型可见 action contract 明确定义；字段缺失 MUST NOT 触发 repair，服务端和前端 MUST 使用现有活动 stage fallback。

#### Scenario: 模型可见合同说明 activitySummary
- **WHEN** 默认 Agent LLM prompt 配置生成 system message 和 `protocol.actionContract`
- **THEN** 模型可见输入 MUST 说明 `activitySummary` 是当前 action 的用户可见短活动摘要
- **AND** 说明 MUST 使用中文描述业务含义
- **AND** `activitySummary`、`AgentAction`、`tool_call`、`final_answer`、`ask_user` 等技术标识 MUST 保持英文原样
- **AND** 说明 MUST 表达该字段不是 `final_answer.content`、不是 `ask_user.content`、不是 tool input、不是模型推理内容、不是 NDJSON event

#### Scenario: activitySummary 覆盖三类 action
- **WHEN** Planner 输出 `tool_call`、`final_answer` 或 `ask_user`
- **THEN** 每类 action MAY 包含 `activitySummary`
- **AND** schema MUST 对三类 action 使用一致的字段含义和安全边界
- **AND** schema MUST NOT 要求旧 `tool_call.rationale` 承担用户可见活动摘要职责

#### Scenario: activitySummary 不参与 Agent 决策
- **WHEN** Runtime、Action Validator、Policy Guard、ResourceStore、tool handler 或 Response Renderer 处理合法 action
- **THEN** 系统 MUST NOT 使用 `activitySummary` 决定 action type、`toolName`、tool input、resource 引用、grounding、权限、确认策略、最终回答或结构化输出
- **AND** 系统 MUST NOT 根据用户原文、关键词、正则、同义词表或短句模板生成、改写或替换 `activitySummary`

#### Scenario: activitySummary 不展示内部实现细节
- **WHEN** 模型可见合同说明 `activitySummary` 的写法
- **THEN** 合同 MUST 要求摘要使用面向用户的短中文
- **AND** 合同 MUST 禁止摘要暴露内部执行合同、工具名、schema 字段、validator、runtime、resource、provider、trace、prompt、AgentAction、错误码或 raw model output
- **AND** 合同 SHOULD 示例化用户安全表达，例如“需要查询动作库”“需要读取已有训练内容”“需要校验训练安排”“需要向你确认训练时间”

### Requirement: activitySummary 必须遵守 prompt 分层边界
系统 SHALL 将 `activitySummary` 的字段形状放在 `Action Contract` / schema 中，将用户安全写法放在默认 Agent LLM prompt 的短规则或 field dictionary 中。系统 MUST NOT 为该字段新增业务 tool 固定流程、业务关键词触发规则或具体 trace case 规则。

#### Scenario: 字段规则落在 Action Contract
- **WHEN** 开发者查看默认 prompt 配置
- **THEN** `activitySummary` 的字段含义、可选性、长度边界和用户安全边界 MUST 位于 `protocol.actionContract`、field dictionary、schema 或等价 action 合同层
- **AND** system prompt MAY 只保留短句提醒模型该字段是用户安全活动摘要
- **AND** system prompt MUST NOT 承载业务 tool 的长流程说明

#### Scenario: repair 只处理字段结构问题
- **WHEN** 模型输出非法 `activitySummary`
- **THEN** repair feedback MAY 指出字段类型、长度、未知字段或内部术语泄漏等确定性错误
- **AND** repair feedback MUST NOT 根据用户语义替模型生成新的摘要
- **AND** 如果摘要缺失，系统 MUST NOT 因缺失该可选字段进入 repair
