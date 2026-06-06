## 1. 方案边界与门禁

- [x] 1.1 完成 Agent 修复方案抽象层级门禁审查，确认本 change 的失败证据只作为测试样例，生产规则只落在 `searchExerciseResources` tool 合同、repository policy、observation projection 和 trace summary。
- [x] 1.2 确认任务分类为已有业务 tool 合同调整 / Agent tool bug 修复，不新增业务 tool，不修改 Agent core contract。
- [x] 1.3 记录允许触碰模块：`searchExerciseResources` tool bundle、Exercise repository 查询构造、tool output schema、model observation、trace summary、tool-level tests、manifest / schema summary tests 和必要文档。
- [x] 1.4 记录禁止触碰模块：orchestrator 主循环、`PlannerPort`、Executor、Policy Guard、ResourceStore、Resource Contract Validator、Response Renderer、`/api/chat` production route、服务端用户原文关键词分流、pgvector / RAG 基础设施。
- [x] 1.5 如修改 manifest、schema description、examples、repair feedback、observations 或 compressed tool results，使用 `agent-prompt-contract-governance` 检查模型可见合同；本 change 只定义执行边界。

## 2. Repository 查询策略

- [x] 2.1 为 Exercise resource 查询构造 section-aware hard filter policy，`training` 使用 `training` policy，`warmup` / `stretch` 使用 `support_section` policy。
- [x] 2.2 保持 `training` 查询应用现有结构化 hard filters，包括发布态、section、器械、场地、肌群、难度、分类、动作力学、目标标签、风险标签、`q`、`requiredExerciseIds` 和 `excludeExerciseIds`。
- [x] 2.3 让 `warmup` / `stretch` 查询只应用发布态、section、器械、场地、肌群、`requiredExerciseIds` 和 `excludeExerciseIds` hard filters。
- [x] 2.4 确保 `warmup` / `stretch` 查询中传入的 `level`、`force`、`mechanic`、`category`、`goalTag`、`riskTag` 和 `q` 不进入数据库 `where`，并被记录为未作为 hard filter 使用。
- [x] 2.5 确保 policy 在查询前由 section 决定，不由查空结果、用户原文、`q` 文本、关键词或短句模板触发。
- [x] 2.6 保持 repository 数据库下推，不回退到 `listExerciseRecords()`、`listAllExercises()`、旧 `searchExercises()` 或全量读取后内存过滤。

## 3. Tool 输出与投影

- [x] 3.1 更新 `searchExerciseResources` output schema，新增 `query.filterApplications` 或等价 section 级执行摘要字段。
- [x] 3.2 为每个 section 的 `filterApplications` 输出 `section`、`hardFilterPolicy`、`appliedHardFilters` 和 `unappliedInputFilters`。
- [x] 3.3 为未作为 hard filter 使用的输入字段输出稳定 reason code，例如 `not_applied_as_hard_filter_for_support_section`，避免自由文本 `resultBoundary` 成为唯一边界。
- [x] 3.4 更新 handler 汇总逻辑，让混合 `suitabilities = ["training", "warmup", "stretch"]` 能分别记录每个 section 的 hard filter policy 和 hard filter 应用情况。
- [x] 3.5 更新 `toModelObservation()`，投影 section 级 `filterApplications` 摘要，并保持 observation 只表达 tool 执行事实，不判断最终 routine、plan、visibleOutputs 或用户目标是否满足。
- [x] 3.6 更新 trace summary，记录每个 section 的 `hardFilterPolicy`、applied hard filter 字段名、未应用字段名和 reason code，不泄漏完整 handler output 或完整数据库对象。
- [x] 3.7 检查 `appliedFilters` 现有语义，避免它在混合 section 查询中误导 Planner；如保留该字段，明确 section 级真实执行口径以 `filterApplications` 为准。
- [x] 3.8 确保 repository where 构造和 `filterApplications` 摘要生成共用同一个 section-aware hard filter policy helper，不维护两套字段清单。
- [x] 3.9 确保 `unappliedInputFilters` 在 model observation / trace 中默认只暴露 `field` 和 `code`；如需要值信息，只输出脱敏截断的 `valueSummary`，不得回灌自由文本 `q` 原文。

