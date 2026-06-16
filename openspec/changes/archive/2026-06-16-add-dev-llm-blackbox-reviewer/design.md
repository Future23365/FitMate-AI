## Context

当前基础 LLM 黑盒测试使用 `manual-tests/llm/fixtures/basic-chat-blackbox-cases.json` 作为执行用例来源。命令行 runner 能真实调用 `/api/chat`，但输出是 Markdown 报告，不适合快速人工查看多轮聊天气泡、训练卡片和建议提问的真实展示效果。

用户希望新增一个页面来自动跑用例并人工审核结果，同时明确要求避免把测试页面嵌入首页整页，避免后续首页布局、输入框、侧栏或欢迎态变化时测试页面频繁跟改。因此本 change 的核心是：测试页只复用稳定的聊天事件、消息投影和消息展示组件，不依赖首页整页 DOM。

## Goals / Non-Goals

**Goals:**

- 新增开发态 `/dev/llm-blackbox` 页面，读取 JSON fixture 并展示 flow 列表。
- 支持运行单个 flow，也支持串行运行全部 flow。
- 自动按 `turns[]` 顺序发送用户消息，等待本轮 `/api/chat` NDJSON `done` 后再进入下一轮。
- 收集每轮用户可见结果，包括 assistant 文本、可见训练输出、建议提问、安全错误和 stream 事件摘要。
- 使用与首页一致的消息展示层渲染用户消息、assistant 消息、Markdown 内容和训练卡片。
- 临时保存本浏览器会话中的运行批次、flow 结果、turn 结果、人工审核结论和备注。
- 展示批次统计：flow / turn 执行数量、通过/失败/跳过数量、人工审核状态、耗时和 token 诊断。
- 保持 dev runner 与首页整页 UI 解耦，让首页布局变化不影响 runner 执行能力。

**Non-Goals:**

- 不新增生产用户功能，不在常规导航中面向普通用户开放。
- 不修改 `/api/chat` 请求 schema、NDJSON 事件合同、LangChain runtime、tool catalog、prompt 或模型可见输入。
- 不使用 iframe、DOM 自动点击、输入框 selector 或首页整页嵌入来驱动测试。
- 不把 `expectedOutput` 作为自动语义评分，不新增 judge 模型。
- 不把临时运行结果保存为生产聊天历史之外的长期业务数据。

## Decisions

### 架构边界与职责

- **生产者**：JSON fixture 文件提供 flow / turn / `expectedOutput`；`/api/chat` 提供真实 NDJSON stream；dev trace store 提供可选 token 诊断。
- **协调者**：`useLlmBlackboxReviewRunner` 或等价 hook 负责运行队列、发送消息、等待 `done`、记录结果和推进下一轮。
- **展示层**：`/dev/llm-blackbox` 页面只展示测试控制、统计、转录和人工审核结果。
- **持久化层**：临时结果只写入 browser `sessionStorage` 或等价 dev-only client store；不写入业务数据库。
- **共享合同**：runner 消费 `BasicChatFixture`、`AgentTextChatEvent`、`ChatMessage`、`ChatVisibleOutput` 和统计 DTO，不消费首页 `ChatPage` 的 DOM 或布局状态。

稳定合同是“fixture -> chat stream -> ChatMessage projection -> transcript render -> review record”。首页整页布局不是稳定合同。

### Fixture 读取模块从 `manual-tests` 抽到共享 dev 入口

当前 fixture parser 位于 `manual-tests/llm/basic-chat-fixtures.ts`。审核页不应从 `manual-tests` 目录导入运行时代码。实现时应抽出：

- `lib/shared/llm-blackbox/basic-chat-fixture-schema.ts`：类型和纯校验 / parse 逻辑。
- `lib/server/dev/llm-blackbox-fixture-store.ts`：服务端读取 JSON 文件。
- `manual-tests/llm/basic-chat-fixtures.ts`：保留为命令行 runner 的薄 adapter，复用上述模块。

这样未来新增第二个 fixture 消费者时，不需要复制 parser 或让 app 页面认识 `manual-tests` 目录。

### Headless runner 不依赖首页 UI

runner 直接调用现有 `requestAgentTextChatResponse()`，并复用 `consumeAgentTextChatNdjson()` 和 `applyAgentTextChatEventToAssistantMessage()` 将 stream 归一为 `ChatMessage`。runner 不能通过 DOM 操作首页输入框，也不能依赖 `.className`、按钮文本、滚动位置或 `ChatPage` 内部状态。

为了保持多轮上下文接近真实首页，runner 每轮应维护与首页一致的：

- `conversationId`
- `responseMessageId`
- `conversationSummary`
- `conversationContext`
- 当前 messages

