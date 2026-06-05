## 1. 手动黑盒入口

- [x] 1.1 恢复 `manual-tests/llm` 基础黑盒 fixture、runner、judge、report 和 `.manual.test.ts`。
- [x] 1.2 新增 `scripts/run-basic-llm-blackbox.mjs`，支持 `--flow`、`--report` 和 `--help`。
- [x] 1.3 新增 `vitest.manual-llm.config.ts`，只 include `manual-tests/llm/**/*.manual.test.ts`。
- [x] 1.4 在 `package.json` 新增 `test:llm:basic`，不修改默认 `test` 命令。

## 2. 默认测试隔离

- [x] 2.1 移除或迁出默认 `tests/**/*.test.ts` 中可触发真实模型 API 的测试分支。
- [x] 2.2 补充普通单测，验证默认 Vitest include 不包含 `manual-tests/llm`，且 `package.json` 默认 `test` 不指向手动 LLM 命令。
- [x] 2.3 补充普通单测，验证默认测试目录中不再存在 `RUN_DEEPSEEK_BLACKBOX` 这类真实模型 opt-in 执行分支。

## 3. 文档说明

- [x] 3.1 新增 `docs/manual-llm-basic-blackbox-tests.md`，说明命令、参数、环境变量、报告路径、token 成本和失败排查方式。
- [x] 3.2 更新 `README.md` 测试命令说明，明确 `npm run test` 不触发真实模型，`npm run test:llm:basic` 才会手动消费 token。
- [x] 3.3 在 `docs/方案变更历史` 和 `docs/项目演变历程.md` 记录本次测试入口恢复和默认测试隔离调整。

## 4. 验证

- [x] 4.1 运行 `npm run test -- tests/manual-llm-basic-blackbox.test.ts tests/agent-core/architecture-boundary.test.ts`，验证不触发真实模型的单测通过。
- [x] 4.2 运行 `npm run test`，确认默认自动化测试不会执行手动 LLM 黑盒。
- [x] 4.3 运行 `npm run test:llm:basic -- --help`，确认手动入口参数说明可用且不触发真实模型。
- [x] 4.4 运行 `openspec validate restore-manual-llm-basic-blackbox-tests --strict`。

## 5. 误删恢复补全

- [x] 5.1 恢复原 `add-llm-basic-chat-blackbox-tests` change 的 proposal、design、tasks、specs 和 `.openspec.yaml`，避免 OpenSpec 显示空 change。
- [x] 5.2 恢复 `docs/manual-llm-basic-blackbox-latest-report.md`，并按当前报告生成器使用 ISO `+08:00` 时间格式。
- [x] 5.3 恢复 `tests/agent-core/architecture-boundary.test.ts` 中基础 LLM 黑盒 fixture 不得泄漏进生产聊天、Agent core、tools 和 renderer 的架构扫描。
- [x] 5.4 重新运行相关普通测试和 `openspec validate`，确认补全后的两个 change 均可校验。
