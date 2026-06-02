## Context

本次日志显示，Agent 在前两轮已经成功执行 `searchExercises` 和 `generateRoutineDraft`，第三轮模型返回的语义决策也是调用 `validateRoutineDraft`。失败原因不是训练领域规则、候选集合或工具执行，而是模型输出末尾额外多出一个 `}`，触发严格 `JSON.parse` 的 `invalid_json`。

当前解析链路只支持纯 JSON 或 fenced JSON。`requestDeepSeekJson()` 在模型响应解析失败后直接返回 `invalid_json`，`runAgentOrchestrator()` 随后将本轮收敛为 `model_output_invalid`。这条路径可诊断，但对“模型输出基本合法、只存在尾随字符”的格式波动过于脆弱。

约束边界：

- 服务端不得基于用户原文、关键词、同义词或规则评分改写高层语义。
- 恢复逻辑只能处理 JSON 文本边界，不能合成 action、toolName、intent、draftId 或用户回复。
- 恢复后的对象仍必须经过现有 `AgentToolDecision` Schema、registry 和工具输入 Schema 校验。

## Goals / Non-Goals

**Goals:**

- 让 Agent decision 对尾随非空白字符、fenced JSON 和包裹文本中的唯一 JSON object 具备非语义恢复能力。
- 在恢复成功时继续使用现有 schema / registry / dependency 校验，避免把格式恢复变成语义兜底。
- 在 trace 中保留原始失败、恢复方式和恢复后结果，方便判断模型格式波动是否仍在发生。
- 补测试覆盖日志中出现的 `validateRoutineDraft` 尾随 `}` 场景。

**Non-Goals:**

- 不接入新的 LLM provider、LangGraph 或原生 tool calling。
- 不修改训练计划生成、候选动作排序、Validator、Policy 或保存规则。
- 不在服务端根据自然语言猜测 routine / recommendation / patch 语义。
- 不恢复旧 intent-first、旧 `assistant_action` 或旧 resolved intent repair。

## Decisions

1. **在 JSON 解析层增加 deterministic extractor，而不是在业务层兜底。**

   新增解析辅助函数先尝试现有严格解析；失败后只扫描文本中的 JSON object 边界，找到第一个完整闭合对象并确认尾部仅为可丢弃的额外文本或多余对象结束符。提取出的文本必须再次通过 `JSON.parse`。这样可以恢复 `{"action":"call_tool",...}}`，也可以处理 ```json fence 或模型在 JSON 前后加说明的情况。

   取舍：相比直接重试模型，确定性恢复更快、更便宜，并能解决日志中的单字符问题。但它只修文本边界，不能修字段缺失、未知工具或 schema 冲突。

2. **恢复结果只作为 parsed JSON 值进入现有 Agent decision 校验。**

   `parseAgentJsonObject()` 返回恢复成功时，仍把恢复后的 `value` 交给 `parseAgentToolDecision()`。如果 `toolName` 未注册、输入 Schema 不合法、请求多个工具或 final result 合同失败，仍按原失败路径处理。

   取舍：这避免了服务端“帮模型决定下一步”，但会继续让真实 schema 错误失败。对本项目而言，结构安全优先于异常路径成功率。

3. **`requestDeepSeekJson()` 的 trace 记录恢复元数据。**

   当模型原始 `content` 严格解析失败但恢复成功时，模型响应 step 仍记录 `parseStatus: "recovered"`、`jsonRecovery` 元数据和原始 content。后续 Agent decision step 记录的是恢复后的结构化决策。失败时继续记录原始 `invalid_json`。

   取舍：trace 会多一点字段，但调试页可以直接区分“模型 JSON 格式波动已恢复”和“模型 schema 仍坏”。

4. **不把普通 `invalid_json` 直接改成 Agent tool retry。**

   本次先修确定性解析恢复。若恢复失败，runtime 仍按当前失败路径收敛。未来如果要新增一次 LLM repair/retry，需要单独限定 retry 输入、成本预算和 trace 合同。

   取舍：这次避免引入额外模型调用和 token 成本，也减少循环复杂度；代价是无法恢复中间截断或严重错乱的 JSON。

## Risks / Trade-offs

- [Risk] 过宽的对象提取可能吞掉模型解释文本中的 JSON 片段。→ Mitigation: 只接受能解析为单个 object 的片段，并继续通过 `AgentToolDecision` Schema 和 registry 校验。
- [Risk] 恢复尾随内容可能掩盖模型输出质量问题。→ Mitigation: trace 记录 `parseStatus: "recovered"` 和恢复原因，后续可按频率评估 prompt 或 provider。
- [Risk] 部分 provider 输出多个 JSON 对象时恢复第一个对象可能不是最终意图。→ Mitigation: 多对象或无法唯一闭合时保持失败，除非尾随部分只是多余右括号或空白。
- [Risk] 本次不做 LLM retry，严重 malformed JSON 仍会失败。→ Mitigation: 保留现有可诊断失败路径，并通过黑盒报告继续暴露真实失败。
