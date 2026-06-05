## Context

当前 core 合同中 `ToolResult` 同时有：

```ts
ok: boolean
fulfillment: {
  satisfied: boolean
  summary?: string
  producedResources?: AgentResourceRef[]
  consumedResources?: AgentResourceRef[]
  unmetRequirements?: unknown
}
```

`ok` 表示 tool 是否成功执行；`satisfied` 原本试图表达“执行结果是否满足需求”。实际运行中，这个字段容易把 0 条查询结果、候选不足、诊断型结果和业务最终失败混成一个布尔值。服务端 core 不具备用户语义理解能力，也不应根据中间 tool 返回的数量或诊断判断用户目标是否完成。

正确边界是 final-output-centered validation：

- 中间 tool result 是当前 run 的事实材料。
- 普通文本 `final_answer` 可以引用任何当前 run 的成功 tool result，包括 0 条结果。
- 结构化 `visibleOutputs[]` 是最终业务交付，必须由对应 output validator 判断是否合格。
- 保存、渲染、事实桥和历史写入只消费通过最终 validator 的结构化输出。

本 change 的 primary governance 是 `agent-tool-change-governance` 的 Core Contract 变更；secondary governance 是 `agent-prompt-contract-governance` 的模型可见合同同步检查。

## Goals / Non-Goals

**Goals:**

- 移除 `satisfied` 在 Agent core 中作为普通 `final_answer` grounding gate 的作用。
- 让 0 条成功查询可以支撑普通事实回答。
- 把“训练方案是否满足数量、动作事实、section、处方和 schedule”收敛到最终 `visibleOutputs` validator。
- 保留 current-run refs、resource role、resource contract、schema、budget、timeout 和 duplicate loop 等通用 hard boundary。
- 更新 repair feedback、observation、trace 和 tests，避免继续把中间 tool result 解释成业务成败。
- 不新增任何服务端自然语言语义分流或具体业务 `toolName` 分支。

**Non-Goals:**

- 不实现完整 `PlannerStateView` / `TerminalGate` 大重构。
- 不改变 `PlannerPort.decideNext(input)` 方法外形，除非实现阶段发现必须同步注释或类型语义。
- 不改业务 tool handler 查询逻辑。
- 不绕过 `visibleTrainingProposal` 的数据库动作事实和 section 校验。
- 不允许模型用普通正文伪造结构化训练方案。
- 不允许历史 assistant 文本直接成为可消费数据库事实。

## Decisions

### Decision 1: `ok` 保留为唯一 tool 执行成功边界

Core SHOULD 使用 `ToolResult.ok` 判断 tool 是否成功执行。`ok = true` 表示 handler 完成、output schema 通过、权限和执行合同没有失败。0 条结果仍然是 `ok = true` 的事实。

实现阶段应避免把 `totalMatches = 0`、候选不足或业务诊断映射成 core-level `ok = false`，除非 tool 本身执行失败、输出 schema 失败、权限失败或合同失败。

### Decision 2: `satisfied` 从 core grounding gate 删除或降级为诊断

`fulfillment.satisfied` 不再参与这些 core 判断：

- 普通 `final_answer` 是否可引用某个当前 run tool result。
- 成功 tool result 是否进入模型事实通道。
- Response Renderer 是否可输出普通 tool result 摘要。
- duplicate feedback 是否被命名为 success / unsatisfied。

如果实现阶段需要保留该字段以降低迁移风险，它只能作为 tool projection / diagnostics 中的非阻断信息，并且不得被 core 用作普通 `final_answer` 的成功 gate。最终应评估删除字段或改名为更明确的诊断结构，例如 `diagnostics.resultKind`、`diagnostics.unmetRequirements`。

### Decision 3: 普通 `final_answer` 只校验结构和当前 run grounding

普通文本回答的 core gate 是：

- action schema 合法；
- `content` 存在；
- `usedRefs` 如存在，必须引用当前 run 已登记 tool result 或 resource；
- tool result 引用必须是 `ok = true`；
- resource 引用必须符合当前 run、role 和 resource contract；
- 不允许引用不存在、失败、跨 run、跨用户或未登记事实。

Core MUST NOT 因某个成功 tool result 的业务结果为空、候选不足或未满足业务目标而拒绝普通 `final_answer`。

### Decision 4: 结构化业务交付只看最终 output validator

