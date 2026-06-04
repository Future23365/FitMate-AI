## 1. Preflight 与设计确认

- [x] 1.1 读取最新 `codex_logs/ai_trace_log.js`，确认当前失败仍是 `budget_exhausted`、重复 `searchExerciseResources` 调用和缺少跨 run 动作事实导致。
- [x] 1.2 确认 `lib/server/chat/agent-text-chat-service.ts` 当前 production run limits、registry 构造点、AgentRunInput metadata 和 trace 摘要入口。
- [x] 1.3 确认 `searchExerciseResources` 当前 input schema、model-visible manifest、repository 查询入口、projection 和 tool-level tests。
- [x] 1.4 确认当前 ResourceStore / resource contract 是否能支持 read/import tool 产出当前 run consumable resource；如不能，先补充设计说明并暂停确认是否升级为 core contract 变更。
- [x] 1.5 决定动作事实持久化位置：复用现有 conversation artifact / message metadata / recent summary，或新增专门业务事实表；如新增持久化结构，补 Prisma migration、schema 文档和数据库测试计划。
- [x] 1.6 运行 `git status --short`，确认没有无关改动混入本 change。

## 2. Production Tool 预算调整

- [x] 2.1 将 production `/api/chat` Agent run 的 `maxToolCalls` 从 1 调整为 10。
- [x] 2.2 同步调整 `maxPlannerCalls` 和 `maxSteps`，确保 10 次 tool call 加一次 terminal action 不会被 planner / step 上限提前截断。
- [x] 2.3 更新 runtime / trace 摘要，使 production trace 能记录本轮 `maxToolCalls`、`maxPlannerCalls`、`maxSteps` 和预算事件。
- [x] 2.4 补充重复 tool 调用诊断或现有诊断测试，证明相同 toolName、toolVersion 和归一化 input 的重复调用可被 trace / observation 识别。
- [x] 2.5 更新 `tests/agent-core/architecture-boundary.test.ts` 或等价测试，断言 production 文本聊天不再固定 `maxToolCalls: 1`，而是使用 10 次工具预算。

## 3. 用户可见动作事实桥

- [x] 3.1 定义用户可见动作事实 schema，至少包含 `userId`、`conversationId`、`messageId`、fact kind、status、schemaVersion、createdAt、结构化查询摘要和 `displayedExerciseIds`。
- [x] 3.2 在用户可见投影边界保存动作事实，确保 `displayedExerciseIds` 只来自实际展示给用户的动作，不包含未展示内部候选。
- [x] 3.3 如保留 `returnedExerciseIds` 或诊断候选摘要，确保它们不会作为默认刷新排除集合暴露给 Planner。
- [x] 3.4 实现 `/api/chat` 最近动作事实轻量摘要恢复，只暴露 fact ref、messageId、展示动作数量、少量动作摘要和结构化过滤摘要。
- [x] 3.5 确保事实保存失败只记录诊断，不改变本轮用户可见响应、不重试模型、不伪造 tool result。
- [x] 3.6 补充单元测试覆盖用户可见事实保存、轻量摘要恢复、未展示候选不进入默认排除和保存失败非致命。

## 4. 动作事实 Read / Import Tool

- [x] 4.1 新增动作事实 read/import tool bundle，包含 `inputSchema`、`outputSchema`、policy metadata、resource contract、handler、model projection、user projection 和 trace summary。
- [x] 4.2 read/import tool 必须校验当前 actor、`userId`、`conversationId`、message / fact ref、status、kind 和 schemaVersion。
- [x] 4.3 read/import 成功后，将动作事实作为当前 run 的 tool result 或 consumable resource 登记，输出原始结构化查询摘要和 `displayedExerciseIds`。
- [x] 4.4 read/import 失败时返回结构化 failed / diagnostic 结果，不能支撑成功 `final_answer`。
- [x] 4.5 注册 production registry 中允许的动作事实 read/import tool，不注册 fixture tools、训练生成、保存、用户记忆或未声明业务 tool。
- [x] 4.6 更新 model-visible manifest，说明 read/import tool 只用于读取当前用户可访问的历史动作事实，不用于语义分流或保存新事实。
- [x] 4.7 新增 tool-level tests，直接覆盖 read/import handler 或真实执行入口，包括成功读取、跨用户拒绝、跨会话拒绝、缺失事实、过期状态、schemaVersion 不兼容和引用不唯一。

## 5. `searchExerciseResources` 排除能力

