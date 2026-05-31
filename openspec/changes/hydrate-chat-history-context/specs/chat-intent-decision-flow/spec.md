## ADDED Requirements

### Requirement: `/api/chat` 必须从服务端会话恢复结构化历史事实

系统 SHALL 在每轮 `/api/chat` 意图决策前，根据当前用户和 `conversationId` 恢复已保存会话中的结构化上下文，并将其作为 action gate 的可信事实来源。

#### Scenario: 已保存会话优先于最新消息构造的空上下文

- **WHEN** 当前用户发送 `/api/chat` 请求
- **AND** 请求包含已保存会话的 `conversationId`
- **AND** 已保存会话包含历史 `messages`、`conversationContext`、训练卡片或 `recommendationIntents`
- **THEN** 系统 MUST 从已保存会话构造 `internalConversationContext`
- **AND** 系统 MUST 使用该上下文执行 `workout_plan`、`workout_routine`、`exercise_recommendation` 和引用类 action gate
- **AND** 系统 MUST NOT 只用最新一条 `latestUserMessage` 构造的空上下文覆盖已保存结构化事实

#### Scenario: 客户端上下文只能作为 fallback

- **WHEN** `/api/chat` 请求同时携带客户端提交的 `messages` 或 `conversationContext`
- **AND** 服务端能够读取当前用户的已保存会话
- **THEN** 系统 MUST 优先使用服务端读取到的会话事实
- **AND** 系统 MUST NOT 将客户端提交的上下文作为唯一可信事实源
- **AND** 客户端提交的上下文若被用于 fallback，MUST 先通过服务端 schema 校验

#### Scenario: hydrated context 进入 trace

- **WHEN** `/api/chat` 完成历史事实恢复
- **THEN** trace MUST 记录 hydration source
- **AND** trace MUST 记录是否读取到已保存会话、结构化上下文和 recent artifact summaries
- **AND** trace MUST NOT 保存完整 prompt、完整候选池或未裁剪的敏感 payload

### Requirement: 长期计划短指令必须使用 hydrated plan 上下文

系统 SHALL 在长期计划补齐或调整场景中使用 hydrated context 判断 plan 语义，避免把后续短指令误降级为动作推荐、routine 或澄清。

#### Scenario: 长期计划补齐后触发 plan

- **WHEN** 同一会话中用户先输入“给我一个每周训练计划”
- **AND** 后续输入“每周4练，每次45分钟”
- **AND** 再输入“增肌，有健身房器械”
- **THEN** 系统 MUST 使用历史结构化事实识别已存在长期计划上下文
- **AND** 系统 MUST 触发 `workout_plan`
- **AND** 生成 intent MUST 保留 `weeklyFrequency = 4`
- **AND** 生成 intent MUST 保留 `sessionMinutes = 45`
- **AND** 系统 MUST NOT 触发 `exercise_recommendation`

#### Scenario: 已有 plan 后调整周频

- **WHEN** 同一会话中最近已生成 `workout_plan`
- **AND** 用户输入“改成每周6练”
- **THEN** 系统 MUST 将本轮识别为长期计划调整
- **AND** 系统 MUST 触发 `workout_plan`
- **AND** 生成 intent MUST 表达 `weeklyFrequency = 6`
- **AND** 系统 MUST NOT 因缺少重新声明目标或器械而静默无卡片或重新追问

#### Scenario: 笼统长期计划仍需追问

- **WHEN** 用户只输入“给我一个每周训练计划”
- **AND** 当前会话没有训练目标、周频、单次时长、器械或场地等核心事实
- **THEN** 系统 MUST 返回澄清回复
- **AND** 系统 MUST NOT 生成 `workout_plan`
- **AND** 系统 MUST NOT 生成空泛训练卡片
