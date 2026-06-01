# chat-blackbox-flow-regression-fixes Specification

## Purpose
TBD - created by archiving change fix-chat-blackbox-flow-regressions. Update Purpose after archive.
## Requirements
### Requirement: 黑盒失败样例必须被自动化回归覆盖

系统 SHALL 为最新手动 LLM 黑盒报告中暴露的聊天主路径失败增加自动化回归测试，覆盖服务端确定性边界，而不是只依赖真实模型手测。

#### Scenario: 问候引导场景保留模型建议回复

- **WHEN** 用户输入“你好”
- **AND** 当前会话缺少训练目标、场地、频率和单次时长
- **AND** 意图模型返回 `canTriggerAction=false`
- **AND** 意图模型返回非空 `suggestedReplies`
- **AND** 意图模型返回 `workoutIntent=null`
- **THEN** 系统 MUST 保留模型返回的合法 `suggestedReplies`
- **AND** 系统 MUST 通过 `suggested_replies` 流事件把这些回复返回给前端
- **AND** 系统 MUST NOT 触发 `exercise_recommendation`、`workout_routine` 或 `workout_plan`
- **AND** 系统 MUST NOT 因 `workoutIntent=null` 使用清空建议回复的兜底意图

#### Scenario: 正文示例不自动变成建议回复

- **WHEN** 助手自然语言正文包含类似“想减脂+在家练+每周3次每次30分钟”的示例文本
- **AND** 本轮结构化意图没有返回合法 `suggestedReplies`
- **THEN** 前端和服务端 MUST NOT 从正文中提取该示例并自动展示为建议回复按钮
- **AND** 建议回复按钮 MUST 只来自结构化 `suggestedReplies` 或兼容的 `suggestedQuestions`

#### Scenario: 执行型请求不能靠无效 workoutIntent 生成卡片

- **WHEN** 用户请求生成动作推荐、单次训练或长期计划
- **AND** 意图模型返回的执行层字段无法通过 `workoutIntent` 校验
- **THEN** 系统 MUST 阻止对应内部动作
- **AND** 系统 MUST 进入澄清、恢复或可追踪失败路径
- **AND** 系统 MUST NOT 仅为了保留建议回复而生成训练卡片

### Requirement: AI 建议回复必须有自动化回归覆盖

系统 SHALL 为统一 AI 建议回复增加自动化回归测试，覆盖用户口吻、阶段来源、阻断优先级和动作推荐后的下一步建议。

#### Scenario: 非用户口吻建议不展示

- **WHEN** 任一 LLM 阶段返回“请重新说明你的训练目标、时间和器械条件”或等价 AI 指令式建议
- **THEN** 服务端 MUST 过滤该建议
- **AND** 前端 MUST NOT 展示该建议 chip

#### Scenario: 缺信息建议使用用户口吻

- **WHEN** 用户输入“帮我安排一下”
- **AND** 当前缺少训练目标、时长或器械条件
- **THEN** 系统 MUST 返回用户可直接点击发送的 `assistantSuggestions`
- **AND** 建议消息 MUST 类似“我在家自重练 30 分钟全身”，而不是“你想练多久？”

#### Scenario: 动作推荐成功后提供下一步建议

- **WHEN** 用户输入“我想练胸”
- **AND** 系统成功生成 `exercise_recommendation`
- **THEN** 系统 MUST 可以返回 `kind = "next_action"` 的非阻断建议
- **AND** 建议 MUST 基于刚生成的动作推荐，例如继续生成单次训练、换一批动作或调整动作偏好
- **AND** 建议点击后 MUST 作为下一轮用户消息发送

#### Scenario: 阻断建议优先于下一步建议

- **WHEN** 当前意图需要用户先补充必要信息
- **THEN** 系统 MUST 只展示阻断补齐建议
- **AND** 系统 MUST NOT 同时展示依赖未满足信息的生成训练建议

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

