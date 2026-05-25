## ADDED Requirements

### Requirement: Test Changes Have Explicit Execution Order

项目 MUST 明确 `expand-test-coverage` 和 `formalize-testing-workflow` 的实施顺序。实施顺序 MUST 为先完成 `expand-test-coverage`，再完成 `formalize-testing-workflow`。

#### Scenario: Coverage change runs first

- **WHEN** 两个测试相关 change 都处于待实施状态
- **THEN** 实施计划 MUST 先执行 `expand-test-coverage`
- **THEN** 实施计划 MUST 后执行 `formalize-testing-workflow`

#### Scenario: Sequencing documentation is consistent

- **WHEN** 文档提到两个测试 change 的依赖关系
- **THEN** 文档 MUST 与“先 `expand-test-coverage`，后 `formalize-testing-workflow`”保持一致

### Requirement: Test Change Responsibilities Are Separated

项目 MUST 将测试覆盖范围和测试流程职责分开维护，避免两个 change 重复定义同一类需求。

#### Scenario: Coverage ownership

- **WHEN** 文档描述新增测试用例、测试文件清单、fixture、测试数据策略、服务层覆盖或 API 边界覆盖
- **THEN** 这些内容 MUST 归属 `expand-test-coverage`

#### Scenario: Workflow ownership

- **WHEN** 文档描述测试框架、runner、`npm test`、现有手写测试迁移、验收命令策略或 OpenSpec 验收流程
- **THEN** 这些内容 MUST 归属 `formalize-testing-workflow`

#### Scenario: Browser verification ownership

- **WHEN** 文档描述 Chrome DevTools MCP 真实浏览器验收规则
- **THEN** 通用验收规则 MUST 归属 `formalize-testing-workflow`
- **THEN** `expand-test-coverage` 只能列出需要浏览器验收的高风险页面或交互范围

### Requirement: Duplicate Content Is Reconciled

项目 MUST 对两个测试 change 中重复或冲突的说明进行归并或改写。归并 MUST 保留原始需求含义，不得扩大测试范围或新增实现方案。

#### Scenario: Runner duplication is removed

- **WHEN** `expand-test-coverage` 文档中出现测试 runner、`npm test` 或测试框架接入职责
- **THEN** 文档 MUST 将该职责改为由 `formalize-testing-workflow` 承接

#### Scenario: Coverage duplication is removed

- **WHEN** `formalize-testing-workflow` 文档中出现详细测试用例覆盖清单
- **THEN** 文档 MUST 将该职责改为由 `expand-test-coverage` 承接

#### Scenario: Conflicting dependency is removed

- **WHEN** `expand-test-coverage` 文档将 `formalize-testing-workflow` 描述为必须先完成的前置条件
- **THEN** 文档 MUST 改写为 `expand-test-coverage` 先实施，后续由 `formalize-testing-workflow` 统一承接 runner 和脚本执行

### Requirement: No Runtime Behavior Changes

本编排 change MUST 只修改 OpenSpec 文档和实施顺序说明，不得修改应用运行时代码、测试代码、依赖配置、`package.json` 或 API 契约。

#### Scenario: Documentation-only change

- **WHEN** 本 change 被实施
- **THEN** 改动 MUST 限于 OpenSpec 文档
- **THEN** 不得新增测试文件、安装依赖或修改应用源码

#### Scenario: Validation passes

- **WHEN** 本 change 文档完成
- **THEN** `openspec validate "sequence-test-coverage-before-workflow" --strict` MUST 通过
