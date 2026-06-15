## ADDED Requirements

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
