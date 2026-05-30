## Context

ConversationArtifact 建立后，聊天编排需要在触发生成、修改或解释前判断用户是否在引用已有卡片。引用表达既可能是“这个”“上一个”这类近指，也可能是“之前那个练胸的”这类语义引用。引用解析必须先走服务端可验证结果，再把明确对象交给后续工具。

## Goals / Non-Goals

**Goals:**

- 输出统一 `ReferenceResolution`，覆盖 resolved、ambiguous、not_found 三种结果。
- 当前会话近指引用优先基于 recent artifacts 的顺序和类型规则解析。
- 语义引用通过 artifact index 检索候选，再用规则和受控 LLM 辅助判断。
- 歧义时返回候选和澄清问题，不让系统猜测修改对象。
- 提供 `getArtifactPayload` 受控读取工具，统一权限校验和 trace 记录。

**Non-Goals:**

- 不实现独立向量数据库或复杂 RAG 排序。
- 不修改训练内容；Patch 属于后续 change。
- 不从旧聊天自然语言中重建 artifact。
- 不处理长期用户记忆写入和策略确认。

## Decisions

### Decision 1: 引用解析在内部动作前执行

`/api/chat` 完成意图识别后，如果用户表达包含引用或修改语义，应先调用 ReferenceResolver，再决定解释、修改、重复生成或追问。

这样可以避免 workout routine / plan 生成服务在不知道目标对象的情况下重新生成内容。

ReferenceResolver 的输入只包含当前 `userId`、`sessionId`、最新用户消息、意图解析结果、当前会话 recent artifact summaries 和按需检索到的候选摘要。输出统一为 `resolved`、`ambiguous` 或 `not_found`，不返回完整 payload。

### Decision 2: 近指引用优先确定性规则

“这个”“刚才那个”“上一个”优先从当前会话 recent artifacts 中按消息顺序和 UI 展示顺序解析。只有类型不明确或候选接近时才进入歧义结果。

近指引用通常由 UI 上下文决定，直接让 LLM 判断反而容易引入幻觉。

如果 recent artifacts 中存在多个同等可引用对象，例如同一轮同时推送 routine 和 plan，而用户只说“这个”，解析结果必须进入 `ambiguous`，并按 UI 展示顺序或 `updatedAt` 倒序返回候选。

### Decision 3: 语义引用使用候选约束

“之前那套练胸的”先用 `ArtifactIndex` 做 userId、kind、scope、目标、肌群、标题、摘要等结构化过滤和文本召回，再让规则或 LLM 在候选集合中选择。

LLM 只能在候选内选择或返回歧义，不能生成不存在的 artifactId。

第一版不引入向量数据库，`searchArtifacts` 使用数据库索引字段和大小写不敏感文本匹配召回候选。服务端会把 `status = active`、当前 `userId` 和可访问 `sessionScope` 作为硬过滤条件。

### Decision 4: payload 读取独立工具化

ReferenceResolver 默认只返回 artifactId、置信度和候选摘要；完整 payload 必须通过 `getArtifactPayload` 读取。该工具统一检查 userId、status 和访问范围。

这能控制模型上下文大小，也让敏感 payload 读取有明确 trace。

`getArtifactPayload` 返回前必须按 artifact kind 和 payload schema version 做 Zod 校验。校验失败时返回工具失败结果并记录 trace，不把未校验 JSON 继续交给后续编排。

### Decision 5: 失败结果由聊天层明确消费

`ambiguous` 结果由 `/api/chat` 生成候选确认问题，并停止本轮修改或重复生成动作。`not_found` 结果返回重新说明或新生成引导，不允许从 `conversationSummary` 或自然语言历史摘要伪造历史卡片。

这样可以把“找不到历史对象”和“需要生成新训练内容”区分开，避免模型在上下文不足时误改或重复生成。

## Risks / Trade-offs

- [Risk] 近指引用在多卡片同消息中可能不明确。→ Mitigation: ReferenceResolver 返回候选和澄清问题，不默认选择。
- [Risk] 语义检索缺少向量能力时召回有限。→ Mitigation: 第一版使用结构化字段和全文匹配，后续由 `change-008-rag-hybrid-search` 扩展。
- [Risk] 解析失败会增加用户追问。→ Mitigation: 澄清问题必须包含候选标题和简短摘要，降低用户确认成本。
- [Risk] LLM 选择候选时输出非法 id。→ Mitigation: 服务端只接受候选集合内 id，否则转为 `ambiguous` 或 `not_found`。