如果实现复用首页保存逻辑，则每轮结束后可调用现有聊天保存 client，使后续 turn 的服务端 hydration 行为与首页一致；若保存失败，该 turn 应记录为执行失败或诊断失败，不静默继续伪造成功。

### 复用消息展示层，不复用整页

应从 `ChatPage` 中抽出只读 transcript / message bubble 组件，例如：

- `ChatTranscript`
- `ChatMessageBubble`
- `ChatAssistantMessageContent`

这些组件负责渲染 `ChatMessage`、Markdown、`visibleOutputs` 和 suggested questions。首页和审核页都使用这些组件。首页保留自己的 header、sidebar、欢迎态、输入框、滚动和焦点管理；审核页保留自己的测试控制栏、统计和 review 面板。

这种拆分能让“消息内容和卡片样式”跟首页同步，同时避免测试页被首页整页布局变化影响。

### 执行状态与人工审核状态分离

自动执行状态只描述链路是否完成：

- `passed`：收到 `done`，且存在至少一个用户可见回答面。
- `failed`：请求异常、NDJSON 解析失败、缺少 `done`、没有用户可见回答面或保存 / hydration 诊断失败。
- `skipped`：前置 turn 失败导致同 flow 后续 turn 未执行。
- `running` / `queued`：当前批次内的临时状态。

人工审核状态单独记录：

- `unreviewed`
- `accepted`
- `rejected`
- `needs_followup`

`expectedOutput` 用于审核对照，不作为自动语义评分依据。

### 临时结果存储

运行结果应以 `BlackboxReviewRun` 形式暂存在浏览器会话内。建议使用 `sessionStorage` 保存最近若干批次，包含：

- run id、开始 / 结束时间、状态和筛选范围。
- 每个 flow 的执行状态、耗时、turn 结果和人工审核状态。
- 每轮的 `userInput`、`expectedOutput`、assistant message、visible output 摘要、suggested questions、error、eventTypes、conversationId、responseMessageId。
- token 诊断和 trace 关联信息。

存储必须有大小上限和清理入口，避免长文本和卡片 payload 无限堆积。

### Token 与 trace 诊断

token 统计通过 dev trace store 做 best-effort 关联，优先按 `conversationId` / `responseMessageId` 查找当前用户 trace。拿不到 token 时显示“未获取”，不因此判定执行失败。

### UI 结构

推荐布局：

```text
/dev/llm-blackbox
├─ 顶部：运行全部 / 停止 / 清空结果 / 当前批次统计
├─ 左侧：flow 列表、状态、turn 数、人工审核标记
├─ 中间：当前 flow transcript，复用聊天消息展示层
└─ 右侧：当前 turn 的 userInput、expectedOutput、actual summary、token / trace 诊断、人工审核操作
```

页面应以浅色 Material Design 3 风格实现，保持工作台式密度，不做营销式 landing page。

## Risks / Trade-offs

- [Risk] 抽消息展示组件时误把首页布局一起抽走，导致首页和审核页继续耦合 → Mitigation: 只抽 `ChatMessage[]` 到只读转录的渲染组件，首页输入框、欢迎态、header、sidebar、滚动和焦点逻辑不进入共享组件。
- [Risk] runner 只用 client context，不保存会话，导致多轮 hydration 与真实首页不一致 → Mitigation: 复用现有聊天保存 client 或明确记录 hydration/save 诊断；测试覆盖多轮后续请求携带同一 `conversationId` 和累计消息。
- [Risk] token 统计不可用导致页面误判失败 → Mitigation: token 只作为诊断字段，缺失时显示 `missing`，不影响执行状态。
- [Risk] 真实模型调用成本较高 → Mitigation: “运行全部”需要显式确认，支持停止当前批次，默认串行执行，不并发。
- [Risk] `sessionStorage` 容量不足 → Mitigation: 存储摘要和必要可见结果，限制批次数和单轮摘要长度，提供清空按钮。
- [Risk] `/api/chat` 事件合同未来变化 → Mitigation: runner 只通过共享 parser 和 projection 消费事件；事件合同变化会由首页和审核页共同测试暴露，而不是测试页独立失效。

## Migration Plan

1. 新增 shared fixture schema/store，并让现有命令行 runner 继续通过 adapter 使用同一来源。
2. 抽出首页消息展示层，先保持首页视觉不变。
3. 实现 dev review runner 和结果数据模型。
4. 新增 `/dev/llm-blackbox` 页面和临时存储。
5. 补自动化测试和文档，再做浏览器手动验证。

## Open Questions

- 临时结果是否需要跨浏览器刷新保留？默认按 `sessionStorage` 保留当前 tab 会话；如需要跨天复盘，应另开 change 做文件导出或服务端 dev-only 存储。
- 人工审核结论是否需要导出成 JSON / Markdown？本 change 可先保存在临时结果中，导出能力可作为后续增强。
