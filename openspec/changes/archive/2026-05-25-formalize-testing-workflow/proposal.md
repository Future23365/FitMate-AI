## Why

项目已经存在 `tests/` 目录和若干手写逻辑测试，但当前没有正式测试框架、`npm test` 脚本或统一的验收测试要求。随着 AI 编排、训练计划生成、训练执行页和动作库逻辑继续扩展，缺少可重复执行的测试流程会让回归风险集中到人工检查上。

## What Changes

- 接入正式测试流程，提供可通过 `npm test` 执行的项目级测试入口。
- 将既有手写 `console.assert` 测试迁移到正式测试框架下运行，并承接 `expand-test-coverage` 新增测试的统一执行入口。
- 明确后续 OpenSpec change 的实现验收必须包含与改动相关的测试执行记录。
- 明确不同类型改动应运行的验证命令，例如类型检查、lint、单元测试、构建或必要的浏览器验证。
- 不在本变更中改变业务行为、API 契约、AI 输出结构、数据库结构或用户流程。

## Capabilities

### New Capabilities

- `testing-workflow`: 约束项目测试脚本、测试组织方式、验收时必须运行的验证命令和 OpenSpec change 的测试记录要求。

### Modified Capabilities

无。

## Impact

- 影响 `package.json` 的 scripts 和开发依赖，用于提供正式测试命令。
- 影响 `tests/` 目录内现有逻辑测试的运行方式。
- 影响 `expand-test-coverage` 新增测试的执行方式：这些测试最终应被 `npm test` 自动发现并运行。
- 可能新增测试框架配置文件，例如 `vitest.config.ts` 或等价配置。
- 影响后续 OpenSpec change 的 `tasks.md` 编写要求：实现任务必须包含相关测试与验收检查。
- 不影响现有运行时功能、页面路由、API URL、Prisma Schema、AI prompt 或模型调用链路。
