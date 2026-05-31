## Context

当前 `/api/chat` 已经具备一套服务端编排链路：先解析意图，再处理用户反馈记忆、引用解析、动作候选、Patch、训练草稿生成、校验和最终回复。链路中已有多个可视为工具的服务端能力，例如 `searchArtifacts`、`getArtifactPayload`、`getExerciseById`、`searchExercises`、`ReferenceResolver` 和 AI Trace 记录。

现有问题不是缺少底层读能力，而是这些能力被分散在固定分支里。LLM 在最终回复或复杂追问中无法按需补查只读上下文，只能依赖 `conversationSummary`、recent artifact summary 或服务端提前放入 prompt 的有限上下文。继续堆固定分支会让新意图、失败恢复和 trace 复盘越来越难维护。

本 change 要完成第二阶段：让 LLM 具备受控只读工具调用能力。写操作、训练计划保存、Patch 应用和数据库持久化仍由服务端确定性流程控制。

## Goals / Non-Goals

**Goals:**

- 建立统一的只读 `ControlledTool` 注册和执行协议。
- 允许 LLM 在聊天编排中选择有限只读工具补查上下文。
- 首批接入 `searchArtifacts`、`getArtifactPayload`、`getExerciseById`、`searchExercises`。
- 对每次工具选择、参数校验、权限校验、执行结果、失败和回退写入 AI Trace。
- 限制 tool loop 的最大步数、上下文预算和工具输出摘要，避免不可控循环或 prompt 膨胀。
- 保留当前固定编排作为回退路径，确保工具调用失败不会让核心聊天流程中断。

**Non-Goals:**

- 不引入 LangGraph、LangChain 或其他重型 Agent Runtime。
- 不开放写工具，例如 `applyWorkoutPatch`、`createWorkoutPlanDraft`、`saveWorkoutPlan`、`recordUserFeedback`。
- 不让 LLM 直接访问数据库、Prisma client、任意 SQL 或未校验 payload。
- 不改变数据库 Schema。
- 不改变客户端为工具执行发起请求的方式；工具执行仍只发生在服务端。

## Decisions

### 1. 使用项目内自定义 tool registry，而不是直接引入 Agent 框架

新增 `lib/server/ai/tools/`，定义 `ControlledReadTool`：

```ts
type ControlledReadTool<Input, Output> = {
  name: string;
  description: string;
  inputSchema: ZodSchema<Input>;
  execute(input: Input, context: ControlledToolContext): Promise<ControlledToolResult<Output>>;
  summarizeForModel(output: Output): unknown;
  summarizeForTrace(output: Output): unknown;
};
```

选择这个方案是因为当前项目已经有明确的服务端边界、权限模型和 trace 体系。先用本地 registry 可以复用现有服务，同时避免 LangGraph 带来的状态机迁移成本。

备选方案是直接接 LangGraph 或 Vercel AI SDK Tools。它们能更快提供通用 tool loop，但会把当前业务门控、trace、token budget 和错误结构适配压力前置，不适合这次只读能力的第一步落地。

### 2. LLM 只决定只读工具选择，工具执行必须由服务端完成

模型请求可以携带工具定义或等价 JSON tool decision schema，但服务端必须校验：

- tool 名称存在于只读 registry。
- tool 输入通过 Zod Schema。
- tool 执行上下文包含当前 `userId`、`sessionId`、`trace` 和 token budget。
- 工具内部继续执行用户隔离、status、kind、limit 等约束。
- 工具返回先摘要化，再进入下一次模型上下文或最终回复。

这样可以让 LLM 补查上下文，但不能让模型绕过权限边界。

### 3. 只读 tool loop 作为聊天编排的可选阶段

在 `resolveChatIntent`、用户记忆构建和引用解析之后，进入一个可选 `runReadonlyToolLoop` 阶段。触发条件包括：

- 用户要求解释历史卡片、推荐原因、动作细节或计划细节。
- resolved intent 或 referenceResolution 表明需要更多只读上下文。
- 当前 prompt 上下文不足以回答，但可以通过注册只读工具补查。

tool loop 输出 `ReadonlyToolContextBundle`，供最终回复、解释、动作推荐或后续确定性服务端流程使用。若工具阶段失败、模型未选择工具或达到步数上限，系统回退到当前编排路径或澄清回复。

### 4. 首批工具严格限定为读工具

首批工具职责如下：

- `searchArtifacts`：返回当前用户可访问 artifact 候选摘要，不返回完整 payload。
- `getArtifactPayload`：读取当前用户可访问、Schema 校验通过的 artifact payload，并对模型输出做摘要化。
- `getExerciseById`：读取数据库中已存在动作详情。
- `searchExercises`：按结构化条件检索动作摘要，结果仍不得越过动作库和用户上下文边界。

`applyWorkoutPatch`、`createWorkoutPlanDraft` 等写类能力不进入 registry。本 change 可以在代码中预留 `writeTool` 类型边界，但不得注册或暴露写工具。

### 5. Trace 和 token budget 是 tool loop 的硬边界

每轮 tool loop 必须记录：

- 模型可见工具定义版本。
- 模型选择的 tool name 和参数摘要。
- 参数校验结果。
- 工具执行状态、耗时、输出摘要和失败 code。
- 是否达到 step 上限。
- 最终哪些工具上下文进入回复生成。

工具输出必须走摘要函数，避免完整 artifact payload、长文本或大候选集合直接进入 trace 或 prompt。

## Risks / Trade-offs

- [Risk] 模型频繁选择工具导致延迟和成本上升 → Mitigation: 限制最大步数，默认只在需要补查上下文的 intent 进入 tool loop，并记录 token budget。
- [Risk] 工具输出过大导致 prompt 膨胀 → Mitigation: 每个工具必须提供 `summarizeForModel`，并限制候选数量和字段长度。
- [Risk] LLM 选择不存在或越权参数 → Mitigation: registry 名称白名单、Zod 校验、当前用户权限过滤和失败回退。
- [Risk] tool loop 与现有 ReferenceResolver 产生重复职责 → Mitigation: ReferenceResolver 继续负责 artifactId 边界收敛，tool loop 只能在候选和权限边界内补查只读上下文。
- [Risk] 写操作被误暴露 → Mitigation: 只读 registry 和写服务分离，测试断言 registry 不包含写工具。

## Migration Plan

1. 新增只读工具基础类型、registry、executor、trace helper 和单元测试。
2. 将现有读能力包装成只读工具，不改变原服务函数语义。
3. 在聊天编排中接入只读 tool loop，先只用于补查上下文，保留现有确定性路径。
4. 扩展 AI Trace 数据和调试页展示，使工具决策和执行结果可复盘。
5. 增加自动化测试覆盖工具注册、权限失败、Schema 失败、步数上限、trace 和聊天回退。
6. 运行类型检查、相关测试和必要的构建验证。

回滚策略：保留 feature flag 或服务端开关，关闭后 `/api/chat` 跳过 `runReadonlyToolLoop`，继续使用当前固定编排链路。

## Open Questions

- DeepSeek 当前接口是否稳定支持标准 `tools` / `tool_choice`；如果不支持，需要使用受控 JSON tool decision 协议模拟一轮工具选择。
- `getArtifactPayload` 给模型的摘要字段需要按 artifact kind 细化，避免过多 payload 进入模型上下文。
- 只读 tool loop 的默认最大步数建议为 3，是否需要按 intent 类型调整为 1-5。
