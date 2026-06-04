## Context

`enable-agent-text-chat-flow` 已把生产 `/api/chat` 接入新 `agent-core` 文本聊天阶段，但该阶段故意使用空 `ToolRegistry`，不注册任何业务 tool。这个边界本身是正确的：当前生产聊天只能做文本回答、澄清和建议回复，不能生成训练计划、查询动作库或保存 artifact。

问题出现在用户可见投影层。模型面对“生成一个计划”这类请求时，可能仍返回 `tool_call`。由于 registry 为空，Action Validator / runtime 会产生 `unknown_tool`、`invalid_action`、`repair_limit_exceeded` 等内部错误；默认 Response Renderer 目前会把 `terminalError.message` 输出为 NDJSON `error`，前端又把 `event.error.message` 写入 assistant 气泡，最终用户看到服务端内部英文错误。

本 change 属于 production 接入变更 + Response Renderer / frontend projection 边界修复。它不接入业务 tool，不恢复旧 AgentOrchestrator，不改变模型语义理解来源。

## Goals / Non-Goals

**Goals:**

- 用户可见聊天气泡不得展示服务端错误原文、runtime budget、validator 名称、toolName 注册状态或内部英文错误。
- 当前空 registry 阶段遇到 tool 不支持、unknown tool、tool call 不可执行、invalid action repair limit 等能力缺口时，输出普通 `content` 回复，说明目前暂不支持该功能，并引导用户提出可用文本问题。
- 保留内部结构化错误 code、details、traceEvents 和测试诊断，确保开发者仍能定位失败。
- 前端 `error` 事件处理变成安全最后防线，即使后端仍返回 `error.message`，也不得原样显示。
- 继续证明 `/api/chat` 没有业务关键词分流、fixture tool、真实业务 tool 或旧兼容事件回流。

**Non-Goals:**

- 不接入 `searchExercises`、`generateRoutineDraft`、`generatePlanDraft`、`saveConversationArtifactRevision`、用户记忆或任何业务 tool。
- 不根据用户原文关键词判断“生成计划”“推荐动作”等语义意图。
- 不让前端承担 runtime 错误分类的主责任；前端只做安全兜底。
- 不修改 Prisma Schema、数据库迁移、训练计划生成规则、动作选择规则或权限模型。
- 不启动 dev server，不要求浏览器验证。

## Decisions

### 1. 在服务端做确定性错误分类，不做自然语言分流

聊天接入层或 Response Renderer 应根据 `AgentRunResult.terminalError.code`、`traceEvents`、registry 为空状态、terminal result 状态等确定性事实判断是否属于 unsupported capability。典型 code 包括 `unknown_tool`、`unsupported_m0_capability`、`invalid_action`、`repair_limit_exceeded`、`max_tool_calls_exceeded`，以及由空 registry 导致的 tool call 不可执行链路。

取舍：用用户原文包含“计划”来改写回复会违反 AI 语义边界；用 runtime error code 则是确定性合同投影，不会替代模型理解。

### 2. 生产文本聊天对 unsupported capability 输出 `content`，不是 `error`

当错误可归类为当前阶段能力不支持时，`/api/chat` 应返回：

- 一个普通 `content` 事件，使用中文、产品化、安全文案，例如说明“目前还不能直接生成或保存训练计划”，并引导用户可以继续询问训练原则、动作说明、准备工作或补充需求。
- 可选 `assistant_suggestions`，提供当前阶段可处理的问题入口。
- 一个 `done` 事件。

内部 `terminalError` 仍保留在 runtime result / trace / 测试中，但不进入用户可见气泡。

取舍：继续输出 `error` 事件再让前端替换文案会让后端仍在发送用户不可见语义，且不同前端容易漏处理。服务端应优先产出正确用户协议，前端作为兜底。

### 3. 真正不可恢复的服务端失败也必须安全展示

