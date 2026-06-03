## Context

最新 trace 显示，用户在同一会话里说“再推荐一批”后，模型先成功调用 `searchExerciseResources` 查询腿部训练动作，但第二轮没有输出 `final_answer`，而是重复调用同一 tool 和同一输入。生产 `/api/chat` 当前把 `maxToolCalls` 限制为 1，导致第二次 tool call 被 runtime 以 `budget_exhausted` 拦截。这个失败不是数据库、schema 或 handler 错误，而是 production 预算过窄、动作查询 tool 缺少刷新表达能力、跨 run 用户可见事实没有进入当前 run 的组合问题。

现有 `docs/agent-tool-orchestrator-design.md` 已经定义 `13.1 跨 run 业务事实桥`：旧 run 的 resource 不能直接被新 run 消费，必须先进入业务事实源，再通过 read/import tool 重新引入当前 run。这个 change 的实现应落到该原则，而不是把上一轮 assistant 文本塞给模型，让模型从自然语言里猜动作 id。

任务分类：

- 主类型：Agent tool bug 修复 + production 接入变更。
- 伴随类型：已有业务 tool 合同扩展、跨 run 业务事实桥落地。
- 模型可见合同类型：业务 tool manifest / schema 描述 / examples、上下文恢复摘要、read/import tool manifest。
- core contract 变更：原则上不修改 Runtime 主循环、PlannerPort、Executor 主流程、Policy Guard 主流程、Resource Contract Validator 主流程或 Response Renderer 主流程；如果实现时发现当前 resource contract 无法表达 read/import 资源登记，应先补设计说明并确认是否升级为 core contract 变更。

允许触碰模块：

- `/api/chat` production Agent run limits 和 AgentRunInput 上下文恢复组装。
- 业务事实持久化 / 索引 / recent summary 读取边界。
- `lib/server/agent-tools/**` 中的动作事实 read/import tool 和 `searchExerciseResources` 合同扩展。
- `lib/server/exercises/**` 查询 repository，增加 `excludeExerciseIds` 数据库下推条件。
- trace / replay 摘要、registry manifest、安全 projection。
- 对应 OpenSpec、架构文档、演变历史文档和自动化测试。

禁止触碰模块：

- 不在 `/api/chat` 中按“换一批”“再推荐一批”等用户原文做关键词分流。
- 不让服务端改写 Planner 的语义 action。
- 不从 assistant 自然语言正文反向重建动作事实。
- 不把 `searchExerciseResources` 改成训练生成、候选集合、保存或卡片生成 super tool。
- 不用提高 tool 预算掩盖重复空转。

## Goals / Non-Goals

**Goals:**

- 将 production 文本聊天 tool 总预算从 1 放宽到 10，并同步 planner / step 上限。
- 让模型可以完成多步只读链路，例如读取上一轮动作事实、排除已展示动作、再次查询动作、最终回答。
- 只把用户实际看到的动作 id 作为默认刷新排除集合。
- 让 `searchExerciseResources` 支持 `excludeExerciseIds`，并在数据库层排除。
- 建立跨 run 动作事实桥，使上一轮用户可见动作事实能被下一轮安全读取并登记到当前 run。
- 保持服务端语义边界，继续由 LLM 基于 tool manifest 和上下文决定是否 read/import 或 query。

**Non-Goals:**

- 不新增分页、offset、pageSize 或 LLM 可控返回数量参数。
- 不把未展示给用户的内部候选默认排除。
- 不注册训练生成、保存 artifact、用户记忆写入、动作详情读取或 routine / plan / patch 候选集合 tool。
- 不查询未发布动作。
- 不依赖前端按钮或旧 `assistant_action` 事件恢复“换一批”。
- 不把跨 run 事实保存在 Orchestrator core 内部状态。

## Decisions

### Decision 1: Production tool 预算设为 10，并同步 planner / step 上限

production `/api/chat` 的 `maxToolCalls` 应从 1 调整为 10。为了让 10 次 tool call 后仍可输出 terminal action，`maxPlannerCalls` 和 `maxSteps` 也必须同步提高，不能继续停在 4。

理由：只要 registry 里有超过一个只读 tool，`maxToolCalls: 1` 就无法支持“read/import -> query -> answer”这类基本链路。10 次是足够覆盖短链路的上限，同时仍能防止无限 tool loop。

备选方案：只把 `maxToolCalls` 调成 2。该方案能修当前单例，但后续多 tool 链路仍会频繁碰顶，放弃。

备选方案：取消 tool 预算。该方案会放大成本和空转风险，放弃。

### Decision 2: 预算放宽必须配套重复调用诊断

提高预算不能被当作重复调用的修复。实现应保留并增强 “同一 tool + 同一归一化 input” 的 trace 摘要，必要时通过 observation、duplicate failure 或等价机制提示模型停止重复输入。

理由：当前失败中第二次调用和第一次输入相同。如果只放宽预算，模型可能连续多次重复查同一批数据，成本变高但体验不变。

### Decision 3: 持久化的是用户可见动作事实，不是 handler 完整 output

用户可见动作事实应来自 Response Renderer 或等价用户投影边界：只有进入用户可见事件 / 气泡 / 卡片投影的动作 id 才进入 `displayedExerciseIds`。handler 返回但没有展示给用户的动作，不进入默认排除集合。

