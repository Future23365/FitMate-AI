## Why

当前 LangChain Agent 的 prompt、tool description、schema description 和 tool result summary 已经承担大量模型可见合同，单靠黑盒真实模型结果很难判断问题来自 DeepSeek 行为波动，还是合同本身不清楚。

需要新增一个 dev-only 的 Codex Shadow LLM Probe，让 Codex 在隔离输入内扮演生产 LLM 决策方，逐轮说明 tool call / final 决策依据，并通过文件型 CLI 闭环实际推进工具执行和报告生成，用于定位模型可见合同的歧义、缺口和污染风险。

## What Changes

- 新增 `aitest-shadow-llm-probe` Codex skill：Codex 只能基于 runner 导出的模型可见输入做 Shadow LLM 决策，并输出结构化决策、证据和污染审计。
- 新增 shadow input / decision / report 的共享类型和 Zod schema，作为 CLI、skill 文档和测试的稳定文件合同。
- 新增 dev-only shadow input exporter：从生产 prompt、tool catalog、tool description、schema description、finalization tool 和模型可见预算装配入口导出首轮输入。
- 新增 dev-only shadow runner：接收 Codex 决策，确定性校验 tool 可用性和 input schema，执行真实 dev-safe tool handler，再生成下一轮模型可见输入。
- 新增完整文件型诊断闭环：以 `codex_logs/shadow_llm_probe/<runId>/` 下的输入、决策、tool result 和报告文件完成多轮推进，不接 UI。
- 新增报告生成能力：逐轮记录 Codex 看到的事实、调用理由、参数来源、tool result 消费方式、停止条件和合同问题归因。
- 新增自动化测试：覆盖输入白名单、决策 schema、runner 校验、dev-safe tool 推进、报告生成和生产隔离边界。
- 保持生产 `/api/chat`、DeepSeek provider 调用、LangChain runtime、业务 tool handler、数据库事实和用户可见 NDJSON 输出不变。
- 不新增服务端自然语言分流，不让 Codex skill 成为生产 LLM provider，不把 debug-only trace 或源码实现暴露给 Shadow 决策阶段。

## Capabilities

### New Capabilities

- `codex-shadow-llm-probe`: 定义 Codex Shadow LLM Probe 的隔离输入、结构化决策、真实 tool 执行推进、污染审计和报告输出合同。

### Modified Capabilities

- 无。

## Impact

- 新增项目级 Codex skill，路径为 `.codex/skills/aitest-shadow-llm-probe/`。
- 新增 dev-only runner / helper 脚本，用于导出 shadow input、校验 Codex decision、执行真实 tool handler、推进 loop 和生成报告。
- 新增 `codex_logs/shadow_llm_probe/**` 诊断输出，默认不进入生产数据流。
- 新增普通自动化测试，验证 input 白名单、decision schema、污染审计、tool 执行推进、报告生成和生产隔离。
- 本 change 的完整交付范围是不接 UI 的 CLI / 文件闭环；不要求启动 dev server，不接 `/dev/ai-traces` 或 `/dev/llm-blackbox` UI。UI 集成可作为后续 change 单独处理。
