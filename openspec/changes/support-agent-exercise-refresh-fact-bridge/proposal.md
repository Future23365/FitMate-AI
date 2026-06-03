## Why

当前 production `/api/chat` 把本轮 Agent 的 `maxToolCalls` 限制为 1，真实模型在完成一次只读动作查询后如果还需要读取上一轮事实、排除已展示动作或继续查询，就会因为预算耗尽而失败。与此同时，`searchExerciseResources` 只能按结构化条件查首批动作，不能表达“换一批 / 再推荐一批 / 不要重复刚才用户已看到的动作”这类跨轮刷新需求。

本 change 需要把生产只读 tool 预算放宽到合理上限，并建立跨 run 用户可见动作事实桥，让模型能通过受控事实恢复找到上一轮已展示动作，再用动作查询 tool 排除这些动作，而不是重复调用同一输入或依赖自然语言历史反推。

## What Changes

- 将 production `/api/chat` Agent run 的只读 tool 总调用预算从当前 1 次放宽到 10 次，并同步 planner / step 预算，使“读取上一轮事实 -> 查询新动作 -> 收口回答”等多步链路可以完成。
- 为用户可见的动作查询 / 推荐结果建立跨 run 业务事实桥：服务端持久化轻量、可审计的已展示动作事实，并在下一轮上下文中恢复可引用摘要。
- 新增或接入受控 read/import 能力，用于按权限、会话、消息、状态和 schemaVersion 读取上一轮用户可见动作事实，并把它登记为当前 run 的可消费资源或等价安全事实。
- 扩展 `searchExerciseResources` 输入合同，支持 `excludeExerciseIds` 排除指定动作 id；刷新场景默认只排除用户已看到的动作 id，不排除未展示给用户的候选。
- 保持服务端语义边界：`/api/chat` 不根据“换一批”“再推荐一批”等关键词选择 tool，不改写 Planner action，不从自然语言回复正文反推结构化动作事实。
- 增加重复 tool 调用和预算风险门禁：同一 tool + 同一归一化输入的重复调用必须可诊断，不能靠提高预算掩盖模型空转。

## Capabilities

### New Capabilities

- `agent-exercise-refresh-fact-bridge`: 定义跨 run 用户可见动作事实的持久化、轻量恢复、read/import、权限隔离、ResourceStore 登记和刷新排除边界。

### Modified Capabilities

- `agent-tool-production-hardening`: 调整 production Agent tool / planner / step 预算要求，使低风险只读多工具链路不再被 1 次 tool 调用上限阻断，同时保留预算、重复调用和 trace 约束。
- `agent-exercise-resource-query-tool`: 扩展 `searchExerciseResources` 查询合同，允许 `excludeExerciseIds` 排除特定发布态动作 id，并要求查询、投影和测试覆盖刷新场景。
- `agent-text-chat-flow`: 调整 `/api/chat` production 接入要求，允许恢复跨 run 动作事实摘要并注册对应 read/import 能力，但禁止服务端关键词分流和自然语言事实反推。

## Impact

- 预计影响代码：
  - `lib/server/chat/agent-text-chat-service.ts` 的 production Agent run 预算配置。
  - `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts` 的 input schema、manifest、handler 和 projection。
  - `lib/server/exercises/**` 的动作资源查询 repository，新增排除 id 条件。
  - 业务事实持久化 / 索引 / 上下文恢复边界，例如 conversation artifact、message metadata、recent summary 或新增受控事实表 / store。
  - `lib/server/agent-tools/**` 和 registry 接线，新增或注册读取最近动作事实的 read/import tool。
  - trace / replay / response projection 的摘要记录。
- 预计新增或更新测试：
  - `tests/agent-tools/search-exercise-resources.test.ts` 覆盖 `excludeExerciseIds`、候选不足、只排除已展示动作和重复调用边界。
  - Agent core / production hardening 测试覆盖 `maxToolCalls: 10` 及同步 planner / step 预算。
  - chat service 测试覆盖“再推荐一批”通过恢复事实和排除已展示动作完成，而不是触发 `budget_exhausted`。
  - ResourceStore / read-import tool / 权限隔离测试覆盖跨用户、跨会话、过期 schema 和引用不唯一。
  - architecture boundary 测试继续证明 `/api/chat` 没有业务关键词分流，core 中没有业务 toolName 分支。
- 不涉及前端 UI 改造、训练计划生成、保存训练计划、用户长期偏好写入、医疗建议或未发布动作查询。
