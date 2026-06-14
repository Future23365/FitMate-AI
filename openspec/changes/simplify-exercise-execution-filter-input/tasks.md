## 1. 合同边界与字段设计

- [ ] 1.1 完成 `searchExerciseResources` Tool 抽象层级检查，确认稳定 resource type 仍是发布态动作库资源，能力族仍是只读 query，不新增第二个动作查询 tool。
- [ ] 1.2 列出旧模型可见字段到新字段的迁移边界：`requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevelMax`、`noiseLevelMax` 必须从模型可见 input 删除。
- [ ] 1.3 定义 `executionProfile`、`equipmentScope`、`impactLimit`、`noiseLimit` 的 TypeScript 类型、Zod schema、中文 schema description 和字段冲突校验。
- [ ] 1.4 确认 `executionProfile = "no_equipment"` 表达完整无器械口径，允许地面或瑜伽垫，但不允许外部训练器械、椅子/墙面、健身房固定设施、搭档或户外空间。
- [ ] 1.5 确认本 change 不修改 LangChain runtime 主循环、provider payload、`/api/chat`、production response adapter、finalization tool 或服务端自然语言分流逻辑。

## 2. 查询 Adapter 与 Repository

- [ ] 2.1 在 `searchExerciseResources` handler 或专用 adapter 中将 `executionProfile` 确定性映射为内部 execution taxonomy 查询条件。
- [ ] 2.2 实现 `equipmentScope.mode = "compatible_with_available"` 的器械子集语义，确保“用户只有某些器械”不会返回需要集合外器械的动作。
- [ ] 2.3 实现 `equipmentScope.mode = "must_use_any"` 的器械 overlap 语义，确保“找某器械动作”使用 `requiredEquipmentTags hasSome` 或等价条件。
- [ ] 2.4 将 `impactLimit` 和 `noiseLimit` 映射为等级上限 where 条件，并保持 `null` 不匹配低冲击或安静约束。
- [ ] 2.5 更新 section-aware hard filter policy、`requiredExerciseIds` mismatch diagnostics、query summary 和 `appliedFilters`，统一使用新高层字段表达模型可见查询口径。
- [ ] 2.6 保留 repository 内部 taxonomy 字段或内部查询对象作为服务端实现细节，禁止把内部 mapping 投影为下一轮 Planner 可复制 input。

## 3. 模型可见说明与投影

- [ ] 3.1 更新 `searchExerciseResources` tool description，按 `Purpose`、`Use When`、`Do Not Use When`、`Input Source`、`Output Meaning`、`Grounding Rules` 表达新输入合同。
- [ ] 3.2 更新 schema description 和 facet catalog，暴露 `executionProfile`、`equipmentScope.tags`、`impactLimit`、`noiseLimit` 的 canonical values，移除旧底层 taxonomy 输入字段。
- [ ] 3.3 更新 model-visible summary / compressed tool result，确保 query summary 只回显新高层字段，动作摘要仍可包含有限 `executionTaxonomy` 数据库事实。
- [ ] 3.4 更新 user projection 和 trace summary，用户投影只展示查询口径和动作摘要，trace 可以包含内部 taxonomy mapping 诊断但不得误导为模型 input。
- [ ] 3.5 使用 `agent-prompt-contract-governance` 检查模型可见合同，确认说明位于 tool description / schema description / result summary 层，不写入通用 Agent prompt 特例。
- [ ] 3.6 用 `rg` 检查旧字段在 tool description、schema description、examples、query summary、model-visible summary、production catalog 和测试 fixture 中不再作为可填写 input 出现。

## 4. Tool 单测与回归覆盖

- [ ] 4.1 更新或新增 `tests/langchain-agent-tools/search-exercise-resources.test.ts`，直接覆盖 `handler`、`executeLangChainToolWrapper` 或当前真实 runtime 执行入口。
- [ ] 4.2 覆盖 `executionProfile` 六个枚举的成功路径、数据库映射、空结果和 query summary。
- [ ] 4.3 覆盖 `equipmentScope.compatible_with_available` 的子集语义，包含“只有哑铃时不返回弹力带动作”等真实健身场景。
- [ ] 4.4 覆盖 `equipmentScope.must_use_any` 的 overlap 语义，包含“找哑铃动作”只返回使用指定器械集合中至少一种的动作。
- [ ] 4.5 覆盖 `impactLimit`、`noiseLimit` 上限语义，以及 `impactLevel = null` / `noiseLevel = null` 不匹配低冲击或安静约束。
- [ ] 4.6 覆盖底层 taxonomy 字段、旧 `equipment` / `homeRequirement`、`published`、分页字段和 SQL / Prisma 片段被 schema 拒绝，且 handler 不执行查询。
- [ ] 4.7 覆盖 `requiredExerciseIds` 与新高层执行条件不一致时的 mismatch diagnostics，不通过服务端自然语言判断替模型放弃用户点名动作。
- [ ] 4.8 覆盖 model-visible summary、user projection、trace summary、policy / permission 边界、handler 失败归一化、`excludeExerciseIds` 去重、数量上限、非法 id 拒绝、数据库层排除、排除后候选不足和摘要投影。
- [ ] 4.9 证明该 tool 仍不产出 `candidateSetId`、`candidate_set` resource、训练卡片、routine、plan、patch、保存事件或业务目标满足度字段。

## 5. Production Catalog 与模型可见门禁

- [ ] 5.1 更新 `tests/langchain-agent-tools/production-tool-catalog.test.ts`，断言 production schema 暴露新字段且不暴露旧底层 taxonomy input。
- [ ] 5.2 更新 `tests/langchain-agent-tools/model-visible-contract-gate.test.ts` 或等价门禁，防止新增服务端关键词规则、固定 workflow 文案、用户短句特判或旧字段示例。
- [ ] 5.3 若存在 prompt / catalog snapshot 或 examples fixture，更新为 `executionProfile`、`equipmentScope`、`impactLimit` 和 `noiseLimit` 示例。

## 6. 验证与收尾

- [ ] 6.1 运行 `openspec validate simplify-exercise-execution-filter-input --strict`。
- [ ] 6.2 运行 `npm test -- tests/langchain-agent-tools/search-exercise-resources.test.ts`。
- [ ] 6.3 运行 `npm test -- tests/langchain-agent-tools/production-tool-catalog.test.ts tests/langchain-agent-tools/model-visible-contract-gate.test.ts`。
- [ ] 6.4 如修改共享 schema、repository、AI 编排或 TypeScript 类型，运行 `npm run typecheck`。
- [ ] 6.5 如触碰 production catalog、tool wrapper 或 model-visible summary，运行最窄相关 runtime / response adapter 测试，或在最终总结中说明未运行原因和剩余风险。
- [ ] 6.6 提交前检查 `git diff --name-status`，确认没有混入 `clarify-exercise-query-clarification-contract` 或其他无关未跟踪 OpenSpec 文件。
