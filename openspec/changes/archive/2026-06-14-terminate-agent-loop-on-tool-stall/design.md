## Context

当前生产 `/api/chat` 已使用 LangChain Agent Runtime 和 DeepSeek native tool calling。Runtime 中已有三层循环控制：

- `maxToolCallsPerTool`：同一业务 tool 连续调用上限。
- `maxToolCalls`：整轮业务 tool 总执行预算。
- `maxModelCalls` / `recursionLimit`：provider model call 和 LangChain graph step 外层预算。

当前问题在于第一层控制只是返回模型可见失败 observation。模型看到 `tool_consecutive_call_limit_exceeded` 后仍可继续调用其他业务 tool，随后再次回到原业务 tool，导致连续限制无法终止无进展循环。最终请求只能依靠 `maxModelCalls` 失败收口，成本和延迟已经失控。

## Goals / Non-Goals

**Goals:**

- 将连续业务 tool 超限改成主 Agent loop 的硬终止条件。
- 保留连续超限 tool call 的模型可见失败摘要、trace summary 和 failed tool execution 记录。
- 复用现有 terminal failure finalizer / fallback 收口，不新增用户可见失败回复路径。
- 不新增用户短句、关键词、正则、同义词或具体业务 `toolName` 特判。
- 保持全局预算作为外层安全熔断。

**Non-Goals:**

- 不调整 `searchExerciseResources`、`inspectVisibleTrainingProposals` 或其他业务 tool 的 handler、schema、description 或候选返回策略。
- 不修改 production tool catalog。
- 不修改 `/api/chat` 主路由或 response adapter 主流程。
- 不把“10 个动作”这条用户原话写入生产规则；它只作为回归测试样例。

## Decisions

### Decision 1: 将连续超限记录为 terminal tool execution failure

Runtime coordinator 在发现 `consecutiveBusinessToolCalls > maxToolCallsPerTool` 时，继续创建失败 execution record，并标记稳定失败码。该 record 进入 trace 和 failure finalizer 输入，帮助用户可见回复解释本轮未完成原因。

替代方案是在 tool wrapper 内直接抛错、不生成失败 execution record。这个方案更简单，但会丢失失败 tool input、模型可见失败摘要和 trace 证据。

### Decision 2: 在 tool call 闭合后立刻终止主 Agent loop

连续超限 failure 不能再作为普通可恢复 observation 回到自由 tool loop。实现上应在 agent invoke 返回后识别该 terminal failure，或者在 runtime 边界以等价方式把 run 归一化为失败结果，并阻止后续 provider model call 成为正常路径。

替代方案是继续移除当前 tool 并允许其他 tool 可用。这个方案就是当前缺陷来源，模型可以用其他业务 tool 打断连续计数，最终拖到全局预算。

### Decision 3: 使用通用失败码，不写业务 toolName 分支

连续超限是通用 runtime contract，适用于任何 `executionKind = "business"` 的 tool。实现和测试只能基于 execution kind、连续计数、failure code 和 run result 判断，不得写 `searchExerciseResources` 或历史事实 tool 的语义分支。

### Decision 4: 保留全局预算作为外层兜底

`maxToolCalls`、`maxModelCalls`、`recursionLimit` 和 timeout 仍然存在，用于覆盖跨 tool 广泛探索、provider 行为异常和其他未被连续限制捕获的路径。本 change 只把连续同 tool 超限从软反馈提升为更早的硬终止。

## Risks / Trade-offs

- [Risk] 某些合法多步链路可能在模型连续第三次调用同一业务 tool 时更早失败。  
  Mitigation: 连续上限来自集中配置，且合法链路应在达到上限前使用已有事实收口、澄清或提交结构化终态；更早失败比无进展循环烧尽预算更可控。

- [Risk] 直接中断可能丢失连续超限失败证据。  
  Mitigation: 先生成失败 tool execution 和模型可见失败摘要，再将 run 归一化为 terminal failure，避免继续自由 model call。

- [Risk] terminal failure finalizer 需要识别新的失败类别。  
  Mitigation: 优先复用现有 `budget_exhausted` / tool failure 摘要路径；如果需要新增 code，必须保持稳定、通用、脱敏，并补类型和测试。

- [Risk] 修复容易被写成具体业务 toolName 特判。  
  Mitigation: OpenSpec tasks 加入抽象层级门禁和 diff 检查，测试使用 fixture business tools 覆盖通用 runtime 行为。
