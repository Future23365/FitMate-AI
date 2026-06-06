## ADDED Requirements

### Requirement: failed / diagnostic tool result 不得支撑成功 final_answer
生产 `/api/chat` 文本聊天 SHALL 区分成功事实、失败事实和诊断事实。`failed` tool result、diagnostic resource、不可消费 resource、`satisfied=false` 结果或 terminal validation failure details MUST NOT 被模型用作成功 `final_answer` 的 grounding；这些事实只能用于恢复、澄清、阻断说明、repair 或 production fallback / finalizer。

#### Scenario: failed tool result 进入 Planner 可见输入
- **WHEN** 当前 run 已有 `failed` tool result、diagnostic resource、不可消费 resource 或 `satisfied=false` result
- **THEN** 模型可见 prompt / model input / repair feedback MUST 明确这些事实不能支撑成功 `final_answer`
- **AND** 模型可见内容 MUST 表达可选合法路径：继续当前可见且合法的 `tool_call`、返回 `ask_user`、进入 repair，或交由 production fallback / finalizer 收口
- **AND** 模型可见内容 MUST NOT 暗示模型可以用成功 `final_answer` 解释“已完成但失败”的业务结果

#### Scenario: failed tool 后解释失败
- **WHEN** 模型需要向用户解释 failed / diagnostic 事实
- **THEN** 模型 SHOULD 优先使用 `ask_user` 表达缺口、约束冲突、需要用户补充的信息或可恢复选择
- **AND** 如果当前目标仍可通过合法工具继续推进，模型 SHOULD 继续返回合法 `tool_call`
- **AND** 如果 runtime 已经不可恢复或 repair budget 已耗尽，用户可见回复 MUST 由 production terminal failure fallback / finalizer 生成
- **AND** 成功 `final_answer` MUST NOT 只引用 failed / diagnostic result、不可消费 resource 或 validation details

#### Scenario: ok=true 空结果仍可支撑普通事实解释
- **WHEN** tool result 是 `ok=true` 且 deterministic fulfillment 表示查询成功，但返回 0 条或候选不足
- **THEN** 模型可见合同 MAY 允许模型用 `final_answer.usedRefs` 引用该 satisfied tool result 来解释“没有找到”“当前条件不足”等普通事实
- **AND** 该普通文本解释 MUST NOT 伪装成结构化训练卡片、已生成 routine、已生成 plan、已保存 artifact 或已执行未注册能力
- **AND** tests MUST 区分 `ok=true` 空结果和 `failed` / diagnostic result 的终态能力

### Requirement: 不可执行请求必须按通用 action 顺序收口
生产文本聊天 SHALL 对不可执行请求使用通用 action 决策顺序，而不是服务端自然语言分流。系统 MUST 保持：可直接回答则 `final_answer`；缺必要信息则 `ask_user`；需要未注册能力则不得 `tool_call` 或承诺执行；已有事实不足则继续合法 tool、澄清、repair 或 fallback。

#### Scenario: 能力未注册但未发生 tool failure
- **WHEN** 用户请求需要当前 `tools[]` 未注册的能力
- **AND** Planner 尚未执行 failed tool result
- **THEN** 模型 MAY 返回 `final_answer` 说明当前能力边界和可行替代方向
- **AND** 该回复 MUST NOT 承诺已查询、已保存、已生成卡片、已执行训练或会在回复后继续内部执行
- **AND** `/api/chat`、Agent runtime 和 fallback MUST NOT 根据用户原文关键词、正则、同义词表或短句模板选择该回复

#### Scenario: 能力未注册导致 runtime failure
- **WHEN** Planner 输出未注册 tool、invalid action、unknown tool、capability unsupported 或 repair limit exceeded
- **THEN** production fallback MAY 输出安全用户可见回复
- **AND** fallback 决策 MUST 基于 registry、tool capability、action validation、runtime error code、validation details 或 trace event 等确定性事实
- **AND** fallback MUST NOT 基于用户原文、历史摘要自然语言、具体 phrasing 或业务 `toolName` 语义分支改写模型 action

#### Scenario: 基础问答不被 fallback 抢占
- **WHEN** 用户请求是普通可回答问题、能力说明、训练原则解释、总结整理或概念解释
- **THEN** 模型 SHOULD 能直接返回 `final_answer`
- **AND** 系统 MUST NOT 因未注册业务 tool、空结果历史、业务 output contract 存在或用户提到训练相关词而强行输出 unsupported capability fallback

### Requirement: failed / diagnostic 终态必须可审计
系统 SHALL 在 trace、runtime result 或测试中保留足够诊断，使开发者能区分成功 `final_answer`、`ask_user`、unsupported fallback、visible output validation fallback、provider / transport failure 和 failed tool repair。

#### Scenario: trace 区分失败收口来源
- **WHEN** terminal failure 被投影为用户安全 `content`、`ask_user` 或 fallback
- **THEN** trace MUST 能定位原始错误 code、失败阶段、repair budget 状态、最近 validation details 或 tool result 状态
- **AND** trace MUST 能区分模型合法 `final_answer` 成功和 production fallback 安全投影
- **AND** 用户可见文本 MUST NOT 展示 stack、provider 原文、validator 内部 message、secret、`repair_limit_exceeded`、`terminal_reference_invalid` 或内部 details

#### Scenario: tests 覆盖 failed 不能成功收口
- **WHEN** 自动化测试构造 failed / diagnostic tool result 或 terminal visible output validation failure
- **THEN** tests MUST 证明该事实不能作为成功 `final_answer` 的唯一 grounding
- **AND** tests MUST 覆盖合法恢复路径：继续 tool、`ask_user`、repair 或 production fallback
