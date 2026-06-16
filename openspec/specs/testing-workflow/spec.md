# testing-workflow Specification

## Purpose
TBD - created by archiving change formalize-testing-workflow. Update Purpose after archive.
## Requirements
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

#### Scenario: Expanded tests are discovered

- **WHEN** `expand-test-coverage` 已新增测试文件
- **THEN** `npm test` MUST 自动发现并运行这些新增测试

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

### Requirement: High-risk database refactor audit gate
项目 MUST 对破坏性数据库重构提供独立验收门禁。该门禁 MUST 在实现完成后执行，并且 MUST 覆盖静态检查、自动化测试、构建检查、日志排查和缺陷修复回归。

#### Scenario: Destructive database refactor completes
- **WHEN** change 删除或替换 Prisma 核心业务模型
- **THEN** 后续验收 MUST 包含独立排查任务
- **AND** 排查任务 MUST 明确旧模型残留扫描、Prisma 验证、测试矩阵、构建检查和 bug 修复闭环
- **AND** 仅运行 `npm run typecheck` 或 `npm run build` MUST NOT 视为充分验收

#### Scenario: Audit check fails
- **WHEN** 任一排查命令或测试失败
- **THEN** 实现者 MUST 定位根因并修复
- **AND** 修复后 MUST 重新运行失败命令及其相关上游或下游检查
- **AND** 最终交付 MUST 记录失败、修复和重新验证结果

#### Scenario: Check cannot run
- **WHEN** 某项检查因为环境、权限、依赖、数据库或外部服务限制无法运行
- **THEN** 最终交付 MUST 记录未运行命令的原始错误或限制原因
- **AND** 最终交付 MUST 说明该缺口带来的剩余风险
- **AND** 实现者 MUST 尽量运行可替代的较低层检查，但不能把替代检查描述为完全等价

### Requirement: Runtime log review for refactor regressions
项目 MUST 在数据库重构排查中使用现有日志文件定位运行时问题。

#### Scenario: Terminal or runtime error appears
- **WHEN** 排查期间出现终端报错、编译失败、启动失败或运行时报错
- **THEN** 实现者 MUST 读取 `codex_logs/error_log.js`
- **AND** 实现者 MUST 根据真实错误链路定位问题

#### Scenario: AI generated workout flow behaves unexpectedly
- **WHEN** AI 草稿生成、保存、动作 id 校验或 trace 关联行为不符合预期
- **THEN** 实现者 MUST 读取 `codex_logs/ai_trace_log.js`
- **AND** 实现者 MUST 区分 AI 输出问题、服务端校验问题和前端保存问题

### Requirement: Agent 模型可见合同高风险变更必须运行通用门禁
项目 SHALL 要求高风险 Agent / model-visible contract 变更在验收中运行通用合同门禁，验证模型实际可见输入没有重引入旧字段、旧 workflow 提示或同类换名规则。

#### Scenario: 高风险 Agent 合同变更验收
- **WHEN** OpenSpec change 修改 Agent 主链路、LangChain runtime、production tool catalog、批量 tool wrapper、批量 model-visible summary、system prompt、outputContracts、repair feedback、finalization tool description 或 trace summary
- **THEN** `tasks.md` MUST 包含 Agent model-visible contract gate
- **AND** 验收 MUST 覆盖白名单 summary schema、production tool catalog contract tests、模型可见文本 linter 和历史禁止项补充扫描

#### Scenario: 固定黑名单不能作为充分验收
- **WHEN** change 只添加了固定字段名或固定短语的 `not.toContain` 断言
- **THEN** 该验证 MUST NOT 被视为 Agent model-visible contract gate 的完整实现
- **AND** 验收 MUST 证明同类换名字段、同类工作流指导和同类 case-specific 生产规则也会失败

#### Scenario: 门禁无法运行
- **WHEN** Agent model-visible contract gate 因环境、依赖、数据库 fixture、外部服务或生产 catalog 初始化限制无法运行
- **THEN** 最终交付 MUST 说明未运行命令、原始限制原因和剩余风险
- **AND** 实现者 MUST 尽量运行可替代的较低层 schema / linter / catalog 静态检查
- **AND** 替代检查 MUST NOT 被描述为完全等价于完整 Agent model-visible contract gate

### Requirement: Basic LLM Blackbox Uses JSON Fixtures

基础 LLM 黑盒测试 SHALL 使用结构化 JSON fixture 作为默认执行用例来源。JSON fixture MUST 显式声明 flow id、流程目标、按顺序执行的 turn 列表、每轮用户输入和每轮期望输出说明。Markdown 说明文档 MUST NOT 作为基础黑盒命令的默认执行数据源。

