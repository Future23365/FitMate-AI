## Why

最新 AI Trace 暴露出一个用户可见回归：用户在刚生成“30 分钟哑铃上肢训练”后输入“`不用哑铃了，换一个`”，系统没有把它当作对最近 routine 的器械约束调整，反而用整句做 artifact 搜索，把“哑铃”当正向匹配，最终返回多条仍含哑铃的候选澄清。

这会同时破坏训练编排正确性和聊天可读性：用户已经明确否定哑铃，系统却把哑铃方案作为候选展示，并且确定性澄清回复被拼成一整段长文本，难以阅读和点击确认。

## What Changes

- 修正短指令器械调整链路：当最近上下文存在 active routine 或 plan，且 LLM 识别用户要调整训练内容时，当前消息中的否定器械/场地约束必须覆盖历史器械条件，并触发可执行的 `workout_patch` 或重新生成 routine/plan，而不是退化为普通引用澄清。
- 收紧 `ReferenceResolver` 对当前会话 recent artifact 的优先级：已有唯一可调整 routine/plan 且用户本轮表达为修改、替换、调整或重新生成时，应优先解析最近 artifact；只有 recent artifacts 不唯一或不满足 kind 时才进入语义检索或澄清。
- 调整 artifact hybrid search 的否定约束处理：`不用哑铃`、`不要哑铃`、`无器械` 等当前消息约束不得把被否定器械作为正向召回和 rerank 加分依据。
- 优化引用澄清回复格式：候选确认问题必须使用可读的多行列表或等价结构化输出，候选建议继续通过 `assistantSuggestions` 输出，且不得优先展示明显违反当前否定约束的候选。
- 更新 summary 写入边界：当本轮用户明确覆盖器械条件时，新的 `conversationSummary` 必须记录“当前已改为不使用哑铃/无器械”等覆盖事实，而不是继续强化旧哑铃条件。
- 增加单元测试、OpenSpec 校验和必要的黑盒 flow 断言，覆盖“已有哑铃 routine -> 用户说不用哑铃换一个 -> 不再推荐哑铃且回复可读”的链路。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `chat-intent-decision-flow`: 明确已有 routine/plan 后的否定器械短指令必须走可执行调整链路，并保持 resolved intent、引用需求和回复一致。
- `reference-resolver`: 明确当前会话唯一 recent artifact 在短指令调整中的优先级，并约束澄清候选的可读输出。
- `rag-hybrid-search`: 明确 artifact 检索对否定器械/场地约束的处理，避免把被否定词作为正向匹配加分。
- `assistant-suggestions`: 明确引用确认建议不得优先展示违反当前用户否定约束的候选，且用户可见候选必须保持可点击、可读。
- `chat-context-summarization`: 明确当前消息覆盖历史器械条件时 summary 必须保存覆盖后的事实。

## Impact

- 影响 `lib/server/chat/chat-service.ts` 的 resolved intent 创建、引用解析调用、确定性回复和 summary 更新输入。
- 影响 `lib/server/reference-resolver/reference-resolver-service.ts` 的 recent artifact 优先级、语义查询构造和澄清文案。
- 影响 `lib/server/conversation-artifacts/artifact-service.ts` 或等价搜索层的否定约束处理与 rerank 诊断。
- 可能影响 `lib/server/workout-patches/*` 或 routine 重新生成路径，用于把器械变化应用到已有训练卡片。
- 需要补充 `tests/chat-service.test.ts`、`tests/reference-resolver-service.test.ts`、`tests/conversation-artifact-service.test.ts`、`tests/conversation-summary-service.test.ts` 或黑盒 flow 策略测试。
