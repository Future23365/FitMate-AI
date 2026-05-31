## ADDED Requirements

### Requirement: 黑盒测试必须模拟首页聊天多轮流程
系统 SHALL 提供首页聊天黑盒 LLM 流程测试，按用户在聊天页面连续输入的方式执行真实服务端聊天链路。

#### Scenario: 每个流程用例从新会话开始
- **WHEN** 手动黑盒 LLM 流程测试开始执行一个流程用例
- **THEN** 系统 MUST 为该流程用例创建新的 `conversationId`
- **AND** 系统 MUST NOT 复用其他流程用例的消息历史、summary、conversationContext 或 artifact

#### Scenario: 同一流程内沿用上轮对话
- **WHEN** 同一个流程用例执行第 2 轮或第 3 轮用户输入
- **THEN** 系统 MUST 沿用该流程前面轮次产生的消息历史
- **AND** 系统 MUST 沿用该流程前面轮次产生的 conversation summary、conversation context 和已生成 artifact
- **AND** 系统 MUST 使用当前轮用户输入作为最新用户消息继续请求聊天链路

#### Scenario: 首轮失败后停止后续轮次
- **WHEN** 流程用例第 1 轮没有得到可展示回复或基础卡片结果不符合预期
- **THEN** 系统 MUST 将该流程标记为首轮基础能力失败
- **AND** 系统 MUST 跳过该流程后续轮次
- **AND** 系统 MUST 在报告中记录后续轮次未执行的原因

### Requirement: 黑盒测试必须验证用户可见输出
系统 SHALL 只以最终用户可见结果作为第一版断言对象，不把内部编排字段作为测试通过条件。

#### Scenario: 普通回复可展示
- **WHEN** 任一黑盒流程轮次完成
- **THEN** 系统 MUST 验证 assistant 用户可见文本非空
- **AND** assistant 用户可见文本 MUST NOT 泄漏内部 trigger、JSON fenced block、raw payload 或后台流程字样

#### Scenario: 预期卡片正常推送
- **WHEN** 流程轮次预期推送动作推荐、单次训练或长期训练计划卡片
- **THEN** 系统 MUST 验证最终用户可见结果包含对应的 `exercise_recommendation`、`workout_routine` 或 `workout_plan` 卡片类型
- **AND** 系统 MUST NOT 校验卡片内动作选择、训练容量或计划内容准确性

#### Scenario: 预期不推送卡片
- **WHEN** 流程轮次预期为追问、解释、建议问答或非健身回复
- **THEN** 系统 MUST 验证最终用户可见结果不包含训练卡片类型
- **AND** 系统 MUST 验证 assistant 用户可见文本可以作为普通回复展示

#### Scenario: 第一版只验证流程
- **WHEN** 黑盒 LLM 流程测试判断单轮结果
- **THEN** 系统 MUST 只验证是否能回答、是否按预期出现或不出现卡片
- **AND** 系统 MUST NOT 因动作 ID、训练组数、训练时长精确值或计划细节不够准确而判定失败

### Requirement: 黑盒测试必须覆盖基础流程冒烟集
系统 SHALL 从 `测试情况预览.md` 中选取能代表首页聊天主链路的多轮流程作为第一版测试集合。

#### Scenario: 动作推荐流程被覆盖
- **WHEN** 手动黑盒 LLM 流程测试运行
- **THEN** 系统 MUST 覆盖动作推荐到刷新推荐的多轮流程
- **AND** 系统 MUST 覆盖动作推荐升级为单次训练的多轮流程

#### Scenario: 信息补齐流程被覆盖
- **WHEN** 手动黑盒 LLM 流程测试运行
- **THEN** 系统 MUST 覆盖信息不足时先追问、后补齐条件并生成 routine 的流程
- **AND** 系统 MUST 覆盖长期计划逐步补齐条件并生成 plan 的流程

#### Scenario: 语义切换流程被覆盖
- **WHEN** 手动黑盒 LLM 流程测试运行
- **THEN** 系统 MUST 覆盖长期计划语义区分流程
- **AND** 系统 MUST 覆盖非健身话题切回健身流程
- **AND** 系统 MUST 覆盖当前消息覆盖历史目标或器械条件的流程

#### Scenario: 最近卡片引用流程被覆盖
- **WHEN** 手动黑盒 LLM 流程测试运行
- **THEN** 系统 MUST 覆盖用户引用最近推荐卡片并升级为 routine 的流程
- **AND** 系统 MUST 在同一个流程用例内构造引用上下文

### Requirement: 黑盒测试报告必须可用于排错
系统 SHALL 在每次手动黑盒 LLM 流程测试结束后生成 Markdown 报告，记录通过情况、token 消耗和失败排错信息。

#### Scenario: 每次运行生成报告
- **WHEN** 手动黑盒 LLM 流程测试命令结束
- **THEN** 系统 MUST 生成一份最新测试报告文档
- **AND** 报告 MUST 包含运行时间、模型、流程用例数、轮次数、通过数、失败数和跳过数
- **AND** 报告 MUST 包含执行前预计 token 消耗和模型返回的真实 token 汇总

#### Scenario: 报告记录用例验证情况
- **WHEN** 手动黑盒 LLM 流程测试命令结束
- **THEN** 报告 MUST 按流程用例和轮次记录用户输入、预期结果、实际用户可见回复摘要、实际卡片类型和验证状态
- **AND** 报告 MUST 标明每个流程用例是新建会话还是沿用同一流程内上轮结果

#### Scenario: 失败用例记录关键排错信息
- **WHEN** 任一流程轮次验证失败
- **THEN** 报告 MUST 记录 `conversationId`、轮次序号、用户输入、期望卡片类型、实际卡片类型、失败原因和 assistant 回复摘要
- **AND** 如果存在请求错误、stream 解析错误、trace id 或 responseMessageId，报告 MUST 一并记录
- **AND** 报告 MUST NOT 保存完整 prompt、完整动作候选池或大段原始模型 payload

### Requirement: 黑盒测试必须保持真实模型和隔离运行
系统 SHALL 保持手动 LLM 测试的真实模型运行原则，并继续与普通自动化测试隔离。

#### Scenario: 默认测试不运行黑盒 LLM 流程
- **WHEN** 开发者执行 `npm run test`
- **THEN** 系统 MUST NOT 运行首页聊天黑盒 LLM 流程测试
- **AND** 系统 MUST NOT 因缺少模型配置或外部模型网络不可用而导致 `npm run test` 失败

#### Scenario: 专用命令运行真实黑盒流程
- **WHEN** 开发者执行专用手动 LLM 测试命令
- **THEN** 系统 MUST 使用真实模型和真实服务端聊天链路运行黑盒流程
- **AND** 系统 MUST NOT 静默改用 mock、旧快照或非真实模型结果
- **AND** 系统 MUST 在命令开始前输出本次运行的粗略 token 消耗预估