`final_answer.visibleOutputs[]` 是业务交付边界。对应 validator 必须校验最终 payload：

- 数量是否满足该 outputType 的结构要求；
- id 是否存在、发布态、属于当前用户可见范围；
- section / allowedSections 是否合法；
- prescription / schedule / payload.kind 是否完整；
- 失败时是否提供结构化、脱敏、可恢复诊断。

Core 只按 `outputType + schemaVersion` 分发 validator，不理解业务内容。

### Decision 5: duplicate feedback 只表达重复输入，不表达业务成功

重复调用边界应保留，用于成本、幂等和死循环控制。但命名和反馈应避免 `duplicate_tool_success` 这类“业务成功”暗示。

推荐迁移为：

```text
duplicate_tool_input
duplicate_tool_result
duplicate_tool_call
```

feedback 只表达：

- 相同 `toolName + toolVersion + normalizedInputHash` 已执行过；
- 既有 `toolResultId`；
- 既有结果的 `ok` 状态和安全摘要；
- 重复同 input 不会产生新事实；
- Planner 可以引用既有结果、提交不同 input、输出普通 final answer、提交最终 visibleOutputs、ask_user 或失败收口。

feedback MUST NOT 指定具体业务 tool、固定下一步 action 或根据用户原文生成新 input。

### Decision 6: resource role 保留，但不表达业务满足度

`resource.role = consumable | diagnostic` 继续是通用资源用途边界：

- `consumable` 表示可被后续 tool 或 terminal action 按合同消费；
- `diagnostic` 表示只用于解释、澄清、repair 或 trace。

但业务 tool 不得用 role 偷偷表达“用户目标已满足”。如果某个业务最终输出需要更强要求，应在最终 validator 校验，而不是通过中间 resource role 或 `satisfied` 间接拦截。

## Migration Plan

1. 梳理所有 `fulfillment.satisfied` 读写点，分成 core gate、projection/diagnostic、test fixture 三类。
2. 修改 action validator：普通 `final_answer` 不再因 `satisfied=false` 拒绝 `ok=true` tool result。
3. 修改 observation / planner input：成功 tool result 不再按 `satisfied` 分流；0 条结果进入模型事实通道。
4. 修改 duplicate feedback：从 `duplicate_tool_success` 迁移为不带业务成功含义的重复输入反馈。
5. 修改 response renderer / trace summary：不再用 `satisfied` 判断普通 result 是否可展示或可作为事实引用。
6. 保留并加强 `visibleOutputs` validator：最终结构化训练方案仍必须通过数据库事实和业务结构校验。
7. 同步 prompt / model-visible 合同，说明中间 tool result 是事实材料，最终 output validator 才判业务交付。
8. 更新测试，覆盖 0 条结果普通回答成功、0 条结果伪造结构化输出失败、最终输出通过 validator 才渲染/保存。

## Risks / Trade-offs

- [Risk] 删除 `satisfied` gate 后，模型可能引用候选不足的 result 做过度承诺。  
  Mitigation：普通 `final_answer` 可解释事实；结构化承诺必须通过 `visibleOutputs` validator；prompt 明确正文不能伪造结构事实。
- [Risk] 短期大量 tests 依赖 `satisfied=false`。  
  Mitigation：先更新合同测试，明确哪些是普通文本 grounding，哪些是 final output validation。
- [Risk] 某些业务 tool 过去用 `satisfied=false` 表达资源不可消费。  
  Mitigation：改用 `resource.role`、`resourceContract`、`diagnostics` 或最终 validator；不得继续复用 `satisfied` 做隐藏业务 gate。
- [Risk] duplicate feedback 重命名影响 trace/replay。  
  Mitigation：在 change 中同步 trace projection 和 replay fixtures，必要时短期保留旧 code 到新 code 的测试说明，但不保留长期业务语义。

## Open Questions

- `fulfillment` 是否整体保留为 summary/resources 容器，还是拆成 `summary`、`resources`、`diagnostics` 顶层字段，需要实现阶段按最小迁移风险决定。
- `diagnostic` resource 是否允许被普通 `final_answer` 用于解释失败事实，需要实现阶段严格区分“解释性引用”和“成功 grounding”的字段形态。
- 旧 trace 中的 `duplicate_tool_success` code 是否需要兼容读取，还是只在新 trace 里改名，需按 `/dev/ai-traces` 读取兼容性决定。
