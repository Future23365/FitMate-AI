## 1. 范围和门禁

- [x] 1.1 运行 `git status --short`，确认不混入无关本地改动，尤其不修改已有脏文件。
- [x] 1.2 完成 Agent tool 变更治理检查，确认本 change 类型为 `searchExerciseResources` 既有 tool 合同调整。
- [x] 1.3 完成抽象层级门禁审查，确认方案只修改业务 tool 合同、repository 映射、manifest / projection 和测试，不把具体 trace、用户原话或 `Pushups` 个例升格为通用生产规则。
- [x] 1.4 确认允许触碰模块：`lib/server/agent-tools/exercises/search-exercise-resources.tool.ts`、`lib/server/exercises/exercise-repository.ts`、production registry / manifest 构造入口、相关 projection / trace 摘要和测试。
- [x] 1.5 确认禁止触碰模块：`/api/chat` 主链路、Agent runtime 主循环、`PlannerPort`、Executor 主流程、`Policy Guard`、`ResourceStore`、`Resource Contract Validator`、Response Renderer 主流程。
- [x] 1.6 确认不新增服务端关键词、正则、同义词表、短句模板、自然语言模板路由或具体业务 `toolName` 语义分支。

## 2. Tool 输入合同

- [x] 2.1 更新 `searchExerciseResources` input schema / schema description，表达 `equipment` 是器械可用性或器械类别筛选。
- [x] 2.2 在 `equipment` 查询合同中新增 `no_equipment` / `无器械` 语义，并说明该值表示不需要外部器械。
- [x] 2.3 更新 `homeRequirement` schema description，表达它只表示环境、场地或支撑条件，不表示器械可用性。
- [x] 2.4 从 Planner 可见 `homeRequirement` catalog、schema description 和 examples 中移除 `none` / `无器械`。
- [x] 2.5 确认不为旧输入 `homeRequirement = "none"` 或 `"无器械"` 添加 alias、fallback、自动迁移或兼容成功路径。
- [x] 2.6 更新非法输入边界，确认未知字段、分页字段、消费侧字段和旧错误字段组合仍在 handler 执行前被拒绝或进入 repair 边界。

## 3. Facet Catalog 和模型可见说明

- [x] 3.1 更新 `facetCatalog` 构造，使 `facetCatalog.equipment` 包含 `no_equipment` / `无器械` 作为 tool 合同层稳定查询语义。
- [x] 3.2 更新 `facetCatalog` 构造，使 `facetCatalog.homeRequirements` 不包含 `none` / `无器械`，只保留环境、场地或支撑条件类值。
- [x] 3.3 更新 `searchExerciseResources` 的 `description`、`whenToUse`、`whenNotToUse`，说明 `equipment` 与 `homeRequirement` 的职责分离。
- [x] 3.4 更新 examples，删除 `Pushups` + `homeRequirement = "none"` 这类错误组合。
- [x] 3.5 新增无器械动作查询 example，使用 `equipment = "no_equipment"` 或 `equipment = "无器械"`，不得同时默认传 `homeRequirement = "none"`。
- [x] 3.6 确认 manifest / examples 不把“用户说无器械时必须怎么查”写成固定短语触发规则；只描述 tool 字段语义和可执行查询值。

## 4. Repository 查询映射

- [x] 4.1 更新 `searchExerciseResourceSummaries()` 或对应 where 构造逻辑，将 `equipment = "no_equipment"` / `"无器械"` 下推为数据库自重动作条件，例如 `equipment = "body only"` 或 `equipmentZh = "自重"`。
- [x] 4.2 确认 `equipment = "no_equipment"` / `"无器械"` 不会默认附加 `homeRequirement = "none"`、`homeRequirementZh = "无器械"` 或等价环境条件。
- [x] 4.3 确认显式传入合法 `homeRequirement` 时，repository 才叠加环境条件过滤。
- [x] 4.4 确认 repository 仍使用 `count()` 和 `findMany({ take: maxReturned + 1, select })`，不回退到全表读取、旧 `searchExercises()`、hybrid search 或 pgvector rerank。
- [x] 4.5 更新 applied filters / query summary，使输出能表达 `equipment = "no_equipment"` 的实际查询口径，并保留动作事实中的真实 `equipmentZh` 与 `homeRequirementZh`。

## 5. Projection / Trace / Observation

- [x] 5.1 更新 `toModelObservation` 或等价压缩 tool result，表达 `equipment` 与 `homeRequirement` 的实际 applied filters。
- [x] 5.2 确认 model observation 不把 `homeRequirement = "none"` 表达为无器械查询证据。
- [x] 5.3 更新 user projection，确保用户可见摘要可以展示动作真实 `equipmentZh` 和 `homeRequirementZh`，但不把底层 `none` 误解释为器械条件。
- [x] 5.4 更新 trace summary，记录 `no_equipment` 查询语义和数据库映射摘要，不记录完整 handler output 或大 payload。

## 6. 自动化测试

- [x] 6.1 更新或新增 `tests/agent-tools/search-exercise-resources.test.ts`，覆盖 `equipment = "no_equipment"` / `"无器械"` 可命中 `equipment = "body only"` / `equipmentZh = "自重"` 的动作。
- [x] 6.2 在 tool-level tests 中覆盖自重但 `homeRequirement = "floor"` 的训练动作可以被无器械查询返回，例如俯卧撑或等价自重地面动作 fixture。
- [x] 6.3 在 tool-level tests 中覆盖无器械查询不会默认加入 `homeRequirement = "none"` 或 `"无器械"`。
- [x] 6.4 在 tool-level tests 中覆盖 `homeRequirement = "none"` / `"无器械"` 不会被 handler 自动迁移成 `equipment = "no_equipment"`。
- [x] 6.5 更新 `tests/agent-core/tool-registry-manifest.test.ts`，覆盖 Planner 可见 `facetCatalog.equipment` 包含 `no_equipment` / `无器械`，`facetCatalog.homeRequirements` 不包含 `none` / `无器械`。
- [x] 6.6 更新 manifest tests，确认 examples 不包含 `Pushups` + `homeRequirement = "none"` 或其他用 `homeRequirement` 表达无器械的错误组合。
- [x] 6.7 更新 `tests/agent-core/contract-helper.test.ts` 或等价 model observation 测试，覆盖 applied filters / compressed tool result 的无器械查询表达。
- [x] 6.8 更新 `tests/chat-service.test.ts` 或等价生产聊天回归，覆盖模型可见合同可通过 `equipment = "no_equipment"` 获得自重胸部动作事实。
- [x] 6.9 更新或运行 `tests/agent-core/architecture-boundary.test.ts`，确认没有新增 `/api/chat` 关键词分流、Agent core 业务 `toolName` 分支、handler 自然语言模板或服务端同义词表。

## 7. 验证

- [x] 7.1 运行 `openspec validate harden-no-equipment-resource-query-contract --strict`。
- [x] 7.2 运行 `npm test -- tests/agent-tools/search-exercise-resources.test.ts` 或当前最窄 tool-level 测试文件。
- [x] 7.3 运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`。
- [x] 7.4 运行 `npm test -- tests/agent-core/contract-helper.test.ts`。
- [x] 7.5 运行 `npm test -- tests/chat-service.test.ts` 或更窄的 production chat 回归。
- [x] 7.6 运行 `npm test -- tests/agent-core/architecture-boundary.test.ts`。
- [x] 7.7 如修改 TypeScript、schema、AI orchestration 或共享业务逻辑，运行 `npm run typecheck`。
- [x] 7.8 最终检查 `git diff`，确认没有旧兼容分支、服务端语义分流、无关格式化或无关本地文件混入。
