## ADDED Requirements

### Requirement: 手动 LLM 测试必须支持详细套件入口

系统 SHALL 在保留默认基准测试和基础 LLM 黑盒测试的同时，提供显式详细 LLM 黑盒测试入口。

#### Scenario: 默认测试仍运行基准套件

- **WHEN** 开发者在项目根目录执行 `npm run test`
- **THEN** 系统 MUST 运行原有普通 Vitest 基准测试
- **AND** 系统 MUST NOT 运行真实模型 LLM 黑盒测试
- **AND** 系统 MUST NOT 因缺少 `DEEPSEEK_API_KEY` 或外部模型网络不可用而失败

#### Scenario: 详细参数运行详细 LLM 套件

- **WHEN** 开发者在项目根目录执行 `npm run test --detail`
- **THEN** 系统 MUST 运行详细 LLM 首页聊天黑盒测试
- **AND** 系统 MUST 使用真实模型测试入口
- **AND** 系统 MUST NOT 静默改用 mock、旧快照或非真实模型结果

#### Scenario: 基础 LLM 命令保持兼容

- **WHEN** 开发者执行 `npm run test:llm`
- **THEN** 系统 MUST 继续运行基础 LLM 首页聊天黑盒流程
- **AND** 系统 MUST NOT 自动升级为详细套件

### Requirement: 详细 LLM 套件必须扩展首页聊天能力覆盖

系统 SHALL 在详细 LLM 套件中覆盖比基础套件更完整的首页聊天流程能力。

#### Scenario: 详细套件包含基础套件

- **WHEN** 详细 LLM 套件被选择
- **THEN** 系统 MUST 包含基础 LLM 套件中的所有流程用例
- **AND** 系统 MUST 为每个流程保持 3 轮多轮对话结构

#### Scenario: 详细套件覆盖主要能力域

- **WHEN** 详细 LLM 套件运行
- **THEN** 系统 MUST 覆盖基础回复、动作推荐、单次训练、长期计划、多轮上下文、引用修改、安全边界和输出质量场景
- **AND** 系统 MUST 继续只断言用户可见文本、内部字段泄漏和卡片类型这些稳定黑盒结果

### Requirement: 详细 LLM 套件必须生成独立报告

系统 SHALL 为详细 LLM 套件生成独立报告，避免覆盖基础 LLM 测试报告。

#### Scenario: 详细套件报告独立写入

- **WHEN** 详细 LLM 套件运行结束
- **THEN** 系统 MUST 写入 `docs/manual-llm-blackbox-flow-detail-latest-report.md`
- **AND** 报告 MUST 标明当前运行的是详细套件
- **AND** 报告 MUST 包含流程用例数、轮次数、通过数、失败数、跳过数、预计 token 和真实 token 汇总

#### Scenario: 缺少模型配置时详细报告记录跳过

- **WHEN** 开发者执行 `npm run test --detail` 但缺少 `DEEPSEEK_API_KEY`
- **THEN** 系统 MUST 输出缺失配置名称
- **AND** 系统 MUST 生成详细套件跳过报告
- **AND** 系统 MUST 记录所有详细流程轮次被跳过

### Requirement: 测试模式边界必须清晰可追踪

系统 SHALL 明确区分默认基准测试、基础 LLM 黑盒测试和完整/详细 LLM 黑盒测试，避免开发者误读测试结果。

#### Scenario: 基础测试结果不得代表完整回归

- **WHEN** 开发者只执行 `npm run test:llm`
- **THEN** 系统 MUST 只运行基础 LLM 首页聊天黑盒流程
- **AND** 报告或说明文档 MUST NOT 表达为完整/详细套件已经通过
- **AND** 开发者 MUST 能从文档中确认完整/详细套件需要通过 `npm run test --detail` 单独执行

#### Scenario: 完整测试说明当前自动化边界

- **WHEN** 开发者查看详细 LLM 测试说明或 OpenSpec change 文档
- **THEN** 文档 MUST 说明详细套件覆盖 `LLM完整测试.md` 中的主要首页聊天能力域
- **AND** 文档 MUST 说明详细套件首版不等于 `LLM完整测试.md` 的所有流程和人工 UI 验收项已经全部自动化
- **AND** 文档 MUST 标出后续可继续补齐的方向，包括更真实的 HTTP/API runner、数据库 artifact 持久化链路和更细的语义断言

#### Scenario: 报告结果必须带有套件语义

- **WHEN** 任一手动 LLM 黑盒报告生成
- **THEN** 报告 MUST 能区分基础套件和详细套件
- **AND** 报告 MUST 让开发者看出该结果只代表最近一次运行
- **AND** 报告 MUST 保留 token 预估和真实 token 汇总，便于判断真实模型成本
