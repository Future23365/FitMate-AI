## Context

根目录 `llm基础测试.md` 定义首页聊天入口的三轮基础 flow。基础套件应保持低歧义、低成本，只覆盖动作推荐、routine、plan、信息不足追问、目标切换、非健身话题切回、未知动作不编造和动作说明等冒烟流程。引用歧义、局部替换、重复动作范围、高风险降级、过多目标与短时长冲突等复杂场景应移出基础默认执行面，放到 detailed suite 或专项回归。当前 worktree 已没有 `manual-tests/llm` 和 `scripts/run-manual-llm-tests.mjs`，默认测试入口 `npm test` 只包含 `tests/**/*.test.ts`，因此本 change 需要新增一条隔离的手动 LLM 黑盒测试面，而不是沿用已删除的旧 runner。

现有首页聊天请求面是 `/api/chat`：前端通过 `latestUserMessage`、`conversationId`、`conversationSummary`、`conversationContext` 等字段发起请求，响应为 NDJSON 事件流。对这个 change 来说，`agent_progress`、`tool_result`、trace 和 runtime loop 都是中间过程；最终用户可见输出只由请求完成后的 assistant 文本内容和 `visible_output` 摘要构成。

首版 runner 已经避开 planner、tool handler 和 trace 作为判定输入，但仍需要进一步收紧：测试请求体不得获得真实首页客户端没有的完整 `messages` 历史；多轮连续性应覆盖会话保存后的服务端 hydration；NDJSON 解析必须和生产客户端保持同一合同；用户可见输出不应只限于正文和 `visible_output`，还应覆盖建议回复、确认请求和安全错误文案。

## Goals / Non-Goals

**Goals:**

- 基于 `llm基础测试.md` 构建一套手动运行的基础 LLM 黑盒 flow，保持文档用例和 runner 覆盖一致。
- 逐轮模拟用户在首页聊天框输入，并在同一 flow 内继承上一轮最终聊天历史。
- 请求体严格对齐首页聊天客户端公开输入，不传入真实页面没有发送的完整历史 `messages`。
- 多轮 flow 通过会话保存和读取边界验证 continuity，避免 runner 内存状态掩盖 hydration 回归。
- 每轮只在 NDJSON `done` 或等价完成边界后判定最终 assistant 用户可见输出。
- 用结构化语义判定覆盖自然语言期望，避免用关键词、正则或内部事件替代用户可见验收。
- 输出可人工复核的 Markdown 报告，记录最终输出摘要、期望、判定结果、失败原因和 token 使用。
- 保持手动运行隔离，不影响 `npm test`、常规 CI 和无模型配置的本地开发。

**Non-Goals:**

- 不改 `/api/chat` 业务行为、Agent planner、tool manifest、response renderer 或训练生成规则。
- 不新增服务端自然语言关键词判断、同义词表、固定短句分流或测试专用业务 fallback。
- 不使用真实浏览器、Browser、Chrome DevTools、Playwright 或截图验证。
- 不把 stream chunk、Agent progress、tool execution、trace、raw model output 或旧 trigger 字段作为通过条件。
- 不把开发态 trace store、数据库内部 fact 表、Agent runtime 内存状态或 runner 自己拼出的完整历史窗口作为 judge 输入。
- 不要求每个期望都用确定性代码完全断言动作内容准确率；本套测试验收用户可见输出是否符合文档期望。

## Decisions

### 1. `llm基础测试.md` 是基础套件的源文档

实现应读取并解析根目录 `llm基础测试.md` 中“三轮流程用例”的 Markdown 表格，生成稳定的 flow fixture。每一行对应一个 flow，每个 flow 固定三轮；解析阶段需要校验 ID 唯一、三轮输入和三轮期望均存在、列名与预期一致。这样后续人工维护用例时，不需要在文档和代码 fixture 之间重复修改。

备选方案是手写一份 TypeScript fixture。这个方案更简单，但会让文档和测试很快漂移；本 change 更看重 `llm基础测试.md` 作为人工 review 入口的权威性。

### 2. runner 走聊天请求合同，不走内部 planner

runner 应复用 `/api/chat` 等价请求体和 NDJSON 解析逻辑，按 flow 顺序发送 `latestUserMessage`。同一个 flow 内保留已完成轮次的用户消息和 assistant 最终可见输出，用于下一轮上下文；不同 flow 使用新的 `conversationId`，避免互相污染。