- [x] 5.1 扩展 `searchExerciseResources` input schema，新增 `excludeExerciseIds`，包含数组去重、数量上限、id 格式校验和未知字段拒绝。
- [x] 5.2 更新 `description`、`whenToUse`、`whenNotToUse`、schema 描述和 examples，说明 `excludeExerciseIds` 只用于排除用户已看到或明确要求排除的动作 id。
- [x] 5.3 更新动作资源查询 repository，将 `excludeExerciseIds` 下推为数据库 `where` 排除条件，禁止全表读取后内存过滤。
- [x] 5.4 更新 output / projection / trace summary，记录 `excludedCount` 或等价排除摘要，并确保不泄漏完整历史 payload。
- [x] 5.5 覆盖排除后候选不足：不得回填被排除动作，tool result 必须给出结构化候选不足摘要。
- [x] 5.6 保持 `searchExerciseResources` 不支持分页、`limit`、`offset`、`page`、`pageSize`，不产出 `candidateSetId`、`candidate_set` resource、训练卡片或保存事件。
- [x] 5.7 更新 `tests/agent-tools/search-exercise-resources.test.ts`，覆盖 `excludeExerciseIds` 成功排除、非法 id、数量上限、去重、候选不足、projection / trace 和不产出训练候选资源。

## 6. `/api/chat` 刷新链路回归

- [x] 6.1 更新 `tests/chat-service.test.ts` 或等价生产聊天测试，覆盖“再推荐一批”链路：第一轮展示动作事实，第二轮恢复事实，read/import 后用 `excludeExerciseIds` 查询新动作并 `final_answer` 收口。
- [x] 6.2 测试证明第二轮不会因为第二次 tool call 触发 `budget_exhausted`。
- [x] 6.3 测试证明已展示动作不会再次出现在刷新结果中。
- [x] 6.4 测试证明未展示给用户的候选不会被默认排除。
- [x] 6.5 测试候选不足时输出解释或澄清，不回填已排除动作。
- [x] 6.6 测试 `/api/chat` 没有根据“换一批”“再推荐一批”等用户原文关键词直接选择 tool。

## 7. Contract、架构与文档

- [x] 7.1 更新 `tests/agent-core/contract-helper.test.ts`，覆盖 read/import tool 和扩展后的 `searchExerciseResources` contract、policy、resource、projection 和 redaction。
- [x] 7.2 更新 `tests/agent-core/tool-registry-manifest.test.ts`，覆盖 production registry toolNames、schema summary 中的 `excludeExerciseIds` 和 read/import manifest。
- [x] 7.3 更新 `tests/agent-core/architecture-boundary.test.ts`，证明 Agent core 没有具体业务 toolName 分支，`/api/chat` 没有业务关键词分流。
- [x] 7.4 更新 trace / replay 相关测试，覆盖预算事件、动作事实摘要、read/import 结果和排除摘要均为安全投影。
- [x] 7.5 如果新增或调整数据库结构，更新 README 或相关数据库文档，并运行迁移 / schema 相关测试。
- [x] 7.6 更新 `docs/agent-tool-orchestrator-design.md`，补充 production 预算、动作事实桥落地方式、用户可见动作排除边界和禁止项。
- [x] 7.7 如本次实现属于核心链路优化，在 `docs/方案变更历史/` 新增按上海时间记录的变更文档，并在 `docs/项目演变历程.md` 末尾追加简要记录。

## 8. 验证与收尾

- [x] 8.1 运行 `openspec validate support-agent-exercise-refresh-fact-bridge --strict`。
- [x] 8.2 运行 `npm test -- tests/agent-tools/search-exercise-resources.test.ts`。
- [x] 8.3 运行 read/import tool 对应的最窄 tool-level test 文件。
- [x] 8.4 运行 `npm test -- tests/agent-core/contract-helper.test.ts`。
- [x] 8.5 运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`。
- [x] 8.6 运行 `npm test -- tests/agent-core/architecture-boundary.test.ts`。
- [x] 8.7 运行 `npm test -- tests/chat-service.test.ts`。
- [x] 8.8 如修改 API route、Prisma、schema 或持久化边界，运行对应 API / Prisma / repository 测试。
- [x] 8.9 运行 `npm run typecheck`。
- [x] 8.10 最终检查 `git diff`，确认只包含本 change 范围内的 OpenSpec、实现、测试和必要文档，没有混入无关改动。
