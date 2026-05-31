## 1. 动作元数据模型

- [x] 1.1 扩展 `Exercise` 或等价动作元数据结构，增加 allowedSections、intensityRole、movementPattern、difficulty、riskTags、contraindications、regressionExerciseIds、progressionExerciseIds 和 substitutionGroupId。
- [x] 1.2 为新增字段增加 TypeScript 类型、Zod 校验和服务端读取归一化逻辑。
- [x] 1.3 更新 seed 或动作初始化数据，至少覆盖当前聊天推荐、routine 和 plan 常用动作。

## 2. 分池检索服务

- [x] 2.1 扩展 Exercise Retrieval Service，按 userId、visibility、equipment、level、risk、allowedSections 做 pre-filter。
- [x] 2.2 输出 `ExerciseCandidatePools`，包含 warmup、training、stretch、regression、progression 和 substitution 候选池。
- [x] 2.3 实现替代动作排序，优先使用 substitutionGroupId、降阶/进阶关系、movementPattern、primaryMuscles、equipment、difficulty 和 allowedSections。
- [x] 2.4 在候选不足时返回结构化不足原因，不让调用方静默使用候选外动作。

## 3. Validator 接入

- [x] 3.1 在 routine、plan 和 Patch 校验中检查动作 section 合法性。
- [x] 3.2 校验替代动作必须满足原 section、器械、难度、风险和用户限制。
- [x] 3.3 校验模型返回或 Patch 指定的 exerciseId 必须来自本次服务端候选集合。

## 4. 测试与验证

- [x] 4.1 补充分池检索单元测试，覆盖热身、主训练、拉伸和候选不足分支。
- [x] 4.2 补充替代动作排序测试，覆盖 substitutionGroup、regression、progression 和同肌群兜底。
- [x] 4.3 补充 Validator 测试，确认主训练动作不会进入热身、拉伸动作不会进入主训练。
- [x] 4.4 运行 `npm test`、`npm run typecheck` 和 `npm run lint`；如修改 Prisma schema，运行相关迁移或说明无法运行原因。

## 5. 文档记录

- [x] 5.1 在 `docs/方案变更历史` 新增方案变更记录，说明动作检索从相关性召回升级为元数据分池。
- [x] 5.2 如调整动作库字段、seed 或协作方式，同步更新相关 README 或架构文档。
