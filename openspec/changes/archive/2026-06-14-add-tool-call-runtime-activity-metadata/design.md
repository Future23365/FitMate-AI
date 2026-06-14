## Context

生产 `/api/chat` 已迁移到 `LangChain Agent Runtime + DeepSeek native tool_calls`。当前活动条文案来自独立 `reportAgentActivity` tool：模型调用该 tool 后，runtime observer 投影 `agent_progress`，前端展示 `activitySummary`。这个实现让 UI 状态具备了普通 tool action 的运行时语义，导致两个问题：

- 模型可以单独调用 `reportAgentActivity`，该调用不产生业务事实，却会让 LangChain 继续下一轮模型调用，形成低价值空转 loop。
- 模型调用业务 tool 时不一定同时调用 `reportAgentActivity`，前端会在 `agent_loop` 推进时继续展示上一条摘要，出现同一句文案重复滚动。

本变更把活动摘要从独立 activity tool 迁移为业务 tool call 的 request-local runtime metadata。活动摘要仍由模型生成，但只作为工具执行前的 UI 状态预告，由通用 wrapper 消费并投影，不进入业务 handler、业务输出、模型可见结果、grounding、资源事实或持久化。

## Goals / Non-Goals

**Goals:**

- 为所有生产业务 LangChain tool 统一提供 `runtimeMetadata.activitySummary` 输入 envelope。
- 在业务 tool handler 执行前投影 `agent_progress`，让用户看到“正在做什么”的实时状态。
- 废弃独立 `reportAgentActivity` 作为生产活动条主合同，避免 activity-only tool call 空转。
- 保持服务端只做确定性合同处理：schema、metadata 清洗、projection、trace、预算和权限；不根据用户原文、关键词或具体 phrasing 选择工具。
- 确保 `activitySummary` 不污染业务事实、tool output、model-visible summary、user projection、visible output、conversation summary 或训练事实。
- 修正前端活动条动画策略，避免只有 `agent_loop` 变化时重复滚动上一条相同摘要。

**Non-Goals:**

- 不新增业务 tool，不改变动作检索、历史方案读取、训练输出提交等业务能力。
- 不让服务端根据用户自然语言推断活动摘要。
- 不把 `activitySummary` 作为工具调用理由审计、业务诊断或最终回答依据。
- 不恢复旧 `AgentAction` / `PlannerPort` / `ToolRegistry` 生产主链。
- 不把具体业务 `toolName` 写进 runtime 语义分支。

## Decisions

### 1. 使用 runtime metadata envelope，而不是独立 activity tool

业务 tool 的 provider-visible input 统一扩展为：

```ts
type ToolCallRuntimeMetadata = {
  activitySummary?: string;
};

type RuntimeMetadataEnvelope<TBusinessInput> = TBusinessInput & {
  runtimeMetadata?: ToolCallRuntimeMetadata;
};
```

模型调用业务 tool 时可以传：

```json
{
  "runtimeMetadata": {
    "activitySummary": "正在查询适合核心训练的动作"
  },
  "muscles": ["abdominals"],
  "suitabilities": ["training"]
}
```

服务端 wrapper 先读取 `runtimeMetadata.activitySummary`，投影活动事件，再剥离 `runtimeMetadata` 并用原业务 schema 校验剩余 input。handler 只能看到业务字段。

`runtimeMetadata` 由通用 LangChain tool wrapper / production catalog schema serialization 自动注入 provider-visible schema，不要求每个业务 tool 的源 `inputSchema` 手写该字段。业务 `inputSchema` 仍只表达业务字段；runtime metadata envelope 是 wrapper 层的执行合同。

**取舍：**

- 相比继续使用 `reportAgentActivity + businessTool` companion tool，这个方案不会产生额外 tool action、ToolMessage 或 activity-only loop。
- 代价是需要统一扩展 provider-visible schema，并补 wrapper / catalog / prompt contract tests。

