## ADDED Requirements

### Requirement: /api/chat 必须使用 Tool-first AgentOrchestrator 作为主链

系统 SHALL 使用 Tool-first `AgentOrchestrator` 处理生产 `/api/chat` 请求。LLM SHALL 通过受控工具读取事实、查询动作、提出训练变更、请求校验和保存结果；服务端 SHALL 只执行工具、校验边界和写入结果。

#### Scenario: 聊天请求进入 Agent 主链
- **WHEN** 用户向 `/api/chat` 发送消息
- **THEN** 系统 MUST 构建 `AgentExecutionState`
- **AND** 系统 MUST 让 LLM 通过 Agent tool loop 决定下一步
- **AND** 系统 MUST NOT 先通过服务端关键词、正则、自然语言模板或旧 normalize 改写用户高层语义

#### Scenario: Agent 需要查询当前会话事实
- **WHEN** 用户消息依赖最近训练卡片、历史计划、动作库或用户记忆
- **THEN** LLM MUST 通过工具读取 `ConversationArtifact`、`ArtifactIndex`、动作库或用户记忆摘要
- **AND** 服务端 MUST NOT 从 `conversationSummary` 反向构造完整训练事实

#### Scenario: Agent 完成本轮执行
- **WHEN** Agent loop 结束
- **THEN** 系统 MUST 产出一个 `AgentExecutionResult`
- **AND** 最终回复、流事件、artifact 推送和 trace MUST 基于该结果
- **AND** 系统 MUST NOT 仅凭自然语言回复正文表达执行成功

### Requirement: Agent 工具必须由服务端受控执行

系统 SHALL 通过统一 `AgentToolRegistry` 注册 LLM 可调用工具，并在每次工具执行前完成 Schema、权限、候选集合、Policy、Validator 或 Persistence 边界校验。

#### Scenario: LLM 调用工具
- **WHEN** LLM 请求调用 Agent 工具
- **THEN** `toolName` MUST 属于服务端 registry
- **AND** `input` MUST 通过该工具的 Schema 校验
- **AND** 工具执行上下文 MUST 绑定当前 `userId`、`sessionId`、trace 和请求预算

#### Scenario: 工具不存在或参数非法
- **WHEN** LLM 请求未知工具、非法参数或越权资源
- **THEN** 服务端 MUST 拒绝执行
- **AND** Agent MUST 将该结果视为可诊断工具失败
- **AND** 系统 MUST NOT 把未知工具请求转发给任意服务端函数

#### Scenario: 写工具被调用
- **WHEN** LLM 请求保存 artifact、应用 Patch 或持久化训练变更
- **THEN** 写工具 MUST 校验前置读结果、候选集合、Validator、Policy 和 Confirmation 状态
- **AND** 写工具 MUST 创建安全 revision 或返回明确失败
- **AND** LLM MUST NOT 直接写数据库或执行任意 SQL

### Requirement: Agent 必须支持训练生成、Patch、重新生成和澄清

系统 SHALL 让 Agent 基于工具结果选择回答、澄清、生成、局部 Patch 或整套重新生成，而不是让服务端关键词规则选择执行策略。

#### Scenario: 局部修改已有 artifact
- **WHEN** LLM 读取目标 artifact payload 后判断用户只要求修改局部内容
- **THEN** Agent MUST 调用 Patch 相关工具提出结构化 Patch
- **AND** 服务端 MUST 校验 Patch target、scope、candidate set 和 artifact 可访问性

#### Scenario: 整套训练条件变化
- **WHEN** LLM 读取目标 artifact payload 后判断用户改变器械、场地、整体难度、目标或大幅时长
- **THEN** Agent MUST 调用重新生成或 draft 工具
- **AND** 新 draft MUST 沿用应保留的目标、时长、经验或上下文事实
- **AND** 新 draft MUST 使用当前用户覆盖后的条件

#### Scenario: 信息不足
- **WHEN** LLM 通过工具仍无法确定目标 artifact、目标动作、训练条件或用户偏好
- **THEN** Agent MUST 返回 `needs_clarification`
- **AND** 系统 MUST 输出用户可直接发送的 `assistantSuggestions`
- **AND** 系统 MUST NOT 猜测 artifactId、exerciseId 或训练变更范围

### Requirement: 最终回复必须只描述真实执行结果

系统 SHALL 通过 Response Writer 基于 `AgentExecutionResult` 生成用户可见回复。

#### Scenario: Artifact 已生成或修订
- **WHEN** `AgentExecutionResult` 表示已生成、已 patch 或已保存 revision
- **THEN** 回复 MUST 描述真实完成的训练结果
- **AND** 聊天流 MUST 返回对应 artifact、patch 或 revision 事件

#### Scenario: 未执行写操作
- **WHEN** `AgentExecutionResult` 表示需要澄清、工具失败、校验失败或 policy blocked
- **THEN** 回复 MUST 说明当前阻断原因或下一步
- **AND** 回复 MUST NOT 承诺训练卡片已经生成、修改或稍后展示

#### Scenario: 回复需要引用动作或训练事实
- **WHEN** 回复中出现具体动作、训练结构、器械、时长或 artifact 信息
- **THEN** 这些内容 MUST 来自本轮 tool result、已保存 artifact 或服务端校验结果
- **AND** 回复 MUST NOT 编造数据库不存在的 exerciseId 或未读取的 artifact 内容

