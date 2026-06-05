## ADDED Requirements

### Requirement: 基础黑盒测试必须以 llm基础测试.md 为用例来源
系统 SHALL 将根目录 `llm基础测试.md` 中“三轮流程用例”表作为首页聊天基础 LLM 黑盒套件的用例来源，并在真实模型调用前完成 fixture 预检。

#### Scenario: 解析根目录基础用例表
- **WHEN** 开发者运行首页聊天基础 LLM 黑盒测试命令
- **THEN** 系统 MUST 读取根目录 `llm基础测试.md`
- **AND** 系统 MUST 从“三轮流程用例”表中为每一行生成一个 flow
- **AND** 每个 flow MUST 包含 `ID`、`流程目标`、三轮用户输入和三轮期望
- **AND** 系统 MUST 在报告中记录本次从文档解析到的 flow 数和 turn 数

#### Scenario: 用例表格式不合法时阻止模型调用
- **WHEN** `llm基础测试.md` 缺少必需列、存在重复 `ID`、任一轮用户输入为空或任一轮期望为空
- **THEN** 系统 MUST 在发起任何真实模型请求前失败
- **AND** 系统 MUST 输出具体的文档解析错误
- **AND** 系统 MUST NOT 静默回退到旧 fixture、mock fixture 或空测试集合

#### Scenario: 基础套件不依赖旧预览文档
- **WHEN** 首页聊天基础 LLM 黑盒测试构造运行集合
- **THEN** 系统 MUST 以 `llm基础测试.md` 当前内容为准
- **AND** 系统 MUST NOT 以旧 `测试情况预览.md`、归档 change fixture 或硬编码历史用例替代当前根目录文档

#### Scenario: 基础默认表只保留冒烟场景
- **WHEN** 开发者维护 `llm基础测试.md` 的可执行基础 flow 表
- **THEN** 该表 SHOULD 优先保留低歧义、低成本的基础首页聊天场景
- **AND** 该表 SHOULD 覆盖动作推荐、routine、plan、信息不足追问、目标切换、非健身话题回到训练、未知动作不编造和动作说明等基础能力
- **AND** 引用歧义、局部替换、重复动作范围确认、高风险降级、过多目标与短时长冲突、复杂 schedule 或精确质量断言 SHOULD NOT 进入基础默认表
- **AND** 被移出的复杂场景 MAY 记录在文档的 detailed suite 或专项回归清单中

#### Scenario: 每个 flow 使用独立会话
- **WHEN** 基础黑盒测试开始执行一个 flow
- **THEN** 系统 MUST 为该 flow 使用新的 `conversationId`
- **AND** 系统 MUST NOT 复用其他 flow 的消息历史、summary、conversation context 或 visible output
- **AND** 同一 flow 的第 2 轮和第 3 轮 MUST 基于该 flow 内已完成轮次继续请求首页聊天链路

#### Scenario: 基础 runner 不发送额外历史窗口
- **WHEN** 基础黑盒 runner 构造任一轮 `/api/chat` 请求体
- **THEN** 请求 MUST 只包含首页聊天客户端公开发送的输入字段
- **AND** 请求 MUST 包含 `conversationId`、`responseMessageId`、`latestUserMessage`、`conversationSummary`、`conversationContext` 和 `thinkingEnabled`
- **AND** 请求 MUST NOT 包含完整历史 `messages`
- **AND** 请求 MUST NOT 包含测试专用绕过字段、planner override、tool override、trace override 或内部 runtime 状态

#### Scenario: 多轮 flow 通过保存后的 hydration 继续
- **WHEN** 基础黑盒 runner 完成同一 flow 的任一成功轮次
- **THEN** 系统 MUST 按首页会话保存边界保存该轮 user message、assistant message、conversation summary、conversation context 和最终用户可见输出摘要
- **AND** 后续轮次 MUST 使用同一 `conversationId` 和测试 current user 继续请求
- **AND** 后续轮次 MUST NOT 通过 runner 内存中的完整 `messages` 历史绕过服务端会话 hydration
- **AND** 报告 MAY 记录保存结果、hydration source 和最近可见输出读取状态作为诊断摘要
- **AND** 这些诊断摘要 MUST NOT 进入 judge 输入或作为通过条件

### Requirement: 基础黑盒断言必须只判断最终用户可见输出
系统 SHALL 只以每轮请求完成后的最终 assistant 用户可见输出作为黑盒判定对象，不把 Agent 内部编排、中间 stream 事件或调试数据作为通过条件。