### 2. `activitySummary` 是 UI 状态预告，不是调用理由或业务事实

字段语义：

- 描述当前工具调用即将执行或正在执行的用户可见步骤。
- 推荐中文短句，建议 8-40 个字。
- 不写 `toolName`、字段名、trace、schema、数据库 id、错误码、内部枚举或服务端实现细节。
- 不写“已完成”“已生成”“已保存”等完成态承诺，因为工具尚未完成执行。
- 不参与最终回答 grounding，不进入模型可见 tool result，不保存到历史。

示例：

```txt
正在查询适合核心训练的动作
正在读取已有训练方案
正在确认你提到的动作
正在筛选可用于主训练的动作
正在校验训练卡片内容
正在整理可展示的训练结果
```

### 3. 缺失或非法摘要不阻断业务工具

`activitySummary` 属于 UI metadata，不应让业务 tool 失败。处理规则：

- 合法摘要：投影给前端。
- 缺失摘要：使用 tool wrapper 声明的 `runtimeActivity.defaultSummary`，例如“正在查询动作库”。
- 非法摘要：丢弃模型摘要，使用默认摘要，并在 trace runtime metadata 区域记录 warning。
- 缺失默认摘要：使用通用兜底，例如“正在处理当前请求”。

默认摘要来自 tool wrapper 的静态能力声明，不来自用户关键词或自然语言模板路由。该声明属于 tool 能力 metadata，不是业务 handler 输出。

### 4. wrapper 统一负责 schema envelope 和 projection

实现层级应在 `defineLangChainToolWrapper` / `createExecutableLangChainTool` / `executeLangChainToolWrapper` 附近增加通用扩展点：

- provider-visible schema = 原业务 `inputSchema` + 可选 `runtimeMetadata`。
- wrapper 执行前提取、归一化和记录 runtime metadata。
- wrapper 执行 handler 前投影 `model_activity_reported` 或等价 observer 事件。
- wrapper 把剥离后的业务 input 交给原业务 schema 与 handler。
- `runtimeMetadata` 不出现在 `toModelVisibleSummary`、`toUserProjection`、`toTraceSummary` 的业务摘要里。

这属于 LangChain runtime / wrapper 通用合同变更；允许触碰 wrapper 通用执行边界和 production catalog schema serialization，但不得新增具体业务 toolName 分支。

### 5. 生产 catalog 迁移出 `reportAgentActivity`

迁移完成后，生产 tool catalog 不应再暴露 `reportAgentActivity` 作为活动条主入口。本 change 选择直接从 production catalog / 默认可用 tools 中移除或停用该 tool，不保留生产 deprecated 兼容窗口；如果测试或开发 fixture 临时保留同名工具，也不得进入 production catalog、默认 prompt、预算说明或 `/api/chat` 主链路。

相关配置中的 `maxActivityReports` 需要删除或迁移为 runtime metadata 投影防刷屏边界，例如 `maxActivityMetadataEvents`。该边界只限制 request-local UI projection / trace warning 数量，不是 provider-visible tool 预算，不产生独立 ToolMessage、model call、graph step 或 activity-only loop。

### 6. 前端只对真实文案变化做滚动

`agent_loop` 和 `agent_progress` 继续保持独立状态：

- `agent_loop` 只更新 `loopTurn`。
- `agent_progress.activitySummary` 或 stage fallback 只更新右侧文案。

活动条可以显示新的 `#N` 前缀，但如果右侧文案与上一帧相同，不能触发“上一条文案滚出 / 同一文案滚入”的滚动动画。这样保留 loop 前缀可见，同时避免重复文案刷屏。

本 change 保留 `#N` 前缀显示。重复摘要场景只更新不可动画的前缀文本；右侧文案、滚动动画和 `aria-live` 播报只由真实文案变化触发。

### 7. active spec 迁移和历史回归审计

本 change 反转了多个历史 activity 合同：

