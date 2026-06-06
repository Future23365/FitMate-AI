## 1. 合同与阶段边界

- [ ] 1.1 对照 `docs/agent-tool-orchestrator-design.md`，确认第一阶段只属于 Exercise index / refresh / validate 基础设施，不属于 Agent query 行为变更。
- [ ] 1.2 对照 `agent-tool-change-governance`，记录 resource 为发布态 `Exercise`，第一阶段能力族为 index / refresh / validate，第二阶段能力族才是 query。
- [ ] 1.3 确认本 change 不新增服务端关键词路由、自然语言模板分流、同义词 intent 判断、具体 `toolName` 分支或基于用户原文改写 tool input 的逻辑。
- [ ] 1.4 实现前检查 Git 工作区，隔离无关脏文件，尤其不得把 `next-env.d.ts` 或用户已有改动混入提交。

## 2. 第一阶段：Exercise 向量数据基础设施

- [ ] 2.1 盘点当前 `Exercise.embeddingText`、`Exercise.embedding`、`lib/shared/search/hybrid-search.ts`、现有回填脚本和 Prisma schema，确认哪些字段需要保留、迁移或替换。
- [ ] 2.2 在集中配置中定义 Exercise embedding 维度、版本、回填批量大小和 pgvector 索引策略；业务模块不得散落 `MAX_*`、`DEFAULT_*`、`EMBEDDING_*` 等运行参数。
- [ ] 2.3 增加 pgvector migration，启用或校验 extension，并为 Exercise 提供固定维度 pgvector 存储和索引；如果 Prisma 需要 `Unsupported("vector(...)")` 或 raw SQL，需在设计说明和测试中覆盖。
- [ ] 2.4 建立 Exercise `embeddingText` builder，覆盖动作名称、别名、分类、器械、居家条件、主 / 辅肌群、`allowedSections`、`movementPattern`、`intensityRole`、`goalTags` 和安全适用场景字段。
- [ ] 2.5 优化本地 `Local Hash V1`：字段权重、中文 / 英文混合短语、归一化、term expansion 和向量归一化；不调用外部 embedding model。
- [ ] 2.6 如果优化改变向量维度、hash 槽位语义或不可兼容算法，新增 embedding version 并要求全量回填；不得无版本覆盖旧向量。
- [ ] 2.7 增加 Exercise embedding 回填 / 刷新脚本，输出处理数量、跳过数量、失败数量、版本和维度摘要，并支持重复执行。
- [ ] 2.8 增加数据层测试，覆盖 `embeddingText` 构建、向量稳定性、维度校验、空文本诊断、版本不一致诊断和回填不修改业务字段。
- [ ] 2.9 增加 migration / schema 验证，确认 pgvector extension、向量列、索引和回填脚本可用。
- [ ] 2.10 增加或更新 regression test，证明第一阶段没有修改 `searchExerciseResources` schema、manifest、examples、handler、repository、model observation、projection 或 trace summary。
- [ ] 2.11 第一阶段验证命令：运行相关 embedding / migration / repository 测试，并运行 `npm run typecheck`。

## 3. 第二阶段：`searchExerciseResources.q` 语义检索接入

- [ ] 3.1 更新 `searchExerciseResources` 模型可见合同，说明 `q` 是 hard filters 后的 recall / ranking signal，不是 hard filter，也不从用户原文解析隐藏条件。
- [ ] 3.2 保持 schema 简洁，不新增专门的热身、拉伸、部位意图或 support section 参数；使用现有 section / facet hard filters 加 `q` 表达语义排序目标。
- [ ] 3.3 更新 repository 查询路径：先下推发布态、section、器械、肌群、难度、风险、`requiredExerciseIds`、`excludeExerciseIds` 等结构化 hard filters，再在候选范围内执行 pgvector / text / business ranking。
- [ ] 3.4 确认 repository 不调用 `listExerciseRecords()`、`listAllExercises()`、旧 `searchExercises()` 或其他全量动作读取入口。
- [ ] 3.5 更新 output / model observation / user projection，只暴露动作事实、section 分组、查询摘要、排序摘要和诊断；不得产出 routine、plan、candidate set、训练卡片或保存事件。
- [ ] 3.6 更新 trace summary，记录 `q`、applied hard filters、embedding version、hard-filtered candidate count、semantic recall count、returned count、truncated、ranking summary 和最终 exerciseId。
- [ ] 3.7 增加 tool-level 和 repository-level 测试，覆盖 warmup / stretch hard filter 加 `q` 的查询，证明返回动作满足显式 hard filters，并能改善类似胸部热身或胸部拉伸的语义排序。
- [ ] 3.8 增加 hard filter 边界测试，证明 `q` 不会自动添加、删除或放宽 `equipment`、section、`muscles`、`level`、`homeRequirement`、`riskTag`、`requiredExerciseIds` 或 `excludeExerciseIds`。
- [ ] 3.9 增加 manifest / contract 测试，确认没有新增自然语言短语到固定 facet 的规则，也没有新增 `/api/chat` 关键词路由或 toolName 分支。
- [ ] 3.10 第二阶段验证命令：运行 `searchExerciseResources` 相关 repository / tool / manifest / architecture boundary 测试，并运行 `npm run typecheck`。

## 4. OpenSpec 与收尾

- [ ] 4.1 运行 `openspec validate stage-exercise-semantic-retrieval --strict`。
- [ ] 4.2 第一阶段实现完成后，更新 `tasks.md` 阶段一 checklist，但保留阶段二未完成状态。
- [ ] 4.3 第二阶段实现完成后，更新 `tasks.md` 阶段二 checklist，并补充最终验证结果。
- [ ] 4.4 如实现涉及数据库结构、运行配置或核心链路变化，同步更新 README、`docs/方案变更历史` 和 `docs/项目演变历程.md` 中必要记录。
