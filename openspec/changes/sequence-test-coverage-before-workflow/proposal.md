## Why

当前同时存在 `expand-test-coverage` 和 `formalize-testing-workflow` 两个测试相关 change：前者定义补哪些测试用例，后者定义测试 runner、`npm test` 和验收流程。两者在验证命令和浏览器验收规则上有少量重叠，并且 `expand-test-coverage` 现有文档写了依赖 `formalize-testing-workflow` 先完成，和当前要求的“先完成补测试用例，再完成补测试流程”顺序不一致。

## What Changes

- 新增一个编排型 change，明确两个测试 change 的执行顺序：先完成 `expand-test-coverage`，再完成 `formalize-testing-workflow`。
- 明确两个 change 的职责边界：`expand-test-coverage` 负责测试用例范围、fixture、覆盖优先级和具体测试文件；`formalize-testing-workflow` 负责测试框架、脚本、runner、验收命令和流程文档。
- 处理重复点：避免两个 change 都同时定义测试 runner 或都重复扩展测试覆盖范围。
- 调整既有文档中的依赖表述，去掉 `expand-test-coverage` 对 `formalize-testing-workflow` 先完成的硬依赖。
- 不新增业务测试用例、不接入测试框架、不改变业务代码；本 change 只处理执行顺序和需求文档一致性。

## Capabilities

### New Capabilities

- `test-change-sequencing`: 约束测试用例补充 change 与测试流程接入 change 的执行顺序、职责边界和重复内容处理方式。

### Modified Capabilities

无。

## Impact

- 影响 `openspec/changes/expand-test-coverage/*` 和 `openspec/changes/formalize-testing-workflow/*` 的说明性文档一致性。
- 可能调整 `expand-test-coverage` 中关于 `formalize-testing-workflow` 前置依赖的表述。
- 不影响应用运行时代码、测试代码、`package.json`、依赖安装或 API 契约。
