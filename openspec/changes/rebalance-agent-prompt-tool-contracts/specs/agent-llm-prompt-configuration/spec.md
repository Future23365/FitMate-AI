## ADDED Requirements

### Requirement: Agent 模型可见规则必须按决策层级分布

默认 LangChain Agent system prompt、LangChain tool description、schema description、decision examples、tool result summary 和 structured final response schema SHALL 按职责分层承载模型可见规则。系统 prompt MUST 只承载通用 Agent 合同、provider tool calling、结构化终态、安全边界和高层停止原则；具体业务 tool 能力、字段来源、候选消费边界和业务结构化收口规则 MUST 放在对应 tool description、schema description、tool result summary 或业务 finalization tool 说明中。

#### Scenario: System prompt 不承载业务操作手册

- **WHEN** 默认 prompt 配置生成 system message
- **THEN** system message MUST 说明模型通过 provider native `tool_calls` 请求工具
- **AND** system message MUST 说明最终用户可见正文通过 `fitmate_final_response.content` 提交
- **AND** system message MUST 保留不能伪造工具结果、不能调用未注册工具、不能泄漏 secret、非医疗边界和缺少事实时自然澄清等高层规则
- **AND** system message MUST NOT 包含完整 `visibleTrainingProposal` payload 规则、动作查询字段说明、训练编排字段 workflow、Markdown 细则或具体业务 tool 的固定调用流程
- **AND** system message MUST NOT 根据用户原文、关键词、正则、同义词表、短句模板或具体业务 `toolName` 规定 action、toolName、outputType 或 payload kind

#### Scenario: 业务规则靠近对应 tool 决策点

- **WHEN** LangChain runtime 构造生产 tool catalog
- **THEN** 每个业务 tool 的 description MUST 在自身附近说明该 tool 的用途、使用条件、不使用条件、输入来源、输出含义和 grounding 边界
- **AND** schema description MUST 保留模型填写字段时必须知道的字段来源、枚举含义、数量边界和不可复制字段边界
- **AND** schema description MUST NOT 承载跨 tool workflow、固定多轮调用顺序或完整 finalization 策略
- **AND** tool description MUST NOT 只通过“参见 system prompt”表达关键业务边界

#### Scenario: Decision examples 保持短链路而非固定规则

- **WHEN** 默认 prompt 或 tool description 包含 decision examples
- **THEN** examples MUST 只表达场景、关键 tool input 和收口边界
- **AND** routine / plan 示例中若用户没有指定肌群，首次动作查询示例 MUST NOT 填写 `muscles`
- **AND** routine / plan 示例 MAY 展示一次性传入 `suitabilities = ["warmup", "training", "stretch"]`
- **AND** examples MUST NOT 表达成固定用户短句、固定业务 `toolName`、固定字段组合或固定调用次数的生产触发规则

### Requirement: Prompt 瘦身不得改变服务端语义边界

模型可见合同瘦身 SHALL 只调整规则放置位置、表述密度和摘要语义，不得引入服务端自然语言理解、关键词分流、固定 tool 调用顺序或运行时拼图状态。LLM 继续负责基于当前可见 prompt、tool description、schema、messages、observations 和 tool results 选择 tool calling 与最终收口。

#### Scenario: 不新增服务端语义分流

- **WHEN** 实现本 prompt / tool contract 优化
- **THEN** `/api/chat`、LangChain runtime、validator、tool handler、response adapter 和 renderer MUST NOT 新增基于用户原文短语、关键词、正则、同义词表或规则评分的条件分支
- **AND** 系统 MUST NOT 根据用户原文改写 provider `tool_calls`、固定 `toolName`、固定 `payload.kind` 或最终回答策略
- **AND** 系统 MUST NOT 根据具体 tool result 字段组合替模型决定继续查询、结构化收口、普通回答或澄清

#### Scenario: 不新增当前轮拼图状态

- **WHEN** 实现本 prompt / tool contract 优化
- **THEN** 系统 MUST NOT 新增 `currentRoutineDraft`、当前轮事实聚合字段、拼图式候选状态、服务端候选编排器或等价运行时语义外壳
- **AND** 当前模型可见输入仍 MAY 使用既有 messages、metadata、observations、tool results、tool result summary 和受控历史事实投影
- **AND** 如未来确需新增模型可见聚合字段，MUST 通过独立 OpenSpec change 重新声明合同、权限和测试边界
