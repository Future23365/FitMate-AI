# chat-blackbox-llm-flow-tests Specification

## Purpose
TBD - created by archiving change blackbox-chat-llm-flow-tests. Update Purpose after archive.
## Requirements
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

系统 SHALL 只以最终用户可见结果作为第一版断言对象，不把内部编排字段作为测试通过条件。报告中的实际卡片类型 SHALL 表示用户可见训练卡片和明确阻断状态，不得把同一轮的普通回复状态误算成训练卡片之外的额外卡片。

#### Scenario: 普通回复可展示
- **WHEN** 任一黑盒流程轮次完成
- **THEN** 系统 MUST 验证 assistant 用户可见文本非空
- **AND** assistant 用户可见文本 MUST NOT 泄漏内部 trigger、JSON fenced block、raw payload 或后台流程字样

#### Scenario: 预期卡片正常推送
- **WHEN** 流程轮次预期推送动作推荐、单次训练或长期训练计划卡片
- **THEN** 系统 MUST 验证最终用户可见结果包含对应的 `exercise_recommendation`、`workout_routine` 或 `workout_plan` 卡片类型
- **AND** 系统 MUST NOT 因同一轮存在普通 assistant 文本而额外记录 `answer` 卡片失败
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

### Requirement: 基础黑盒必须判定信息不足时不可推送随机训练卡片
基础首页聊天黑盒 SHALL 覆盖笼统训练请求、长期计划条件不足、动作推荐目标不清三类流程。若期望是澄清或可选方向，最终用户可见输出中出现不可解释的 `visibleOutputs` 训练卡片 MUST be judged as failed，即使同时出现泛泛 `suggestedQuestions`。

#### Scenario: F03 笼统 routine 请求先澄清
- **WHEN** 基础黑盒执行 F03 第一轮
- **AND** user input is `给我一套训练`
- **THEN** assistant MUST NOT output a `visibleTrainingProposal` card
- **AND** assistant MUST ask for key conditions or provide user-clickable options that directly补齐目标、时长、器械或场地

#### Scenario: F05 非健身后回到训练不应直接生成默认方案
- **WHEN** 基础黑盒执行 F05 第二轮或等价流程
- **AND** user only provides a broad current training target without enough routine constraints
- **THEN** assistant MUST NOT output an unexplained routine or plan card
- **AND** assistant MAY recommend a clarifying next step, ask a question, or provide non-structured text guidance

#### Scenario: F12 目标不清的动作推荐先澄清
- **WHEN** 基础黑盒执行 F12 第一轮
- **AND** user input is `推荐一个动作`
- **THEN** assistant MUST NOT output a random exercise card
- **AND** assistant MUST ask for target body part, goal, equipment, venue, or provide concrete selectable directions

#### Scenario: Judge 不把随机卡片加泛泛建议判为通过
- **WHEN** judge input expectation says not to directly generate random card or training card
- **AND** visible user output includes `visibleOutputs` for `visibleTrainingProposal` or legacy training card kind
- **THEN** judge MUST return `passed=false`
- **AND** judge MUST NOT return `passed_via_suggestion` solely because generic `assistantSuggestions` are present

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

### Requirement: 基础首页黑盒套件必须从 llm基础测试.md 读取流程

系统 SHALL 将 `llm基础测试.md` 作为基础首页聊天黑盒套件的用例来源，按文档中的三轮流程表动态生成 flow。

#### Scenario: 解析三轮流程表

- **WHEN** 基础黑盒 runner 启动
- **THEN** 系统 MUST 读取 `llm基础测试.md` 中 `## 三轮流程用例` 下的 Markdown 表格
- **AND** 系统 MUST 校验必需列、flow id 唯一性、每轮用户输入和期望非空
- **AND** 表格结构不合法时系统 MUST 在真实模型调用前失败

#### Scenario: 每个 flow 保持三轮结构

- **WHEN** 系统从 `llm基础测试.md` 生成基础黑盒 fixture
- **THEN** 每个 flow MUST 包含 3 轮用户输入和 3 轮期望
- **AND** 报告中的完整 flow 数和 turn 数 MUST 从实际解析结果动态计算

### Requirement: 基础首页黑盒 runner 必须贴近首页聊天请求

系统 SHALL 通过当前 `/api/chat` 请求合同执行基础首页聊天黑盒测试，不得向 runner 提供首页客户端没有的额外执行能力。

#### Scenario: 请求体只包含首页公开字段

- **WHEN** 基础黑盒 runner 发送聊天请求
- **THEN** 请求体 MUST 只包含 `conversationId`、`responseMessageId`、`latestUserMessage`、`conversationSummary`、`conversationContext` 和 `thinkingEnabled`
- **AND** 请求体 MUST NOT 包含完整历史 `messages`、planner override、tool override、trace override 或 runtime state

#### Scenario: 同一 flow 内延续会话

- **WHEN** 同一个 flow 执行第 2 轮或第 3 轮
- **THEN** 系统 MUST 使用同一个 `conversationId` 继续请求
- **AND** 系统 MUST 在前一轮成功后通过聊天保存边界保存用户消息、assistant 回复和用户可见训练输出
- **AND** 不同 flow MUST 使用互相隔离的新 `conversationId`

### Requirement: 基础黑盒报告必须记录用户可见验收结果

系统 SHALL 在基础首页聊天黑盒测试结束后生成 Markdown 报告，记录用户可见输出、token 使用和失败排错摘要。

#### Scenario: 报告记录运行范围和 token

- **WHEN** 基础黑盒测试结束
- **THEN** 报告 MUST 包含运行时间、模型、judge 模型、完整 flow/turn 数、实际执行 flow/turn 数、通过数、失败数、跳过数和筛选条件
- **AND** 报告 MUST 包含预计 token 消耗和聊天/judge 的真实 token 汇总或未获取原因

#### Scenario: 报告记录每轮用户可见输出

- **WHEN** 基础黑盒测试完成任一轮
- **THEN** 报告 MUST 记录 flow id、轮次、用户输入、文档期望、assistant 用户可见回复摘要、可见输出类型、建议回复、确认请求和验证状态
- **AND** 报告 MUST NOT 保存完整 prompt、完整动作候选池、大段 raw provider response 或内部 tool payload

#### Scenario: 首轮失败后跳过后续轮次

- **WHEN** 一个 flow 的第 1 轮失败
- **THEN** 系统 MUST 将该 flow 后续轮次标记为 skipped
- **AND** 报告 MUST 记录跳过原因

