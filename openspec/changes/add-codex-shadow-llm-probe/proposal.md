## Why

当前 LangChain Agent 的 prompt、tool description、schema description 和 tool result summary 已经承担大量模型可见合同，单靠黑盒真实模型结果很难判断问题来自 DeepSeek 行为波动，还是合同本身不清楚。

需要新增一个 dev-only 的 Codex Shadow LLM Probe，让 Codex 在隔离输入内扮演生产 LLM 决策方，逐轮说明 tool call / final 决策依据，用于定位模型可见合同的歧义、缺口和污染风险。

## What Changes

- 新增 `aitest-shadow-llm-probe` Codex skill 设计：Codex 只能基于 runner 导出的模型可见输入做 Shadow LLM 决策，并输出结构化决策、证据和污染审计。
- 新增 dev-only shadow runner 设计：导出生产模型可见输入，接收 Codex 决策，执行真实业务 tool handler，再生成下一轮模型可见输入。
- 新增文件型诊断闭环设计：先以 `codex_logs/shadow_llm_probe/<runId>/` 下的输入、决策和报告文件完成闭环，不接 UI。
- 新增报告设计：逐轮记录 Codex 看到的事实、调用理由、参数来源、tool result 消费方式、停止条件和合同问题归因。
- 保持生产 `/api/chat`、DeepSeek provider 调用、LangChain runtime、业务 tool handler、数据库事实和用户可见 NDJSON 输出不变。
- 不新增服务端自然语言分流，不让 Codex skill 成为生产 LLM provider，不把 debug-only trace 或源码实现暴露给 Shadow 决策阶段。

## Capabilities

### New Capabilities

- `codex-shadow-llm-probe`: 定义 Codex Shadow LLM Probe 的隔离输入、结构化决策、真实 tool 执行推进、污染审计和报告输出合同。

### Modified Capabilities

- 无。

## Impact

- 未来实现会新增项目级 Codex skill，建议路径为 `.codex/skills/aitest-shadow-llm-probe/`。
- 未来实现会新增 dev-only runner / helper 脚本，用于导出 shadow input、校验 Codex decision、执行真实 tool handler 和生成报告。
- 未来实现会新增 `codex_logs/shadow_llm_probe/**` 诊断输出，默认不进入生产数据流。
- 未来实现需要补充普通自动化测试，验证 input 白名单、decision schema、污染审计、tool 执行推进和报告生成。
- 本 change 不要求启动 dev server，不接 `/dev/ai-traces` 或 `/dev/llm-blackbox` UI；UI 集成可作为后续 change 单独处理。
