## 1. 合同与边界审查

- [ ] 1.1 按 `agent-fix-abstraction-gate` 检查本 change 没有把具体 trace、具体动作名、用户短句或 tool 字段组合升格为通用 prompt 规则。
- [ ] 1.2 按 `agent-tool-change-governance` 确认本 change 只修改 LangChain business tool wrapper、schema、handler、catalog、projection、trace summary 和 tests，不修改 LangChain runtime 主循环、provider payload、production response adapter 或 `/api/chat` 主路由。
- [ ] 1.3 按 `agent-prompt-contract-governance` 检查所有模型可见 description、schema description、examples、tool result summary 和 failure feedback 默认使用中文，并保留 `toolName`、字段名、enum、resource type 和代码标识符英文原样。
- [ ] 1.4 运行 `openspec validate consolidate-exercise-name-query --strict`，确保 proposal、design、spec delta 和 tasks 可通过 OpenSpec 校验。
- [ ] 1.5 检查 `agent-exercise-resource-query-tool` 基线 spec 中不再保留“`searchExerciseResources` 不适合解析唯一动作名”这类与 `exerciseNames` 冲突的旧模型可见边界。

## 2. `searchExerciseResources` 输入合同实现

- [ ] 2.1 更新 `searchExerciseResources` input schema，新增 `exerciseNames?: string[]`，并限制数量、单项长度和字段含义。
- [ ] 2.2 从 `searchExerciseResources` production 模型可见 schema、description、examples、handler input 和相关类型中删除 `q`。
- [ ] 2.3 确保传入 `q` 会在 handler 执行前被 strict schema 拒绝，并提供结构化 failure feedback，说明应使用 `exerciseNames` 或对应结构化筛选字段。
- [ ] 2.4 更新 `searchExerciseResources` description、schema description 和 examples，表达 `exerciseNames` 只接受模型已提取出的动作名称数组，不接受完整用户消息，也不表示语义搜索。

## 3. 名称查询 repository 和 handler

- [ ] 3.1 在动作资源 repository 查询入口中支持 `exerciseNames`，只对动作名称字段执行精确、前缀和包含匹配。
- [ ] 3.2 对多个 `exerciseNames` 按名称分桶查询有限候选，再合并到现有 section 查询结果，并按 `exerciseId` 去重。
- [ ] 3.3 保持 section-aware hard filter policy：`training` 应用名称和训练相关 hard filters，`warmup` / `stretch` 应用 section、器械、场地、肌群、名称、`requiredExerciseIds` 和 `excludeExerciseIds` hard filters。
- [ ] 3.4 在 `query.appliedFilters` 或等价查询摘要中记录实际应用的 `exerciseNames`。
- [ ] 3.5 通过 `diagnostics` 表达 `exercise_name_not_found`、`exercise_name_section_conflict`、`exercise_name_filter_mismatch`、`exercise_name_ambiguous`、`exercise_name_too_broad` 或等价稳定 code。
- [ ] 3.6 确保服务端不根据用户原文、关键词、正则、同义词表、短句模板、历史摘要或 conversationSummary 抽取或补写 `exerciseNames`。
- [ ] 3.7 明确 `exerciseNames` 与 `muscles` 同时存在时的分桶优先级：名称桶负责结果分布，`muscles` 作为桶内结构化筛选；没有 `exerciseNames` 时保留现有多肌群均衡策略。

## 4. 输出、投影和 production catalog

- [ ] 4.1 保持 `searchExerciseResources` 输出结构稳定为 `query`、`groups` 和 `diagnostics`；名称命中结果进入 `groups.<section>.exercises[]`。
- [ ] 4.2 确保 output、model-visible summary、user projection 和 trace summary 不新增 `exerciseNameResults`、`resolvedMentions`、`nameMatches` 或等价并行结构。
- [ ] 4.3 从 production tool catalog、集中配置白名单、模型可见 manifest、schema/examples 和导出列表中移除 `resolveExerciseResourceMentions`。
- [ ] 4.4 删除或迁移 `resolveExerciseResourceMentions` 的 handler、projection、trace summary 和测试；如果实现阶段发现存在非 production 依赖，需在代码注释或测试中说明保留边界。
- [ ] 4.5 检查 production catalog 不再暴露 `q` 或 `resolveExerciseResourceMentions`，且 `searchExerciseResources` 明确没有语义搜索能力。
- [ ] 4.6 更新 route/catalog/provider/trace viewer 相关 fixture，确保测试不再期待 production tool list 中出现 `resolveExerciseResourceMentions`。

## 5. 自动化测试

- [ ] 5.1 补充 `searchExerciseResources` tool-level tests，覆盖 `exerciseNames = ["俯卧撑", "深蹲", "平板支撑"]` 的多名称查询、分桶合并、去重和 `groups.<section>.exercises[]` 输出。
- [ ] 5.2 补充名称查询失败和冲突测试，覆盖未命中、section 冲突、筛选冲突、候选过宽、projection / redaction 和 trace summary。
- [ ] 5.3 补充 schema / manifest tests，证明 `q` 被拒绝且不出现在模型可见 schema、description、examples 或 model-visible summary 中。
- [ ] 5.4 补充 production catalog tests，证明 `resolveExerciseResourceMentions` 不再是 production 可见 tool。
- [ ] 5.5 迁移或删除旧 `resolveExerciseResourceMentions` tests，避免保留废弃 production 能力的通过路径。
- [ ] 5.6 补充无服务端语义分流测试，证明 `/api/chat`、LangChain runtime、renderer、tool handler 和 repository 不根据用户原文补写 `exerciseNames`。
- [ ] 5.7 更新 `tests/langchain-agent-runtime/config.test.ts`、`tests/langchain-agent-runtime/deepseek-provider-contract.test.ts`、`tests/api-routes.test.ts` 和 `tests/ai-trace-viewer.test.ts` 中关于 production tool list、provider tool schema 和 registry manifest 的 fixture / assertion。

## 6. 验证与收尾

- [ ] 6.1 运行与本 change 相关的 tool-level tests 和 production catalog / model-visible contract tests。
- [ ] 6.2 运行 `npm run typecheck`。
- [ ] 6.3 按需运行 `npm test` 或相关测试命令；如果没有运行全部测试，需在实现总结中说明原因。
- [ ] 6.4 使用 `rg` 定向检查 production 模型可见合同中不再暴露 `q`、`resolveExerciseResourceMentions`，也不再保留“`searchExerciseResources` 不适合解析唯一动作名”的旧边界。
- [ ] 6.5 检查 `git diff --name-status`，若出现 `D` 或 `R`，单独确认这些删除或重命名属于本 change 范围后再提交。