配置缺失、HTTP 错误、NDJSON 解析错误、模型 provider 失败等不能都伪装成 unsupported capability。它们可以保留机器可读 `error` 事件或 hook 错误状态，但用户可见文案必须是稳定中文兜底，不得包含内部 message、堆栈、provider 原文、API key 缺失字段或 runtime 细节。

取舍：把所有失败都显示成“不支持这个功能”会误导用户；区分 unsupported 与 generic failure 可以保持产品语义，同时仍不暴露服务端错误。

### 4. 前端永远不直接渲染 `error.message`

`features/chat/api/chat-client.ts` 可继续解析 `error` 事件并保留 code / retryable / details 供测试或内部状态使用，但 `getAgentTextChatEventErrorMessage()`、`getAgentTextChatErrorMessage()` 和 `use-chat-controller` 写入用户可见内容时必须使用本地安全文案映射。

取舍：后端投影修复后理论上不会把 unsupported 作为 `error` 发给前端，但前端仍需要防止未来服务端、HTTP 或 stream 错误穿透。

### 5. 默认 Response Renderer 的通用能力要保持无业务 toolName 分支

如果实现触碰 `lib/server/agent-core/response-renderer.ts`，只能增加通用错误可见性策略或可插拔文案投影，不得在 core 中写 `searchExercises`、`generatePlanDraft` 等具体业务 toolName 分支。生产文本聊天也可以在 `agent-text-chat-service.ts` 对 render 后事件进行窄投影，但不能注册隐藏业务 tool 或绕过 runtime。

取舍：在 core 里按具体业务 toolName 特判会破坏第 24-26 节治理规则；通用 code 分类或 chat-service 入口策略更符合当前 production 接入阶段。

### 6. Trace / test 保留真实错误，用户事件隐藏错误

实现后测试应同时验证两类事实：

- 内部 `AgentRunResult` 或 trace 仍能看到 `repair_limit_exceeded`、`unknown_tool` 等诊断。
- NDJSON 用户事件和最终 assistant message 不包含 `Agent runtime reached...`、`Tool "... " is not registered.`、`Chat AI model configuration is missing.` 等服务端原文。

取舍：完全删除错误会让调试退化；只做脱敏不改用户事件又不能解决用户体验。两者必须分离。

## Risks / Trade-offs

- [Risk] unsupported capability 被误归类成 generic failure。→ Mitigation：用明确错误码集合和空 registry 事实作为分类条件，并用单测覆盖。
- [Risk] 后续接入真实业务 tool 后仍沿用“不支持”文案。→ Mitigation：unsupported 分类必须依赖当前 registry / tool capability 事实；真实 tool 注册后，合法 tool_call 不应走该 fallback。
- [Risk] 前端隐藏所有 error 后开发者难以调试。→ Mitigation：保留 code/details 在事件对象、trace 和测试中，只禁止用户可见文本渲染原文。
- [Risk] 为了让回复更自然而引入关键词分流。→ Mitigation：tasks 和架构扫描明确检查 `/api/chat` 与 chat service 不出现用户文本关键词路由。

## Migration Plan

1. 增加用户可见错误文案 helper，定义 unsupported capability 和 generic failure 的中文安全文案及建议回复。
2. 在 production text chat response 创建路径中，将 unsupported runtime failure 投影为 `content` + 可选 `assistant_suggestions` + `done`。
3. 调整默认 Response Renderer 或聊天接入层，确保 terminal error 不再直接泄漏给用户事件。
4. 调整前端 chat client / controller 的 `error` 处理，停止把 `error.message` 写入 assistant bubble。
5. 增加后端、前端和架构扫描测试。
6. 同步 OpenSpec、方案变更历史和项目演变文档。

Rollback：如实现导致用户事件缺失，可回滚本 change 的事件投影和前端映射；但不得恢复“直接显示服务端错误原文”的行为，也不得通过注册 fixture tool 或旧链路绕开问题。

## Open Questions

无。unsupported fallback 的具体文案可在实现时选择，但必须满足中文、安全、明确暂不支持、不暴露内部错误、引导继续提问这五个边界。
