## Why

基础首页聊天黑盒套件曾经作为独立手动入口存在，但在合并后清理旧黑盒入口时被一并删除，导致 `llm基础测试.md` 只剩人工用例文档，无法通过命令验证真实首页聊天链路。

同时，当前默认 Vitest discovery 中仍存在可在环境变量开启后真实调用 DeepSeek 的测试分支，这会让 `npm run test` 在特定环境下消费模型 token，不符合“所有真实模型 API 调用必须由开发者手动执行”的边界。

## What Changes

- 恢复基础首页聊天 LLM 黑盒手动套件，提供显式 `npm run test:llm:basic` 入口。
- 新增独立 `vitest.manual-llm.config.ts`，只发现 `manual-tests/llm/**/*.manual.test.ts`。
- 将真实模型调用测试彻底移出默认 `tests/**/*.test.ts`，默认 `npm run test` 永远不触发真实模型 API。
- 恢复基础黑盒 fixture、runner、judge、report 代码，使套件从 `llm基础测试.md` 读取三轮流程，并生成 Markdown 报告。
- 补回误删时遗漏的原 `add-llm-basic-chat-blackbox-tests` change 文档、默认 latest report 文件和架构边界扫描。
- 补充测试说明文档和 README 命令说明，明确 token 消耗、参数、报告路径、环境变量和默认测试隔离边界。
- 补充普通自动化测试，验证手动 LLM 文件不会被默认测试发现，且默认测试目录不包含真实模型调用开关。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `manual-llm-consistency-tests`: 恢复基础手动 LLM 黑盒入口，并强化默认测试不触发真实模型 API 的隔离要求。
- `chat-blackbox-llm-flow-tests`: 恢复首页聊天基础黑盒流程执行和报告生成，继续以用户可见输出作为验收对象。

## Impact

- 影响 `package.json`、`scripts/run-basic-llm-blackbox.mjs`、`vitest.manual-llm.config.ts`。
- 影响 `manual-tests/llm/**` 基础黑盒 runner、fixture、judge 和 report。
- 影响 `tests/**` 中的默认测试隔离断言和现有 DeepSeek fixture blackbox 测试边界。
- 影响 `openspec/changes/add-llm-basic-chat-blackbox-tests/**`，恢复误删前的原 change 审阅记录。
- 影响 `README.md` 和新增/恢复的手动 LLM 黑盒测试说明文档。
- 不改变生产 `/api/chat` 行为、Agent tool 合同、prompt 合同、数据库 schema 或用户可见产品流程。
