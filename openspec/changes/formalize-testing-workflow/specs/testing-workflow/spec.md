## ADDED Requirements

### Requirement: Project Test Command

项目 MUST 提供可通过 `npm test` 执行的正式测试入口，用于发现并运行项目内自动化测试。该命令 MUST 在测试失败时以非零退出码结束，并在测试通过时输出可读的通过结果。

#### Scenario: Run project tests

- **WHEN** 开发者在项目根目录执行 `npm test`
- **THEN** 系统运行已接入测试框架的测试用例
- **THEN** 任一测试失败时命令以非零退出码结束

#### Scenario: Missing test script is not acceptable

- **WHEN** 项目中存在自动化测试文件
- **THEN** `package.json` MUST 包含用于运行这些测试的 `test` script

### Requirement: Existing Logic Tests Are Migrated

现有 `tests/*.test.ts` 中的逻辑测试 MUST 迁移到正式测试框架中，测试断言 MUST 使用测试框架的断言 API，而不是依赖 `console.assert` 手写通过或失败状态。

#### Scenario: Workout plan tests are executable

- **WHEN** 开发者执行 `npm test`
- **THEN** 训练计划 Schema、动作候选筛选、风险过滤和保存结构转换相关测试会被自动执行

#### Scenario: Workout voice tests are executable

- **WHEN** 开发者执行 `npm test`
- **THEN** 训练语音 cue 和语音播报控制器相关测试会被自动执行

#### Scenario: Assertion failures fail the command

- **WHEN** 任一迁移后的测试断言不满足预期
- **THEN** 测试框架 MUST 报告失败用例
- **THEN** `npm test` MUST 返回非零退出码

### Requirement: Change Acceptance Includes Relevant Tests

后续 OpenSpec change 的实现验收 MUST 包含与改动范围相关的测试或验证步骤。`tasks.md` MUST 明确列出需要运行的命令或浏览器验证，并在最终交付中说明执行结果。

#### Scenario: Code change tasks include verification

- **WHEN** OpenSpec change 包含 TypeScript、React、API、Schema、AI 编排、训练规则或共享业务逻辑改动
- **THEN** 该 change 的 `tasks.md` MUST 包含 `npm run typecheck` 和相关自动化测试任务

#### Scenario: UI interaction changes include browser verification

- **WHEN** OpenSpec change 改变页面渲染、用户交互、训练执行流程或浏览器能力
- **THEN** 该 change 的 `tasks.md` MUST 包含真实 Chrome 验证任务
- **THEN** 验证任务 MUST 覆盖页面渲染、Console 报错、Network 请求失败和关键交互结果

#### Scenario: Unavailable checks are documented

- **WHEN** 某项相关检查因为环境、依赖、网络或外部服务限制无法运行
- **THEN** 最终交付 MUST 说明未运行的命令、失败原因和剩余风险

### Requirement: Verification Scope Matches Change Risk

项目 MUST 按改动类型选择验证范围，避免只运行无关检查，也避免把高风险改动仅用人工观察验收。

#### Scenario: Shared logic changes run automated tests

- **WHEN** change 修改 `lib/shared/*`、可测试的 `lib/server/*` 业务规则、Schema 或确定性工具函数
- **THEN** 验收 MUST 运行覆盖受影响逻辑的自动化测试

#### Scenario: Build boundary changes run build

- **WHEN** change 修改路由边界、Next.js 配置、依赖配置、服务端/客户端模块边界或构建相关文件
- **THEN** 验收 MUST 运行 `npm run build` 或说明无法运行的原因

#### Scenario: Lint-sensitive changes run lint

- **WHEN** change 修改导入边界、文件组织、React 组件结构或容易触发 lint 规则的源码
- **THEN** 验收 MUST 运行 `npm run lint` 或说明无法运行的原因