#### Scenario: Default command reads JSON fixture

- **WHEN** 开发者执行 `npm run test:llm:basic`
- **THEN** 系统从默认 JSON fixture 读取 flow 和 turn
- **THEN** 系统不从 `docs/LLM基础测试用例.md` 解析执行用例

#### Scenario: JSON fixture validates required fields before model calls

- **WHEN** 默认 JSON fixture 缺少 `flows`、flow `id`、flow `goal`、flow `turns`、turn `userInput` 或 turn `expectedOutput`
- **THEN** 基础黑盒测试 MUST 在真实模型调用前失败
- **THEN** 失败报告 MUST 标明 fixture 解析或校验错误

#### Scenario: Variable turn counts are supported

- **WHEN** JSON fixture 中某个 flow 配置一个或多个 turn
- **THEN** 基础黑盒 runner MUST 按 JSON 中的 turn 顺序执行该 flow
- **THEN** 报告 MUST 使用实际 turn 数统计完整 turn 数和执行 turn 数

#### Scenario: Flow filtering remains available

- **WHEN** 开发者执行 `npm run test:llm:basic -- --flow <id>`
- **THEN** 系统 MUST 只执行 JSON fixture 中匹配的 flow
- **THEN** 未知 flow id MUST 在真实模型调用前失败

#### Scenario: Expected output remains report metadata

- **WHEN** JSON fixture 提供 `expectedOutput`
- **THEN** 报告 MUST 展示该期望输出说明
- **THEN** 基础黑盒命令 MUST NOT 因为 `expectedOutput` 与模型回复语义不完全一致而自动失败

### Requirement: Dev LLM Blackbox Reviewer Page

项目 SHALL 提供开发态 LLM 黑盒审核页，用于读取基础 LLM 黑盒 JSON fixture、执行单个或全部 flow，并展示每轮真实用户可见结果。该页面 MUST 只在开发态或显式开启开发诊断能力时可访问。

#### Scenario: Reviewer loads JSON fixture

- **WHEN** 开发者打开 `/dev/llm-blackbox`
- **THEN** 页面 MUST 展示 JSON fixture 中的 flow 列表、flow 目标和 turn 数
- **AND** 页面 MUST 显示每个 turn 的 `userInput` 和 `expectedOutput`

#### Scenario: Reviewer is unavailable outside dev diagnostics

- **WHEN** 应用运行在 production 且未显式开启开发诊断能力
- **THEN** `/dev/llm-blackbox` MUST 不向普通用户展示审核页面
- **AND** 相关 fixture / run API MUST 不暴露测试用例或运行结果

### Requirement: Reviewer Can Run Single Or All Flows

开发态审核页 SHALL 支持运行单个 flow 和串行运行全部 flow。runner MUST 按 fixture 中的 `turns[]` 顺序发送用户消息，并等待当前 turn 的 `/api/chat` NDJSON stream 收到 `done` 后再发送下一轮。

#### Scenario: Run selected flow

- **WHEN** 开发者选择某个 flow 并点击运行
- **THEN** runner MUST 创建独立 run 记录
- **AND** runner MUST 按该 flow 的 `turns[]` 顺序发送消息
- **AND** runner MUST 在每个 turn 收到 `done` 后再进入下一 turn

#### Scenario: Run all flows

- **WHEN** 开发者点击运行全部 flow 并确认真实模型调用成本
- **THEN** runner MUST 串行执行 fixture 中全部 flow
- **AND** 每个 flow MUST 使用独立 conversation
- **AND** 一个 flow 的失败 MUST NOT 阻止后续 flow 开始执行

#### Scenario: Stop active run

- **WHEN** 开发者停止当前批次
- **THEN** runner MUST 取消正在进行的请求或在当前 turn 结束后停止队列
- **AND** 未执行的 flow / turn MUST 标记为 skipped 或 cancelled

### Requirement: Reviewer Records User-visible Turn Results

开发态审核页 SHALL 为每个 turn 记录用户可见结果。记录 MUST 包含用户输入、期望输出说明、assistant 用户可见文本、可见训练输出、建议提问、安全错误、事件类型、耗时、conversationId、responseMessageId 和 token / trace 诊断。

#### Scenario: Turn completes with visible answer

- **WHEN** `/api/chat` stream 返回 `done` 且当前 assistant message 存在用户可见回答面
- **THEN** turn execution status MUST 标记为 passed
- **AND** 页面 MUST 展示 assistant 文本、可见训练输出和建议提问

