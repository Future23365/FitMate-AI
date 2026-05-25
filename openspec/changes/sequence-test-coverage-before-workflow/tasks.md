## 1. 重复内容核对

- [ ] 1.1 对比 `expand-test-coverage` 和 `formalize-testing-workflow` 的 proposal、design、spec 和 tasks。
- [ ] 1.2 标记两个 change 中关于 `npm test`、测试 runner、验证命令和 Chrome DevTools MCP 验收规则的重复内容。
- [ ] 1.3 标记两个 change 中关于测试覆盖范围、fixture、测试文件清单和现有手写测试迁移的职责边界。

## 2. 职责边界调整

- [ ] 2.1 在 `expand-test-coverage` 中保留测试用例范围、fixture、覆盖优先级和具体测试文件任务。
- [ ] 2.2 在 `formalize-testing-workflow` 中保留测试框架、runner、`npm test`、现有手写测试迁移和验收流程任务。
- [ ] 2.3 删除或改写重复职责表述，确保两个 change 不同时定义 runner，也不同时扩展详细测试覆盖清单。

## 3. 执行顺序调整

- [ ] 3.1 将文档中的实施顺序统一为先完成 `expand-test-coverage`，再完成 `formalize-testing-workflow`。
- [ ] 3.2 去掉 `expand-test-coverage` 对 `formalize-testing-workflow` 必须先完成的硬前置依赖表述。
- [ ] 3.3 在文档中说明：`expand-test-coverage` 第一阶段新增的测试由后续 `formalize-testing-workflow` 统一承接 runner 和脚本执行。

## 4. 验证

- [ ] 4.1 运行 `openspec validate "sequence-test-coverage-before-workflow" --strict`。
- [ ] 4.2 运行 `openspec status --change "sequence-test-coverage-before-workflow"`，确认 proposal、design、specs 和 tasks 均完成。
- [ ] 4.3 最终交付说明两个原 change 的重复点、处理方式和指定实施顺序。
