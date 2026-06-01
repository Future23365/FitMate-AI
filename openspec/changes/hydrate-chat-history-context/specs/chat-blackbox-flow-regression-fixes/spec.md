## ADDED Requirements

### Requirement: 最新基础黑盒失败必须有确定性回归覆盖

系统 SHALL 为最新基础 LLM 黑盒报告中暴露的 F05、F06 和 F15 失败补充普通自动化回归测试，覆盖服务端确定性边界，而不是只依赖真实模型手测。

#### Scenario: F05 长期计划逐步补齐回归

- **WHEN** 测试模拟同一会话中的三轮输入：“给我一个每周训练计划”、“每周4练，每次45分钟”、“增肌，有健身房器械”
- **THEN** 第 1 轮和第 2 轮 MUST 不触发训练卡片
- **AND** 第 3 轮 MUST 归一化为 `workout_plan`
- **AND** 第 3 轮 MUST 触发 `workout_plan` action
- **AND** 第 3 轮 intent MUST 保留 `weeklyFrequency = 4` 和 `sessionMinutes = 45`

#### Scenario: F06 已有 plan 后周频调整回归

- **WHEN** 测试模拟同一会话中已经存在一个 recent `workout_plan`
- **AND** 用户输入“改成每周6练”
- **THEN** 系统 MUST 保持 plan 语义
- **AND** 系统 MUST 触发 `workout_plan` action
- **AND** intent MUST 表达 `weeklyFrequency = 6`
- **AND** 系统 MUST NOT 返回需要重新补齐目标或器械的阻断结果

#### Scenario: F15 序号动作讲解诊断回归

- **WHEN** 测试模拟同一会话中存在最近训练 artifact
- **AND** 用户输入“第一个动作怎么做”
- **THEN** 系统 MUST 走动作讲解路径
- **AND** 系统 MUST 不触发新的 `exercise_recommendation`、`workout_routine` 或 `workout_plan`
- **AND** 测试报告诊断 MUST 能记录 resolved 引用状态和 payload 可读状态

### Requirement: 回归测试必须贴近真实 `/api/chat` 请求事实来源

系统 SHALL 在普通自动化回归中覆盖服务端会话 hydration，而不是只测试手工注入完整 `conversationContext` 的理想路径。

#### Scenario: 测试验证已保存会话优先

- **WHEN** 回归测试构造已保存会话和同一个 `conversationId`
- **AND** 请求体只包含首页聊天当前可发送的必要字段
- **THEN** `/api/chat` 或等价服务端准备函数 MUST 能从已保存会话恢复结构化事实
- **AND** 测试 MUST 验证该事实影响 action gate

#### Scenario: 测试验证客户端上下文不能越权

- **WHEN** 请求体携带客户端构造的 `conversationContext`
- **AND** 服务端存在当前用户已保存会话事实
- **THEN** 回归测试 MUST 验证服务端优先使用已保存会话
- **AND** 客户端上下文 MUST NOT 覆盖 current user 不可访问或不属于该会话的事实
