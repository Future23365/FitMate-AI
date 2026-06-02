## 1. Routine 草稿生成

- [x] 1.1 重构 `generateRoutineDraft` 草稿构建逻辑，确保传入的 `candidateExerciseIds` 全部进入 routine。
- [x] 1.2 支持 training section 多动作项，并为新手/非新手生成稳定的组数、次数和休息配置。
- [x] 1.3 缺少 warmup 或 stretch 时，从受控动作库候选中补齐必要 section，并把补充动作纳入后续候选边界。
- [x] 1.4 确保 `validateRoutineDraft`、Policy 和 artifact 保存链路使用扩展后的候选边界完成校验。

## 2. 动作元数据

- [x] 2.1 调整 `inferExerciseMetadata()`，避免 `髋伸展 / hip extension` 等力量动作被推断为仅允许 stretch。
- [x] 2.2 保留明确拉伸动作进入 stretch 的推断行为。

## 3. 测试与文档

- [x] 3.1 补充 Agent routine 工具测试，覆盖指定动作全部保留、training 多动作、缺 warmup/stretch 时受控补齐。
- [x] 3.2 补充动作元数据或 validation 测试，覆盖 `Hip_Extension_with_Bands` 可进入 training 且 `Hamstring_Stretch` 仍为 stretch。
- [x] 3.3 运行相关自动化测试和 `npm run typecheck`，记录无法运行的原因。
- [x] 3.4 更新 `docs/方案变更历史` 和 `docs/项目演变历程.md`，记录本次 routine 候选覆盖修复。