#### Scenario: Turn fails before visible answer

- **WHEN** 请求失败、NDJSON 解析失败、缺少 `done` 或没有任何用户可见回答面
- **THEN** turn execution status MUST 标记为 failed
- **AND** 页面 MUST 展示失败原因
- **AND** 同一 flow 后续依赖该上下文的 turn MUST 标记为 skipped

#### Scenario: Expected output remains review context

- **WHEN** fixture 中提供 `expectedOutput`
- **THEN** 页面 MUST 将其作为人工审核对照展示
- **AND** runner MUST NOT 因为模型回复和 `expectedOutput` 的语义差异自动判定失败

### Requirement: Reviewer Provides Temporary Run Storage And Statistics

开发态审核页 SHALL 暂存当前浏览器会话中的黑盒运行结果，并提供批次级统计。临时结果 MUST 可清空，且 MUST 有容量或数量上限，避免长期累积大段模型输出。

#### Scenario: Run result remains available during browser session

- **WHEN** 一个 flow 或批次执行完成
- **THEN** 页面 MUST 允许开发者重新选择该 run 并查看每个 flow / turn 的结果
- **AND** 刷新页面后 SHOULD 能恢复最近的临时 run 结果，除非开发者已清空结果或浏览器清理 session storage

#### Scenario: Reviewer shows summary statistics

- **WHEN** 页面存在一个或多个 run 结果
- **THEN** 页面 MUST 展示 flow 总数、turn 总数、执行通过数、执行失败数、跳过数、运行耗时和 token 诊断摘要
- **AND** 页面 MUST 区分自动执行状态和人工审核状态

#### Scenario: Reviewer stores manual review verdicts

- **WHEN** 开发者审核某个 flow 或 turn
- **THEN** 页面 MUST 支持记录人工审核状态，例如 unreviewed、accepted、rejected 或 needs_followup
- **AND** 人工审核状态 MUST 独立于自动执行状态保存

### Requirement: Reviewer Stays Decoupled From Homepage Shell

开发态审核页 SHALL 复用稳定的聊天事件解析、消息投影和只读消息展示组件，但 MUST NOT 依赖首页整页、输入框、侧栏、欢迎态、滚动容器、CSS selector 或 DOM 自动点击来运行用例。

#### Scenario: Runner sends messages headlessly

- **WHEN** runner 执行某个 turn
- **THEN** 它 MUST 通过共享 chat client / NDJSON parser 调用真实 `/api/chat`
- **AND** 它 MUST NOT 通过查找首页输入框、点击首页按钮、iframe 内页面或 DOM selector 来发送消息

#### Scenario: Reviewer reuses message rendering only

- **WHEN** 页面展示某轮结果
- **THEN** 它 MUST 复用首页聊天的消息内容、Markdown 和 visible output 渲染组件或等价共享组件
- **AND** 它 MUST NOT 复用首页 header、sidebar、欢迎态、输入框、焦点管理或整页滚动逻辑作为运行依赖

#### Scenario: Homepage layout changes do not break reviewer execution

- **WHEN** 首页调整 shell layout、导航、欢迎态、输入框位置或快捷问题入口
- **THEN** reviewer 的自动发送、等待 `done`、结果记录和统计 MUST 不需要修改
- **AND** 只有共享消息展示合同变化时，首页和 reviewer 才需要一起调整

### Requirement: Reviewer Verification Covers Boundaries

实现该审核页时 SHALL 提供自动化测试和手动验证，证明 JSON fixture、headless runner、消息投影、统计和解耦边界按预期工作。

#### Scenario: Automated tests cover runner state machine

- **WHEN** 实现完成
- **THEN** 自动化测试 MUST 覆盖单 flow、多 flow、失败后跳过、停止运行、统计计算和临时存储恢复

#### Scenario: Automated tests cover shared rendering boundary

- **WHEN** 实现完成
- **THEN** 自动化测试 MUST 证明 reviewer 不导入首页整页 `ChatPage` 作为运行依赖
- **AND** 测试 MUST 覆盖消息展示组件能够渲染 assistant 文本、visible outputs 和 suggested questions

#### Scenario: Browser verification covers dev review page

- **WHEN** 实现完成且本地已有可用 dev server
- **THEN** 验证 MUST 覆盖 `/dev/llm-blackbox` 页面加载、单 flow 运行、全部 flow 队列启动和停止、结果详情查看、统计展示和临时结果清空
- **AND** 如果无法使用真实浏览器验证，最终交付 MUST 说明原因和剩余风险

