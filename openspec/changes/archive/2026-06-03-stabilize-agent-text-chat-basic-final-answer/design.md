## Context

当前生产 `/api/chat` 文本聊天链路是：

`PreparedChatRequest -> AgentRunInput -> 空 ToolRegistry -> LlmPlanner + DeepSeekModelAdapter -> runAgentRuntime -> 文本聊天响应投影 -> NDJSON`

空 `ToolRegistry` 是当前阶段的正确业务边界：系统还没有接入动作库查询、训练生成、保存 artifact 或用户记忆 tool。但基础文本问答不应该依赖业务 tool；模型应基于 `tools: []` 和用户消息直接产出合法 `final_answer`。最新 trace 中，用户问“你能干什么”后，模型连续两次产出不被 Action Validator 接受的 action，最终触发 `repair_limit_exceeded`。这暴露出两个问题：

1. 默认 Agent LLM prompt 仍是测试级英文短句，只说明允许 `tool_call / final_answer / ask_user`，没有告诉模型空工具、普通问答、能力介绍和 repair 场景如何收口。
2. 生产聊天 unsupported fallback 曾经用固定“暂不支持生成/保存训练计划”的业务文案处理空 registry 工具调用失败。这可以阻止内部错误泄漏，但不应替代“你能干什么”这类基础问答的模型回复。

本 change 属于 production 接入变更 + Agent LLM prompt 合同强化。它不新增业务 tool，不改变 `AgentAction` 类型，不注册 hidden tool，不恢复旧链路。

## Goals / Non-Goals

**Goals:**

- 将默认 Agent LLM prompt 升级为中文、可审阅、可测试的完整 AgentAction 决策合同。
- 明确 `tools` 为空时，模型不得返回 `tool_call`；普通聊天、能力说明、训练原则解释和信息整理必须用 `final_answer` 自然语言回答。
- 明确模型在回答“能做什么”时，应基于当前可见工具和通用文本能力说明，不声称可以直接执行未注册 tool。
- 将生产文本聊天 unsupported fallback 收窄为安全错误边界：只防止内部错误穿透，不替代基础问答的正常模型回复。
- 保留 trace / runtime result 中的内部错误 code 和诊断信息，便于继续定位模型是否仍输出非法 action。
- 增加测试证明 prompt 为中文、基础问答走 `final_answer`、空 registry 工具调用失败不泄漏内部错误、没有关键词分流或业务 tool 注册。

**Non-Goals:**

- 不接入 `searchExercises`、动作详情、训练生成、计划生成、保存 revision、用户记忆或数据库查询 tool。
- 不根据用户原文关键词、正则、同义词表、短句模板或规则评分改写模型语义。
- 不修改 `PlannerPort`、`AgentAction` Schema、Action Validator、Executor、Policy Guard、ResourceStore 或 Resource Contract Validator。
- 不让服务端为“你能干什么”生成固定业务回答。
- 不改变 `/api/chat` 请求 schema、前端 NDJSON 事件协议、Prisma Schema、数据库迁移或权限模型。

## Decisions

### 1. Prompt 用中文表达完整 AgentAction 合同

默认 prompt 改为中文，因为当前用户、业务语境和协作规则均以中文为主。Prompt 仍只描述通用 AgentAction 合同，不写具体业务 toolName，不写服务端关键词分类，不写动作库或训练生成流程。

Prompt 至少覆盖：

- 只返回一个 JSON object，不输出 Markdown、解释文字或 NDJSON。
- `type` 只能是 `tool_call`、`final_answer`、`ask_user`。
- 普通聊天、概念解释、能力说明、总结整理、无工具也能回答的问题，必须返回 `final_answer`。
- 只有 `tools` 中存在对应工具且用户目标需要执行该工具时，才能返回 `tool_call`。
- 当 `tools` 为空时，禁止返回 `tool_call`；如可直接回答，用 `final_answer`；如缺少用户信息，用 `ask_user`。
- 回答能力边界时，应基于当前 `tools` 和自身文本能力，不承诺执行未注册工具。
- 看到 invalid action observation 或 repair 反馈时，应修正为合法 `final_answer` / `ask_user` / 可执行 `tool_call`，而不是重复非法形态。

取舍：继续只写三行英文 prompt 改动最小，但模型缺少具体操作规则；把业务功能说明写进 prompt 短期看似有效，却会绕过 tool-first 能力边界。中文通用合同能稳定基础问答，同时不扩大业务能力。

### 2. 正常回答必须来自模型，不来自服务端固定文案

“你能干什么”这类问题属于普通文本问答。服务端不能按用户文本或错误场景写固定业务回答。正常路径必须是模型返回 `final_answer.content`，Response Renderer 只投影这个已校验终止动作。

