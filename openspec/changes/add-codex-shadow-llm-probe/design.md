## Context

生产 `/api/chat` 已迁移到 LangChain Agent Runtime 和 DeepSeek native `tool_calls`。当前 prompt、LangChain tool description、Zod schema description、tool result summary、finalization tool 和 response adapter 共同组成模型可见合同。真实黑盒测试可以证明链路是否跑通，但很难解释模型为什么没有调用工具、为什么重复调用工具、为什么只写正文而不提交结构化结果。

本 change 引入一个 dev-only Codex Shadow LLM Probe。它不调用 DeepSeek，也不替换生产模型，而是在本地诊断流程中让 Codex 只读取生产模型实际可见输入，按 LLM 决策方身份逐轮输出 `call_tool`、`final_answer` 或 `contract_gap`。项目侧 runner 负责执行真实 tool handler 并把真实 tool result summary 继续喂给下一轮 Shadow 决策。

关键约束：

- Shadow 阶段只能读取 runner 导出的模型可见输入，不能读源码、memory、历史修复经验、debug-only trace 或数据库 raw payload。
- 项目侧脚本负责校验 Codex 决策和执行真实 tool handler；Codex skill 不直接调用生产内部函数。
- 先完成文件型闭环，不接 UI，不启动 dev server。
- 该能力只服务开发诊断，不改变生产用户请求、DeepSeek provider、LangChain runtime 或用户可见输出。

## Goals / Non-Goals

**Goals:**

- 建立 `aitest-shadow-llm-probe` skill 的使用流程和污染控制规则。
- 定义 shadow input 白名单，确保 Codex Shadow 决策只看到真实模型可见内容。
- 定义结构化 decision 输出，明确 tool call / final / contract gap 的证据、参数来源和污染审计。
- 定义 dev-only runner 如何执行真实 tool handler、推进多轮输入和生成报告。
- 定义最终报告的合同归因分类，帮助区分 prompt、tool description、schema description、tool result summary、finalization 和 runtime budget 问题。

**Non-Goals:**

- 不让 Codex skill 成为生产 LLM provider。
- 不修改生产 `/api/chat`、LangChain runtime、DeepSeek model factory 或 production tool handler 行为。
- 不新增 UI，不接 `/dev/ai-traces` 或 `/dev/llm-blackbox`。
- 不把 Shadow 诊断结果作为普通自动化测试默认通过条件。
- 不在 Shadow 阶段读取源码来推导正确答案。
- 不新增服务端自然语言关键词分流、用户 phrasing 特判或 provider `tool_calls` 改写。

## Decisions

### 1. 采用文件型 Shadow Loop，而不是直接接入 UI 或生产请求

实现时新增 dev-only 文件目录：

```text
codex_logs/shadow_llm_probe/<runId>/
  manifest.json
  round-001-input.json
  round-001-decision.json
  round-001-tool-result.json
  round-002-input.json
  report.json
  report.md
```

runner 先导出 `round-001-input.json`，Codex skill 读取后写出 `round-001-decision.json`。项目脚本校验 decision 并执行真实 tool handler，再写出下一轮 input。循环直到 final、contract gap、预算耗尽或 decision 校验失败。

取舍：

- 文件型闭环可审计、可复现，便于人工检查每一轮输入和决策。
- 不接 UI 可以避免把未稳定的诊断流程混进开发页面状态模型。
- 不直接接生产请求可以保证线上行为不依赖 Codex 当前会话或 skill 可用性。

### 2. Shadow input 只包含模型可见白名单

`round-xxx-input.json` 只能包含：

- `systemPrompt`
- `messages`
- 当前 provider request 暴露的 `tools` 名称、description、input schema 和 schema descriptions
- 当前可见 tool result summary / ToolMessage content
- 当前可见 finalization tool description / schema
- 当前 run 的模型可见预算说明，例如 allowed tools、remaining tool calls、当前 round index
- 可选的 `sourceRefs`，用于指向输入包内部字段，不指向源码路径或 trace debug-only 字段

明确禁止：

- 源码实现、repository 查询细节、Prisma raw payload、完整数据库记录
- `codex_logs/ai_trace_texts.jsonl` 中 debug-only 内容
- 历史 OpenSpec、修复说明、memory、开发者解释
- 用户不可见或模型不可见的 trace diagnostic
- 服务端内部调用栈、环境变量、密钥、cookie

取舍：

- 白名单会牺牲一部分调试便利，但能让结果真正反映模型可见合同是否足够清晰。
- 如果某个判断只能靠源码或历史经验得出，Shadow 决策必须输出 `contract_gap`，而不是猜一个看似正确的 tool call。

### 3. Codex decision 使用稳定 JSON Schema

Codex Shadow 决策必须写入结构化 JSON，核心形态：

```json
{
  "decision": "call_tool",
  "toolName": "searchExerciseResources",
  "toolInput": {},
  "finalAnswer": null,
  "evidence": [
    {
      "source": "systemPrompt",
      "path": "$.systemPrompt",
      "summary": "说明为什么需要工具事实"
    }
  ],
  "fieldRationale": [
    {
      "path": "$.toolInput.exerciseNames",
      "source": "messages",
      "reason": "字段来自用户点名动作"
    }
  ],
  "missingFacts": [],
  "contractConcerns": [],
  "contaminationAudit": {
    "usedOnlyShadowInput": true,
    "suspectedExternalKnowledge": []
  }
}
```