- `openspec/changes/archive/2026-06-11-restore-langchain-agent-activity-stream` 引入 `reportAgentActivity` 作为模型活动汇报 tool。
- `openspec/changes/archive/2026-06-11-align-langchain-runtime-budget-config`、`openspec/changes/archive/2026-06-11-limit-consecutive-langchain-tool-calls` 和 `openspec/changes/archive/2026-06-11-rebalance-langchain-tool-call-budget` 将 `maxActivityReports` 建模为独立 activity report 预算。
- `openspec/changes/archive/2026-06-07-add-llm-agent-activity-summary` 曾将 `activitySummary` 建模为旧 `AgentAction` 顶层字段。

因此本 change 不只修改 runtime / wrapper 实现，还必须同步覆盖 active specs 中仍然表达旧合同的位置：`langchain-agent-runtime`、`agent-llm-prompt-configuration`、`agent-text-chat-flow`、`agent-runtime-configuration`、`agent-tool-production-hardening`、`chat-agent-activity-indicator` 和 `chat-agent-activity-display-stability`。实现完成前必须运行历史回归合同审计和文本扫描，确认 active specs、prompt、production catalog、runtime、adapter 与前端测试不再把 `reportAgentActivity`、`maxActivityReports`、`AgentAction.activitySummary` 或 `model_activity` stage 当作当前生产主合同。

## Risks / Trade-offs

- **风险：provider-visible schema 变大。** → 只新增一个短 optional envelope，并用 contract tests 确认所有生产 tool schema 统一包含该字段。
- **风险：模型忽略 `runtimeMetadata.activitySummary`。** → wrapper 使用 tool 静态默认摘要兜底；业务执行不失败。
- **风险：模型把摘要写成内部字段或完成态承诺。** → wrapper 与前端双层清洗；非法摘要丢弃并 trace warning，不中断业务执行。
- **风险：默认摘要退化成具体 `toolName` 分支。** → 默认摘要由 tool wrapper 能力声明提供，runtime 只读取通用 metadata，不根据具体业务 toolName 写分支。
- **风险：废弃 `reportAgentActivity` 影响现有测试。** → OpenSpec tasks 要求迁移 runtime、catalog、api route、activity UI 和 model-visible contract tests。
- **风险：短期 trace 中既有旧 activity tool 又有新 metadata。** → 迁移任务应先更新 specs 和 tests，再移除生产 catalog 旧 tool；若保留兼容，必须明确 deprecated 边界和清理任务。

## Migration Plan

1. 在 OpenSpec 文档中定义 runtime metadata envelope、旧 `reportAgentActivity` 迁移边界和前端活动条动画要求。
2. 修改通用 wrapper schema 暴露与执行边界，支持 `runtimeMetadata.activitySummary` 的提取、清洗、投影和剥离。
3. 为生产业务 tool 增加 `runtimeActivity.defaultSummary` 或等价静态能力声明。
4. 更新 production catalog、prompt / schema description，使模型看到每个业务 tool 可选 `runtimeMetadata.activitySummary`。
5. 从生产 catalog 和配置中移除或废弃 `reportAgentActivity` 与 `maxActivityReports`。
6. 更新 `/api/chat` stream tests、LangChain runtime tests、tool catalog tests、model-visible contract gate 和前端 activity tests。
7. 运行 `openspec validate add-tool-call-runtime-activity-metadata --strict`、相关 `npm test` 和 `npm run typecheck`。

## Resolved Questions

- 不保留生产 deprecated `reportAgentActivity` 兼容窗口；默认从 production catalog / 默认可用 tools / prompt / 预算说明移除。
- `runtimeMetadata.activitySummary` 由 wrapper / catalog helper 自动注入 provider-visible schema，不写入各业务 tool 的源 `inputSchema`。
- 前端继续显示 `#N` 前缀；重复摘要时只更新前缀，不触发右侧文案动画或重复可访问性播报。