取舍：在 chat-service 中写一段“我能帮你……”最容易让测试通过，但这会把语义回复重新拉回服务端硬编码。正确修复是让 prompt 和模型决策合同足够清晰，并用测试证明 ReplayPlanner / FakeModelAdapter 下的合法 `final_answer` 会正常投影。

### 3. Unsupported fallback 只处理不可执行 tool call 的安全边界

保留空 registry 下模型返回 `tool_call` 时的安全处理，但收窄文案语义：它不再输出固定“不能生成、保存或执行训练计划”的业务回答，也不伪装成模型对用户问题的自然语言理解。它只说明“刚才的操作需要当前未接入的工具，无法直接执行”，并建议用户换成普通文本问题或补充信息。

这个 fallback 的触发仍必须基于确定性 runtime 事实，例如 registry 为空、Planner action 是 `tool_call`、validation / terminal error code 属于 `unknown_tool`、`unsupported_m0_capability`、`repair_limit_exceeded` 或等价不可执行错误。不能基于用户原文。

取舍：完全删除 fallback 会让内部错误再次穿透；继续固定业务能力文案会替代模型回答。收窄到“安全错误边界”能保留用户体验保护，同时不承担正常语义回答。

### 4. 非 tool_call 非法 action 不做业务 fallback

如果模型返回旧式 `answered`、`final_result`、破损 JSON 或其他非法结构，服务端仍按结构化错误和 repair budget 处理。Prompt 应引导模型在 repair 后改成合法 action；若仍失败，用户可见只能是通用安全失败文案，不能编造业务回答。

取舍：把所有非法 action 都转成某段服务端 `content` 可以隐藏错误，但会掩盖 Prompt / 模型输出问题，也会让 trace 难以区分“模型自然回答成功”和“服务端替模型说话”。保留 generic failure 更诚实，并通过 trace 继续定位。

### 5. 测试覆盖 Prompt、投影和边界扫描

实现应补充：

- prompt 配置单测：默认 prompt 为中文，包含空 registry、普通问答、能力说明、repair、禁止工具调用等规则，不包含具体业务 toolName。
- adapter 请求体测试：system message 来自新 prompt。
- chat service 测试：合法 `final_answer` 能作为“你能干什么”的基础问答输出；空 registry 下重复 `tool_call` 仍不泄漏内部错误，但输出的是安全边界文案而不是固定业务回答。
- 架构边界测试：`/api/chat` 没有关键词分流、fixture tool 或业务 tool 注册回流，prompt 配置不导入业务服务。

取舍：真实 LLM 黑盒能验证效果，但本 change 不主动打开页面或启动 dev server；自动化测试先证明合同和投影边界，后续可用已有手动黑盒 runner 复测真实模型。

## Risks / Trade-offs

- [Risk] 中文 prompt 变长，略增 prompt token。→ Mitigation：只写通用 AgentAction 合同，不塞业务规则；优先换取基础链路稳定性。
- [Risk] 模型仍偶发输出非法 action。→ Mitigation：Prompt 增加 repair 指引；服务端保持内部诊断和通用安全失败，不伪造回答。
- [Risk] 收窄 fallback 后，某些未接入业务能力请求不再收到“训练计划”专用固定文案。→ Mitigation：这是预期变化；当前阶段不应用服务端固定业务文案替代模型语义。
- [Risk] 后续接业务 tool 时 prompt 规则过度限制 tool_call。→ Mitigation：规则允许在 `tools` 中存在对应工具且用户目标需要执行工具时返回 `tool_call`，不阻碍未来 tool-first 接入。
- [Risk] 为了让“你能干什么”稳定而加入关键词特判。→ Mitigation：tasks 和架构扫描明确禁止用户原文关键词、正则、同义词或短句模板分流。

## Migration Plan

1. 更新 Agent LLM prompt 配置为中文合同，并同步 prompt version。
2. 调整 prompt 配置和 adapter 相关测试断言。
3. 收窄 production text chat 的 unsupported fallback 文案和触发范围，保留内部错误安全边界。
4. 增加基础问答和空 registry 工具调用失败的 chat service 测试。
5. 更新 Agent Tool 架构文档、方案变更历史和项目演变记录。
6. 运行 `openspec validate stabilize-agent-text-chat-basic-final-answer --strict`、相关 `npm test`、架构扫描和 `npm run typecheck`。

Rollback：如果新 prompt 导致模型更不稳定，可以回滚 prompt 文案和版本；但不得恢复服务端直接暴露内部错误，也不得通过注册 fixture tool、业务 tool 或关键词分流绕过问题。

## Open Questions

无。当前需求已明确：基础问答由模型自然语言回答，服务端只做结构校验和安全错误边界。
