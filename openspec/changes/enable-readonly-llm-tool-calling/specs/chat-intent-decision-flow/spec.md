## ADDED Requirements

### Requirement: 聊天编排必须在适用场景进入只读 tool loop
系统 SHALL 在聊天意图解析、用户记忆构建和引用解析之后，按 resolved intent 和上下文缺口决定是否进入只读 LLM tool loop。

#### Scenario: 用户请求需要补查只读上下文
- **WHEN** 用户询问历史计划细节、动作详情、推荐原因、训练卡片解释或其他需要数据库只读上下文的问题
- **THEN** `/api/chat` MUST 允许进入只读 tool loop
- **AND** tool loop 输出 MUST 作为最终回复或后续服务端确定性流程的只读上下文

#### Scenario: 用户请求可由现有确定性分支完成
- **WHEN** resolved intent 已经能由现有引用解析、Patch、动作讲解或卡片生成流程确定性完成
- **THEN** 系统 MAY 跳过只读 tool loop
- **AND** 系统 MUST 保持现有确定性流程的行为边界

### Requirement: 只读 tool loop 不得绕过 resolved intent 门控
系统 SHALL 将只读 tool loop 作为补查上下文阶段，而不是第二套动作触发决策来源。

#### Scenario: tool loop 返回可用上下文
- **WHEN** 只读 tool loop 成功返回 tool context bundle
- **THEN** 系统 MUST 继续以最终 resolved intent 决定是否触发卡片、Patch 或澄清
- **AND** tool context bundle MUST NOT 单独触发训练 artifact 生成

#### Scenario: tool loop 与 resolved intent 冲突
- **WHEN** 工具结果暗示的动作类型与 resolved intent 的 `action.kind` 冲突
- **THEN** 系统 MUST 以 resolved intent 门控为准
- **AND** 必要时 MUST 进入澄清、repair 或确定性回退

### Requirement: 聊天回复必须显式消费只读工具上下文
系统 SHALL 在最终回复生成时把本轮可用的只读工具摘要作为受控上下文，而不是让模型凭空引用数据库内容。

#### Scenario: 工具上下文用于最终回复
- **WHEN** 只读 tool loop 返回动作、artifact 或候选摘要
- **THEN** 最终回复模型请求 MUST 包含摘要化后的 tool context bundle
- **AND** 回复内容 MUST 与工具结果和 resolved intent 保持一致

#### Scenario: 工具上下文不可用
- **WHEN** 只读 tool loop 未执行、失败或没有返回可用结果
- **THEN** 最终回复 MUST 只基于当前 prompt、conversationSummary、recent artifact summary 和现有服务端上下文
- **AND** 回复 MUST NOT 声称已经读取未成功读取的数据库内容
