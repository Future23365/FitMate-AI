## ADDED Requirements

### Requirement: 详细 LLM 黑盒测试必须贴近真实首页请求链路

系统 SHALL 让完整/详细 LLM 黑盒测试尽量按真实首页聊天路径执行多轮流程，避免测试 runner 获得真实页面没有的上下文能力。

#### Scenario: 详细套件通过 API 形态执行聊天轮次

- **WHEN** 开发者执行完整/详细 LLM 黑盒测试
- **THEN** 系统 MUST 使用与首页聊天一致的请求字段执行每轮聊天
- **AND** 每轮 MUST 使用 `conversationId`、`responseMessageId`、`latestUserMessage`、`conversationSummary` 和 `thinkingEnabled` 构造请求
- **AND** 测试 MUST NOT 依赖手工注入完整历史 `conversationContext` 来通过真实页面无法通过的用例

#### Scenario: 同一流程内保存并延续会话状态

- **WHEN** 完整/详细 LLM 黑盒流程完成任一非失败轮次
- **THEN** 系统 MUST 保存该轮产生的用户消息、assistant 回复、conversation summary 和可见训练卡片
- **AND** 后续轮次 MUST 基于保存后的同一 `conversationId` 继续执行
- **AND** 不同流程用例之间 MUST 使用互相隔离的新会话

### Requirement: 引用类详细用例必须验证真实 artifact 链路

系统 SHALL 在完整/详细 LLM 黑盒测试中验证最近卡片引用、局部修改和动作讲解依赖真实 artifact summary 与 payload。

#### Scenario: 生成卡片后写入 artifact 索引

- **WHEN** 完整/详细 LLM 流程轮次生成 `exercise_recommendation`、`workout_routine` 或 `workout_plan`
- **THEN** 系统 MUST 通过会话保存链路写入对应的 conversation artifact
- **AND** 后续轮次 MUST 能通过当前会话读取 recent artifact summary
- **AND** 报告 MUST 记录该轮是否成功产生可引用 artifact

#### Scenario: 序号动作讲解读取真实 payload

- **WHEN** 完整/详细 LLM 流程中的用户输入引用“第一个动作”“最后一个动作”或等价序号动作
- **THEN** 系统 MUST 验证引用解析结果指向真实 artifact
- **AND** 系统 MUST 验证服务端能够读取 artifact payload 并定位到具体 `exerciseId`
- **AND** 如果 assistant 回复表示没有安全读取到动作详情，该轮 MUST 判定为语义断言失败，而不是仅因无训练卡片而通过

#### Scenario: 歧义引用必须澄清

- **WHEN** 当前会话存在多个可引用训练卡片且用户使用无法唯一定位的“这个”“它”等表达
- **THEN** 系统 MUST 验证 assistant 没有擅自选择其中一个 artifact 执行修改
- **AND** assistant MUST 以用户可回答的方式澄清引用对象

### Requirement: 详细套件必须支持分级语义断言

系统 SHALL 在完整/详细 LLM 黑盒测试中区分流程级断言和语义级断言，使测试结果能解释真实用户目标是否达成。

#### Scenario: 卡片类型通过但语义目标失败

- **WHEN** 某轮回复非空且卡片类型符合预期
- **AND** 该轮声明了额外语义目标
- **THEN** 系统 MUST 继续执行语义断言
- **AND** 语义断言失败时该轮 MUST 记录为 failed
- **AND** 报告 MUST 同时显示卡片类型断言状态和语义断言状态

#### Scenario: 条件覆盖语义被校验

- **WHEN** 用例期望当前消息覆盖历史目标、器械、时长、频率或限制
- **THEN** 系统 MUST 验证 assistant 摘要、卡片 intent 或 artifact payload 不再沿用被覆盖的旧条件
- **AND** 如果无法从可见结果或诊断字段确认覆盖成功，报告 MUST 标记为需要人工复核或语义断言失败

#### Scenario: 排除动作和安全边界被校验

- **WHEN** 用例期望排除某类动作或保持安全边界
- **THEN** 系统 MUST 验证 assistant 可见回复和训练卡片没有继续强化被排除动作或危险承诺
- **AND** 医疗诊断类输入 MUST NOT 触发训练卡片
- **AND** 高风险训练请求 MUST 以保守建议、追问或降级方案处理

### Requirement: 详细套件必须补齐完整用例文档的高价值缺口

系统 SHALL 将 `LLM完整测试.md` 中未自动化但回归价值高的流程补入完整/详细 LLM fixture。

#### Scenario: 计划和上下文缺口被补齐

- **WHEN** 完整/详细 LLM fixture 更新
- **THEN** 系统 MUST 覆盖目标变化重排计划和长期计划解释修改场景
- **AND** 系统 MUST 覆盖新目标覆盖旧目标、记住时长、条件缺口不重复追问和用户否定前一轮场景

#### Scenario: 引用修改缺口被补齐

- **WHEN** 完整/详细 LLM fixture 更新
- **THEN** 系统 MUST 覆盖局部修改不重生成整套、重复动作确认范围、修改计划某一天、刷新与修改区分和确认式执行场景

#### Scenario: 安全和异常缺口被补齐

- **WHEN** 完整/详细 LLM fixture 更新
- **THEN** 系统 MUST 覆盖高强度请求、疼痛中止、年龄或特殊人群场景
- **AND** 系统 MUST 覆盖模型无故拒答后的恢复场景

### Requirement: 详细测试报告必须支持成本校准和失败排错

系统 SHALL 让完整/详细 LLM 测试报告同时服务人工验收、成本判断和失败排查。

#### Scenario: 报告记录运行上下文和断言分层

- **WHEN** 完整/详细 LLM 测试运行结束
- **THEN** 报告 MUST 记录运行命令、套件名、runner 类型、生成时间、模型和真实/跳过状态
- **AND** 每轮结果 MUST 记录卡片类型断言状态、语义断言状态、最终状态和失败分级
- **AND** 失败记录 MUST 包含 `conversationId`、`responseMessageId`、`traceId`、用户输入、期望摘要、实际 assistant 摘要和失败原因

#### Scenario: 报告记录 artifact 诊断摘要

- **WHEN** 某轮用例涉及引用、修改或动作讲解
- **THEN** 报告 MUST 记录是否存在 recent artifact summary
- **AND** 报告 MUST 记录是否读取到 artifact payload
- **AND** 报告 MUST 记录引用解析状态，且不得保存完整 prompt、完整候选池或大段原始模型 payload

#### Scenario: token 预估基于真实运行校准

- **WHEN** 系统输出基础套件或完整/详细套件 token 预估
- **THEN** 预估 MUST 使用可解释口径
- **AND** 如果存在最近一次真实运行报告，预估 MUST 基于该报告的真实 token 均值或总量校准
- **AND** 报告 MUST 同时记录预计 token、真实 token 和偏差摘要
