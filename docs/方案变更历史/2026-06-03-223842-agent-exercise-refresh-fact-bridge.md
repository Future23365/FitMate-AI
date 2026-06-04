# 2026-06-03 22:38:42 CST Agent 动作刷新事实桥落地

## 当前问题

生产 `/api/chat` 的 Agent tool 预算固定为 1 次，模型在“再推荐一批”这类多步只读链路里无法先读取上一轮事实再查询新动作。`searchExerciseResources` 也缺少结构化排除字段，只能重复同一输入；同时上一轮动作结果没有跨 run 的受控业务事实桥，模型只能依赖自然语言历史猜测。

另一个关键问题是“用户可见动作事实”不能由模型定义。模型看到 `tool result` 或写出 `final_answer` 时，并不知道哪些动作最终通过服务端用户投影进入响应边界，因此服务端必须用确定性投影保存事实。

## 调整思路

- 新增 `ConversationBusinessFact` 持久化表，保存轻量业务事实，不依赖 assistant `ChatMessage` 已经存在。
- 只从 `Response Renderer` 输出的 `searchExerciseResources` 用户投影中提取 `displayedExerciseIds`，不从模型 observation、handler output、trace 或自然语言正文反推。
- 在下一轮 `/api/chat` 中只恢复 recent fact 轻量摘要，完整事实必须通过 `readRecentExerciseRecommendationFact` read/import tool 读取。
- `readRecentExerciseRecommendationFact` 成功后通过现有 `resourceContract.produces` 登记当前 run 的 `exercise_recommendation_fact` consumable resource，不修改 Agent core 主循环。
- `searchExerciseResources` 增加 `excludeExerciseIds`，在 repository 层下推为 Prisma `where.id.notIn`，用于排除上一轮已展示动作。
- production `/api/chat` 将只读 tool 预算调整为 `maxToolCalls=10`、`maxPlannerCalls=11`、`maxSteps=22`，并补 `duplicate_tool_call` trace/replay 诊断。

## 关键改动

- 新增动作事实 store：负责保存用户投影事实、恢复轻量摘要、读取完整事实。
- 新增 read/import tool：`readRecentExerciseRecommendationFact`。
- 扩展 production registry：允许 `readRecentExerciseRecommendationFact` 和 `searchExerciseResources` 两个低风险只读 tool。
- 扩展 `searchExerciseResources.excludeExerciseIds`、manifest、projection、repository 查询和测试。
- `/api/chat` 在构造 `AgentRunInput` 前恢复 recent fact summary，并在响应投影后尝试保存动作事实；保存失败只进入 trace 诊断，不改变用户响应。

## 验证重点

- tool-level 测试覆盖 `searchExerciseResources.excludeExerciseIds`、候选不足和重复调用诊断。
- read/import tool 测试覆盖成功读取、不可访问失败、输入 schema 拒绝和当前 run resource 登记。
- chat service 测试覆盖“再推荐一批”链路：恢复 fact、read/import、排除已展示动作、再次查询并 `final_answer` 收口。
- architecture / manifest / contract 测试覆盖 production registry、模型可见 schema 和无服务端关键词分流。