#### Scenario: 每轮完成后归一化最终输出
- **WHEN** 基础黑盒测试完成任一轮用户输入
- **THEN** 系统 MUST 等待该轮聊天响应到达 `done` 或等价完成边界
- **AND** 系统 MUST 将最终 assistant 文本内容归一化为用户可见回复
- **AND** 系统 MUST 将最终 `visible_output` 事件归一化为用户可见训练输出摘要
- **AND** 系统 MUST 将最终 `assistant_suggestions` 事件归一化为用户可见建议摘要
- **AND** 系统 MUST 将最终 `confirmation_request` 事件归一化为用户可见确认摘要
- **AND** 系统 MUST 将请求失败或 stream 失败归一化为用户安全错误文案
- **AND** 系统 MUST 使用归一化后的最终输出进行该轮判定

#### Scenario: 中间事件不作为通过条件
- **WHEN** 基础黑盒测试判断某一轮是否通过
- **THEN** 系统 MUST NOT 使用 `agent_progress`、`tool_result`、runtime trace、tool input、tool output、planner action、repair feedback、raw model output、token diagnostics 或旧 trigger 字段作为通过条件
- **AND** 系统 MUST NOT 因缺少这些中间过程证据而判定失败
- **AND** 系统 MAY 在失败报告中记录受控错误摘要用于排查

#### Scenario: 语义 judge 只接收最终输出
- **WHEN** 系统调用 judge 判断某一轮结果
- **THEN** judge 输入 MUST 只包含 flow id、流程目标、轮次、该轮用户输入、该轮文档期望和 `visibleUserOutput`
- **AND** `visibleUserOutput` MUST 只包含最终 assistant 文本、最终用户可见训练输出摘要、最终建议回复摘要、最终确认请求摘要和用户安全错误文案
- **AND** judge 输入 MUST NOT 包含 prompt、完整 NDJSON raw line、完整 tool payload、trace、Agent loop、raw provider response、token diagnostics、数据库内部 payload 或服务端内部错误栈
- **AND** judge 输出 MUST 经过结构化 schema 校验

#### Scenario: 自然语言期望按用户可见语义判定
- **WHEN** 文档期望包含“触发动作推荐卡片”“生成 routine”“生成 plan”“追问”“解释”“不推送卡片”或等价自然语言要求
- **THEN** 系统 MUST 判断最终用户可见输出是否满足该轮期望的用户可见语义
- **AND** 系统 MUST NOT 要求文档未声明的动作 ID、组数、精确时长、计划细节或数据库内部字段完全匹配
- **AND** 系统 MUST 在判定失败时记录缺失的用户可见期望

#### Scenario: 建议提问可作为可恢复通过
- **WHEN** 最终 assistant 文本或最终用户可见训练输出未直接满足全部文档期望
- **AND** 最终建议回复中存在用户点击后可直接发送的建议提问
- **AND** 该建议提问语义上覆盖缺失的下一步操作
- **THEN** judge MAY 返回 `status = "passed_via_suggestion"` 且 `passed = true`
- **AND** 泛泛建议、不相关建议、助手口吻说明或无法直接发送的建议 MUST NOT 被视为 `passed_via_suggestion`
- **AND** 系统 MUST 在报告中单独展示 `passed_via_suggestion`，不得把它和直接完成的 `passed` 混同

### Requirement: 基础黑盒报告必须展示最终输出验收结果
系统 SHALL 在基础 LLM 黑盒测试结束后生成可人工复核的报告，报告重点展示输入、期望、最终 AI 输出和判定结果。

#### Scenario: 报告记录每轮最终输出
- **WHEN** 基础黑盒测试命令结束
- **THEN** 系统 MUST 生成 Markdown 报告
- **AND** 报告 MUST 按 flow id 和轮次记录用户输入、文档期望、最终 assistant 回复摘要、最终用户可见训练输出类型、判定状态和失败原因
- **AND** 报告 MUST 标明该轮是否执行、通过、失败或因前序失败跳过

#### Scenario: 报告记录运行摘要
- **WHEN** 基础黑盒测试命令结束
- **THEN** 报告 MUST 包含运行时间、模型、judge 模型、完整 flow 数、完整 turn 数、实际执行 flow 数、实际执行 turn 数、通过数、失败数和跳过数
- **AND** 报告 MUST 包含预计 token 消耗和真实 token 汇总
- **AND** 报告 MUST 使用上海时区时间展示报告生成时间

#### Scenario: token usage 是可选诊断
- **WHEN** 基础黑盒测试汇总 token usage
- **THEN** 系统 MAY 从稳定响应合同或受控诊断来源读取 token usage
- **AND** 如果 token usage 只能从开发态 trace store 推导，报告 MUST 标明来源为 `dev_trace_store`
- **AND** token usage 缺失、读取失败或 trace store 不可用 MUST NOT 导致 flow 判定失败
- **AND** token usage MUST NOT 进入 judge 输入

#### Scenario: 报告不保存敏感中间载荷
- **WHEN** 基础黑盒测试生成报告
- **THEN** 报告 MUST NOT 保存完整 prompt、完整 raw provider response、完整 tool input、完整 tool output、完整动作候选池或大段 trace payload
- **AND** 报告 MUST 只保留排查失败所需的安全摘要
