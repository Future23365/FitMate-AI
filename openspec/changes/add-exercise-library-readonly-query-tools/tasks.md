## 1. 动作库只读服务能力

- [ ] 1.1 在动作 repository/service 中新增动作库统计读取函数，返回总数、发布态数量和受限 facet 统计摘要。
- [ ] 1.2 在动作 repository/service 中新增按名称解析动作函数，支持中文名、英文名、动作 id 或 source id 的结构化匹配。
- [ ] 1.3 为名称解析结果定义唯一命中、歧义候选、未找到三类稳定返回结构。
- [ ] 1.4 为动作详情摘要定义安全投影字段，包含动作名称、器械、目标肌群、难度、`instructionsZh`、图片和必要安全提示。

## 2. Agent 只读工具接入

- [ ] 2.1 在 `readonly-tools.ts` 注册 `getExerciseLibrarySummary` 或等价统计工具，补齐 Zod input/output、能力合同、summary 和 trace 摘要。
- [ ] 2.2 注册 `resolveExerciseByName`、`getExerciseDetailByName` 或等价详情工具，补齐输入 Schema、歧义诊断、tool result 资源角色和模型摘要。
- [ ] 2.3 更新 Agent tool registry 类型、工具枚举、能力合同和资源摘要，确保统计/详情工具不会产生 `candidate_set`。
- [ ] 2.4 更新 `prompt-config.ts`，明确动作库统计和“某某动作怎么做”应调用新增只读工具，不能触发训练生成或执行型候选集合。

## 3. Agent 收口与回复投影

- [ ] 3.1 更新 Agent runtime / final result 校验，允许统计和动作详情只读结果以 `answered` 引用对应 `usedToolResultIds` 收口。
- [ ] 3.2 更新 Response Writer 的失败投影，使只读动作库查询失败时不使用训练生成/修改失败兜底文案。
- [ ] 3.3 更新聊天 artifact 投影逻辑，确保只引用统计/详情工具结果时不会生成推荐、routine 或 plan 卡片。
- [ ] 3.4 若引入 LLM 润色阶段，确保输入只包含动作详情安全投影，并保留事实引用校验。

## 4. 测试与验证

- [ ] 4.1 增加动作服务测试，覆盖统计总数、发布态数量、中文名解析、英文名解析、歧义和未找到。
- [ ] 4.2 增加 Agent registry / readonly tool 测试，覆盖工具注册、Schema、能力合同、resourceRole、trace summary 和不产生 candidate set。
- [ ] 4.3 增加 Agent runtime / Response Writer 测试，覆盖动作库统计回答、动作详情回答、歧义追问和只读失败文案。
- [ ] 4.4 增加聊天黑盒 LLM 流程用例，覆盖“目前数据库有多少个动作”“俯卧撑怎么做”“不存在的动作怎么做”等用户问题。
- [ ] 4.5 运行相关自动化检查：`npm test`，并按影响范围运行 `npm run typecheck`；若无法运行需记录原因。

## 5. 文档与回归

- [ ] 5.1 更新必要的开发文档或 trace 说明，记录新增只读工具的事实边界、失败语义和 LLM 润色限制。
- [ ] 5.2 更新 `docs/方案变更历史` 与 `docs/项目演变历程.md`，记录本次 Agent 只读动作库查询能力的真实问题、方案和验证结果。
- [ ] 5.3 使用最新 trace 或黑盒报告确认普通动作库问答不会再返回“没有生成或修改训练结果”。
