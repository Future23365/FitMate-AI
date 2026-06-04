## Context

根目录 `llm基础测试.md` 定义了首页聊天入口的 19 个三轮基础 flow，覆盖动作推荐、routine、plan、追问、引用、修改、边界收束和非健身话题切回等用户可见流程。当前 worktree 已没有 `manual-tests/llm` 和 `scripts/run-manual-llm-tests.mjs`，默认测试入口 `npm test` 只包含 `tests/**/*.test.ts`，因此本 change 需要新增一条隔离的手动 LLM 黑盒测试面，而不是沿用已删除的旧 runner。

现有首页聊天请求面是 `/api/chat`：前端通过 `latestUserMessage`、`conversationId`、`conversationSummary`、`conversationContext` 等字段发起请求，响应为 NDJSON 事件流。对这个 change 来说，`agent_progress`、`tool_result`、trace 和 runtime loop 都是中间过程；最终用户可见输出只由请求完成后的 assistant 文本内容和 `visible_output` 摘要构成。

## Goals / Non-Goals

**Goals:**

- 基于 `llm基础测试.md` 构建一套手动运行的基础 LLM 黑盒 flow，保持文档用例和 runner 覆盖一致。
- 逐轮模拟用户在首页聊天框输入，并在同一 flow 内继承上一轮最终聊天历史。
- 每轮只在 NDJSON `done` 或等价完成边界后判定最终 assistant 用户可见输出。
- 用结构化语义判定覆盖自然语言期望，避免用关键词、正则或内部事件替代用户可见验收。
- 输出可人工复核的 Markdown 报告，记录最终输出摘要、期望、判定结果、失败原因和 token 使用。
- 保持手动运行隔离，不影响 `npm test`、常规 CI 和无模型配置的本地开发。

**Non-Goals:**

- 不改 `/api/chat` 业务行为、Agent planner、tool manifest、response renderer 或训练生成规则。
- 不新增服务端自然语言关键词判断、同义词表、固定短句分流或测试专用业务 fallback。
- 不使用真实浏览器、Browser、Chrome DevTools、Playwright 或截图验证。
- 不把 stream chunk、Agent progress、tool execution、trace、raw model output 或旧 trigger 字段作为通过条件。
- 不要求每个期望都用确定性代码完全断言动作内容准确率；本套测试验收用户可见输出是否符合文档期望。

## Decisions

### 1. `llm基础测试.md` 是基础套件的源文档

实现应读取并解析根目录 `llm基础测试.md` 中“三轮流程用例”的 Markdown 表格，生成稳定的 flow fixture。每一行对应一个 flow，每个 flow 固定三轮；解析阶段需要校验 ID 唯一、三轮输入和三轮期望均存在、列名与预期一致。这样后续人工维护用例时，不需要在文档和代码 fixture 之间重复修改。

备选方案是手写一份 TypeScript fixture。这个方案更简单，但会让文档和测试很快漂移；本 change 更看重 `llm基础测试.md` 作为人工 review 入口的权威性。

### 2. runner 走聊天请求合同，不走内部 planner

runner 应复用 `/api/chat` 等价请求体和 NDJSON 解析逻辑，按 flow 顺序发送 `latestUserMessage`。同一个 flow 内保留已完成轮次的用户消息和 assistant 最终可见输出，用于下一轮上下文；不同 flow 使用新的 `conversationId`，避免互相污染。

如果直接调用 planner 或 tool handler，测试会变成白盒合同测试，无法覆盖 route 级请求校验、stream 投影和前端实际消费事件的组合风险。

### 3. 最终用户可见输出是唯一判定对象

每轮执行时可以解析 NDJSON，但只把以下内容归一化为最终输出：

- 所有 `content` 事件拼接后的 assistant 文本；
- 所有 `visible_output` 事件的用户可见类型、schemaVersion 和安全摘要；
- 请求错误或 stream 错误的用户安全错误信息。

`agent_progress`、`tool_result`、trace id、toolName、tool input / output、planner action、repair feedback、token diagnostics 和 raw payload 只允许进入调试报告的受控错误摘要，不得进入判定 prompt，也不得作为通过条件。

### 4. 用结构化 LLM judge 判定自然语言期望

`llm基础测试.md` 的期望是中文自然语言，例如“触发动作推荐卡片”“不直接生成随机卡片”“应追问或解释”。实现应使用独立的结构化 judge，对当前 flow 目标、轮次用户输入、该轮文档期望和最终用户可见输出做判定，输出固定 schema，例如 `passed`、`status`、`reason`、`matchedExpectations`、`missingExpectations`、`visibleOutputKinds`。

judge prompt 必须强调：只能依据最终用户可见输出判断；不得因为报告中缺少 tool / trace / progress 证据而判失败；不得要求文档未要求的动作精确 ID、组数、时长精确值或数据库内部字段。judge 输出必须经过 Zod 或 JSON Schema 校验，非法输出应记录为 judge 失败。

备选方案是关键词断言或完全人工读报告。关键词断言会把自然语言语义硬编码进测试；完全人工读报告则不能满足“判断最后 AI 输出”的自动化需求。

### 5. 手动命令和报告独立

新增专用命令建议为 `npm run test:llm:basic`，运行路径指向 `manual-tests/llm` 或等价目录。`vitest.config.ts` 现有默认 include 是 `tests/**/*.test.ts`，因此只要手动 LLM 文件不放入 `tests/`，默认 `npm test` 不会运行该套件。实现仍应补充隔离检查，防止后续配置变化把 `manual-tests/llm` 纳入默认测试。

报告应写入 `docs/manual-llm-basic-blackbox-latest-report.md` 或等价稳定路径，并使用上海时区时间。报告只保存用户输入、期望、最终回复摘要、最终可见输出类型、判定结果、失败原因、token 汇总和必要的请求错误摘要，不保存完整 prompt、完整模型 raw response、完整 tool payload 或大段 trace。

## Risks / Trade-offs

- [Risk] LLM judge 可能出现漂移或误判。
  Mitigation: 使用严格结构化输出、短上下文、明确判定规则，并在报告中保留最终输出摘要和 judge reason 供人工复核；后续可通过 flow 级重跑缩小复核范围。

- [Risk] Markdown 表格解析失败导致真实模型调用前才暴露问题。
  Mitigation: runner 必须先做 fixture preflight；表格缺列、空输入、空期望、重复 ID 或 flow 数不匹配时直接失败，不发起模型请求。

- [Risk] 真实模型和 judge 双重调用增加成本。
  Mitigation: 命令必须在运行前输出 flow/turn 数和 token 粗略预估，并支持只跑指定 flow；默认仍为手动命令，不进入自动测试。

- [Risk] 实现为了通过测试新增服务端语义分流。
  Mitigation: tasks 中加入架构扫描，确认 `/api/chat`、Agent core、tool handler 和 response renderer 未新增自然语言关键词、正则、同义词表或测试专用 fallback。
