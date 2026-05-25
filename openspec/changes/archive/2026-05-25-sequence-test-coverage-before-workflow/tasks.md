## 1. 重复内容核对与调整

- [x] 1.1 对比 `expand-test-coverage` 和 `formalize-testing-workflow` 的 proposal、design、spec 和 tasks。
- [x] 1.2 标记两个 change 中关于 `npm test`、测试 runner、验证命令和 Chrome DevTools MCP 验收规则的重复内容。
- [x] 1.3 标记两个 change 中关于测试覆盖范围、fixture、测试文件清单和现有手写测试迁移的职责边界。
- [x] 1.4 在 `expand-test-coverage` 中保留测试用例范围、fixture、覆盖优先级和具体测试文件任务。
- [x] 1.5 在 `formalize-testing-workflow` 中保留测试框架、runner、`npm test`、现有手写测试迁移和验收流程任务。
- [x] 1.6 删除或改写重复职责表述，确保两个 change 不同时定义 runner，也不同时扩展详细测试覆盖清单。
- [x] 1.7 将文档中的实施顺序统一为先完成 `expand-test-coverage`，再完成 `formalize-testing-workflow`。
- [x] 1.8 去掉 `expand-test-coverage` 对 `formalize-testing-workflow` 必须先完成的硬前置依赖表述。
- [x] 1.9 在 `formalize-testing-workflow` 中说明：runner 和 `npm test` 必须自动发现并运行 `expand-test-coverage` 新增测试。

## 2. 先执行补测试用例

- [x] 2.1 按 `expand-test-coverage` 的 tasks 补充 fixture、共享领域逻辑测试、服务层测试、API 边界测试和前端业务逻辑测试。
- [x] 2.2 如果此阶段 `npm test` 尚未接入，记录新增测试等待后续 runner 承接的文件和原因。
- [x] 2.3 运行当前可用的静态检查；如测试无法统一执行，记录无法执行的命令和剩余风险。
- [x] 2.4 确认 `expand-test-coverage` 的任务结果已能被后续 `formalize-testing-workflow` 接管。

## 3. 再执行测试流程接入

- [x] 3.1 按 `formalize-testing-workflow` 的 tasks 接入测试框架、测试配置和 `npm test`。
- [x] 3.2 迁移既有手写测试，并将 `expand-test-coverage` 新增测试纳入同一 runner。
- [x] 3.3 更新 README 或工程说明，记录测试命令和后续验收规则。
- [x] 3.4 运行 `npm test`，确认迁移测试和新增测试都能被发现并执行。

## 4. 最终验收

- [x] 4.1 运行 `openspec validate "expand-test-coverage" --strict`。
- [x] 4.2 运行 `openspec validate "formalize-testing-workflow" --strict`。
- [x] 4.3 运行 `openspec validate "sequence-test-coverage-before-workflow" --strict`。
- [x] 4.4 运行最终项目检查：`npm test`、`npm run typecheck`、`npm run lint`，并在涉及构建边界时运行 `npm run build`。
- [x] 4.5 最终交付说明两个原 change 的重复点、处理方式、实际执行顺序和所有验证结果。
