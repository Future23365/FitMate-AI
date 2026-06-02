## 1. Agent 上下文事实

- [x] 1.1 扩展 `AgentArtifactSummary` Schema，使 recent artifact 摘要可携带主要 `exerciseIds`。
- [x] 1.2 更新 `/api/chat` 到 `ContextPackage` 的映射，保留 `RecentArtifactSummary.exerciseIds`。
- [x] 1.3 更新 Agent trace / prompt 可见上下文摘要，能诊断 recent artifact 动作 id 是否进入 Agent。

## 2. Routine artifact 绑定契约

- [x] 2.1 扩展 `generateRoutineDraft` 输入 Schema、工具描述和 prompt 约束，支持 `sourceArtifactId` 与 `requiredExerciseIds`。
- [x] 2.2 在 `generateRoutineDraft` 执行时校验 `sourceArtifactId` 归属、artifact kind 和 required 动作来源。
- [x] 2.3 确保 artifact-bound routine draft 保留全部 required 动作，只为缺失必要 section 补充受控动作。
- [x] 2.4 确保 `validateRoutineDraft`、Policy 和 artifact 保存链继续使用包含 required 与 supplemental 动作的最终候选边界。

## 3. 测试与文档

- [x] 3.1 补充 Agent context / chat service 测试，覆盖 recent recommendation artifact 的 `exerciseIds` 进入 `ContextPackage`。
- [x] 3.2 补充 `generateRoutineDraft` 工具测试，覆盖绑定 recommendation artifact 后 required 动作全部保留。
- [x] 3.3 补充非法来源测试，覆盖 required 动作不属于 source artifact 时工具失败且不生成 routine。
- [x] 3.4 运行相关自动化测试和 `npm run typecheck`，记录无法运行的原因。
- [x] 3.5 更新 `docs/方案变更历史` 与 `docs/项目演变历程.md`，记录本次 Agent artifact-bound routine 修复。