理由：用户明确没看到的动作不应被排除。否则“换一批”会过早耗尽候选，还会让用户错过其实没有展示过的动作。

备选方案：直接把 `returnedExerciseIds` 全部排除。该方案实现简单，但会排除用户没看到的动作，放弃。

### Decision 4: `/api/chat` 只恢复轻量索引，完整事实由 read/import tool 读取

下一轮上下文可以恢复最近动作事实的轻量摘要，例如 fact ref、messageId、展示动作数量、少量动作名 / id 和原始过滤摘要。完整事实必须由 read/import tool 按权限和 schema 读取，并作为当前 run 的 tool result 或 consumable resource 登记。

理由：这符合 `13.1 跨 run 业务事实桥`。模型看见“有上一轮动作事实”即可决定是否读取；服务端不应该把完整历史 payload 直接塞进每轮上下文，也不能让旧 run resource id 跨 run 复用。

### Decision 5: `searchExerciseResources` 支持 `excludeExerciseIds`

`excludeExerciseIds` 是动作查询 tool 的结构化排除字段。它必须有数量上限、去重、id 格式校验和数据库下推。刷新场景优先由 read/import tool 返回的 `displayedExerciseIds` 填充。

理由：分页只能表达“下一页”，不能表达“不要重复用户已看到的动作”。排除字段能覆盖“换一批”“别再推荐这几个”“继续同类但不要重复”等需求。

备选方案：新增分页参数。该方案不能保证用户不看到重复动作，并且之前已经刻意把分页从模型可见查询 tool 中排除，放弃。

### Decision 6: read/import tool 是业务 tool，不是 core 特例

动作事实 read/import 能力应作为一个低风险只读业务 tool 接入 registry。它校验 `userId`、`conversationId`、message / fact ref、status 和 schemaVersion，成功后把事实作为当前 run 的安全结果登记。core 只认识通用 resource / tool result，不认识动作事实语义。

理由：跨 run 事实桥是业务层职责。把动作事实类型写进 Runtime 或 Action Validator 会污染 core。

### Decision 7: 刷新失败必须诚实收口

排除已展示动作后，如果没有更多符合条件的动作，模型应基于结构化结果输出 `final_answer` 解释没有更多未重复动作，或用 `ask_user` 询问是否放宽器械、难度、部位或训练阶段。系统不得为了填满列表回填被排除动作。

## Risks / Trade-offs

- [Risk] 10 次 tool 调用带来 token 和模型调用成本上涨。→ Mitigation: 同步 observation 压缩、trace 预算摘要、重复调用诊断和相关成本测试；后续可按 tool risk 分层预算。
- [Risk] 模型仍重复调用同一 tool。→ Mitigation: 记录同一归一化 input 的重复调用，并通过结构化 observation 或 duplicate boundary 引导模型收口或调整输入。
- [Risk] 跨 run 事实泄漏到其他用户或会话。→ Mitigation: read/import tool 必须校验 actor、userId、conversationId、scope、status 和 schemaVersion；测试覆盖跨用户和跨会话拒绝。
- [Risk] 系统误排除用户没看到的动作。→ Mitigation: 明确区分 `displayedExerciseIds` 和内部 `returnedExerciseIds`；默认刷新只用 displayed 集合。
- [Risk] 模型从轻量摘要里猜完整 payload。→ Mitigation: 下游消费必须依赖当前 run 的 read/import tool result 或 resource；旧 run id 和自然语言摘要不能直接消费。
- [Risk] 新事实源需要 Prisma migration。→ Mitigation: 实现前在 tasks 中要求明确选择复用现有 conversation artifact / message metadata 还是新增表；如新增持久化结构必须包含 migration、schema 测试和文档更新。
- [Risk] `searchExerciseResources` 被扩成推荐编排工具。→ Mitigation: 只新增排除字段，不新增候选集合、训练生成、分页、保存或卡片副作用。

## Migration Plan

1. 先实现预算调整和测试，证明 production text chat 不再固定 1 次 tool call。
2. 选择并实现动作事实持久化位置，确保只记录用户可见动作 id。
3. 接入 `/api/chat` 轻量事实摘要恢复。
4. 新增 read/import tool，并通过 ResourceStore 或等价当前 run 边界重新引入事实。
5. 扩展 `searchExerciseResources.excludeExerciseIds` 和 repository 查询。
6. 补齐“再推荐一批”自动化回归，确认不会重复展示已看动作。
7. 更新架构文档和演变历史。

回滚策略：如果事实桥实现出现问题，可以保留 `maxToolCalls: 10` 和 `excludeExerciseIds`，临时关闭 recent fact 恢复 / read-import registry 接线，使生产聊天回到普通动作查询能力；不得回滚到服务端关键词分流。

## Open Questions

- 动作事实持久化优先复用现有 conversation artifact / message metadata，还是新增专门的 `ConversationBusinessFact` / 等价表？实现前需要根据当前数据模型选择。
- 用户可见动作事实的保存点应绑定 Response Renderer 输出，还是绑定 `tool_result` NDJSON 事件生成？实现时需要以“用户实际可见”为准。
- read/import tool 的名称和资源类型命名需要在实现前固定，例如 `readRecentExerciseRecommendationFact` 与 `exercise_recommendation_fact`。
