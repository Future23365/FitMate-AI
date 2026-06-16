## Context

基础 LLM 黑盒测试当前通过 `basic-chat-fixtures.ts` 解析 `docs/LLM基础测试用例.md` 中的 Markdown 表格。这个实现把可执行测试数据放在说明文档里，并通过固定列名隐式限定每个 flow 必须有三轮。用户需要把轮次、输入和期望输出配置到 JSON 文件中，让测试从结构化 fixture 读取。

当前基础黑盒的自动验收口径保持为冒烟测试：请求能完成、收到 `done`、会话保存成功，并存在用户可见回答面。`expectedOutput` 暂时保留为报告字段和后续人工复核依据，不在本次改动中升级为语义自动 judge。

## Goals / Non-Goals

**Goals:**

- 使用 JSON fixture 作为基础 LLM 黑盒测试的默认执行数据源。
- 支持每个 flow 配置任意正整数轮次，runner 按 `turns` 顺序执行。
- 对 JSON fixture 做确定性结构校验，避免缺少 id、goal、turns、userInput 或 expectedOutput 时进入真实模型调用。
- 保留现有 `--flow` 筛选和 Markdown 报告输出能力。
- 更新文档和普通自动化测试，明确新的用例来源和可变轮次合同。

**Non-Goals:**

- 不新增真实浏览器或 HTTP server 级 E2E 测试。
- 不改变 `/api/chat` 生产链路、LangChain runtime、tool calling 或模型可见 prompt。
- 不把 `expectedOutput` 升级为自动语义判分，不新增第二个 judge 模型。
- 不继续让 Markdown 文档作为默认执行用例来源。

## Decisions

### JSON fixture 放在 `manual-tests/llm/fixtures`

默认 fixture 路径使用 `manual-tests/llm/fixtures/basic-chat-blackbox-cases.json`。测试数据属于手动测试资产，不再放在 `docs/` 下；说明文档只描述如何维护和运行测试。

备选方案是继续放在 `docs/` 下并改成 JSON，但这会延续“文档目录承载可执行数据”的边界混乱。

### 解析层保留统一 fixture 模型

`BasicChatFlow` 继续作为 runner 的内部模型，但 `turns` 从固定三元组调整为非空数组。JSON 字段使用 `expectedOutput`，解析后映射到现有报告侧的 `expectation` 字段，降低报告渲染和 runner 代码的扩散改动。

### 校验采用本地确定性校验

fixture 解析层检查：

- 根对象必须包含 `flows` 数组。
- 每个 flow 必须有非空 `id`、`goal` 和非空 `turns`。
- flow id 不允许重复。
- 每个 turn 必须有非空 `userInput` 和 `expectedOutput`。

本次不引入额外运行时依赖；校验错误沿用 `BasicChatFixtureParseError`，避免真实模型调用前出现不完整用例。

### 保持基础冒烟验收口径

JSON 中的 `expectedOutput` 替代 Markdown 表格中的“期望”列，继续进入报告供人工复核。基础命令仍只验证链路可用性，不因为语义偏差自动失败。

## Risks / Trade-offs

- JSON 不适合写很长、多段的自然语言期望 → 通过 JSON 字符串保留文本，后续如需要可增加数组形式的 `expectedOutputChecks`。
- Markdown 到 JSON 迁移可能丢失用例内容 → 迁移后用普通测试校验 flow 数、关键 id、轮次总数和非空字段。
- 可变轮次会改变跳过逻辑 → 保留“第 1 轮失败后跳过同 flow 后续轮次”的规则，只是后续轮次不再假设最多两轮。
- 旧说明文档仍可能被误认为执行来源 → 更新 `docs/manual-llm-basic-blackbox-tests.md` 明确 JSON 是唯一默认执行来源。