## 4. Tool 合同与模型可见说明

- [x] 4.1 更新 `searchExerciseResources` manifest / schema description 中关于 support section 查询 policy、`hardFilterPolicy` 和 `filterApplications` 字段含义的中文说明，技术标识保持英文原样。
- [x] 4.2 确保模型可见说明不包含“当用户说 X 时”这类 phrasing 规则，也不要求固定下一步必须调用某个 tool。
- [x] 4.3 确保通用 Agent prompt 不新增 `searchExerciseResources` toolName 特例。
- [x] 4.4 确保 `/api/chat`、handler 和 repository 不新增用户自然语言关键词、正则、同义词表、短句模板或具体 phrasing 分支。
- [x] 4.5 同步检查现有 `suitabilities`、examples 和 whenToUse 文案，避免暗示 `level`、`q` 等字段对 support section 一定作为 hard filter 生效。

## 5. 测试与验证

- [x] 5.1 为 `tests/agent-tools/search-exercise-resources.test.ts` 补回归测试：`warmup/stretch + equipment = "no_equipment" + muscles = ["胸部"] + level = "intermediate"` 不把 `level` 放入 support section hard filter，并能通过 `filterApplications` 披露。
- [x] 5.2 为 `tests/agent-tools/search-exercise-resources.test.ts` 补回归测试：`training + equipment + muscles + level` 仍把 `level` 作为 hard filter。
- [x] 5.3 为混合 section 查询补测试，断言 `training`、`warmup`、`stretch` 分别记录不同 `hardFilterPolicy`。
- [x] 5.4 补测试断言 `warmup` / `stretch` 查询仍保留器械、场地、肌群、required / exclude hard filters；无器械查询不得返回非自重动作。
- [x] 5.5 补测试断言 `warmup` 不返回不能用于 `warmup` 的动作，`stretch` 不返回不能用于 `stretch` 的动作。
- [x] 5.6 补 projection / redaction 测试，断言 `toModelObservation()` 暴露 `filterApplications`，且不泄漏完整数据库对象、完整 handler output、secret 或无关诊断 payload。
- [x] 5.7 补 projection / redaction 测试，断言 `q` 出现在 `unappliedInputFilters` 时 model observation 和 trace 不包含原文，只包含 `field`、`code` 和必要的脱敏 `valueSummary`。
- [x] 5.8 更新 `tests/exercise-repository.test.ts` 或最贴近 repository 的测试，直接断言 section-aware where 构造、`filterApplications` 摘要和数据库下推行为来自同一 policy helper。
- [x] 5.9 如修改 manifest 或 schema summary，更新并运行 `tests/agent-core/tool-registry-manifest.test.ts`。
- [x] 5.10 运行 `openspec validate harden-exercise-support-section-query-policy --strict`。
- [x] 5.11 运行 `npm test -- tests/agent-tools/search-exercise-resources.test.ts`。
- [x] 5.12 运行 `npm test -- tests/exercise-repository.test.ts`。
- [x] 5.13 运行 `npm test -- tests/agent-core/contract-helper.test.ts`。
- [x] 5.14 如修改注册、manifest 或 schema summary，运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`。
- [x] 5.15 运行 `npm test -- tests/agent-core/architecture-boundary.test.ts`，确认没有新增 core 里的业务 toolName 分支或服务端语义分流。
- [x] 5.16 如修改 TypeScript、schema、AI orchestration 或共享业务逻辑，运行 `npm run typecheck`。

## 6. 文档与收尾

- [x] 6.1 如实现阶段改变核心动作查询逻辑，在 `docs/方案变更历史/` 中新增中文方案记录，时间使用上海时间到秒。
- [x] 6.2 如实现阶段影响后续开发的重要问题，在 `docs/项目演变历程.md` 末尾追加简要记录。
- [x] 6.3 最终 diff 检查，确认没有混入 `stage-exercise-semantic-retrieval`、pgvector / RAG、无关 UI、无关 prompt 或已有脏文件。
- [x] 6.4 最终 diff 检查，确认没有新增服务端关键词规则、自然语言模板路由、phrasing 特判或具体业务 `toolName` 语义分支。
