## Context

当前生产聊天链路以 `/api/chat -> createAgentTextChatResponse() -> runAgentRuntime() -> LlmPlanner -> DeepSeekModelAdapter` 为主，模型需要输出项目自定义 `AgentAction` JSON，再由自研 runtime 校验、执行 tool、生成 observation、继续 planner 或终态渲染。这个设计在早期帮助项目建立了可控的服务端边界，但现在已经把模型协议、tool manifest、repair、resource、trace、response rendering 和 production chat 接入绑定在一个自研 Agent core 中。

本 change 的核心判断是：旧自研 Agent core 不再作为长期维护基础。迁移不应停留在“保留旧 core，只替换 DeepSeek adapter”的半状态，而应一次性把生产 Agent 主链改为 LangChain agent harness + DeepSeek native Tool Calling，并在完成后删除旧 `agent-core` / `agent-planners` / 旧 `AgentAction` 主链。

约束如下：

- 用户明确要求只补 OpenSpec 文档，本阶段不改生产代码。
- 模型自然语言理解和 tool calling 决策应交给 LLM / LangChain，不在服务端新增关键词、正则、短句模板或业务 phrasing 分流。
- 项目服务端仍必须掌握确定性边界：认证、权限、Zod 校验、数据库事实校验、结构化输出校验、成本预算、trace 脱敏、错误归一化、NDJSON 投影和持久化。
- 模型可见描述性自然语言默认使用中文，`toolName`、字段名、枚举值、resource type、provider 字段和代码标识保持英文。
- 新增 LangChain 依赖、DeepSeek provider 接入和运行参数必须进入集中配置，不能散落在 route、tool handler 或 service 局部变量中。

## Goals / Non-Goals

**Goals:**

- 用 LangChain agent harness 替换生产自研 Agent loop。
- 使用 DeepSeek native `tool_calls`，不再要求模型手写 `AgentAction` JSON。
- 将现有业务 Agent tools 迁移为 LangChain tools，并保留项目服务端确定性校验、权限、事实投影和错误归一化。
- 保持 `/api/chat` 外部请求和 NDJSON 用户可见响应合同尽量稳定，内部 AgentAction、tool result、resource contract、planner diagnostics 和 trace event 允许 breaking change。
- 迁移 trace，使开发者能复盘 LangChain run、DeepSeek `tool_calls`、tool wrapper 输入输出、结构化输出校验和最终 NDJSON 投影。
- 删除旧 `agent-core`、旧 `agent-planners`、旧 `ToolRegistry`、旧 `Response Renderer`、旧 replay planner 和只服务旧 core 的测试夹具，避免长期双轨。
- 更新 OpenSpec 和治理边界，使后续新增业务能力默认扩展 LangChain tool wrapper。

**Non-Goals:**

- 不使用 LangGraph 作为直接实现 API。LangChain 内部如何实现 agent 不影响本项目的代码边界。
- 不保留旧 `AgentAction` / `PlannerPort` / `ToolRegistry` 作为生产兼容层。
- 不新增服务端自然语言意图分流、关键词路由、同义词表或基于用户原文的 tool 选择逻辑。
- 不让 LangChain tool 直接绕过项目的权限、Zod、Prisma 事实校验、训练输出 validator 或持久化边界。
- 不在本 change 中新增数据库 schema，除非实现阶段证明 LangChain trace 或 run 持久化必须新增字段。
- 不改变前端视觉设计，不主动打开浏览器验证。

## Decisions

### 1. 直接使用 LangChain agent harness，而不是 LangGraph

本项目当前生产聊天是单 Agent 场景：接收用户消息、让模型基于可见 tools 决策、执行 tool、拿结果继续回答或澄清。LangChain 的 agent API 与 tool abstraction 足以表达这个流程。LangGraph 更适合多节点状态机、多 Agent 协作、人工审核节点、持久 checkpoint 和复杂 workflow；当前直接引入会扩大实现面，也会把一次“减少自研 Agent loop”的重构变成“用更底层框架重新搭一套 loop”。

替代方案：

- 继续保留旧 core，只替换 DeepSeek adapter：风险较低，但不能解决旧 AgentAction / PlannerPort / ToolRegistry 复杂度。
- 直接使用 LangGraph：表达能力更强，但当前需求没有复杂图编排前提，维护成本更高。

