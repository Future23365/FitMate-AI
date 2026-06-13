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

迁移完成后，生产 tool catalog 不应再暴露 `reportAgentActivity` 作为活动条主入口。相关配置中的 `maxActivityReports` 需要删除或改名为 runtime metadata projection 防刷屏边界，例如 `maxActivityMetadataEvents`，并且不再以独立 tool 次数计数。

如果保留短期兼容，只能在迁移窗口内作为 deprecated tool，并且不得作为最终实现依赖；OpenSpec 实现任务应默认移除生产 catalog 中的独立 activity tool。

### 6. 前端只对真实文案变化做滚动

`agent_loop` 和 `agent_progress` 继续保持独立状态：

- `agent_loop` 只更新 `loopTurn`。
- `agent_progress.activitySummary` 或 stage fallback 只更新右侧文案。

活动条可以显示新的 `#N` 前缀，但如果右侧文案与上一帧相同，不能触发“上一条文案滚出 / 同一文案滚入”的滚动动画。这样保留 loop 前缀可见，同时避免重复文案刷屏。

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

## Open Questions

- 是否需要保留一个短期 deprecated `reportAgentActivity` 兼容窗口，还是实现时直接从生产 catalog 移除？
- `runtimeMetadata.activitySummary` 是否在 provider-visible schema 中设为全局 optional，还是对所有业务 tool 通过 helper 自动注入并隐藏在源业务 schema 外？
- 前端是否继续显示 `#N` 前缀，还是在重复摘要场景只更新不可动画的前缀文本？
