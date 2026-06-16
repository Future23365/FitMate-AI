# Codex Shadow LLM Probe 使用说明

Codex Shadow LLM Probe 是一个本地开发诊断工具，用来检查生产 LangChain Agent 的模型可见合同是否足够清楚。它不会调用 DeepSeek，不会接入生产 `/api/chat`，也不会修改真实聊天历史、训练事实或用户会话状态。

它的核心用途是：让 Codex 只看生产模型等价可见的 input，模拟“如果我是生产 LLM，下一步会调用哪个 tool、是否能 final，还是合同不够清楚”。

## 什么时候使用

适合使用：

- 想判断某句用户问题在当前 prompt / tool description / schema description 下，模型是否应该调用工具。
- 想排查为什么模型没有进入 `searchExerciseResources`、`submitVisibleTrainingProposal` 或 `fitmate_final_response`。
- 想验证 tool result summary 是否足够支撑下一轮决策。
- 想把“真实模型波动”和“模型可见合同不清楚”分开看。

不适合使用：

- 普通代码 bug 排查。
- 真实 DeepSeek 黑盒效果验证。
- UI、浏览器、页面交互验证。
- 生产数据写入验证。

## 输入框里怎么说

最简单的用法是在输入框里明确点名 skill，并给用户原话：

```txt
使用 $aitest-shadow-llm-probe 诊断：
今天我想练胸，给我几个动作。
```

也可以写成：

```txt
使用 aitest-shadow-llm-probe 诊断这句用户问题：
我一周想练三天，帮我安排一个计划。
```

必须明确写出 `aitest-shadow-llm-probe` 或 `$aitest-shadow-llm-probe`。如果只说“看一下这个 Agent 为什么没调工具”，不会自动触发这个 skill。

## Codex 会自动做什么

当你明确点名 skill 并给用户原话时，Codex 应该自动完成这些步骤：

1. 运行 CLI 创建 shadow run。
2. 读取生成的 `round-001-input.json`。
3. 只基于该 input 写 `round-001-decision.json`。
4. 运行 `--continue <runId>` 推进 runner。
5. 如果生成下一轮 input，继续按轮次写 decision 并推进。
6. 到达 `final_answer`、`contract_gap`、预算耗尽、tool 执行失败或 decision 校验失败后，生成报告。

你不需要手动写“创建 JSON”“读取 JSON”“写出 JSON”。这些是 skill 的内部流程。

## CLI 命令

手动使用时，可以直接运行：

```bash
npm run shadow:llm-probe -- --message "今天我想练胸，给我几个动作。"
```

CLI 会输出：

```txt
runId: <runId>
inputPath: codex_logs/shadow_llm_probe/<runId>/round-001-input.json
decisionPath: codex_logs/shadow_llm_probe/<runId>/round-001-decision.json
reportPath: codex_logs/shadow_llm_probe/<runId>/report.md
```

推进已有 run：

```bash
npm run shadow:llm-probe -- --continue <runId>
```

生成或刷新报告：

```bash
npm run shadow:llm-probe -- --report <runId>
```

查看 run 状态：

```bash
npm run shadow:llm-probe -- --status <runId>
```

列出已有 run：

```bash
npm run shadow:llm-probe -- --status
```

## 已有 run 怎么继续

如果已经有 run，可以在输入框里直接给 `runId`：

```txt
使用 $aitest-shadow-llm-probe 继续这个 run：
shadow-20260616T070101Z-f8df9534
```

也可以给具体 input 文件：

```txt
使用 $aitest-shadow-llm-probe 读取这个文件并写下一轮 decision：
codex_logs/shadow_llm_probe/shadow-20260616T070101Z-f8df9534/round-002-input.json
```

这种情况下，Codex 不需要重新创建 run，而是从已有轮次继续诊断。

## 输出文件怎么看

每个 run 位于：

```txt
codex_logs/shadow_llm_probe/<runId>/
```

常见文件：

- `manifest.json`：run 状态、当前轮次、终态原因。
- `round-xxx-input.json`：Shadow 决策唯一可读的模型可见输入。
- `round-xxx-decision.json`：Codex 按 skill 写出的结构化决策。
- `round-xxx-tool-result.json`：runner 执行 dev-safe tool 后生成的模型可见 summary。
- `report.json`：机器可读报告。
- `report.md`：面向开发者阅读的诊断报告。

`codex_logs/` 默认被 Git 忽略，诊断 run 文件不会进入提交。

## Decision 类型

`round-xxx-decision.json` 只有三类合法决策：

- `call_tool`：当前可见输入足以确定要调用某个当前暴露的业务 tool。
- `final_answer`：当前可见事实足以通过 `fitmate_final_response` 或等价终态收口。
- `contract_gap`：模型可见合同不足以可靠判断，或存在污染风险。

当证据不足时，正确结果是 `contract_gap`，不是强行猜一个 tool call。

## 污染控制

Shadow 决策阶段只能读取当前 `round-xxx-input.json` 和其中的模型可见 tool result summary。

不能把这些内容当作 Shadow 决策依据：

- 仓库源码。
- OpenSpec 文档。
- Codex memory。
- 历史 trace。
- debug-only 字段。
- 数据库 raw payload。
- 开发者解释或上一轮实现意图。

如果判断依赖这些外部信息，应在 decision 中标记污染风险，并输出 `contract_gap`。

## 和子代理配合

如果想进一步降低主线程记忆影响，可以要求 Codex 用子代理执行 Shadow 决策：

```txt
用子代理使用 $aitest-shadow-llm-probe 诊断：
今天我想练胸，给我几个动作。
```

更严格的做法是只给子代理 `round-xxx-input.json` 路径，不给源码、OpenSpec、trace 或主线程分析。这样可以减少上下文污染，但不能保证完全没有模型先验知识。

## 和真实模型黑盒测试的区别

Shadow Probe 不证明 DeepSeek 一定会做出同样决策。它只说明：在一个强 LLM 只看到生产模型可见输入时，合同是否足够支撑下一步决策。

真实模型最终表现仍需要用手动 LLM 黑盒测试或生产 trace 验证。