结论：生产主链使用 LangChain agent harness；不直接依赖 LangGraph API。

### 2. 用 DeepSeek native Tool Calling 替换旧 AgentAction JSON 输出

旧链路要求模型输出 `{ type: "tool_call" | "final_answer" | "ask_user" }`，再由服务端解析 action。新链路应让 DeepSeek 通过 native `tool_calls` 选择业务工具，LangChain 负责 tool calling harness。模型不再把业务 tool 调用伪装成自定义 JSON action。

终态回答和澄清由 LangChain agent 最终消息、结构化输出或受控 response adapter 处理。实现阶段可选择：

- 普通文本终态：LangChain final message -> production response adapter -> NDJSON `content` / `done`。
- 澄清终态：模型输出受控澄清结构或 final message 中的澄清意图 -> response adapter 生成 `content`、可选 `assistant_suggestions`、`done`。
- 结构化业务交付：通过 LangChain structured output、专用 finalization tool 或受控 terminal parser 进入项目 validator，必须通过 `visibleTrainingProposal` 等服务端校验后才可渲染或保存。

实现阶段必须避免把 `final_answer` / `ask_user` 作为旧 AgentAction 的长期兼容层继续存在。

### 3. LangChain tool wrapper 是唯一业务 tool 执行入口

每个生产业务 tool 应迁移为 LangChain tool。wrapper 的职责是：

- 暴露模型可见的 tool name、description 和 input schema。
- 将 provider / LangChain 传入的 arguments 通过 Zod 或等价 schema 校验。
- 注入当前 `userId`、conversation、request metadata、trace writer 和 abort / timeout 信号。
- 调用项目已有领域服务或 repository。
- 执行权限隔离、数据库事实校验和业务边界校验。
- 输出给模型的安全摘要、输出给用户的安全投影、trace 摘要和内部完整结果分层。
- 将异常和拒绝归一化为稳定错误 code。

LangChain tool handler 不得直接拼接 SQL，不得信任客户端传入 userId，不得绕过动作库事实校验，不得持久化未经服务端 validator 校验的 AI 输出。

### 4. 保留项目 response adapter，而不是让 LLM 直接生成前端事件

前端仍应消费受控 NDJSON 白名单事件。LangChain agent 最终结果不能直接输出任意 NDJSON。production response adapter 负责把 LangChain run result、结构化输出 validator 结果、可恢复错误和建议问题投影为前端事件。

这可以保持 `/api/chat` 用户可见合同稳定，同时允许内部 Agent trace 和 tool execution contract 彻底迁移。

### 5. Trace 以 LangChain run 为事实来源重建

旧 trace 中的 `planner_action`、旧 `AgentAction`、旧 tool result id、旧 resource refs、旧 duplicate tool call 等字段不再作为新运行时合同。新 trace 应记录：

- route / run / user / conversation / message metadata。
- LangChain model request / response 摘要。
- DeepSeek `tool_calls` 的 tool call id、tool name、arguments 摘要和 provider status。
- LangChain tool wrapper 的校验、执行、输出摘要、失败 code、duration。
- tool result 是否进入后续模型上下文。
- 结构化输出 validator 结果。
- production response adapter 输出的 NDJSON 摘要。
- 旧 core 缺席证据：生产链路没有调用 `runAgentRuntime()`、`LlmPlanner`、旧 `DeepSeekModelAdapter` 或旧 `ToolRegistry`。

Trace 写入继续是非致命诊断，失败不得改变用户可见响应。

### 6. 旧 core 迁移完成后删除，不保留双轨

实现阶段可以临时并行开发新 runtime，但交付完成时生产代码不得同时保留旧 core 和新 LangChain runtime 两条 Agent 主链。旧 core 删除范围包括：

- `lib/server/agent-core/**`
- `lib/server/agent-planners/**`
- 旧 AgentAction schema / validator / repair loop
- 旧 ToolRegistry / defineTool / Executor / ResourceStore 主链
- 旧 Response Renderer 主链
- 旧 ReplayPlanner
- 只服务旧 core 的 tests、fixtures、manual runner 和 docs 引用