如果直接调用 planner 或 tool handler，测试会变成白盒合同测试，无法覆盖 route 级请求校验、stream 投影和前端实际消费事件的组合风险。

修复补充：runner 的请求体必须以生产 `requestAgentTextChatResponse()` 的公开字段为准，只发送 `conversationId`、`responseMessageId`、`latestUserMessage`、`conversationSummary`、`conversationContext` 和 `thinkingEnabled`。`messages` 虽然仍可能是服务端 schema 的兼容字段，但首页客户端当前不会发送它，基础黑盒 runner 不得用它给 `/api/chat` 提供额外历史窗口。

取舍：直接传 `messages` 能让 runner 更容易维持多轮上下文，但会让测试获得真实页面没有的输入能力，掩盖服务端 hydration 和会话保存问题。因此基础黑盒应优先贴近页面请求合同；需要专门验证兼容字段时，应另设 API 合同测试。

### 2.1 多轮 continuity 必须覆盖会话保存边界

同一 flow 的第 2、3 轮应尽量模拟首页的真实闭环：第 1 轮完成后保存 user/assistant 消息、conversation summary、conversation context 和用户可见训练输出；下一轮请求仍只发送首页客户端公开字段，让 `/api/chat` 根据 `conversationId + current user` 自行恢复已保存会话和近期可见训练方案事实。

报告可以记录保存结果、hydration source、artifact/fact 读取状态等诊断摘要，但这些诊断不得进入 judge prompt，也不能成为通过条件。

取舍：只在 runner 内存中维护 `historyMessages` 成本更低，但它无法发现保存失败、用户隔离错误、source message 丢失、hydration 读取不到最近卡片等真实首页问题。基础套件的目标是用户可见黑盒，因此应覆盖这条边界。

### 3. 最终用户可见输出是唯一判定对象

每轮执行时可以解析 NDJSON，但只把以下内容归一化为最终输出：

- 所有 `content` 事件拼接后的 assistant 文本；
- 所有 `visible_output` 事件的用户可见类型、schemaVersion 和安全摘要；
- 所有 `assistant_suggestions` 事件的用户可见建议摘要；
- 所有 `confirmation_request` 事件的用户可见确认问题摘要；
- 请求错误或 stream 错误的用户安全错误信息。

`agent_progress`、`tool_result`、trace id、toolName、tool input / output、planner action、repair feedback、token diagnostics 和 raw payload 只允许进入调试报告的受控错误摘要，不得进入判定 prompt，也不得作为通过条件。

修复补充：runner 应复用生产 NDJSON parser，或把生产 parser 抽成可被 runner 和前端共同使用的共享合同。未知事件、非法 `agent_progress` payload、非法 `content` payload 或不合法 `assistant_suggestions` 格式在页面会失败时，黑盒 runner 也必须失败；不得用手写宽松 JSON parser 静默跳过。

### 4. 用结构化 LLM judge 判定自然语言期望

`llm基础测试.md` 的期望是中文自然语言，例如“触发动作推荐卡片”“不直接生成随机卡片”“应追问或解释”。实现应使用独立的结构化 judge，对当前 flow 目标、轮次用户输入、该轮文档期望和最终用户可见输出做判定，输出固定 schema，例如 `passed`、`status`、`reason`、`matchedExpectations`、`missingExpectations`、`visibleOutputKinds`。

judge prompt 必须强调：只能依据最终用户可见输出判断；不得因为报告中缺少 tool / trace / progress 证据而判失败；不得要求文档未要求的动作精确 ID、组数、时长精确值或数据库内部字段。judge 输出必须经过 Zod 或 JSON Schema 校验，非法输出应记录为 judge 失败。

备选方案是关键词断言或完全人工读报告。关键词断言会把自然语言语义硬编码进测试；完全人工读报告则不能满足“判断最后 AI 输出”的自动化需求。

修复补充：judge model input 应使用统一的 `visibleUserOutput` 投影，而不是分散字段。该投影只能包含 `finalAssistantText`、`visibleOutputs`、`assistantSuggestions`、`confirmationRequests`、`safeErrorMessage` 和必要的 flow/turn/expectation 元数据。投影中不得包含 prompt、完整 NDJSON raw line、trace id、toolName、tool payload、planner action、token diagnostics、数据库 payload 或内部错误栈。

### 5. 手动命令和报告独立

