## Why

当前项目的 LLM 提示词已经覆盖聊天意图解析、可见回复、动作推荐、训练计划意图抽取和训练草稿生成等多个分支，但缺少一套只在人工需要时运行的输入输出一致性测试。随着 prompt 和 AI 编排继续变化，需要用独立的手动测试保护关键输入、期望输出结构和分支语义，避免把真实模型调用混入 `npm run test`。

## What Changes

- 新增一套只针对 LLM 输入输出一致性的手动测试能力，覆盖当前所有 LLM 调用点和主要分支。
- 新增独立运行入口，要求只能由开发者手动执行，不能被 `npm run test` 自动发现或运行。
- 测试用例需要固定每个 LLM 调用的输入样例、期望输出结构、关键字段约束和失败判定。
- 测试应覆盖聊天意图解析、聊天可见回复、动作推荐、训练计划意图抽取、长期训练计划草稿生成和单次训练 routine 草稿生成。
- 不改变线上业务逻辑、API 契约、prompt 文案、模型选择或现有自动化测试 runner。

## Capabilities

### New Capabilities

- `manual-llm-consistency-tests`: 定义手动运行的 LLM 输入输出一致性测试，包括覆盖范围、运行边界、测试用例矩阵和验收方式。

### Modified Capabilities

- 无。

## Impact

- 可能新增 `tests/llm-*`、`scripts/*` 或等价的手动测试文件与运行脚本。
- 可能新增 `package.json` 中的手动脚本，例如 `npm run test:llm`，但该脚本不得被 `npm run test` 调用。
- 可能需要复用现有 prompt 配置、Schema、fixture、AI trace 或服务层类型来构造输入与校验输出。
- 需要文档化手动运行方式、环境变量要求、外部模型调用风险和结果判定标准。