如果某些公共领域服务当前混在旧 tool 文件中，必须先抽出纯领域服务，再删除旧 tool wrapper。

### 7. 配置集中化

新增 LangChain / DeepSeek / tool calling 相关配置必须放入 `lib/server/config/` 或当前集中配置目录。包括：

- DeepSeek model、endpoint、temperature、max tokens、timeout、tool calling 策略。
- LangChain agent run 预算、最大 tool calls、最大迭代次数、tool timeout。
- trace 裁剪、模型请求摘要长度、tool result 投影预算。
- production tool catalog 开关和允许列表。

业务 route、tool wrapper 和 response adapter 只能读取集中配置导出的稳定接口。

## Risks / Trade-offs

- [Risk] LangChain 抽象隐藏 provider 细节，导致 DeepSeek `tool_calls` raw 信息不好追踪。  
  Mitigation: wrapper 和 model adapter 层必须保存安全 raw summary、tool call id、arguments 摘要和 provider status 到 trace。

- [Risk] 旧 AgentAction 删除后，现有大量测试会失效。  
  Mitigation: tasks 中要求先建立新 runtime contract tests，再删除旧 tests；删除前必须区分旧 core 专属测试和可复用领域服务测试。

- [Risk] LangChain tool wrapper 可能绕过项目已有权限或 validator。  
  Mitigation: spec 要求所有 wrapper 只调用领域 service，必须覆盖 schema 拒绝、userId 隔离、数据库事实校验、失败归一化和 projection 测试。

- [Risk] `/api/chat` 外部事件合同被内部迁移影响。  
  Mitigation: response adapter 保持 NDJSON 白名单事件，并用自动化测试覆盖 content、assistant suggestions、visible output、error、done。

- [Risk] 结构化训练输出在 LangChain final message 中变得不可控。  
  Mitigation: 结构化业务交付必须进入服务端 validator；未通过 validator 不得渲染卡片、保存 artifact 或写入训练事实。

- [Risk] 一次性重构范围大，容易遗留旧 core 引用。  
  Mitigation: 增加架构扫描，检查生产代码不再导入旧 `agent-core`、`agent-planners`、`AgentAction`、`ToolRegistry`、`runAgentRuntime`、旧 response renderer 和旧 planner tests。

## Migration Plan

1. 补齐 OpenSpec、规格 delta 和任务清单，确认本 change 是完整 runtime replacement。
2. 引入 LangChain 依赖和集中配置，不接入生产路由前先完成单元级 adapter / tool wrapper 测试。
3. 建立 LangChain agent runtime service，接入 DeepSeek native Tool Calling，并封装生产 model factory。
4. 将现有生产业务 tools 迁移为 LangChain tools，保留项目校验、权限、事实投影、trace 摘要和错误归一化。
5. 建立 LangChain run trace 投影和 production response adapter。
6. 将 `/api/chat` 切到 LangChain runtime，并保持请求校验、认证、conversation hydration 和 NDJSON 外部合同。
7. 迁移或重写相关自动化测试和 manual LLM 黑盒 runner。
8. 删除旧 `agent-core`、旧 `agent-planners`、旧 AgentAction tests / fixtures 和旧 OpenSpec 过时引用。
9. 运行 OpenSpec validate、typecheck、相关单测、架构扫描、`/api/chat` 自动化测试和 build。

## Open Questions

- LangChain DeepSeek 接入使用官方 DeepSeek provider、OpenAI-compatible ChatModel，还是项目自定义 ChatModel adapter，需要在实现前根据当前 LangChain JS 支持情况和 DeepSeek native `tool_calls` 兼容性确认。
- 结构化终态输出采用 LangChain structured output、专用 finalization tool，还是 response adapter 中的受控 terminal parser，需要在实现阶段以测试稳定性和 DeepSeek 支持情况定案。
- 是否需要保存 LangChain run-level checkpoint 或只保存现有 chat session / trace 摘要。当前设计默认不引入 durable checkpoint。
- 旧 `agent-core-removal` spec 与本 change 迁移后的新 Agent 能力存在历史语义冲突，实现时需要同步修正或归档相关要求。