允许的 `decision`：

- `call_tool`：需要调用当前 request 暴露的 tool。
- `final_answer`：可基于当前可见事实终止并给出最终回答意图。
- `contract_gap`：模型可见合同不足以可靠决策，或 Shadow 决策受到污染风险。

取舍：

- 结构化输出会增加 Codex 操作成本，但能让 runner 做 deterministic validation。
- `contract_gap` 是一等决策，避免为了推进 loop 而伪造可靠性。

### 4. 项目侧 runner 只负责确定性推进

runner 职责：

- 生成 shadow input。
- 校验 decision JSON schema。
- 校验 `toolName` 必须存在于当前 `tools`。
- 用工具 input schema 校验 `toolInput`。
- 调用真实 dev-safe tool wrapper / handler。
- 将 handler 输出压缩为真实模型可见 tool result summary。
- 记录执行状态、错误码和下一轮输入。

runner 不负责：

- 根据用户自然语言替 Codex 选择 tool。
- 修复 Codex 的非法 tool input。
- 把 debug-only trace 补给 Codex。
- 修改生产 prompt、tool description 或 finalization 合同。

取舍：

- runner 做 deterministic validation，可以暴露 schema description 是否真的足够指导字段构造。
- 不自动修复 decision，能保留合同缺口证据。

### 5. 报告分为 Shadow 决策报告和开发者诊断建议

`report.md` 分两段：

1. Shadow 决策报告：只引用 shadow input、decision、tool result summary，记录每轮模型可见证据和污染审计。
2. 开发者诊断建议：在 Shadow 报告冻结后，允许 Codex 读取源码、测试和 OpenSpec，把合同问题映射到具体文件和修改建议。

合同问题分类固定为：

- `prompt_conflict`
- `tool_selection_ambiguous`
- `schema_source_unclear`
- `tool_result_summary_insufficient`
- `stop_condition_unclear`
- `finalization_contract_unclear`
- `debug_only_leakage`
- `case_specific_rule_smell`
- `runtime_budget_mismatch`
- `contamination_risk`

取舍：

- 分段报告能保留 Shadow 阶段的纯净性，同时给开发者足够落地建议。
- 不把开发者诊断混入 Shadow 决策，避免“知道源码后倒推模型应该怎么做”。

## Risks / Trade-offs

- **Codex 无法物理忘记当前线程记忆** → 通过新线程使用 skill、shadow input 白名单、每轮证据引用和 `contaminationAudit` 降低污染；无法引用 shadow input 的判断必须标记为 `contract_gap`。
- **Shadow LLM 能做对不代表 DeepSeek 一定能做对** → 报告只证明合同对强 LLM 是否清晰，不替代真实模型黑盒；DeepSeek 行为仍由现有 manual blackbox 或专项回归验证。
- **Shadow input 导出不完整会误报合同缺口** → input exporter 必须来自生产 prompt/tool/schema/result summary 装配入口，并用测试证明不漏当前 provider request 中模型可见的关键字段。
- **runner 调用真实 tool handler 可能写入数据** → 首版只允许只读 tool 或已确认 dev-safe 的 finalization validation path；任何持久化、保存用户事实或高风险 tool 必须在后续 change 中单独设计。
- **报告可能包含敏感信息** → shadow input 和 report 必须沿用现有 trace 脱敏原则，不保存密钥、cookie、完整 raw provider response 或数据库 raw payload。
- **能力与现有黑盒测试重叠** → 明确职责分离：黑盒测试验证真实模型最终用户可见输出，Shadow Probe 验证模型可见合同是否可执行。

## Migration Plan

1. 新增 `aitest-shadow-llm-probe` skill 和 references，先定义操作规则，不接生产代码。
2. 新增 shadow input / decision / report 的 schema 和 fixture 测试。
3. 新增 CLI 或脚本生成 `round-001-input.json`，优先支持单轮最新用户消息和生产 tool catalog。
4. 新增 decision validator 和只读 tool 推进能力，完成文件型多轮 loop。
5. 新增报告生成器，输出 `report.json` 和 `report.md`。
6. 根据真实使用结果，再单独评估是否接入 `/dev/ai-traces` 或 `/dev/llm-blackbox`。

回滚方式：删除或停用 dev-only script / skill，不影响生产 `/api/chat`。生成的 `codex_logs/shadow_llm_probe/**` 文件可按诊断输出处理，不参与生产数据恢复。

## Open Questions

- 首版是否只允许 `searchExerciseResources` 和 `inspectVisibleTrainingProposals` 等只读 tool，还是允许 `submitVisibleTrainingProposal` 走非持久化 validator path？
- Shadow input 是否直接复用现有 AI trace export，还是新增专门的 production model-visible input exporter？
- Codex decision 是否由人工复制到文件，还是后续通过更自动化的本地工具写入？
