## ADDED Requirements

### Requirement: 工具执行后的成功 final_answer 必须具备当前 run grounding
系统 SHALL 在 `final_answer` 收口前校验当前 run grounding。当当前 run 已经产生 tool result 时，成功 `final_answer` MUST 至少通过 `usedToolResultIds`、`usedResourceRefs` 或 `visibleOutputs[]` 之一连接到当前 run 中可校验的已满足事实。系统 MUST NOT 把工具执行后的无引用、无结构输出 `final_answer` 当作成功完成。

#### Scenario: 拒绝工具执行后的空 grounding final_answer
- **WHEN** 当前 run 已经存在至少一个 tool result
- **AND** Planner 返回 `final_answer`
- **AND** `usedToolResultIds` 为空或缺失
- **AND** `usedResourceRefs` 为空或缺失
- **AND** `visibleOutputs[]` 为空或缺失
- **THEN** Action Validator MUST 拒绝该 terminal action
- **AND** Runtime MUST NOT 将该 `final_answer.content` 投影为成功用户回复
- **AND** 错误 MUST 使用稳定 terminal grounding 类 code

#### Scenario: 允许引用已满足 tool result 的 final_answer
- **WHEN** 当前 run 已经存在 tool result
- **AND** Planner 返回 `final_answer`
- **AND** `usedToolResultIds` 引用当前 run 中 `ok = true` 且 `fulfillment.satisfied = true` 的 tool result
- **THEN** Action Validator MUST 接受该 grounding
- **AND** Response Renderer MAY 投影该 `final_answer.content`

#### Scenario: 允许引用 consumable resource 的 final_answer
- **WHEN** 当前 run 已经存在 tool result
- **AND** Planner 返回 `final_answer`
- **AND** `usedResourceRefs` 引用当前 run 中已登记且 role 为 `consumable` 的 resource
- **THEN** Action Validator MUST 接受该 grounding
- **AND** Action Validator MUST 继续拒绝 diagnostic resource 支撑成功 `final_answer`

#### Scenario: 允许带合法 visibleOutputs 的 final_answer
- **WHEN** 当前 run 已经存在 tool result
- **AND** Planner 返回 `final_answer`
- **AND** `visibleOutputs[]` 非空
- **THEN** Action Validator MUST 将每个 visible output 交给对应 terminal output validator
- **AND** 只有 visible output 校验通过时 Runtime MAY 成功收口

#### Scenario: 普通无 tool 聊天不要求 grounding
- **WHEN** 当前 run 没有 tool result
- **AND** Planner 返回普通自然语言 `final_answer`
- **THEN** Action Validator MUST NOT 仅因缺少 `usedToolResultIds`、`usedResourceRefs` 或 `visibleOutputs[]` 拒绝该 action
- **AND** 普通聊天、能力说明、训练原则解释仍可由模型直接收口

### Requirement: final_answer 不能表达未执行的后续 tool 承诺
系统 SHALL 将 `final_answer` 视为当前 run 的终态动作。模型和 validator 的合同 MUST 表达：如果还需要执行工具、查询事实、生成结构、保存结果或等待后续内部动作，Planner MUST 返回合法 `tool_call`、`ask_user` 或失败收口，而不是用成功 `final_answer.content` 承诺“稍后继续”。

#### Scenario: 需要继续工具时返回 tool_call
- **WHEN** Planner 判断当前回答仍需要当前 run 中尚未执行的 tool 事实
- **THEN** Planner MUST 返回 `tool_call`
- **AND** Planner MUST NOT 返回成功 `final_answer` 来描述尚未执行的 tool 操作

#### Scenario: 无法继续工具时明确阻断
- **WHEN** 当前可见 tool、事实或用户约束不足以完成目标
- **THEN** Planner MUST 使用 `ask_user` 澄清，或使用不伪造成功事实的失败说明收口
- **AND** Planner MUST NOT 将未完成的内部步骤描述为已经进入等待状态
