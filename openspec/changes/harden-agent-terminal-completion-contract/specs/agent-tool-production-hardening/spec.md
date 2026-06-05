## ADDED Requirements

### Requirement: 无 grounding 的 terminal completion 必须进入 repair 或安全失败收口
生产 Agent runtime SHALL 将工具执行后的无 grounding `final_answer` 视为 invalid terminal completion。系统 MUST 生成结构化 observation 供 Planner repair；当 repair budget 耗尽时，production adapter MUST 输出安全失败收口，而不是把内部错误或未完成承诺直接展示给用户。

#### Scenario: invalid terminal completion 进入 repair
- **WHEN** Planner 在 tool result 已存在后返回无 `usedToolResultIds`、无 `usedResourceRefs` 且无 `visibleOutputs[]` 的 `final_answer`
- **THEN** Runtime MUST 记录 validation failure
- **AND** Runtime MUST 将可恢复 repair feedback 放入下一轮 Planner 可见 observations
- **AND** repair feedback MUST 说明合法选择包括继续 `tool_call`、引用已满足 tool result/resource、输出合法 `visibleOutputs[]`、`ask_user` 澄清或明确失败收口

#### Scenario: repair 后可以继续 tool_call
- **WHEN** Runtime 因 invalid terminal completion 触发 repair
- **AND** Planner 下一轮返回合法 `tool_call`
- **THEN** Runtime MUST 允许该 tool_call 继续经过 Action Validator、Policy Guard 和 Executor
- **AND** 系统 MUST NOT 因上一轮 terminal completion 失败而跳过正常 tool 执行边界

#### Scenario: repair budget 耗尽时安全收口
- **WHEN** Planner 在 repair 后仍重复提交 invalid terminal completion
- **THEN** Runtime MUST 按 repair budget 失败收口
- **AND** production adapter MUST NOT 渲染任一被 validator 拒绝的 `final_answer.content`
- **AND** 用户可见 fallback MUST 使用安全中文说明，不暴露 stack、provider raw error 或内部 handler payload

#### Scenario: 生产接入不新增语义分流
- **WHEN** 实现 invalid terminal completion hardening
- **THEN** `/api/chat` 主链路 MUST NOT 新增基于用户原文、assistant 正文、关键词、正则、同义词表、短句模板或具体 phrasing 的分流
- **AND** Agent core MUST NOT 新增具体业务 `toolName` 语义分支