新增专用命令建议为 `npm run test:llm:basic`，运行路径指向 `manual-tests/llm` 或等价目录。`vitest.config.ts` 现有默认 include 是 `tests/**/*.test.ts`，因此只要手动 LLM 文件不放入 `tests/`，默认 `npm test` 不会运行该套件。实现仍应补充隔离检查，防止后续配置变化把 `manual-tests/llm` 纳入默认测试。

报告应写入 `docs/manual-llm-basic-blackbox-latest-report.md` 或等价稳定路径，并使用上海时区时间。报告只保存用户输入、期望、最终回复摘要、最终可见输出类型、判定结果、失败原因、token 汇总和必要的请求错误摘要，不保存完整 prompt、完整模型 raw response、完整 tool payload 或大段 trace。

token usage 只能作为可选诊断：如果当前生产聊天链路通过稳定响应或报告接口提供 usage summary，则报告可以记录；如果只能从开发态 trace store 推导，则必须标记来源为 `dev_trace_store`，且读取失败不得影响执行结果。测试不得为了获取 token usage 依赖 trace 存在，也不得把 trace token 作为通过条件。

### 6. 非真实模型单测验证测试基建，不锁死当前用例数量

基础 parser、judge input、报告和隔离检查需要普通自动化测试覆盖，但这些测试不应把当前 `llm基础测试.md` 的完整固定 ID 列表或某一版人工用例顺序当成长期合同。合理断言是：文档可解析、ID 唯一、每个 flow 固定三轮、每轮输入和期望非空、复杂 detailed 场景不混入基础默认表、报告不泄漏敏感中间载荷、手动套件不进入默认测试。

### 9. 建议提问按钮作为可恢复路径

基础黑盒的判定对象包含 `assistant_suggestions`。如果最终 assistant 文本或 `visible_output` 已满足期望，状态为 `passed`。如果本轮没有直接完成全部期望，但建议提问按钮是用户点击后可直接发送的完整输入，并且语义上覆盖缺失的下一步操作，judge 可返回 `passed_via_suggestion`。该状态计入通过，不让手动命令失败，但必须在报告中单独统计，避免把“可恢复路径”误读为“本轮直出能力已经完成”。

泛泛建议、不相关建议、助手口吻说明、需要用户自行重新理解任务的建议，不能作为 `passed_via_suggestion`。如果需要真实验证点击建议后的下一跳效果，应在 detailed suite 或专项 follow-up runner 中另行执行建议文本；基础套件只判定当前轮用户最终可见输出是否提供了可恢复路径。

取舍：固定数量断言能发现意外删用例，但会让人工正常增删用例时必须同步改测试基建。用例覆盖完整性应由人工 review 和 OpenSpec 文档承担，parser 单测只守结构合同。

## Risks / Trade-offs

- [Risk] LLM judge 可能出现漂移或误判。
  Mitigation: 使用严格结构化输出、短上下文、明确判定规则，并在报告中保留最终输出摘要和 judge reason 供人工复核；后续可通过 flow 级重跑缩小复核范围。

- [Risk] Markdown 表格解析失败导致真实模型调用前才暴露问题。
  Mitigation: runner 必须先做 fixture preflight；表格缺列、空输入、空期望、重复 ID 或 flow 数不匹配时直接失败，不发起模型请求。

- [Risk] 真实模型和 judge 双重调用增加成本。
  Mitigation: 命令必须在运行前输出 flow/turn 数和 token 粗略预估，并支持只跑指定 flow；默认仍为手动命令，不进入自动测试。

- [Risk] 实现为了通过测试新增服务端语义分流。
  Mitigation: tasks 中加入架构扫描，确认 `/api/chat`、Agent core、tool handler 和 response renderer 未新增自然语言关键词、正则、同义词表或测试专用 fallback。

- [Risk] runner 继续传入生产页面没有的历史字段，导致测试比真实用户路径更容易通过。
  Mitigation: 增加请求体单元测试，确认基础 runner 不发送 `messages` 或其他测试专用绕过字段，并通过会话保存/hydration 验证多轮。

- [Risk] 生产 NDJSON 协议变化后，runner 手写 parser 和页面 parser 表现不一致。
  Mitigation: 复用生产 parser 或共享解析模块，并增加未知事件/非法事件的回归测试。

- [Risk] token 汇总继续依赖开发态 trace store，导致测试环境没有 trace 时误判失败。
  Mitigation: 将 token usage 降级为可选诊断，报告明确来源和缺失状态，不影响 flow 判定。
