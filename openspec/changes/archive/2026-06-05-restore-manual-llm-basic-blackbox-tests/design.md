## Context

当前 `package.json` 只保留 `npm run test`，并且 `scripts/run-tests.mjs` 直接把参数转交给默认 Vitest。默认 Vitest 只 include `tests/**/*.test.ts`，这本来可以隔离手动 LLM 测试；但基础首页聊天黑盒套件在合并后被删除，`llm基础测试.md` 只剩文档，不能执行。

另一个问题是默认测试目录中仍有 `tests/agent-core/deepseek-fixture-blackbox.test.ts`。它平时只跑 precondition，但当 `RUN_DEEPSEEK_BLACKBOX=1` 和 `DEEPSEEK_API_KEY` 同时存在时会真实调用模型。用户明确要求：每次需求完成后的自动化验证不能真实消费 token，所有模型 API 调用必须由手动命令触发。

## Goals / Non-Goals

**Goals:**

- 恢复基础首页聊天黑盒手动入口，命令为 `npm run test:llm:basic`。
- 保持默认 `npm run test` 只运行普通自动化测试，任何环境变量组合都不能让它真实调用模型 API。
- 让基础黑盒从 `llm基础测试.md` 动态读取三轮流程，支持按 flow id 筛选和自定义报告路径。
- 每次手动运行生成固定 Markdown 报告，包含运行范围、预计 token、真实 token、用户可见输出和失败摘要。
- 补充说明文档，明确命令、参数、环境变量、报告路径、token 成本边界和默认测试隔离。

**Non-Goals:**

- 不恢复已经删除的完整/详细 LLM 黑盒套件。
- 不修改生产 `/api/chat`、Agent runtime、tool schema、prompt 或数据库结构。
- 不把黑盒 judge 的语义判断升级为生产规则，也不新增服务端关键词分流。

## Decisions

### Decision 1: 手动 LLM 测试使用独立目录和独立 Vitest config

恢复 `manual-tests/llm/**/*.manual.test.ts`，并新增 `vitest.manual-llm.config.ts` 只 include 手动目录。`npm run test:llm:basic` 通过 `scripts/run-basic-llm-blackbox.mjs` 指定 manual config 和 manual test 文件。

这样比把测试放进 `tests/` 后再用环境变量 skip 更清晰：默认 test discovery 根本看不到真实模型测试，避免自动化环境因为环境变量泄漏而消费 token。

### Decision 2: 默认测试目录不得包含真实模型调用分支

`tests/agent-core/deepseek-fixture-blackbox.test.ts` 中真实 DeepSeek 调用分支迁出默认测试目录，保留普通单测只验证默认隔离和配置边界。需要真实模型验证时，通过手动 LLM 命令或后续明确的手动 Agent fixture 命令执行。

这比保留 `RUN_DEEPSEEK_BLACKBOX=1` opt-in 更符合用户要求，因为 `npm run test` 是 Codex 完成任务后的常规自动化验证入口，不能受环境变量影响而消耗 token。

### Decision 3: 基础黑盒 runner 只走首页公开请求合同

runner 通过 `/api/chat` Route Handler 执行，构造字段限定为 `conversationId`、`responseMessageId`、`latestUserMessage`、`conversationSummary`、`conversationContext` 和 `thinkingEnabled`。它不向请求中注入完整历史 `messages`、planner override、tool override 或 runtime state。

这样可以复用当前生产 NDJSON 解析和鉴权边界，同时避免测试获得首页客户端没有的额外上下文能力。

### Decision 4: Judge 只看用户可见输出

基础黑盒 judge 使用真实 DeepSeek，但输入只包含 flow id、目标、轮次、用户输入、文档期望、assistant 最终文本、可见输出类型、安全错误文案、建议和确认请求摘要。报告可以记录 trace id 或 token usage 作为诊断，但不把内部 tool result、prompt、raw payload 当成通过条件。

这保持黑盒测试目的：验证用户最终看到的回复和可见训练输出是否符合 `llm基础测试.md`。

### Decision 5: 文档说明必须直接服务手动使用

新增 `docs/manual-llm-basic-blackbox-tests.md`，README 只放简短入口和边界。详细文档列出命令、参数、环境变量、默认报告路径、失败时如何重跑、以及为什么默认 `npm run test` 不会触发真实模型。

### Decision 6: 原 change 记录按误删前状态恢复，代码以当前链路为准

误删前的 `add-llm-basic-chat-blackbox-tests` change 文档属于已经审阅过的需求和任务记录，应恢复到删除前状态，避免 OpenSpec 列表出现空 change。实现代码如果已经由当前恢复入口补齐，则不回滚到旧上下文；只补遗漏的 latest report 文件和架构扫描，继续以当前 `/api/chat`、manual Vitest 隔离和报告时间格式为准。

## Risks / Trade-offs

- [Risk] 恢复历史 runner 可能与当前 Agent 文本聊天链路存在局部类型漂移。→ Mitigation: 只保留与当前 `/api/chat` 和 NDJSON client 兼容的字段，并补普通单测覆盖请求体、parser、报告和隔离边界。
- [Risk] 手动真实模型测试可能因本地数据库、匿名 auth 或 `DEEPSEEK_API_KEY` 不满足而失败。→ Mitigation: runner 在模型调用前输出 preflight/配置失败报告，并在文档中列出环境要求。
- [Risk] Judge 本身也会消耗 token。→ Mitigation: 入口命名、文档和报告都明确这是手动命令；默认 `npm run test` 和 Codex 自动验证不运行该套件。
- [Risk] 只恢复基础套件会低于历史详细套件覆盖。→ Mitigation: 本 change 只解决基础黑盒入口丢失和默认测试隔离；详细套件后续单独恢复或重建。
