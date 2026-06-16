## 1. Fixture 数据源

- [x] 1.1 新增 `manual-tests/llm/fixtures/basic-chat-blackbox-cases.json`，从现有 Markdown 用例迁移 flow、turn、userInput 和 expectedOutput。
- [x] 1.2 将 `basic-chat-fixtures.ts` 改为默认读取 JSON fixture，并用确定性校验替代 Markdown 表格解析。

## 2. Runner 与报告合同

- [x] 2.1 将 `BasicChatFlow.turns` 从固定三轮调整为非空 turn 数组，并让 runner 按 JSON 顺序执行任意轮次。
- [x] 2.2 保留 `--flow` 筛选、首轮失败后跳过同 flow 后续轮次、报告 expected output 展示和实际 turn 数统计。

## 3. 测试与文档

- [x] 3.1 更新普通自动化测试，覆盖 JSON fixture 解析、必填字段校验、重复 id、可变轮次和报告安全输出。
- [x] 3.2 更新 `docs/manual-llm-basic-blackbox-tests.md`，说明 JSON fixture 是默认执行来源，Markdown 文档不再作为执行数据源。

## 4. 验证

- [x] 4.1 运行 `npm test -- tests/manual-llm-basic-blackbox.test.ts`。
- [x] 4.2 运行 `npm run typecheck`。
- [x] 4.3 运行 `openspec validate add-json-basic-llm-blackbox-fixtures --strict`。
