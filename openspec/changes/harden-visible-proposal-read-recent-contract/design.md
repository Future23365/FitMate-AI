## Context

当前 `inspectVisibleTrainingProposals` 已作为生产聊天读取当前会话可见训练方案事实的只读 tool。最新 trace 中，模型实际可见的 metadata 已包含真实 `factRef` / `messageId`，但模型仍输出了：

```json
{
  "type": "tool_call",
  "toolName": "inspectVisibleTrainingProposals",
  "input": {
    "operation": "read_recent"
  }
}
```

该 action 能通过基础 `AgentAction` JSON 解析，但在 `validateAgentAction()` 调用 tool `inputSchema.safeParse()` 时被拒绝。真实 Zod 合同通过 `superRefine` 要求 `read_recent` 必须提供 `factRef` 或 `messageId`，而导出的 JSON Schema 只显示 `required: ["operation"]`，tool example 也给出了同样缺引用的 `read_recent` 输入。第一轮失败后，repair observation 只暴露了泛化的 `Tool input does not match its schema`，没有把字段级修复原因反馈给模型，导致第二轮重复失败并耗尽 repair budget。

本 change 的任务分类是 Agent tool bug 修复 + 单个业务 tool 模型可见合同修复 + repair feedback 合同修复。允许触碰 `inspectVisibleTrainingProposals` 的 input schema、examples、manifest 描述、相关 tests，以及 `invalid_tool_input` 的安全 details / repair feedback。禁止触碰 Agent runtime 主循环、`PlannerPort`、Executor 主流程、Policy Guard、ResourceStore、Resource Contract Validator、Response Renderer、`/api/chat` 主链路或服务端自然语言语义分流。

## Goals / Non-Goals

**Goals:**
- 让 `read_recent` 的 `factRef` / `messageId` 二选一必填进入模型可见 JSON Schema。
- 确保 production manifest 中不存在会被 runtime 拒绝的 `read_recent` example。
- 让 `invalid_tool_input` repair observation 安全暴露可恢复字段级原因，帮助模型在剩余预算内修正输入。
- 用回归测试覆盖原始失败形态和等价输入变体，证明 handler 不会在非法输入时执行。

**Non-Goals:**
- 不新增业务 tool，不新增 `list_recent` 变体，不重命名现有字段。
- 不让服务端根据用户原始自然语言、关键词、正则、同义词或固定短句替模型选择 `factRef`、`messageId` 或 operation。
- 不放宽 `read_recent` 权限、conversation、status、kind、schemaVersion 或 payload 校验。
- 不改 `/api/chat` production routing，不改 renderer，不改 core 的业务 toolName 分支。

## Decisions

### 1. 用 union 分支表达二选一必填，而不是继续依赖 `superRefine`

`superRefine` 可以保护 runtime，但 `z.toJSONSchema()` 不能稳定把“`factRef` 或 `messageId` 至少一个”表达给模型。修复应把 `read_recent` 拆成 JSON Schema 可见的两个合法分支：

```ts
| { operation: "read_recent"; factRef: string; messageId?: string }
| { operation: "read_recent"; messageId: string; factRef?: string }
```

这样 Planner 可见 schema 会明确至少存在一个 required 引用字段，runtime 也继续执行同一确定性边界。保留 `operation = "list_recent"` 的独立分支，避免 `list_recent` 接受引用字段。

备选方案是只修改 prompt / example。该方案能降低当前模型犯错概率，但真实 JSON Schema 仍然比 runtime 合同更宽，后续模型或 repair 仍可能重复输出非法输入。

### 2. example 必须是“可执行合同示例”，不能用无效输入占位

当前 `read_recent` example 使用 `{ operation: "read_recent" }`，描述里说“不提供可复制引用值”。这个设计避免模型照抄假 `factRef`，但副作用是 example 自身违反 runtime 合同。修复后 examples 应只展示：

- `list_recent` 的完整合法输入。
- `read_recent` 的字段关系说明放在 description / schema description / whenToUse 中，不提供无效 input；如果需要示例，使用 `messageId` / `factRef` 来源描述，不提供可复制占位 id。

备选方案是放一个看似真实的 `factRef` 占位值。该方案会让模型更容易照抄不存在的引用，因此不采用。

### 3. `invalid_tool_input` feedback 增加安全 schema issue details

Action Validator 已经拥有 Zod error，但当前只返回泛化 message。修复后 `ToolError.details` 可以包含脱敏后的 schema issue 摘要，例如：

```ts
{
  schemaIssues: [
    {
      path: "factRef",
      message: "operation = \"read_recent\" 时必须提供 factRef 或 messageId。",
      repair: "从当前 run 可见的 recentVisibleTrainingProposals、list_recent result 或 diagnostic index resource 复制真实 factRef；如果只有 messageId，则传 messageId。"
    }
  ]
}
```

details 必须只包含字段路径、错误说明和修复提示，不包含完整 handler payload、数据库输出、secret 或任意用户不可见事实。`createInvalidActionObservation()` 继续只把该结构作为模型可见 invalid action observation，不执行 tool，不替模型补字段。

### 4. 测试覆盖真实失败链，而不是只验证 manifest 字符串

本 change 的关键是“模型看见的合同”和“runtime 拒绝的合同”一致。因此测试需要同时覆盖：

- production manifest 的 JSON Schema required / oneOf 结构。
- production manifest examples 不包含非法 `read_recent` input。
- `validateAgentAction()` 对缺引用 `read_recent` 返回 `invalid_tool_input`，并带字段级 repair details。
- runtime repair loop 下一轮能看到该 details，不再只有泛化失败。
- chat service replay 中，合法 `read_recent` 继续能读取已有事实；非法缺引用不会执行 handler。

## Risks / Trade-offs

- [Risk] `read_recent` 拆成两个 union 分支后 manifest 更长。→ Mitigation：只拆该 tool 的小 input schema，换取模型可见硬约束与 runtime 合同一致。
- [Risk] 不提供 `read_recent` example input 可能降低模型调用成功率。→ Mitigation：把字段来源写进 `whenToUse`、schema description 和 repair feedback；合法真实值必须来自当前 run，不应通过 example 占位模拟。
- [Risk] schema issue details 可能泄漏内部实现。→ Mitigation：只投影 Zod issue 的安全字段路径、中文说明和修复建议，不暴露 handler payload、数据库内容或堆栈。
- [Risk] 真实 LLM 仍可能忽略 metadata 中的真实 `factRef`。→ Mitigation：本 change 不用服务端语义兜底；通过 manifest + repair feedback + replay tests 收口执行合同，后续真实黑盒再评估是否需要进一步增强模型可见上下文。

## Migration Plan

1. 更新 `inspectVisibleTrainingProposals` input schema 和 examples。
2. 更新 `invalid_tool_input` 的 error details 和 invalid action observation 投影。
3. 更新 manifest、validator、chat replay 相关测试。
4. 运行 `openspec validate harden-visible-proposal-read-recent-contract --strict`、相关单测和 `npm run typecheck`。
5. 如验证通过，提交本次 bugfix；无需数据迁移或用户迁移。
