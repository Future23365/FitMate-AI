## 1. 旧接口和旧触发面审计

- [x] 1.1 扫描 active Route Handler，列出 `/api/ai/workout-plan`、`/api/ai/exercise-recommendations` 及其测试、client、hook、mock 引用。
- [x] 1.2 扫描前端聊天新流，列出 `requestWorkoutPlanDraft`、`requestExerciseRecommendations`、旧 trigger JSON parser、assistant 文本 trigger 清理和训练卡片触发引用。
- [x] 1.3 扫描生产目录 legacy 模块，列出旧 `reference-resolver`、旧 workout patch chat 入口、旧 intent/trigger helper、旧推荐/计划服务中仅为旧聊天接口存在的导出。
- [x] 1.4 扫描当前 OpenSpec 主规格和测试文件，列出仍正向要求旧 `/api/ai/*` route、旧 trigger parser 或旧前端 fallback 存在的段落。
- [x] 1.5 更新审计结论，明确每个旧入口的处理方式：删除、迁移到 Agent-first、移动到测试 fixture / 历史兼容 / 离线迁移，或加入 legacy allowlist。

## 2. 删除旧 AI route 和服务端旧入口

- [x] 2.1 删除 `/api/ai/workout-plan` active Route Handler 及只服务该 route 的请求 schema、服务调用边界和 route 测试。
- [x] 2.2 删除 `/api/ai/exercise-recommendations` active Route Handler 及只服务该 route 的请求 schema、服务调用边界和 route 测试。
- [x] 2.3 删除或迁移旧接口专属的计划/推荐服务入口，确保聊天计划、routine、推荐和推荐刷新不会绕过 `/api/chat` Agent-first 主链。
- [x] 2.4 检查删除 route 后的 Next.js route tree、测试 mock 和 barrel export，确保不存在悬空导入或仍可访问的旧兼容 route。

## 3. 迁移前端聊天调用和推荐刷新

- [x] 3.1 删除 `features/chat/api/chat-client.ts` 中旧 `requestWorkoutPlanDraft`、`requestExerciseRecommendations` 或等价旧 route client helper。
- [x] 3.2 将“换一批/刷新推荐”从旧 `/api/ai/exercise-recommendations` 调用迁移到 Agent-first `/api/chat` 请求，或迁移为基于已存在 Agent result 的确定性分页、去重、排除已反馈动作操作。
- [x] 3.3 迁移推荐刷新时保持 LLM 语义边界：不得新增关键词、正则、短句模板、同义词表或用户原文规则来替 Agent 改写推荐目标、器械条件、肌群或 action。
- [x] 3.4 删除前端旧 trigger JSON parser 和 assistant 文本 trigger 清理执行路径；历史展示兼容如确需保留，必须移动到明确的历史/测试边界。
- [x] 3.5 更新聊天卡片触发逻辑，确保 plan、routine、recommendation、patch 和 suggestion 只消费 `agent_execution_result`、artifact / patch / suggestion 事件和 done metadata。

## 4. 隔离或删除生产目录 legacy 模块

- [x] 4.1 删除不再被生产使用的旧 `reference-resolver`、旧 workout patch chat 入口、旧 intent/trigger helper 或旧服务端语义解析模块。
- [x] 4.2 对确需保留的历史展示、离线迁移或测试 fixture 逻辑，移动到非生产边界并改名标识 legacy fixture / historical compatibility。
- [x] 4.3 更新 `docs/legacy-intent-allowlist.md`，记录允许保留项、禁止保留项和新扫描范围，覆盖 active Route Handler、前端新流解析、生产导出、领域服务和当前 OpenSpec 主规格。
- [x] 4.4 增加或更新架构级扫描测试，断言 allowlist 外旧 route、旧 trigger、旧 intent、旧语义解析模块不能被生产路径导入。

## 5. 测试和规格迁移

- [x] 5.1 删除旧 `/api/ai/workout-plan`、`/api/ai/exercise-recommendations` 的正向 route 测试，替换为旧 route 缺席或旧 route 不被前端调用的防回归测试。
- [x] 5.2 更新前端 chat client / hook 测试，断言不会调用旧 `/api/ai/*` route，推荐刷新走 Agent-first 或 result-level 确定性流程。
- [x] 5.3 更新 trigger parser 相关测试，删除新流成功解析旧 trigger 的断言，保留历史 trigger fixture 仅用于证明新流不会把它转成生产执行结果。
- [x] 5.4 更新当前主规格 `openspec/specs/test-coverage/spec.md` 及相关聊天规格，删除对旧接口和旧 trigger parser 的正向要求。
- [x] 5.5 如实现涉及架构说明，更新 `docs/architecture.md`、相关聊天流程文档、`docs/方案变更历史` 和 `docs/项目演变历程.md`，记录旧接口清理原因、关键改动和验证结果。

## 6. 验证

- [x] 6.1 运行旧接口缺席扫描测试，覆盖 active Route Handler、前端 client/hook、生产 `/api/chat`、Agent runtime、Response Writer、领域服务和当前 OpenSpec 主规格。
- [x] 6.2 运行相关自动化测试，例如 chat service、Agent orchestrator、chat client、API route、trigger/legacy cleanup、recommendation refresh 相关测试。
- [x] 6.3 运行 `npm run typecheck`。
- [x] 6.4 影响 Route Handler、服务端/客户端模块边界或删除旧导出后，运行 `npm run build`；如无法运行，必须记录原因和替代验证。
- [x] 6.5 运行 `openspec validate remove-legacy-chat-ai-interfaces --strict`，并在实现完成后更新本 change 的 `tasks.md` 勾选状态。
