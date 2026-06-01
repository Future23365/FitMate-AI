## Context

当前 `/api/chat` 的动作替换链路已经具备 ReferenceResolver、WorkoutPatchEngine、ConversationArtifact 和 `assistantSuggestions` 协议，但本次 trace 暴露出一个断点：`exercise_replacement` 在结构恢复后丢失 `action.kind` 和引用需求，导致引用解析被跳过，后续 Patch 没有执行。模型最终回复仍承诺会更新训练内容，但服务端实际没有返回 artifact 或 patch 事件。

另一个断点是替换候选只出现在自然语言正文里。前端现有按钮渲染只消费 `assistantSuggestions`、`suggestedReplies` 或 `suggestedQuestions`，不会也不应该从 Markdown 列表解析业务候选。因此“候选动作列表”和“下一轮用户选择”必须成为服务端结构化协议的一部分。

本设计遵守当前 AI 语义边界：LLM 负责理解用户要替换动作的语义；服务端只基于已解析 artifact、已校验候选集合和上一轮保存的 pending selection 做确定性状态推进，不通过关键词或同义词表重新判断用户意图。

## Goals / Non-Goals

**Goals:**

- 让 `exercise_replacement` 的 resolved intent 始终保留可审计的 action、引用需求和门控结果。
- 用户要求“换成别的”但未指定新动作时，服务端返回可点击替换候选，而不是让模型在正文中自由列候选。
- 用户点击按钮或手动输入候选动作名后，服务端能基于 pending replacement selection 触发 `replace_exercise` Patch，并返回修订后的卡片或明确失败恢复。
- 最终回复必须和 `assistantAction`、`artifactResult`、Patch 结果一致，不能在未触发生成时承诺“稍后会看到更新内容”。
- 用自动化测试覆盖真实回归路径，并在 AI trace 中暴露关键分支。

**Non-Goals:**

- 不让前端从 Markdown 正文中解析动作候选或触发卡片生成。
- 不新增任意 SQL、客户端 Patch 执行器或绕过 userId/sessionId 的读取路径。
- 不改变 `WorkoutPatchEngine` 已有的替换校验原则：替代动作仍必须来自服务端候选集合和数据库。
- 不把服务端改造成新的自然语言语义判断器；候选选择只基于上一轮结构化 pending 状态和候选集合匹配。

## Decisions

### 1. `exercise_replacement` 必须优先恢复为引用型 action

当意图类型是 `exercise_replacement`，但模型输出缺失或误填 `action.kind` 时，服务端应从 `type` 推导 `action.kind = "exercise_replacement"`，并补齐 `referenceRequirement.required = true`。如果引用无法解析，则进入引用澄清；如果引用已解析但缺少替代动作，则进入候选选择；如果替代动作明确，则进入 Patch。

替代方案是接受模型输出的 `action.kind = "none"` 并让最终回复模型自然处理。这个方案已经在 trace 中证明会跳过 Patch 且产生虚假承诺，因此不采用。

### 2. 替换候选使用 `assistantSuggestions`

当服务端已经解析到 source artifact 和 source exercise，但没有 replacement exercise 时，候选选择模块应使用动作候选服务生成替代候选，并输出 `assistantSuggestions`。每条 suggestion 的 `message` 必须是完整用户表达，例如“把上斜哑铃前平举换成侧平举至前平举”，点击后前端只发送该 message。

替代方案是保留正文 Markdown 列表并让前端提取按钮。这个方案会把业务协议耦合到展示文本，且无法保证 trace、持久化和历史恢复一致，因此不采用。

### 3. pending replacement selection 是短期结构化状态

服务端在候选建议产生时保存 pending replacement selection，至少包含 `artifactId`、`artifactKind`、`sourceExerciseId`、source exercise 展示名、候选 `exerciseIds`、创建时间和过期边界。下一轮用户消息如果由按钮发送，message 本身已包含完整替换表达；如果用户手动输入候选动作名，服务端只能在 pending 候选集合内做确定性命中，并补齐 Patch 输入。

这个状态可以先存放在现有 conversation context / saved conversation metadata 中；如果实现发现需要数据库字段，必须使用 userId、sessionId 和无歧义时间字段隔离，并同步文档。

### 4. Patch 是唯一执行替换的写路径

候选选择后不得重新生成整套 routine 或 plan。服务端应调用现有 WorkoutPatchEngine 或等价 Patch 服务生成 `replace_exercise` operation，并让 Validator 校验 replacement exercise、section、器械、难度和训练边界。成功后返回新的 artifact revision；失败时返回可恢复建议。

### 5. 最终回复消费真实结果，不再凭 prompt 承诺

最终回复模型请求应继续包含 `serverAssistantAction`、`serverArtifactResult`、referenceResolution 和 Patch 结果摘要，但服务端还需要兜底：当没有触发 action 或 artifact 未请求时，回复不得声称会生成或更新卡片。对于候选建议、引用澄清和 Patch 成功/失败这些确定性分支，优先使用服务端确定性回复，减少模型误承诺。

## Risks / Trade-offs

- [Risk] pending selection 过期或与最近 artifact 不一致会替换错对象。→ Mitigation: 保存 artifactId、sourceExerciseId 和候选集合，并在消费前重新读取 artifact payload 校验 still active / accessible / contains source exercise。
- [Risk] 候选动作名称相似导致手动输入命中歧义。→ Mitigation: 只在 pending 候选集合内匹配；多候选命中时返回 `assistantSuggestions` 让用户选择，不执行 Patch。
- [Risk] 为 pending selection 增加持久化字段会扩大迁移范围。→ Mitigation: 优先复用现有会话上下文结构；只有实现证明必须跨刷新长期保留时才引入 schema 迁移。
- [Risk] 过度修复模型输出可能违反 AI 语义边界。→ Mitigation: 只修复结构契约不一致，例如 `type=exercise_replacement` 与 `action.kind=none` 的内部冲突；不基于原始文本关键词改写用户语义。
- [Risk] 确定性回复过多导致文本不自然。→ Mitigation: 候选、澄清、成功、失败分支使用短句；复杂说明仍可交给最终回复模型，但必须受真实 action/artifact 结果约束。

## Migration Plan

1. 先补充单元测试复现 trace 中的两段失败：候选按钮缺失、候选选择后不推卡。
2. 修复 resolved intent 恢复和引用需求推导，让 `exercise_replacement` 必须进入引用解析或澄清。
3. 接入候选建议和 pending replacement selection，并保证建议通过 `assistant_suggestions` 流事件输出。
4. 接入 pending selection 消费到 `WorkoutPatchEngine`，成功返回修订 artifact，失败返回可恢复建议。
5. 收紧最终回复生成和 trace 输出，确保 `assistantAction=false` 时不会承诺生成结果。
6. 运行相关单元测试、typecheck、OpenSpec validate；若改动影响真实黑盒 runner，再按需运行对应手动 LLM 流程。

## Open Questions

无。
