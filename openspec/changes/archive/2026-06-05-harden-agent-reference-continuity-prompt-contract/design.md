## Context

当前 `/api/chat` 生产文本聊天已经通过 `AgentAction`、`ToolRegistry`、`observations` 和 tool manifest 让模型自主规划。最近围绕 `visibleTrainingProposal`、`inspectVisibleTrainingProposals` 和刷新语义已经收紧了事实引用边界，服务端不应回到关键词、短句模板或业务条件分流。

本次 trace 暴露的问题不是服务端缺少某个业务分支，而是模型在省略表达或续问场景中没有稳定把“本轮用户请求”和“本轮新增 tool observation”作为回复焦点。模型看到历史 assistant 能力介绍后，可能把历史回复当作当前回复模板，忽略最新事实，导致回答生硬且上下文不连贯。

## Goals / Non-Goals

**Goals:**

- 在通用 Agent prompt 中补齐引用对象推理规则，让模型自行判断本轮请求是否依赖上一轮、当前可见、已生成或已选择的对象。
- 让模型在可见事实不足时自行推理并自然收口：不编造对象、不复读历史 assistant 能力介绍、不由服务端替它决定答案。
- 强化 `inspectVisibleTrainingProposals(list_recent)` 的模型可见 observation 事实边界，说明空索引只是当前可见事实状态，不是业务答案模板。
- 保持模型语义判断优先：服务端只提供结构、权限、事实和模型可见边界。

**Non-Goals:**

- 不新增 `/api/chat` 中的 `换一批`、`再来一组`、`factCount = 0` 或其他自然语言条件分流。
- 不修改 Agent runtime、validator、`Policy Guard`、`ResourceStore`、`Resource Contract Validator` 或 `Response Renderer`。
- 不实现“调用 tool 后必须引用 tool result / resource”的强制 grounding guard。
- 不新增稳定语义外壳或重排 model input 结构；当前实现已有 `messages`、`metadata`、`observations` 和 `toolResults`，本 change 只增强模型可见合同文案。

## Decisions

### 1. 用通用 prompt 引导引用推理，而不是业务条件分支

在 `agent-llm-prompt-config.ts` 增加通用规则：当本轮用户请求表现为省略、续问、替换、调整、继续或引用最近内容时，模型应基于当前可见的 messages、metadata、observations 和 tool results 自行判断被引用对象是否存在且可引用。若事实不足，模型应自然说明缺少可继续操作的上下文并给出可恢复路径。

选择该方案，是因为它不让服务端理解用户语义，也不绑定 `visibleTrainingProposal`、`factCount` 或某个具体 tool。模型仍负责判断“用户是否在引用上一轮东西”，服务端只提供规则和事实边界。

备选方案是新增服务端分支或 validator guard。该方案被排除，因为它会让服务端根据业务条件规定模型输出，违背“模型能力优先，服务端只管契约”的边界。

### 2. observation 只描述事实含义，不描述答案模板

在 `inspectVisibleTrainingProposals` 的 `list_recent` model projection 中补充说明：`facts[]` 是当前 actor 和 conversation 可见、可引用的 `visibleTrainingProposal` 索引；空数组只表示当前可见事实中没有这类引用对象；模型应结合本轮用户请求和上下文自行判断下一步。

该说明不得出现“如果用户说换一批就回答什么”的模板，也不得要求固定 action 或固定 tool 调用顺序。

### 3. 测试验证“没有业务绑定”

测试应覆盖两个方向：

- 正向：prompt 和 observation 表达引用对象推理、缺失上下文收口和最新事实参与推理。
- 反向：prompt、projection 和 route 中不得出现固定短语路由、`factCount = 0` 答案模板或强制 grounding guard。

## Risks / Trade-offs

- [Risk] 只改 prompt 和 observation 仍可能存在个别模型输出不稳定。→ Mitigation：通过黑盒/fixture 场景覆盖省略表达、有引用对象和无引用对象三类路径；如果仍不稳定，后续优先继续增强模型可见事实摘要，而不是新增服务端语义分流。
- [Risk] 通用 prompt 过长会稀释重点。→ Mitigation：新增规则保持短句，放在 terminal action 前的通用推理合同附近，不重复业务 tool manifest。
- [Risk] observation 文案过度业务化。→ Mitigation：只描述事实集合、空结果含义和可消费边界，不包含用户短语、答案模板或固定 action。
