## 1. 合同审查

- [ ] 1.1 完成 Agent 修复方案抽象层级门禁审查，确认本 change 没有把具体用户短句、trace、`toolName` 组合或字段组合升格成通用 prompt / runtime / 服务端生产规则。
- [ ] 1.2 完成 Tool 抽象层级检查：`searchExerciseResources` 的稳定 resource type 是 Exercise 动作资源，能力族是 query；`suitabilities`、结构化 facet、`candidateCountPerSection`、`excludeExerciseIds` 和 `requiredExerciseIds` 均属于 filter / sort / bounded candidate count / resource reference，不写进 `toolName`。
- [ ] 1.3 对照 `docs/agent-tool-orchestrator-design.md` 第 24、25、26 节，确认允许触碰模块仅限业务 tool wrapper、集中配置、tool-level tests、catalog / contract gate tests 和 OpenSpec 文档。
- [ ] 1.4 使用 `agent-prompt-contract-governance` 检查 `searchExerciseResources` 的 description、schema description 和 model-visible summary，确认模型可见说明符合 `docs/llm-prompt-guidance.md` 的 Tool Description / Schema Description / Runtime Context 分层。

## 2. Tool 输入和配置

- [ ] 2.1 更新 `lib/server/config/agent-runtime-config.ts`，将 `searchExerciseResources.maxReturnedPerSection` 调整为 `defaultCandidateCountPerSection = 8` 和 `maxCandidateCountPerSection = 24`，并补充中文意图注释。
- [ ] 2.2 更新 `searchExerciseResourcesInputSchema`，新增 `candidateCountPerSection?: number`，范围为 1 到 24；说明该字段只控制每个请求 section 的候选数量，不是分页、offset、cursor 或最终展示数量承诺。
- [ ] 2.3 确认 schema 继续拒绝 `limit`、`page`、`pageSize`、`offset`、`take`、`cursor`、`maxReturned`、`q`、`published`、`bodyRegions` 等不允许字段。
- [ ] 2.4 更新 handler，将 `candidateCountPerSection ?? defaultCandidateCountPerSection` 传入 repository 内部 `maxReturned`，并继续保留 repository hard cap 24。
- [ ] 2.5 更新配置相关测试，覆盖默认值 8、最大值 24 和集中配置导出结构。

## 3. Tool 输出和模型可见投影

- [ ] 3.1 将 `searchExerciseResources` model-visible summary 从 `groups.<section>.exercises[]` 简化为顶层 `exercises[]` 候选列表。
- [ ] 3.2 从 `searchExerciseResources` model-visible summary 中删除 `sectionSummary`、`availableSections`、`missingSections`、`allowedSections`、`allowedSectionsRelation` 和 `groupSemantics`。
- [ ] 3.3 保留 `query.suitabilities`、`returnedCount`、`truncated`、`appliedFilters`、`filterApplications`、`filterSemantics`、`zeroMatchMuscles` 和必要 `diagnostics[]`，但不得表达固定补查流程、section 缺口或最终输出禁令。
- [ ] 3.4 更新 user projection 和 trace summary，确保用户 / trace 可复盘查询口径、候选数量和 diagnostics，但不会把删除字段回灌到 Planner 可见输入。
- [ ] 3.5 确认最终 `visibleTrainingProposal` validator 继续基于数据库动作事实校验 `exerciseId`、发布态和 `allowedSections`，本 change 不放宽最终结构化输出的确定性校验。

## 4. 模型可见说明和合同门禁

- [ ] 4.1 更新 `searchExerciseResources` tool description，表达该 tool 只返回动作候选事实，不生成 `visibleTrainingProposal`、routine、plan、训练卡片、处方、日程或保存结果。
- [ ] 4.2 更新 `candidateCountPerSection` 的 schema description，说明字段来源可以是用户明确数量要求或模型需要的候选规模；禁止解释为分页或最终展示数量承诺。
- [ ] 4.3 更新 `suitabilities` 的 schema description，表达它是查询候选用途的结构化口径，模型需要主训练、热身或拉伸候选时自行选择，不由服务端根据用户原文分流。
- [ ] 4.4 更新 model-visible contract gate，确认模型可见文本不再要求暴露 `groups`、`allowedSections`、`allowedSectionsRelation`、`sectionSummary`、`availableSections` 或 `missingSections`。
- [ ] 4.5 最终 diff 检查，确认没有新增服务端关键词规则、自然语言模板路由、phrasing 特判或具体业务 `toolName` runtime 分支。

## 5. Tool 级测试

- [ ] 5.1 更新 `tests/langchain-agent-tools/search-exercise-resources.test.ts`，覆盖传入 `candidateCountPerSection = 10` 时 repository 收到 `maxReturned = 10`。
- [ ] 5.2 更新 `tests/langchain-agent-tools/search-exercise-resources.test.ts`，覆盖未传 `candidateCountPerSection` 时默认使用 8。
- [ ] 5.3 更新 `tests/langchain-agent-tools/search-exercise-resources.test.ts`，覆盖 `candidateCountPerSection > 24` 被 schema validation 拒绝且不执行 handler。
- [ ] 5.4 更新 `tests/langchain-agent-tools/search-exercise-resources.test.ts`，断言 model-visible summary 使用顶层 `exercises[]`，并且不包含 `groups`、`sectionSummary`、`availableSections`、`missingSections`、`allowedSections`、`allowedSectionsRelation` 或 `groupSemantics`。
- [ ] 5.5 更新 `tests/langchain-agent-tools/search-exercise-resources.test.ts`，覆盖多肌群查询仍能在 `candidateCountPerSection` 上限内尽量均衡返回候选，并保留 `zeroMatchMuscles` 诊断边界。
- [ ] 5.6 运行 `npm test -- tests/langchain-agent-tools/search-exercise-resources.test.ts`。

## 6. Catalog、投影和回归测试

- [ ] 6.1 更新 `tests/langchain-agent-tools/production-tool-catalog.test.ts`，断言 schema 暴露 `candidateCountPerSection`，并继续不暴露 `limit`、`page`、`pageSize`、`offset`、`take`、`cursor`、`maxReturned`、`published` 或 `q`。
- [ ] 6.2 更新 `tests/langchain-agent-tools/model-visible-contract-gate.test.ts`，断言 `searchExerciseResources` 模型可见合同不包含固定 workflow、业务满足度、`allowedSectionsRelation`、section coverage 缺口或 placement 指令。
- [ ] 6.3 如有 token 瘦身投影相关测试，更新其期望：Planner 可见 tool result 必须保留当前 model-visible summary 需要的 `exercises[]` 和查询摘要，不得因历史白名单重新注入 `groups` / `allowedSections`。
- [ ] 6.4 运行 `npm test -- tests/langchain-agent-tools/production-tool-catalog.test.ts tests/langchain-agent-tools/model-visible-contract-gate.test.ts`。
- [ ] 6.5 运行 `npm run typecheck`。

## 7. OpenSpec 验证和收尾

- [ ] 7.1 运行 `openspec validate simplify-exercise-resource-search-output --strict`。
- [ ] 7.2 运行 `git diff --name-status`，确认没有删除无关测试、脚本、OpenSpec 文档或业务入口。
- [ ] 7.3 运行 `git status --short`，确认最终变更范围只包含本 change 允许的文件。
- [ ] 7.4 总结实现结果、验证命令、剩余风险，并按项目规则提交中文 commit。
