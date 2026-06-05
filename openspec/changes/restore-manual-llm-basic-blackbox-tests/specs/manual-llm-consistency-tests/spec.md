## ADDED Requirements

### Requirement: 默认自动化测试不得触发真实模型 API

项目 SHALL 保证默认自动化测试入口不会在任何环境变量组合下真实调用外部模型 API。所有会消费模型 token 的测试 MUST 只能通过显式手动 LLM 测试命令进入。

#### Scenario: 默认 npm test 永不调用真实模型

- **WHEN** 开发者在项目根目录执行 `npm run test`
- **THEN** 系统 MUST 只发现并运行普通自动化测试
- **AND** 系统 MUST NOT 运行任何会调用 DeepSeek、OpenAI 或其他外部模型 API 的测试体
- **AND** 即使环境中存在 `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`、`RUN_DEEPSEEK_BLACKBOX=1` 或其他模型相关变量，系统也 MUST NOT 因默认测试而消费模型 token

#### Scenario: 真实模型测试必须位于手动入口

- **WHEN** 项目新增或保留任何真实模型测试
- **THEN** 该测试文件 MUST 位于默认 Vitest include 之外
- **AND** 该测试 MUST 通过专用手动命令和独立 Vitest config 运行
- **AND** 默认测试目录中的测试 MAY 检查手动入口配置，但 MUST NOT 包含真实模型调用分支

### Requirement: 基础 LLM 黑盒测试必须提供手动命令入口

项目 SHALL 提供独立的基础首页聊天 LLM 黑盒手动命令，使开发者能在明确承担 token 成本时运行真实模型测试。

#### Scenario: 手动命令运行基础黑盒

- **WHEN** 开发者执行 `npm run test:llm:basic`
- **THEN** 系统 MUST 使用独立 manual Vitest config 运行 `manual-tests/llm/**/*.manual.test.ts`
- **AND** 系统 MUST 读取项目环境变量配置真实聊天模型和 judge 模型
- **AND** 系统 MUST 在开始真实模型调用前输出本次运行范围和粗略 token 预估

#### Scenario: 手动命令支持 flow 筛选

- **WHEN** 开发者执行 `npm run test:llm:basic -- --flow F01` 或 `npm run test:llm:basic -- --flow F01,F02`
- **THEN** 系统 MUST 只运行指定 flow id
- **AND** 指定不存在的 flow id 时系统 MUST 在真实模型调用前失败
- **AND** 报告 MUST 记录本次 flow 筛选条件

#### Scenario: 手动命令支持报告路径

- **WHEN** 开发者执行 `npm run test:llm:basic -- --report <path>`
- **THEN** 系统 MUST 将本次 Markdown 报告写入指定路径
- **AND** 未指定时系统 MUST 写入 `docs/manual-llm-basic-blackbox-latest-report.md`

#### Scenario: 缺少模型配置时不静默降级

- **WHEN** 开发者执行 `npm run test:llm:basic` 但缺少 `DEEPSEEK_API_KEY`
- **THEN** 系统 MUST 明确输出缺失配置
- **AND** 系统 MUST NOT 使用 mock、旧快照或非真实模型结果替代
- **AND** 系统 MUST 生成或保留清晰的跳过/配置失败报告
